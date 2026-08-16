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

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.run.mockResolvedValue({ rowCount: 1 });
  // User mutations now run inside a transaction, so the role UPDATE lands on tx.
  mockTx.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.withTransaction.mockImplementation(async (fn) => fn(mockTx));
  // The guard now counts super admins on the transaction, with FOR UPDATE.
  mockTx.all.mockResolvedValue([{ id: 1 }, { id: 2 }]);
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

// Authorization reads the role out of the JWT, never the database, so a role
// change is invisible to a session minted before it. Promote a collector and
// their phone keeps getting 403 for up to 7 days; demote an admin and they keep
// admin powers for just as long. Bumping token_version ends the old session, so
// the next sign-in mints a token carrying the new role.
describe('a role or activation change revokes existing sessions', () => {
  test('changing a role bumps token_version', async () => {
    getReturns({ id: 1, email: 'target@sbcc.church', role: 'user' });

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    const bump = mockTx.run.mock.calls.find(([sql]) => /token_version\s*=/i.test(sql));
    expect(bump).toBeDefined();
    expect(bump[0]).toMatch(/token_version\s*=\s*(COALESCE\()?token_version/i);
  });

  test('deactivating an account bumps token_version', async () => {
    getReturns({ id: 1, email: 'target@sbcc.church', role: 'admin', is_active: true });

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ is_active: false });

    expect(res.status).toBe(200);
    const bump = mockTx.run.mock.calls.find(([sql]) => /token_version\s*=/i.test(sql));
    expect(bump).toBeDefined();
  });

  test('renaming an account leaves the session alone', async () => {
    getReturns({ id: 1, email: 'target@sbcc.church', role: 'admin' });

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ name: 'New Name' });

    expect(res.status).toBe(200);
    const bump = mockTx.run.mock.calls.find(([sql]) => /token_version\s*=/i.test(sql));
    expect(bump).toBeUndefined();
  });

  test('setting a role to the value it already has leaves the session alone', async () => {
    getReturns({ id: 1, email: 'target@sbcc.church', role: 'admin' });

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    const bump = mockTx.run.mock.calls.find(([sql]) => /token_version\s*=/i.test(sql));
    expect(bump).toBeUndefined();
  });
});

test('creating a super_admin directly is still refused', async () => {
  const res = await request(app)
    .post('/api/auth/users')
    .set('Authorization', tokenFor('super_admin'))
    .send({ email: 'new@sbcc.church', name: 'New', role: 'super_admin' });

  expect(res.status).toBe(403);
});

describe('last-super-admin guard', () => {
  const targetIsLastSuper = (remaining) => {
    getReturns({ id: 1, email: 'last@sbcc.church', role: 'super_admin', is_active: true });
    mockTx.all.mockResolvedValue(remaining);
  };

  test('the count that guards the change is taken on the transaction, with FOR UPDATE', async () => {
    // Counting on the pool before the transaction let two concurrent demotions
    // both read "there are still two of us" and both proceed.
    targetIsLastSuper([{ id: 1 }, { id: 2 }]);

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    const counted = mockTx.all.mock.calls.find(([sql]) => /super_admin/i.test(sql));
    expect(counted).toBeDefined();
    expect(counted[0]).toMatch(/FOR UPDATE/i);
  });

  test('demoting the only active super_admin is refused with 409', async () => {
    targetIsLastSuper([{ id: 1 }]);

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/last super admin/i);
  });

  test('deactivating the only active super_admin is refused with 409', async () => {
    targetIsLastSuper([{ id: 1 }]);

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ is_active: false });

    expect(res.status).toBe(409);
  });

  test('demoting one of two super_admins is allowed', async () => {
    targetIsLastSuper([{ id: 1 }, { id: 2 }]);

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
  });

  test('deleting a super admin is refused with a 409 that explains why', async () => {
    getReturns({ id: 1, email: 'boss@sbcc.church', role: 'super_admin', is_active: true });

    const res = await request(app)
      .delete('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'));

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/super admin/i);
    expect(mockDb.run.mock.calls.some(([sql]) => /DELETE FROM users/i.test(sql))).toBe(false);
  });
});
