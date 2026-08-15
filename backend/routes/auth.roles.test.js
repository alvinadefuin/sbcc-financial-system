const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 9, email: 'actor@sbcc.church', role, tv: 0 }, JWT_SECRET);

const makeApp = (target) => {
  const db = {
    get: jest.fn((sql, params, cb) => {
      if (/token_version/i.test(sql)) return cb(null, { token_version: 0 });
      return cb(null, target);
    }),
    all: jest.fn((sql, params, cb) => cb(null, [{ id: 1 }, { id: 2 }])),
    run: jest.fn(function (sql, params, cb) { if (cb) cb.call({ changes: 1, lastID: 1 }, null); }),
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = db; next(); });
  app.use('/api/auth', require('./auth'));
  return { app, db };
};

test('promoting to super_admin as an admin is an explicit 403, not a silent no-op', async () => {
  const { app, db } = makeApp({ id: 1, email: 't@sbcc.church', role: 'user', is_active: true });

  const res = await request(app)
    .put('/api/auth/users/1')
    .set('Authorization', tokenFor('admin'))
    .send({ role: 'super_admin' });

  expect(res.status).toBe(403);
  expect(db.run.mock.calls.some(([sql]) => /role\s*=/.test(sql))).toBe(false);
});

test('a super_admin may promote another account to super_admin', async () => {
  const { app, db } = makeApp({ id: 1, email: 't@sbcc.church', role: 'admin', is_active: true });

  const res = await request(app)
    .put('/api/auth/users/1')
    .set('Authorization', tokenFor('super_admin'))
    .send({ role: 'super_admin' });

  expect(res.status).toBe(200);
  const roleUpdate = db.run.mock.calls.find(([sql]) => /role\s*=/.test(sql));
  expect(roleUpdate[1]).toContain('super_admin');
});
