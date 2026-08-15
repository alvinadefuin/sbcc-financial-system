const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');

// The local server needs the same lockout as the serverless handler; without it
// a deployment of backend/ would have no brute-force protection at all.
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

const makeApp = (overrides = {}) => {
  const user = { ...baseUser, ...overrides };
  const tx = {
    run: jest.fn(async () => ({ changes: 1, lastID: 1 })),
    get: jest.fn(async () => null),
    all: jest.fn(async () => []),
  };
  const db = {
    tx,
    get: jest.fn((sql, params, cb) =>
      /token_version/i.test(sql) ? cb(null, { token_version: user.token_version }) : cb(null, user)
    ),
    all: jest.fn((sql, params, cb) => cb(null, [])),
    run: jest.fn(function (sql, params, cb) { if (cb) cb.call({ changes: 1, lastID: 1 }, null); }),
    withTransaction: jest.fn(async (fn) => fn(tx)),
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = db; next(); });
  app.use('/api/auth', require('./auth'));
  return { app, db, tx };
};

const login = (app, password) =>
  request(app).post('/api/auth/login').send({ email: baseUser.email, password });

const sqlOn = (runner) => runner.run.mock.calls.map(([sql]) => sql).join('\n');

test('a wrong password increments the failure counter', async () => {
  const { app, tx } = makeApp({ failed_login_attempts: 0 });

  const res = await login(app, 'wrong');

  expect(res.status).toBe(401);
  expect(sqlOn(tx)).toMatch(/failed_login_attempts/i);
});

test('the fifth consecutive failure sets locked_until', async () => {
  const { app, tx } = makeApp({ failed_login_attempts: 4 });

  await login(app, 'wrong');

  const lock = tx.run.mock.calls.find(([sql]) => /locked_until\s*=\s*now\(\)\s*\+/i.test(sql));
  expect(lock).toBeDefined();
});

test('a fourth failure does not lock the account', async () => {
  const { app, tx } = makeApp({ failed_login_attempts: 3 });

  await login(app, 'wrong');

  expect(tx.run.mock.calls.find(([sql]) => /locked_until\s*=\s*now\(\)\s*\+/i.test(sql))).toBeUndefined();
});

test('a locked account is refused with 423 even when the password is correct', async () => {
  const { app } = makeApp({ locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() });

  const res = await login(app, PASSWORD);

  expect(res.status).toBe(423);
  expect(res.body.retry_after_seconds).toBeGreaterThan(0);
  expect(res.body.token).toBeUndefined();
});

test('a locked account answers 423 for a wrong password too, revealing nothing', async () => {
  const { app } = makeApp({ locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() });

  const res = await login(app, 'wrong');

  expect(res.status).toBe(423);
});

test('an expired lock lets the correct password through', async () => {
  const { app } = makeApp({
    locked_until: new Date(Date.now() - 60 * 1000).toISOString(),
    failed_login_attempts: 5,
  });

  const res = await login(app, PASSWORD);

  expect(res.status).toBe(200);
  expect(res.body.token).toBeDefined();
});

test('a successful login clears the counter and the lock', async () => {
  const { app, tx } = makeApp({ failed_login_attempts: 3 });

  const res = await login(app, PASSWORD);

  expect(res.status).toBe(200);
  const reset = tx.run.mock.calls.find(([sql]) => /failed_login_attempts\s*=\s*0/i.test(sql));
  expect(reset).toBeDefined();
  expect(reset[0]).toMatch(/locked_until\s*=\s*NULL/i);
});
