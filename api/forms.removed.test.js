const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

const repoRoot = path.join(__dirname, '..');

test('the retired serverless forms function is gone', () => {
  expect(fs.existsSync(path.join(repoRoot, 'api/forms.js'))).toBe(false);
});

test('the retired local forms router is gone', () => {
  expect(fs.existsSync(path.join(repoRoot, 'backend/routes/forms.js'))).toBe(false);
});

test('the retired Apps Script directory is gone', () => {
  expect(fs.existsSync(path.join(repoRoot, 'google-forms-integration'))).toBe(false);
});

test('the local server no longer mounts a forms router', () => {
  const server = fs.readFileSync(path.join(repoRoot, 'backend/server.js'), 'utf8');
  expect(server).not.toMatch(/routes\/forms/);
  expect(server).not.toMatch(/["']\/api\/forms["']/);
});

test('vercel no longer routes /api/forms', () => {
  const vercel = fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8');
  expect(vercel).not.toMatch(/api\/forms/);
});

test('a request to a former forms endpoint 404s on the local server', async () => {
  // Mount every router the real server mounts except forms, then confirm the
  // path falls through. Asserting on the file alone would not catch a stray
  // mount added elsewhere.
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = { get: (s, p, cb) => cb(null, null) }; next(); });
  app.use('/api/activity', require('../backend/routes/activity'));

  const res = await request(app).get('/api/forms/responses');
  expect(res.status).toBe(404);
});
