const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key-change-this';
const AUTH = 'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church' }, JWT_SECRET);

function makeApp() {
  jest.resetModules();
  const collectionsRouter = require('./collections');
  const queryCalls = [];
  const db = {
    get: jest.fn((sql, params, cb) => {
      queryCalls.push({ sql, params });
      cb(null, null);
    }),
    run: jest.fn((sql, params, cb) => {
      if (typeof cb === 'function') cb.call({ lastID: 99 }, null);
    }),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = db; next(); });
  app.use('/', collectionsRouter);
  return { app, queryCalls };
}

describe('POST /collections — duplicate detection', () => {
  test('dupe check query includes AND payment_method = ?', async () => {
    const { app, queryCalls } = makeApp();

    await request(app)
      .post('/')
      .set('Authorization', AUTH)
      .send({
        date: '2026-01-05',
        control_number: 'TEST-001',
        general_tithes_offering: 5000,
        payment_method: 'GCash',
      });

    const dupeCall = queryCalls.find(c => c.sql.includes('total_amount'));
    expect(dupeCall).toBeDefined();
    expect(dupeCall.sql).toContain('AND payment_method = ?');
    expect(dupeCall.params).toContain('GCash');
  });

  test('when a Cash record exists, a GCash submission for same date+total is NOT blocked', async () => {
    jest.resetModules();
    const collectionsRouter = require('./collections');
    const db = {
      get: jest.fn((sql, params, cb) => {
        if (sql.includes('total_amount')) {
          // params[2] is payment_method — return a row only when payment_method matches Cash
          cb(null, params[2] === 'Cash' ? { id: 1, created_by: 'other', date: '2026-01-05' } : null);
        } else {
          cb(null, null);
        }
      }),
      run: jest.fn((sql, params, cb) => {
        if (typeof cb === 'function') cb.call({ lastID: 99 }, null);
      }),
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.db = db; next(); });
    app.use('/', collectionsRouter);

    const res = await request(app)
      .post('/')
      .set('Authorization', AUTH)
      .send({
        date: '2026-01-05',
        control_number: 'TEST-002',
        general_tithes_offering: 5000,
        payment_method: 'GCash',
      });

    expect(res.status).not.toBe(409);
  });
});
