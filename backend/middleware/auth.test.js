const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const { authenticateToken, requireRole } = require('./auth');

const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (claims) => 'Bearer ' + jwt.sign(claims, JWT_SECRET);

const makeApp = (db, guards = [authenticateToken]) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = db; next(); });
  app.get('/thing', ...guards, (req, res) => res.json({ ok: true, email: req.user.email }));
  return app;
};

const dbWithVersion = (version) => ({
  get: jest.fn((sql, params, cb) => cb(null, { token_version: version })),
});

test('a valid current token passes through', async () => {
  const res = await request(makeApp(dbWithVersion(2)))
    .get('/thing')
    .set('Authorization', tokenFor({ id: 1, email: 'a@b.c', role: 'admin', tv: 2 }));

  expect(res.status).toBe(200);
  expect(res.body.email).toBe('a@b.c');
});

test('a revoked token is refused with 401 so the client signs out', async () => {
  const res = await request(makeApp(dbWithVersion(3)))
    .get('/thing')
    .set('Authorization', tokenFor({ id: 1, email: 'a@b.c', role: 'admin', tv: 2 }));

  expect(res.status).toBe(401);
  expect(res.body.code).toBe('TOKEN_REVOKED');
});

test('a token minted before the tv claim existed still works', async () => {
  const res = await request(makeApp(dbWithVersion(0)))
    .get('/thing')
    .set('Authorization', tokenFor({ id: 1, email: 'a@b.c', role: 'admin' }));

  expect(res.status).toBe(200);
});

test('no token is 401', async () => {
  const res = await request(makeApp(dbWithVersion(0))).get('/thing');
  expect(res.status).toBe(401);
});

test('a garbage token is 403', async () => {
  const res = await request(makeApp(dbWithVersion(0)))
    .get('/thing')
    .set('Authorization', 'Bearer not-a-token');

  expect(res.status).toBe(403);
});

test('a promise-style req.db is accepted as well as a callback-style one', async () => {
  // reports.js is driven with a promise db in its tests; a callback-only
  // middleware would hang there rather than fail loudly.
  const promiseDb = { get: jest.fn(async () => ({ token_version: 1 })) };

  const res = await request(makeApp(promiseDb))
    .get('/thing')
    .set('Authorization', tokenFor({ id: 1, email: 'a@b.c', role: 'admin', tv: 1 }));

  expect(res.status).toBe(200);
});

test('a promise-style db that rejects is a 500, not a hang', async () => {
  const promiseDb = { get: jest.fn(async () => { throw new Error('connection lost'); }) };

  const res = await request(makeApp(promiseDb))
    .get('/thing')
    .set('Authorization', tokenFor({ id: 1, email: 'a@b.c', role: 'admin', tv: 0 }));

  expect(res.status).toBe(500);
});

test('requireRole refuses a role outside the list', async () => {
  const res = await request(makeApp(dbWithVersion(0), [authenticateToken, requireRole(['super_admin'])]))
    .get('/thing')
    .set('Authorization', tokenFor({ id: 1, email: 'a@b.c', role: 'admin', tv: 0 }));

  expect(res.status).toBe(403);
});
