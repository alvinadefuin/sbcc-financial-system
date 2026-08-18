// Mirrors the classification cases in api/expenses.activity.test.js. The Express
// and serverless routers are duplicate implementations of the same endpoints, so
// how a write is classified has to be asserted against both or local development
// drifts away from production. The taxonomy itself is shared and tested once, in
// api/_lib/expenseTaxonomy.test.js; what these cases pin is that this copy asks
// it the same questions and writes the same statement.
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const { AMOUNT_COLUMNS } = require('../../api/_lib/expenseTaxonomy');

const JWT_SECRET = 'your-secret-key-change-this';
const ADMIN =
  'Bearer ' + jwt.sign({ id: 1, email: 'admin@sbcc.church', role: 'admin' }, JWT_SECRET);

const txRun = jest.fn(async () => ({ changes: 1, lastID: 42 }));

// `row` answers every query but the token_version probe: null for a create, so
// duplicate detection finds nothing, and an existing row for an edit.
function makeApp(row = null) {
  const expensesRouter = require('./expenses');
  const db = {
    get: jest.fn((sql, params, cb) => {
      if (/token_version/i.test(sql)) return cb(null, { token_version: 0 });
      cb(null, row);
    }),
    all: jest.fn((sql, params, cb) => cb(null, [])),
    run: jest.fn((sql, params, cb) => {
      if (typeof cb === 'function') cb.call({ lastID: 42 }, null);
    }),
    withTransaction: (fn) => fn({ run: txRun, get: async () => null, all: async () => [] }),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = db; next(); });
  app.use('/', expensesRouter);
  return app;
}

const existingRow = (fields) => ({
  id: 3,
  date: '2026-08-15',
  category: 'Operational Fund',
  subcategory: 'Supplies',
  fund_source: 'operational',
  total_amount: '0.00',
  ...Object.fromEntries(AMOUNT_COLUMNS.map((c) => [c, '0.00'])),
  ...fields,
});

const insertCalls = () => txRun.mock.calls.filter(([sql]) => /INSERT INTO expenses/i.test(sql));
const updateCall = () =>
  txRun.mock.calls.find(([sql]) => /UPDATE expenses SET/i.test(sql) && !/deleted_at = now\(\)/i.test(sql));

beforeEach(() => {
  txRun.mockReset();
  txRun.mockResolvedValue({ changes: 1, lastID: 42 });
});

describe('POST classifies from the amount key (express)', () => {
  test('one amount writes one row, classified and funded', async () => {
    const res = await request(makeApp())
      .post('/')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 500 });

    expect(res.status).toBe(200);
    const [sql, params] = insertCalls()[0];
    expect(sql).toMatch(/INSERT INTO expenses/i);
    expect(params).toContain('Operational Fund');
    expect(params).toContain('Utilities');
    expect(params).toContain('operational');
    expect(params).toContain(500);
  });

  test('a client-supplied fund_source is ignored', async () => {
    await request(makeApp())
      .post('/')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 500, fund_source: 'pastoral_team' });

    const [, params] = insertCalls()[0];
    expect(params).toContain('operational');
    expect(params).not.toContain('pastoral_team');
  });

  test('a pastoral line stores total_amount and no amount column', async () => {
    const res = await request(makeApp())
      .post('/')
      .set('Authorization', ADMIN)
      .send({
        date: '2026-08-15', category: 'Pastoral Team',
        subcategory: 'Benevolence', total_amount: 2000,
      });

    expect(res.status).toBe(200);
    const [, params] = insertCalls()[0];
    expect(params).toContain('pastoral_team');
    expect(params).toContain('Benevolence');
    expect(params.filter((p) => p === 2000)).toHaveLength(1);
  });

  test('a legacy mobile category still classifies', async () => {
    await request(makeApp())
      .post('/')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', category: 'workers_share', total_amount: 300 });

    const [, params] = insertCalls()[0];
    expect(params).toContain('Pastoral & Worker Support');
    expect(params).toContain('operational');
  });

  test('an amount on an unknown field is refused by name', async () => {
    const res = await request(makeApp())
      .post('/')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', kabisig_fund: 400 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/kabisig_fund/);
    expect(insertCalls()).toHaveLength(0);
  });

  test('a missing date is still refused', async () => {
    const res = await request(makeApp())
      .post('/')
      .set('Authorization', ADMIN)
      .send({ utilities: 500 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date/i);
  });
});

