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
