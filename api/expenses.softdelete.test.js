const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockDb = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 1 })),
};
jest.mock('./_lib/database', () => ({
  ...mockDb,
  notDeleted: (alias) => (alias ? `${alias}.deleted_at IS NULL` : 'deleted_at IS NULL'),
}));

const app = require('./expenses');
const JWT_SECRET = 'your-secret-key-change-this';
const ADMIN =
  'Bearer ' + jwt.sign({ id: 1, email: 'admin@sbcc.church', role: 'admin' }, JWT_SECRET);

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.all.mockResolvedValue([]);
  mockDb.get.mockResolvedValue(null);
});

describe('expenses soft delete', () => {
  test('DELETE issues an UPDATE stamping deleted_at, not a physical DELETE', async () => {
    const res = await request(app).delete('/api/expenses/7').set('Authorization', ADMIN);

    expect(res.status).toBe(200);
    const statements = mockDb.run.mock.calls.map(([sql]) => sql);
    const stamp = statements.find((s) => /UPDATE expenses/i.test(s));
    expect(stamp).toMatch(/deleted_at\s*=\s*now\(\)/i);
    expect(statements.some((s) => /DELETE\s+FROM\s+expenses/i.test(s))).toBe(false);
  });

  test('DELETE records the acting user as deleted_by', async () => {
    await request(app).delete('/api/expenses/7').set('Authorization', ADMIN);

    const call = mockDb.run.mock.calls.find(([sql]) => /UPDATE expenses/i.test(sql));
    expect(call[1]).toContain('admin@sbcc.church');
  });

  test('deleting an already-deleted record returns 404', async () => {
    mockDb.run.mockResolvedValue({ changes: 0 });

    const res = await request(app).delete('/api/expenses/7').set('Authorization', ADMIN);
    expect(res.status).toBe(404);
  });

  test('PUT stamps updated_at and updated_by and will not resurrect a deleted row', async () => {
    const res = await request(app)
      .put('/api/expenses/7')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', supplies: 100 });

    expect(res.status).toBe(200);
    const call = mockDb.run.mock.calls.find(([sql]) => /UPDATE expenses/i.test(sql));
    expect(call[0]).toMatch(/updated_at\s*=\s*now\(\)/i);
    expect(call[0]).toMatch(/deleted_at IS NULL/i);
    expect(call[1]).toContain('admin@sbcc.church');
  });
});
