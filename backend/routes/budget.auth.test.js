// Mirrors api/budget.auth.test.js. The Express and serverless routers are
// duplicate implementations, so the role gate has to be asserted against both
// or local development drifts away from production.
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church', role }, JWT_SECRET);

const planBody = { year: 2026, target_offering: 109916.67, categories: [] };

function makeApp() {
  jest.resetModules();
  const budgetRouter = require('./budget');
  const db = {
    get: jest.fn((sql, params, cb) => {
      const done = typeof params === 'function' ? params : cb;
      if (/token_version/i.test(sql)) return done(null, { token_version: 0 });
      done(null, null);
    }),
    all: jest.fn((sql, params, cb) => (typeof params === 'function' ? params : cb)(null, [])),
    run: jest.fn(function (sql, params, cb) {
      const done = typeof params === 'function' ? params : cb;
      if (typeof done === 'function') done.call({ lastID: 1 }, null);
    }),
    serialize: (fn) => fn(),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = db; next(); });
  app.use('/', budgetRouter);
  return app;
}

describe('budget role gates (express)', () => {
  test('a user may not write the budget plan', async () => {
    const res = await request(makeApp())
      .post('/plan')
      .set('Authorization', tokenFor('user'))
      .send(planBody);
    expect(res.status).toBe(403);
  });

  test('an admin may write the budget plan', async () => {
    const res = await request(makeApp())
      .post('/plan')
      .set('Authorization', tokenFor('admin'))
      .send(planBody);
    expect(res.status).not.toBe(403);
  });

  test('a user may still read the plan', async () => {
    const res = await request(makeApp())
      .get('/plan/2026')
      .set('Authorization', tokenFor('user'));
    expect(res.status).not.toBe(403);
  });
});
