const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const mockTx = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 5 })),
};
const mockDb = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 5 })),
  withTransaction: jest.fn(async (fn) => fn(mockTx)),
};
jest.mock('./_lib/database', () => mockDb);

const app = require('./auth');
const JWT_SECRET = 'your-secret-key-change-this';
const SUPER =
  'Bearer ' + jwt.sign({ id: 9, email: 'boss@sbcc.church', role: 'super_admin' }, JWT_SECRET);

const PASSWORD = 'correct-horse';
const USER = {
  id: 3,
  email: 'member@sbcc.church',
  name: 'Member',
  role: 'user',
  is_active: true,
  password_hash: bcrypt.hashSync(PASSWORD, 10),
};

const logFrom = (calls) => calls.find(([sql]) => /INSERT INTO activity_log/i.test(sql));
const txLog = () => logFrom(mockTx.run.mock.calls);
const dbLog = () => logFrom(mockDb.run.mock.calls);

// Auth now reads token_version on every request. Route that probe past whatever
// this test wants the handler's own lookup to return.
const getReturns = (row) =>
  mockDb.get.mockImplementation(async (sql) =>
    /SELECT token_version/i.test(sql) ? { token_version: 0 } : row
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.run.mockResolvedValue({ changes: 1, lastID: 5 });
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 5 });
  getReturns(null);
  mockDb.withTransaction.mockImplementation(async (fn) => fn(mockTx));
});

describe('login', () => {
  test('a successful login logs auth.login_success for that user', async () => {
    getReturns(USER);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: USER.email, password: PASSWORD });

    expect(res.status).toBe(200);
    const [, params] = txLog();
    expect(params[0]).toBe('member@sbcc.church');
    expect(params[1]).toBe('user');
    expect(params[2]).toBe('auth.login_success');
  });

  test('a wrong password logs auth.login_failed against the known account', async () => {
    getReturns(USER);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: USER.email, password: 'wrong' });

    expect(res.status).toBe(401);
    // A failure against a known account now also increments its counter, so the
    // log entry rides that transaction rather than going through the pool.
    const [, params] = txLog();
    expect(params[0]).toBe('member@sbcc.church');
    expect(params[2]).toBe('auth.login_failed');
  });

  test('a login for an unknown email logs with a null actor', async () => {
    getReturns(null);

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });

    const [, params] = dbLog();
    expect(params[0]).toBeNull();
    expect(params[2]).toBe('auth.login_failed');
    expect(params[5]).toMatch(/nobody@example\.com/);
  });

  test('no log entry ever carries password material', async () => {
    getReturns(USER);

    await request(app)
      .post('/api/auth/login')
      .send({ email: USER.email, password: PASSWORD });
    await request(app)
      .post('/api/auth/login')
      .send({ email: USER.email, password: 'hunter2' });

    const everything = JSON.stringify([...mockTx.run.mock.calls, ...mockDb.run.mock.calls]);
    expect(everything).not.toMatch(/hunter2/);
    expect(everything).not.toMatch(/\$2a\$/);
    expect(everything).not.toMatch(new RegExp(PASSWORD));
  });
});

describe('user administration', () => {
  test('creating a user logs user.create with the new account id', async () => {
    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', SUPER)
      .send({ email: 'new@sbcc.church', name: 'New Person', role: 'user' });

    expect(res.status).toBe(200);
    const [, params] = txLog();
    expect(params[0]).toBe('boss@sbcc.church');
    expect(params[2]).toBe('user.create');
    expect(params[3]).toBe('user');
    expect(params[4]).toBe(5);
    expect(params[5]).toMatch(/new@sbcc\.church/);
  });

  test('updating a user logs user.update with a role diff', async () => {
    getReturns({ id: 3, email: 'member@sbcc.church', name: 'Member', role: 'user', is_active: true });

    const res = await request(app)
      .put('/api/auth/users/3')
      .set('Authorization', SUPER)
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    const [, params] = txLog();
    expect(params[2]).toBe('user.update');
    expect(params[4]).toBe(3);
    expect(JSON.parse(params[6])).toEqual({ role: { from: 'user', to: 'admin' } });
  });

  test('a rejected promotion writes no log entry', async () => {
    getReturns({ id: 3, email: 'member@sbcc.church', role: 'user', is_active: true });
    const ADMIN = 'Bearer ' + jwt.sign({ id: 8, email: 'adm@sbcc.church', role: 'admin' }, JWT_SECRET);

    const res = await request(app)
      .put('/api/auth/users/3')
      .set('Authorization', ADMIN)
      .send({ role: 'super_admin' });

    expect(res.status).toBe(403);
    expect(txLog()).toBeUndefined();
    expect(dbLog()).toBeUndefined();
  });
});
