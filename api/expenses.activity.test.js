const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockTx = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 42 })),
};
const mockDb = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 42 })),
  withTransaction: jest.fn(async (fn) => fn(mockTx)),
};
jest.mock('./_lib/database', () => ({
  ...mockDb,
  notDeleted: (alias) => (alias ? `${alias}.deleted_at IS NULL` : 'deleted_at IS NULL'),
}));

const app = require('./expenses');
const JWT_SECRET = 'your-secret-key-change-this';
const ADMIN =
  'Bearer ' + jwt.sign({ id: 1, email: 'admin@sbcc.church', role: 'admin' }, JWT_SECRET);

const logCall = () => mockTx.run.mock.calls.find(([sql]) => /INSERT INTO activity_log/i.test(sql));

// Auth now reads token_version on every request. Route that probe past whatever
// this test wants the handler's own lookup to return.
const getReturns = (row) =>
  mockDb.get.mockImplementation(async (sql) =>
    /SELECT token_version/i.test(sql) ? { token_version: 0 } : row
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.run.mockResolvedValue({ changes: 1, lastID: 42 });
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 42 });
  getReturns(null);
  mockDb.all.mockResolvedValue([]);
  mockDb.withTransaction.mockImplementation(async (fn) => fn(mockTx));
});

test('creating an expense logs record.create for the expense entity', async () => {
  const res = await request(app)
    .post('/api/expenses')
    .set('Authorization', ADMIN)
    .send({ date: '2026-08-15', category: 'supplies', supplies: 100 });

  expect(res.status).toBe(200);
  const [, params] = logCall();
  expect(params[0]).toBe('admin@sbcc.church');
  expect(params[2]).toBe('record.create');
  expect(params[3]).toBe('expense');
  expect(params[4]).toBe(42);
});

test('the insert and the log entry share one transaction', async () => {
  await request(app)
    .post('/api/expenses')
    .set('Authorization', ADMIN)
    .send({ date: '2026-08-15', category: 'supplies', supplies: 100 });

  expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
  const statements = mockTx.run.mock.calls.map(([sql]) => sql);
  expect(statements.some((s) => /INSERT INTO expenses/i.test(s))).toBe(true);
  expect(statements.some((s) => /INSERT INTO activity_log/i.test(s))).toBe(true);
});

test('updating an expense logs only the fields that changed', async () => {
  getReturns({
    id: 3, date: '2026-08-15', particular: 'Office run', supplies: '100.00', utilities: '0.00',
  });

  const res = await request(app)
    .put('/api/expenses/3')
    .set('Authorization', ADMIN)
    .send({ date: '2026-08-15', particular: 'Office run', supplies: 250 });

  expect(res.status).toBe(200);
  const [, params] = logCall();
  expect(params[2]).toBe('record.update');
  expect(JSON.parse(params[6])).toEqual({ supplies: { from: 100, to: 250 } });
});

test('deleting an expense logs record.delete', async () => {
  getReturns({ id: 3, date: '2026-08-15', total_amount: '250.00' });

  const res = await request(app).delete('/api/expenses/3').set('Authorization', ADMIN);

  expect(res.status).toBe(200);
  expect(logCall()[1][2]).toBe('record.delete');
  expect(logCall()[1][4]).toBe(3);
});

test('a missing expense is neither updated nor logged', async () => {
  getReturns(null);

  const res = await request(app).delete('/api/expenses/404').set('Authorization', ADMIN);

  expect(res.status).toBe(404);
  expect(logCall()).toBeUndefined();
});

const insertCalls = () =>
  mockTx.run.mock.calls.filter(([sql]) => /INSERT INTO expenses/i.test(sql));

describe('POST classifies from the amount key', () => {
  test('one amount writes one row, classified and funded', async () => {
    const res = await request(app)
      .post('/api/expenses')
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
    await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 500, fund_source: 'pastoral_team' });

    const [, params] = insertCalls()[0];
    expect(params).toContain('operational');
    expect(params).not.toContain('pastoral_team');
  });

  test('a pastoral line stores total_amount and no amount column', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({
        date: '2026-08-15', category: 'Pastoral Team',
        subcategory: 'Benevolence', total_amount: 2000,
      });

    expect(res.status).toBe(200);
    const [, params] = insertCalls()[0];
    expect(params).toContain('pastoral_team');
    expect(params).toContain('Benevolence');
    // total_amount is 2000; every one of the 17 amount columns is zero.
    expect(params.filter((p) => p === 2000)).toHaveLength(1);
  });

  test('a legacy mobile category still classifies', async () => {
    await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', category: 'workers_share', total_amount: 300 });

    const [, params] = insertCalls()[0];
    expect(params).toContain("Pastoral & Worker Support");
    expect(params).toContain('operational');
  });

  test('an amount on an unknown field is refused by name', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', kabisig_fund: 400 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/kabisig_fund/);
    expect(insertCalls()).toHaveLength(0);
  });

  test('a body with no amount is refused', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', category: 'supplies' });

    expect(res.status).toBe(400);
    expect(insertCalls()).toHaveLength(0);
  });

  test('a missing date is still refused', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ utilities: 500 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date/i);
  });
});

describe('POST fans out a multi-line voucher', () => {
  test('two amounts write two rows sharing the voucher fields', async () => {
    const res = await request(app)
      .post('/api/expenses')
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
  });

  test('the response carries every id', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 500, supplies: 120 });

    expect(res.body.ids).toHaveLength(2);
    expect(res.body.id).toBe(res.body.ids[0]);
  });

  test('both rows and both log entries share one transaction', async () => {
    await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 500, supplies: 120 });

    expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
    const logs = mockTx.run.mock.calls.filter(([sql]) => /INSERT INTO activity_log/i.test(sql));
    expect(logs).toHaveLength(2);
  });

  test('a failure part-way through rolls the whole voucher back', async () => {
    // withTransaction propagates; the real implementation ROLLBACKs on throw.
    mockTx.run.mockImplementation(async (sql) => {
      if (/INSERT INTO expenses/i.test(sql) && insertCalls().length === 2) {
        throw new Error('constraint violation');
      }
      return { changes: 1, lastID: 42 };
    });

    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 500, supplies: 120 });

    expect(res.status).toBe(500);
  });
});
