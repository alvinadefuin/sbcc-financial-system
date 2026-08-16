const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('./_lib/database', () => ({
  // Auth reads token_version on every request; anything else still answers null.
  get: jest.fn(async (sql) => (/SELECT token_version/i.test(sql) ? { token_version: 0 } : null)),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ rowCount: 1, lastID: 1 })),
}));

const app = require('./google-sheets');
const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church', role }, JWT_SECRET);

// These handlers are 503 stubs today — the live sync is POST /api/reports/sync-sheet,
// which is already admin-only. Gate them anyway so that if the export is ever
// implemented here it does not arrive open to every signed-in account.
describe('google sheets role gates', () => {
  test('user role cannot trigger an export', async () => {
    const res = await request(app)
      .post('/api/google-sheets/export')
      .set('Authorization', tokenFor('user'));
    expect(res.status).toBe(403);
  });

  test('user role cannot trigger the connection test', async () => {
    const res = await request(app)
      .post('/api/google-sheets/test')
      .set('Authorization', tokenFor('user'));
    expect(res.status).toBe(403);
  });

  test('admin role is not blocked by the role gate on export', async () => {
    const res = await request(app)
      .post('/api/google-sheets/export')
      .set('Authorization', tokenFor('admin'));
    expect(res.status).not.toBe(403);
  });

  test('user role can still read the integration status', async () => {
    const res = await request(app)
      .get('/api/google-sheets/status')
      .set('Authorization', tokenFor('user'));
    expect(res.status).not.toBe(403);
  });
});
