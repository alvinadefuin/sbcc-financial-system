const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('./_lib/database', () => ({
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ rowCount: 1, lastID: 1 })),
}));
jest.mock('./_lib/customFieldsHelper', () => ({
  enrichRecordsWithCustomFields: jest.fn(async (rows) => rows),
  getCustomFieldValues: jest.fn(async () => ({})),
  saveCustomFieldValues: jest.fn(async () => {}),
}));

const app = require('./expenses');
const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church', role }, JWT_SECRET);

describe('expenses role gates', () => {
  test('user role cannot create', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', tokenFor('user'))
      .send({ date: '2026-08-15', total_amount: 100 });
    expect(res.status).toBe(403);
  });

  test('user role cannot update', async () => {
    const res = await request(app)
      .put('/api/expenses/1')
      .set('Authorization', tokenFor('user'))
      .send({ date: '2026-08-15' });
    expect(res.status).toBe(403);
  });

  test('user role cannot delete', async () => {
    const res = await request(app)
      .delete('/api/expenses/1')
      .set('Authorization', tokenFor('user'));
    expect(res.status).toBe(403);
  });

  test('user role can still read', async () => {
    const res = await request(app)
      .get('/api/expenses')
      .set('Authorization', tokenFor('user'));
    expect(res.status).toBe(200);
  });

  test('super_admin is not blocked by the role gate on delete', async () => {
    const res = await request(app)
      .delete('/api/expenses/1')
      .set('Authorization', tokenFor('super_admin'));
    expect(res.status).not.toBe(403);
  });
});
