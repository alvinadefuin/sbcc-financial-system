const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// verifyToken now reads token_version on every request.
const mockDb = { get: jest.fn(), all: jest.fn(), run: jest.fn() };
jest.mock('./database', () => mockDb);

const { verifyToken, checkRole } = require('./expressAuth');

const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church', role }, JWT_SECRET);

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.get.mockResolvedValue({ token_version: 0 });
});

function makeApp() {
  const app = express();
  app.get('/open', verifyToken, (req, res) => res.json({ email: req.user.email }));
  app.get('/admin', verifyToken, checkRole(['admin', 'super_admin']), (req, res) =>
    res.json({ ok: true })
  );
  return app;
}

test('verifyToken rejects a missing token with 401', async () => {
  const res = await request(makeApp()).get('/open');
  expect(res.status).toBe(401);
});

test('verifyToken rejects an invalid token with 403', async () => {
  const res = await request(makeApp()).get('/open').set('Authorization', 'Bearer nonsense');
  expect(res.status).toBe(403);
});

test('verifyToken populates req.user on success', async () => {
  const res = await request(makeApp()).get('/open').set('Authorization', tokenFor('user'));
  expect(res.status).toBe(200);
  expect(res.body.email).toBe('tester@sbcc.church');
});

test('checkRole rejects a role not in the list with 403', async () => {
  const res = await request(makeApp()).get('/admin').set('Authorization', tokenFor('user'));
  expect(res.status).toBe(403);
  expect(res.body.error).toMatch(/permission/i);
});

test('checkRole allows a role in the list', async () => {
  const res = await request(makeApp()).get('/admin').set('Authorization', tokenFor('admin'));
  expect(res.status).toBe(200);
});

describe('token revocation', () => {
  test('a token behind the stored version is refused with 401, not 403', async () => {
    // 401 matters: the frontend interceptor clears the session on 401 only, so a
    // 403 would leave the user stuck in a dashboard where everything fails.
    mockDb.get.mockResolvedValue({ token_version: 5 });

    const res = await request(makeApp())
      .get('/open')
      .set('Authorization', 'Bearer ' + jwt.sign({ id: 1, email: 'a@b.c', role: 'user', tv: 4 }, JWT_SECRET));

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_REVOKED');
  });

  test('a token minted before the tv claim existed is still accepted', async () => {
    mockDb.get.mockResolvedValue({ token_version: 0 });

    const res = await request(makeApp()).get('/open').set('Authorization', tokenFor('user'));

    expect(res.status).toBe(200);
  });

  test('a database failure during the check is a 500, never a silent pass', async () => {
    mockDb.get.mockRejectedValue(new Error('connection lost'));

    const res = await request(makeApp()).get('/open').set('Authorization', tokenFor('user'));

    expect(res.status).toBe(500);
  });
});
