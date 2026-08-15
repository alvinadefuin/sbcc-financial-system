const request = require('supertest');
const jwt = require('jsonwebtoken');

// Must be `mock`-prefixed: jest hoists jest.mock() above this declaration and
// only permits the factory to close over names matching /^mock/i.
const mockDb = { get: jest.fn(), all: jest.fn(), run: jest.fn() };
jest.mock('./_lib/database', () => mockDb);

const app = require('./auth');
const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 9, email: 'actor@sbcc.church', role }, JWT_SECRET);

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.run.mockResolvedValue({ rowCount: 1 });
});

test('admin cannot promote a user to super_admin', async () => {
  mockDb.get.mockResolvedValue({ id: 1, email: 'target@sbcc.church', role: 'user' });

  const res = await request(app)
    .put('/api/auth/users/1')
    .set('Authorization', tokenFor('admin'))
    .send({ role: 'super_admin' });

  expect(res.status).toBe(403);
});

test('super_admin can promote a user to super_admin', async () => {
  mockDb.get.mockResolvedValue({ id: 1, email: 'target@sbcc.church', role: 'admin' });

  const res = await request(app)
    .put('/api/auth/users/1')
    .set('Authorization', tokenFor('super_admin'))
    .send({ role: 'super_admin' });

  expect(res.status).toBe(200);
  const roleUpdate = mockDb.run.mock.calls.find(([sql]) => /role\s*=/.test(sql));
  expect(roleUpdate).toBeDefined();
  expect(roleUpdate[1]).toContain('super_admin');
});

test('creating a super_admin directly is still refused', async () => {
  const res = await request(app)
    .post('/api/auth/users')
    .set('Authorization', tokenFor('super_admin'))
    .send({ email: 'new@sbcc.church', name: 'New', role: 'super_admin' });

  expect(res.status).toBe(403);
});
