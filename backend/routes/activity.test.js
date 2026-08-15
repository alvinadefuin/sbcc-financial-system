const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'actor@sbcc.church', role }, JWT_SECRET);

const ENTRY = {
  id: 1,
  occurred_at: '2026-08-15T04:00:00.000Z',
  actor_email: 'admin@sbcc.church',
  actor_role: 'admin',
  action: 'record.create',
  entity_type: 'collection',
  entity_id: 7,
  summary: 'Created collection 2026-08-15 for 5000.00',
  changes: null,
};

const makeApp = (db) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = db; next(); });
  app.use('/api/activity', require('./activity'));
  return app;
};

const db = {
  get: jest.fn((sql, params, cb) =>
    /token_version/i.test(sql) ? cb(null, { token_version: 0 }) : cb(null, { count: '1' })
  ),
  all: jest.fn((sql, params, cb) => cb(null, [ENTRY])),
};

beforeEach(() => jest.clearAllMocks());

test('super_admin reads the log', async () => {
  const res = await request(makeApp(db)).get('/api/activity').set('Authorization', tokenFor('super_admin'));

  expect(res.status).toBe(200);
  expect(res.body.entries).toHaveLength(1);
  expect(res.body.total).toBe(1);
});

test('admin is refused', async () => {
  const res = await request(makeApp(db)).get('/api/activity').set('Authorization', tokenFor('admin'));
  expect(res.status).toBe(403);
});

test('filters and pagination reach the query', async () => {
  await request(makeApp(db))
    .get('/api/activity?entity_type=expense&limit=10&offset=5')
    .set('Authorization', tokenFor('super_admin'));

  const [sql, params] = db.all.mock.calls[0];
  expect(sql).toMatch(/entity_type = \?/);
  expect(params).toEqual(['expense', 10, 5]);
});
