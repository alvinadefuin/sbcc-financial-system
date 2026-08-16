// Mirrors api/custom-fields.auth.test.js. The Express router had no role gates
// at all while the serverless one required admin for every definition change —
// local development was more permissive than production, which is the drift the
// api/backend parity rule exists to prevent.
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// The router resolves its own handle at require time, separately from req.db.
const mockDb = {
  get: jest.fn((sql, params, cb) => cb(null, null)),
  all: jest.fn((sql, params, cb) => cb(null, [])),
  run: jest.fn(function (sql, params, cb) { if (cb) cb.call({ lastID: 1 }, null); }),
};
jest.mock('../config/database', () => ({ getDatabase: () => mockDb }));

const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church', role, tv: 0 }, JWT_SECRET);

function makeApp() {
  const app = express();
  app.use(express.json());
  // authenticateToken reads token_version off req.db, which server.js sets.
  app.use((req, _res, next) => {
    req.db = {
      get: jest.fn((sql, params, cb) =>
        /token_version/i.test(sql) ? cb(null, { token_version: 0 }) : cb(null, null)
      ),
      all: jest.fn((sql, params, cb) => cb(null, [])),
      run: jest.fn(function (sql, params, cb) { if (cb) cb.call({ lastID: 1 }, null); }),
    };
    next();
  });
  app.use('/', require('./customFields'));
  return app;
}

describe('custom fields role gates (express)', () => {
  test('user role cannot write field values', async () => {
    const res = await request(makeApp())
      .post('/collections/1/values')
      .set('Authorization', tokenFor('user'))
      .send({ values: [{ field_id: 1, field_value: 'x' }] });
    expect(res.status).toBe(403);
  });

  test('user role cannot create a field definition', async () => {
    const res = await request(makeApp())
      .post('/')
      .set('Authorization', tokenFor('user'))
      .send({ table_name: 'collections', field_name: 'x', field_label: 'X', field_type: 'text' });
    expect(res.status).toBe(403);
  });

  test('user role cannot edit a field definition', async () => {
    const res = await request(makeApp())
      .put('/manage/1')
      .set('Authorization', tokenFor('user'))
      .send({ field_label: 'X' });
    expect(res.status).toBe(403);
  });

  test('user role cannot delete a field definition', async () => {
    const res = await request(makeApp())
      .delete('/manage/1')
      .set('Authorization', tokenFor('user'));
    expect(res.status).toBe(403);
  });

  test('admin role is not blocked from writing field values', async () => {
    const res = await request(makeApp())
      .post('/collections/1/values')
      .set('Authorization', tokenFor('admin'))
      .send({ values: [{ field_id: 1, field_value: 'x' }] });
    expect(res.status).not.toBe(403);
  });

  test('user role can still read field definitions', async () => {
    const res = await request(makeApp())
      .get('/collections')
      .set('Authorization', tokenFor('user'));
    expect(res.status).not.toBe(403);
  });
});
