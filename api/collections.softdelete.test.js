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
jest.mock('./_lib/customFieldsHelper', () => ({
  enrichRecordsWithCustomFields: jest.fn(async (rows) => rows),
  getCustomFieldValues: jest.fn(async () => ({})),
  saveCustomFieldValues: jest.fn(async () => {}),
}));

const app = require('./collections');
const JWT_SECRET = 'your-secret-key-change-this';
const ADMIN =
  'Bearer ' + jwt.sign({ id: 1, email: 'admin@sbcc.church', role: 'admin' }, JWT_SECRET);

const sqlOf = (calls) => calls.map(([sql]) => sql);

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.all.mockResolvedValue([]);
  mockDb.get.mockResolvedValue(null);
});

describe('collections soft delete', () => {
  test('DELETE issues an UPDATE stamping deleted_at, not a physical DELETE', async () => {
    const res = await request(app).delete('/api/collections/7').set('Authorization', ADMIN);

    expect(res.status).toBe(200);
    const statements = sqlOf(mockDb.run.mock.calls);
    const stamp = statements.find((s) => /UPDATE collections/i.test(s));
    expect(stamp).toMatch(/deleted_at\s*=\s*now\(\)/i);
    expect(stamp).toMatch(/deleted_by/i);
    expect(statements.some((s) => /DELETE\s+FROM\s+collections/i.test(s))).toBe(false);
  });

  test('DELETE records the acting user as deleted_by', async () => {
    await request(app).delete('/api/collections/7').set('Authorization', ADMIN);

    const call = mockDb.run.mock.calls.find(([sql]) => /UPDATE collections/i.test(sql));
    expect(call[1]).toContain('admin@sbcc.church');
  });

  test('no handler writes the dead fund_allocation table', async () => {
    await request(app).delete('/api/collections/7').set('Authorization', ADMIN);
    await request(app)
      .post('/api/collections')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });
    await request(app)
      .put('/api/collections/7')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    const statements = sqlOf(mockDb.run.mock.calls);
    expect(statements.some((s) => /fund_allocation/i.test(s))).toBe(false);
  });

  test('deleting an already-deleted record returns 404', async () => {
    mockDb.run.mockResolvedValue({ changes: 0 });

    const res = await request(app).delete('/api/collections/7').set('Authorization', ADMIN);
    expect(res.status).toBe(404);
  });

  test('PUT stamps updated_at and updated_by', async () => {
    const res = await request(app)
      .put('/api/collections/7')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    expect(res.status).toBe(200);
    const call = mockDb.run.mock.calls.find(([sql]) => /UPDATE collections/i.test(sql));
    expect(call[0]).toMatch(/updated_at\s*=\s*now\(\)/i);
    expect(call[0]).toMatch(/updated_by/i);
    expect(call[1]).toContain('admin@sbcc.church');
  });

  test('PUT refuses to resurrect a soft-deleted record', async () => {
    const call = () =>
      mockDb.run.mock.calls.find(([sql]) => /UPDATE collections/i.test(sql));

    await request(app)
      .put('/api/collections/7')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    expect(call()[0]).toMatch(/deleted_at IS NULL/i);
  });
});

describe('collections read filtering', () => {
  test('the record list excludes deleted rows', async () => {
    await request(app).get('/api/collections').set('Authorization', ADMIN);

    expect(mockDb.all.mock.calls[0][0]).toMatch(/deleted_at IS NULL/i);
  });

  test('the record list still filters by month when both filters apply', async () => {
    await request(app)
      .get('/api/collections?month=8&year=2026')
      .set('Authorization', ADMIN);

    const sql = mockDb.all.mock.calls[0][0];
    expect(sql).toMatch(/deleted_at IS NULL/i);
    expect(sql).toMatch(/to_char/i);
  });

  test('fetching one record by id excludes deleted rows', async () => {
    mockDb.get.mockResolvedValue({ id: 7 });
    await request(app).get('/api/collections/7').set('Authorization', ADMIN);

    const call = mockDb.get.mock.calls.find(([sql]) => /FROM collections/i.test(sql));
    expect(call[0]).toMatch(/deleted_at IS NULL/i);
  });

  test('the detailed summary excludes deleted rows', async () => {
    mockDb.get.mockResolvedValue({});
    await request(app)
      .get('/api/collections/summary/detailed')
      .set('Authorization', ADMIN);

    const call = mockDb.get.mock.calls.find(([sql]) => /total_collections/i.test(sql));
    expect(call[0]).toMatch(/deleted_at IS NULL/i);
  });

  test('duplicate detection ignores deleted rows', async () => {
    await request(app)
      .post('/api/collections')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    const call = mockDb.get.mock.calls.find(([sql]) => /created_by, date FROM collections/i.test(sql));
    expect(call[0]).toMatch(/deleted_at IS NULL/i);
  });

  test('control number generation still sees deleted rows (unique constraint)', async () => {
    await request(app)
      .post('/api/collections')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    const call = mockDb.get.mock.calls.find(([sql]) => /control_number LIKE/i.test(sql));
    expect(call[0]).not.toMatch(/deleted_at IS NULL/i);
  });
});
