const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('./_lib/database', () => ({
  // Auth reads token_version on every request; anything else still answers null.
  get: jest.fn(async (sql) => (/SELECT token_version/i.test(sql) ? { token_version: 0 } : null)),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ rowCount: 1, lastID: 1 })),
}));
jest.mock('./_lib/customFieldsHelper', () => ({
  enrichRecordsWithCustomFields: jest.fn(async (rows) => rows),
  getCustomFieldValues: jest.fn(async () => ({})),
  saveCustomFieldValues: jest.fn(async () => {}),
}));

const app = require('./collections');
const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church', role }, JWT_SECRET);

describe('collections role gates', () => {
  // Mobile is the only channel for adding records (see the 2026-06-14
  // desktop-edit-delete-only design), and collectors hold `user`. Creating is
  // therefore open to any signed-in account; only editing and deleting are not.
  test('user role can create', async () => {
    const res = await request(app)
      .post('/api/collections')
      .set('Authorization', tokenFor('user'))
      .send({ date: '2026-08-15', total_amount: 100 });
    expect(res.status).not.toBe(403);
  });

  test('user role cannot update', async () => {
    const res = await request(app)
      .put('/api/collections/1')
      .set('Authorization', tokenFor('user'))
      .send({ date: '2026-08-15' });
    expect(res.status).toBe(403);
  });

  test('user role cannot delete', async () => {
    const res = await request(app)
      .delete('/api/collections/1')
      .set('Authorization', tokenFor('user'));
    expect(res.status).toBe(403);
  });

  test('user role can still read', async () => {
    const res = await request(app)
      .get('/api/collections')
      .set('Authorization', tokenFor('user'));
    expect(res.status).toBe(200);
  });

  test('admin role is not blocked by the role gate on delete', async () => {
    const res = await request(app)
      .delete('/api/collections/1')
      .set('Authorization', tokenFor('admin'));
    expect(res.status).not.toBe(403);
  });
});
