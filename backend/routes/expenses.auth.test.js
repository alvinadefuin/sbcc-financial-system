// Mirrors api/expenses.auth.test.js. The Express and serverless routers are
// duplicate implementations of the same endpoints, so the role gates have to be
// asserted against both or local development drifts away from production.
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church', role }, JWT_SECRET);

function makeApp() {
  jest.resetModules();
  const expensesRouter = require('./expenses');
  const db = {
    get: jest.fn((sql, params, cb) => {
      if (/token_version/i.test(sql)) return cb(null, { token_version: 0 });
      cb(null, null);
    }),
    all: jest.fn((sql, params, cb) => cb(null, [])),
    run: jest.fn((sql, params, cb) => {
      if (typeof cb === 'function') cb.call({ lastID: 99 }, null);
    }),
    withTransaction: async (fn) => fn({
      run: async () => ({ changes: 1, lastID: 99 }),
      get: async () => null,
      all: async () => [],
    }),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = db; next(); });
  app.use('/', expensesRouter);
  return app;
}

describe('expenses role gates (express)', () => {
  // Mobile is the only channel for adding records (see the 2026-06-14
  // desktop-edit-delete-only design), and collectors hold `user`.
  test('user role can create', async () => {
    const res = await request(makeApp())
      .post('/')
      .set('Authorization', tokenFor('user'))
      .send({ date: '2026-08-15', particular: 'Test', total_amount: 100 });
    expect(res.status).not.toBe(403);
  });

  test('user role cannot update', async () => {
    const res = await request(makeApp())
      .put('/1')
      .set('Authorization', tokenFor('user'))
      .send({ date: '2026-08-15' });
    expect(res.status).toBe(403);
  });

  test('user role cannot delete', async () => {
    const res = await request(makeApp())
      .delete('/1')
      .set('Authorization', tokenFor('user'));
    expect(res.status).toBe(403);
  });

  test('admin role can create', async () => {
    const res = await request(makeApp())
      .post('/')
      .set('Authorization', tokenFor('admin'))
      .send({ date: '2026-08-15', particular: 'Test', total_amount: 100 });
    expect(res.status).not.toBe(403);
  });
});
