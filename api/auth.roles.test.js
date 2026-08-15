const request = require('supertest');
const jwt = require('jsonwebtoken');

// Must be `mock`-prefixed: jest hoists jest.mock() above this declaration and
// only permits the factory to close over names matching /^mock/i.
const mockTx = { get: jest.fn(), all: jest.fn(), run: jest.fn() };
const mockDb = {
  get: jest.fn(),
  all: jest.fn(),
  run: jest.fn(),
  withTransaction: jest.fn(async (fn) => fn(mockTx)),
};
jest.mock('./_lib/database', () => mockDb);

const app = require('./auth');
const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 9, email: 'actor@sbcc.church', role }, JWT_SECRET);

// Auth now reads token_version on every request. Route that probe past whatever
// this test wants the handler's own lookup to return.
const getReturns = (row) =>
  mockDb.get.mockImplementation(async (sql) =>
    /SELECT token_version/i.test(sql) ? { token_version: 0 } : row
  );

// Route each db.get by its SQL rather than by call order: the auth
// token_version probe now runs before the handler's own lookups.
const routeGet = (userRow, countRow) =>
  mockDb.get.mockImplementation(async (sql) => {
    if (/SELECT token_version/i.test(sql)) return { token_version: 0 };
    if (/COUNT\(\*\)/i.test(sql)) return countRow;
    return userRow;
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.run.mockResolvedValue({ rowCount: 1 });
  // User mutations now run inside a transaction, so the role UPDATE lands on tx.
  mockTx.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.withTransaction.mockImplementation(async (fn) => fn(mockTx));
});

test('admin cannot promote a user to super_admin', async () => {
  getReturns({ id: 1, email: 'target@sbcc.church', role: 'user' });

  const res = await request(app)
    .put('/api/auth/users/1')
    .set('Authorization', tokenFor('admin'))
    .send({ role: 'super_admin' });

  expect(res.status).toBe(403);
});

test('super_admin can promote a user to super_admin', async () => {
  getReturns({ id: 1, email: 'target@sbcc.church', role: 'admin' });

  const res = await request(app)
    .put('/api/auth/users/1')
    .set('Authorization', tokenFor('super_admin'))
    .send({ role: 'super_admin' });

  expect(res.status).toBe(200);
  const roleUpdate = mockTx.run.mock.calls.find(([sql]) => /role\s*=/.test(sql));
  expect(roleUpdate).toBeDefined();
  expect(roleUpdate[1]).toContain('super_admin');
});

test('creating a super_admin directly is still refused', async () => {
  const res = await request(app)
    .post('/api/auth/users')
    .set('Authorization', tokenFor('super_admin'))
    .send({ email: 'new@sbcc.church', name: 'New', role: 'super_admin' });

  expect(res.status).toBe(403);
});

describe('last-super-admin guard', () => {
  test('demoting the only active super_admin is refused with 409', async () => {
    routeGet({ id: 1, email: 'last@sbcc.church', role: 'super_admin' }, { count: '1' });

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/last super admin/i);
  });

  test('deactivating the only active super_admin is refused with 409', async () => {
    routeGet({ id: 1, email: 'last@sbcc.church', role: 'super_admin' }, { count: '1' });

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ is_active: false });

    expect(res.status).toBe(409);
  });

  test('demoting one of two super_admins is allowed', async () => {
    routeGet({ id: 1, email: 'one@sbcc.church', role: 'super_admin' }, { count: '2' });

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
  });
});
