const request = require('supertest');
const jwt = require('jsonwebtoken');

// The tx handed to the withTransaction callback. Handler statements and the log
// insert both land here, which is the point: one transaction, one commit.
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
jest.mock('./_lib/customFieldsHelper', () => ({
  enrichRecordsWithCustomFields: jest.fn(async (rows) => rows),
  getCustomFieldValues: jest.fn(async () => ({})),
  saveCustomFieldValues: jest.fn(async () => {}),
}));

const app = require('./collections');
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
  mockTx.get.mockResolvedValue(null);
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 42 });
  getReturns(null);
  mockDb.all.mockResolvedValue([]);
  mockDb.withTransaction.mockImplementation(async (fn) => fn(mockTx));
});

describe('collection create', () => {
  test('logs record.create with the actor and the new id', async () => {
    const res = await request(app)
      .post('/api/collections')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    expect(res.status).toBe(200);
    const [, params] = logCall();
    expect(params[0]).toBe('admin@sbcc.church');
    expect(params[1]).toBe('admin');
    expect(params[2]).toBe('record.create');
    expect(params[3]).toBe('collection');
    expect(params[4]).toBe(42);
  });

  test('writes the record and the log entry through the same transaction', async () => {
    await request(app)
      .post('/api/collections')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
    const statements = mockTx.run.mock.calls.map(([sql]) => sql);
    expect(statements.some((s) => /INSERT INTO collections/i.test(s))).toBe(true);
    expect(statements.some((s) => /INSERT INTO activity_log/i.test(s))).toBe(true);
  });

  test('a failing log write fails the request rather than committing unlogged', async () => {
    mockDb.withTransaction.mockRejectedValue(new Error('activity_log insert failed'));

    const res = await request(app)
      .post('/api/collections')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    expect(res.status).toBe(500);
  });
});

describe('collection update', () => {
  test('logs record.update with a diff of only the changed fields', async () => {
    getReturns({
      id: 7, date: '2026-08-15', particular: 'Sunday Service',
      total_amount: '100.00', general_tithes_offering: '100.00',
    });

    const res = await request(app)
      .put('/api/collections/7')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', particular: 'Sunday Worship', general_tithes_offering: 100 });

    expect(res.status).toBe(200);
    const [, params] = logCall();
    expect(params[2]).toBe('record.update');
    expect(params[4]).toBe(7);
    expect(JSON.parse(params[6])).toEqual({
      particular: { from: 'Sunday Service', to: 'Sunday Worship' },
    });
  });

  test('logs no changes payload when the figures are identical', async () => {
    getReturns({
      id: 7, date: '2026-08-15', particular: 'Sunday Service',
      total_amount: '100.00', general_tithes_offering: '100.00',
    });

    await request(app)
      .put('/api/collections/7')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', particular: 'Sunday Service', general_tithes_offering: 100 });

    expect(logCall()[1][6]).toBeNull();
  });

  test('does not log when the record does not exist', async () => {
    getReturns(null);

    const res = await request(app)
      .put('/api/collections/404')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    expect(res.status).toBe(404);
    expect(logCall()).toBeUndefined();
  });
});

describe('collection delete', () => {
  test('logs record.delete with a summary naming the record', async () => {
    getReturns({ id: 7, date: '2026-08-15', total_amount: '5000.00' });

    const res = await request(app).delete('/api/collections/7').set('Authorization', ADMIN);

    expect(res.status).toBe(200);
    const [, params] = logCall();
    expect(params[2]).toBe('record.delete');
    expect(params[3]).toBe('collection');
    expect(params[4]).toBe(7);
    expect(params[5]).toMatch(/5000|5,000/);
  });

  test('does not log when nothing was deleted', async () => {
    getReturns(null);

    const res = await request(app).delete('/api/collections/7').set('Authorization', ADMIN);

    expect(res.status).toBe(404);
    expect(logCall()).toBeUndefined();
  });
});
