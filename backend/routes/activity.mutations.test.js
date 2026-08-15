const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key-change-this';
const ADMIN =
  'Bearer ' + jwt.sign({ id: 1, email: 'admin@sbcc.church', role: 'admin' }, JWT_SECRET);

// The local server hands routes a callback-style req.db. withTransaction is
// promise-based on both adapters, so the fake mirrors that shape.
const makeDb = () => {
  const tx = { run: jest.fn(async () => ({ changes: 1, lastID: 11 })), get: jest.fn(async () => null), all: jest.fn(async () => []) };
  const db = {
    tx,
    get: jest.fn((sql, params, cb) =>
      /token_version/i.test(sql)
        ? cb(null, { token_version: 0 })
        : cb(null, { id: 7, date: '2026-08-15', total_amount: '5000.00' })
    ),
    all: jest.fn((sql, params, cb) => cb(null, [])),
    run: jest.fn(function (sql, params, cb) { if (cb) cb.call({ changes: 1, lastID: 11 }, null); }),
    withTransaction: jest.fn(async (fn) => fn(tx)),
  };
  return db;
};

const mount = (router, db) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = db; next(); });
  app.use('/api/collections', router);
  return app;
};

const logCall = (db) => db.tx.run.mock.calls.find(([sql]) => /INSERT INTO activity_log/i.test(sql));

test('deleting a collection locally logs record.delete in the same transaction', async () => {
  const db = makeDb();
  const app = mount(require('./collections'), db);

  const res = await request(app).delete('/api/collections/7').set('Authorization', ADMIN);

  expect(res.status).toBe(200);
  expect(db.withTransaction).toHaveBeenCalledTimes(1);
  const [, params] = logCall(db);
  expect(params[0]).toBe('admin@sbcc.church');
  expect(params[2]).toBe('record.delete');
  expect(params[3]).toBe('collection');
});

test('a missing collection is neither deleted nor logged locally', async () => {
  const db = makeDb();
  db.get = jest.fn((sql, params, cb) =>
    /token_version/i.test(sql) ? cb(null, { token_version: 0 }) : cb(null, undefined)
  );
  const app = mount(require('./collections'), db);

  const res = await request(app).delete('/api/collections/7').set('Authorization', ADMIN);

  expect(res.status).toBe(404);
  expect(logCall(db)).toBeUndefined();
});
