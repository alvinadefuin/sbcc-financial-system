const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const { verifyToken, checkRole } = require('./expressAuth');

const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church', role }, JWT_SECRET);

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