describe('POST fans out a multi-line voucher (express)', () => {
  test('two amounts write two rows sharing the voucher fields', async () => {
    const res = await request(makeApp())
      .post('/')
      .set('Authorization', ADMIN)
      .send({
        date: '2026-08-15', particular: 'Electric Expense',
        cheque_number: '276296', forms_number: '2025-001',
        utilities: 12287.8, supplies: 128.55,
      });

    expect(res.status).toBe(200);
    expect(insertCalls()).toHaveLength(2);

    for (const [, params] of insertCalls()) {
      expect(params).toContain('Electric Expense');
      expect(params).toContain('276296');
      expect(params).toContain('2025-001');
    }
    expect(insertCalls()[0][1]).toContain('Utilities');
    expect(insertCalls()[1][1]).toContain('Supplies');
    expect(res.body.ids).toHaveLength(2);
    expect(res.body.id).toBe(res.body.ids[0]);
  });

  test('both rows and both log entries share one transaction', async () => {
    await request(makeApp())
      .post('/')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 500, supplies: 120 });

    const logs = txRun.mock.calls.filter(([sql]) => /INSERT INTO activity_log/i.test(sql));
    expect(logs).toHaveLength(2);
  });

  test('a failure part-way through rolls the whole voucher back', async () => {
    txRun.mockImplementation(async (sql) => {
      if (/INSERT INTO expenses/i.test(sql) && insertCalls().length === 2) {
        throw new Error('constraint violation');
      }
      return { changes: 1, lastID: 42 };
    });

    const res = await request(makeApp())
      .post('/')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 500, supplies: 120 });

    expect(res.status).toBe(500);
  });
});

describe('PUT writes columns that exist (express)', () => {
  test('the statement names no column absent from the schema', async () => {
    await request(makeApp(existingRow({ supplies: '100.00', total_amount: '100.00' })))
      .put('/3')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', supplies: 250 });

    const [sql] = updateCall();
    for (const dead of [
      'workers_share', 'fellowship_expense', 'benevolence_donations',
      'gasoline_transport', 'pbcm_share =', 'mission_evangelism',
      'admin_expense', 'worship_music', 'discipleship',
    ]) {
      expect(sql).not.toContain(dead);
    }
    for (const column of AMOUNT_COLUMNS) {
      expect(sql).toContain(column);
    }
  });

  test('an edit persists what the row is filed against', async () => {
    const res = await request(makeApp(existingRow({ supplies: '100.00', total_amount: '100.00' })))
      .put('/3')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 250 });

    expect(res.status).toBe(200);
    const [sql, params] = updateCall();
    expect(sql).toMatch(/category = \?/);
    expect(sql).toMatch(/subcategory = \?/);
    expect(sql).toMatch(/fund_source = \?/);
    expect(params).toContain('Utilities');
    expect(params).toContain('operational');
  });

  test('changing the subcategory moves the amount to the new column', async () => {
    await request(makeApp(existingRow({ supplies: '100.00', total_amount: '100.00' })))
      .put('/3')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 250 });

    const [sql, params] = updateCall();
    const columnOrder = sql
      .slice(sql.indexOf('SET'))
      .match(/(\w+) = \?/g)
      .map((m) => m.replace(' = ?', ''));
    expect(params[columnOrder.indexOf('utilities')]).toBe(250);
    expect(params[columnOrder.indexOf('supplies')]).toBe(0);
  });

  test('an edit may not become two line items', async () => {
    const res = await request(makeApp(existingRow({ supplies: '100.00' })))
      .put('/3')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 250, supplies: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/single line item/i);
  });

  test('an unknown amount field is refused on edit too', async () => {
    const res = await request(makeApp(existingRow()))
      .put('/3')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', kabisig_fund: 400 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/kabisig_fund/);
  });

  test('an edit logs only the fields that changed', async () => {
    await request(makeApp(existingRow({
      particular: 'Office run', total_amount: '100.00', supplies: '100.00',
    })))
      .put('/3')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', particular: 'Office run', supplies: 250 });

    const log = txRun.mock.calls.find(([sql]) => /INSERT INTO activity_log/i.test(sql));
    expect(JSON.parse(log[1][6])).toEqual({
      supplies: { from: 100, to: 250 },
      total_amount: { from: 100, to: 250 },
    });
  });
});
