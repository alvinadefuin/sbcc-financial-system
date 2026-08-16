const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('./_lib/database', () => ({
  // Auth reads token_version on every request; anything else still answers null.
  get: jest.fn(async (sql) => (/SELECT token_version/i.test(sql) ? { token_version: 0 } : null)),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ rowCount: 1, lastID: 1 })),
}));

const app = require('./custom-fields');
const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church', role }, JWT_SECRET);

// Writing custom field values edits an existing record's data. Collectors add
// records from the phone, where the values ride along in the collection POST and
// are saved server-side — they never need this endpoint. Correcting a record is
// a desktop, admin-only action, so this gate matches edit rather than create.
describe('custom field values role gates', () => {
  test('user role cannot write field values', async () => {
    const res = await request(app)
      .post('/api/custom-fields/collections/1/values')
      .set('Authorization', tokenFor('user'))
      .send({ values: [{ field_id: 1, field_value: 'x' }] });
    expect(res.status).toBe(403);
  });

  test('admin role can write field values', async () => {
    const res = await request(app)
      .post('/api/custom-fields/collections/1/values')
      .set('Authorization', tokenFor('admin'))
      .send({ values: [{ field_id: 1, field_value: 'x' }] });
    expect(res.status).not.toBe(403);
  });

  test('user role can still read field values', async () => {
    const res = await request(app)
      .get('/api/custom-fields/collections/1/values')
      .set('Authorization', tokenFor('user'));
    expect(res.status).not.toBe(403);
  });

  test('user role can still read field definitions', async () => {
    const res = await request(app)
      .get('/api/custom-fields/collections')
      .set('Authorization', tokenFor('user'));
    expect(res.status).not.toBe(403);
  });
});
