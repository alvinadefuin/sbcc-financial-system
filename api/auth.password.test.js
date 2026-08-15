const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const mockTx = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 1 })),
};
const mockDb = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 1 })),
  withTransaction: jest.fn(async (fn) => fn(mockTx)),
};
jest.mock('./_lib/database', () => mockDb);

const app = require('./auth');
const JWT_SECRET = 'your-secret-key-change-this';

const CURRENT = 'current-pass-1';
const USER = {
  id: 3,
  email: 'member@sbcc.church',
  name: 'Member',
  role: 'user',
  is_active: true,
  token_version: 2,
  password_hash: bcrypt.hashSync(CURRENT, 10),
};

const tokenFor = (claims) => 'Bearer ' + jwt.sign(claims, JWT_SECRET);
const MEMBER = tokenFor({ id: 3, email: USER.email, role: 'user', tv: 2 });
// All three carry tv: 2 to match the stubbed stored version; revocation itself
// is covered in _lib/expressAuth.test.js and _lib/tokenVersion.test.js.
const SUPER = tokenFor({ id: 9, email: 'boss@sbcc.church', role: 'super_admin', tv: 2 });
const ADMIN = tokenFor({ id: 8, email: 'adm@sbcc.church', role: 'admin', tv: 2 });

// Answer the auth token_version probe, then the handler's own user lookup.
const lookupsReturn = (row, version = 2) => {
  mockDb.get.mockImplementation(async (sql) =>
    /SELECT token_version/i.test(sql) ? { token_version: version } : row
  );
};

const logCall = () => mockTx.run.mock.calls.find(([sql]) => /INSERT INTO activity_log/i.test(sql));

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.withTransaction.mockImplementation(async (fn) => fn(mockTx));
  lookupsReturn(USER);
});

describe('POST /api/auth/change-password', () => {
  test('rejects an unauthenticated caller', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ current_password: CURRENT, new_password: 'brand-new-pass' });

    expect(res.status).toBe(401);
  });

  test('rejects a wrong current password', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', MEMBER)
      .send({ current_password: 'not-it', new_password: 'brand-new-pass' });

    expect(res.status).toBe(401);
    expect(mockDb.withTransaction).not.toHaveBeenCalled();
  });

  test('rejects a new password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', MEMBER)
      .send({ current_password: CURRENT, new_password: 'short7c' });

    expect(res.status).toBe(400);
    expect(mockDb.withTransaction).not.toHaveBeenCalled();
  });

  test('stores a bcrypt hash, never the plaintext', async () => {
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', MEMBER)
      .send({ current_password: CURRENT, new_password: 'brand-new-pass' });

    const update = mockTx.run.mock.calls.find(([sql]) => /password_hash/i.test(sql));
    expect(update[1].some((p) => typeof p === 'string' && p.startsWith('$2'))).toBe(true);
    expect(JSON.stringify(mockTx.run.mock.calls)).not.toMatch(/brand-new-pass/);
  });

  test('increments token_version and returns a replacement token carrying it', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', MEMBER)
      .send({ current_password: CURRENT, new_password: 'brand-new-pass' });

    expect(res.status).toBe(200);
    const update = mockTx.run.mock.calls.find(([sql]) => /token_version/i.test(sql));
    expect(update[0]).toMatch(/token_version\s*=\s*token_version\s*\+\s*1/i);

    // Without a fresh token the caller is signed out the moment they succeed.
    expect(res.body.token).toBeDefined();
    expect(jwt.verify(res.body.token, JWT_SECRET).tv).toBe(3);
  });

  test('logs auth.password_change for the acting user', async () => {
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', MEMBER)
      .send({ current_password: CURRENT, new_password: 'brand-new-pass' });

    const [, params] = logCall();
    expect(params[0]).toBe('member@sbcc.church');
    expect(params[2]).toBe('auth.password_change');
    expect(JSON.stringify(params)).not.toMatch(/brand-new-pass|current-pass-1/);
  });
});

describe('PUT /api/auth/users/:id/password', () => {
  test('a super_admin may reset another account', async () => {
    const res = await request(app)
      .put('/api/auth/users/3/password')
      .set('Authorization', SUPER)
      .send({ new_password: 'reset-by-boss' });

    expect(res.status).toBe(200);
    const update = mockTx.run.mock.calls.find(([sql]) => /token_version/i.test(sql));
    expect(update[0]).toMatch(/token_version\s*=\s*token_version\s*\+\s*1/i);
  });

  test('an admin may not', async () => {
    const res = await request(app)
      .put('/api/auth/users/3/password')
      .set('Authorization', ADMIN)
      .send({ new_password: 'reset-by-admin' });

    expect(res.status).toBe(403);
    expect(mockDb.withTransaction).not.toHaveBeenCalled();
  });

  test('rejects a short password', async () => {
    const res = await request(app)
      .put('/api/auth/users/3/password')
      .set('Authorization', SUPER)
      .send({ new_password: 'short7c' });

    expect(res.status).toBe(400);
  });

  test('404s for a user that does not exist', async () => {
    lookupsReturn(null);

    const res = await request(app)
      .put('/api/auth/users/404/password')
      .set('Authorization', SUPER)
      .send({ new_password: 'reset-by-boss' });

    expect(res.status).toBe(404);
  });

  test('logs auth.password_change against the target account, with no new token', async () => {
    const res = await request(app)
      .put('/api/auth/users/3/password')
      .set('Authorization', SUPER)
      .send({ new_password: 'reset-by-boss' });

    const [, params] = logCall();
    expect(params[0]).toBe('boss@sbcc.church');
    expect(params[2]).toBe('auth.password_change');
    expect(params[3]).toBe('user');
    expect(params[4]).toBe(3);
    expect(res.body.token).toBeUndefined();
  });
});

describe('GET /api/auth/me honours revocation', () => {
  // The frontend calls /me on every page load to restore the session. If it
  // accepted a revoked token the user would appear signed in while every other
  // request 401'd.
  test('a current token reads the profile', async () => {
    lookupsReturn(USER);

    const res = await request(app).get('/api/auth/me').set('Authorization', MEMBER);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('member@sbcc.church');
  });

  test('a revoked token is refused with 401', async () => {
    lookupsReturn(USER, 9); // stored version moved past the token's tv: 2

    const res = await request(app).get('/api/auth/me').set('Authorization', MEMBER);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_REVOKED');
  });
});
