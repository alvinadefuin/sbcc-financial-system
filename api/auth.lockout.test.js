const request = require('supertest');
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

const PASSWORD = 'correct-horse';
const baseUser = {
  id: 3,
  email: 'member@sbcc.church',
  name: 'Member',
  role: 'user',
  is_active: true,
  token_version: 0,
  failed_login_attempts: 0,
  locked_until: null,
  password_hash: bcrypt.hashSync(PASSWORD, 10),
};

const userIs = (overrides) => {
  const row = { ...baseUser, ...overrides };
  mockDb.get.mockImplementation(async (sql) =>
    /SELECT token_version/i.test(sql) ? { token_version: row.token_version } : row
  );
};

const sqlOn = (runner) => runner.run.mock.calls.map(([sql]) => sql).join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.withTransaction.mockImplementation(async (fn) => fn(mockTx));
});

test('a wrong password increments the failure counter in the same transaction as the log', async () => {
  userIs({ failed_login_attempts: 0 });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: baseUser.email, password: 'wrong' });

  expect(res.status).toBe(401);
  expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
  expect(sqlOn(mockTx)).toMatch(/failed_login_attempts/i);
  expect(sqlOn(mockTx)).toMatch(/INSERT INTO activity_log/i);
});

test('the fifth consecutive failure sets locked_until', async () => {
  userIs({ failed_login_attempts: 4 });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: baseUser.email, password: 'wrong' });

  expect(res.status).toBe(401);
  const lock = mockTx.run.mock.calls.find(([sql]) => /locked_until/i.test(sql));
  expect(lock).toBeDefined();
  expect(lock[0]).toMatch(/locked_until\s*=\s*now\(\)\s*\+/i);
});

test('a fourth failure does not lock the account', async () => {
  userIs({ failed_login_attempts: 3 });

  await request(app).post('/api/auth/login').send({ email: baseUser.email, password: 'wrong' });

  expect(mockTx.run.mock.calls.find(([sql]) => /locked_until\s*=\s*now\(\)/i.test(sql))).toBeUndefined();
});

test('a locked account is refused with 423 even when the password is correct', async () => {
  userIs({ locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: baseUser.email, password: PASSWORD });

  expect(res.status).toBe(423);
  expect(res.body.retry_after_seconds).toBeGreaterThan(0);
  expect(res.body.token).toBeUndefined();
});

test('a locked account answers 423 identically for a wrong password, revealing nothing', async () => {
  userIs({ locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: baseUser.email, password: 'wrong' });

  expect(res.status).toBe(423);
});

test('an expired lock lets the correct password through', async () => {
  userIs({ locked_until: new Date(Date.now() - 60 * 1000).toISOString(), failed_login_attempts: 5 });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: baseUser.email, password: PASSWORD });

  expect(res.status).toBe(200);
  expect(res.body.token).toBeDefined();
});

test('a successful login clears the counter and the lock', async () => {
  userIs({ failed_login_attempts: 3 });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: baseUser.email, password: PASSWORD });

  expect(res.status).toBe(200);
  const reset = mockTx.run.mock.calls.find(([sql]) => /failed_login_attempts\s*=\s*0/i.test(sql));
  expect(reset).toBeDefined();
  expect(reset[0]).toMatch(/locked_until\s*=\s*NULL/i);
});

test('an unknown email still logs without opening a transaction', async () => {
  mockDb.get.mockImplementation(async (sql) =>
    /SELECT token_version/i.test(sql) ? { token_version: 0 } : null
  );

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'nobody@example.com', password: 'whatever' });

  expect(res.status).toBe(401);
  expect(mockDb.withTransaction).not.toHaveBeenCalled();
  expect(sqlOn(mockDb)).toMatch(/INSERT INTO activity_log/i);
});
