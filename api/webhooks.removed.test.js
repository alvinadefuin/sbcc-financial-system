// The /api/webhooks/* surface existed only for n8n. All three n8n workflows were
// retired in August 2026 — and none of them ever called these endpoints anyway:
// 1-google-forms-to-api posted to the already-removed /api/forms/*, while the
// backup and weekly-report workflows used shell commands and direct Postgres
// queries. The endpoints had no caller, so they went with n8n.
//
// Mirrors api/forms.removed.test.js: the point is that a later change cannot
// quietly reintroduce the surface, taking a Vercel function slot (the Hobby plan
// caps at 12) and re-exposing financial summaries behind a shared secret.
const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

const repoRoot = path.join(__dirname, '..');
const exists = (p) => fs.existsSync(path.join(repoRoot, p));

test('the serverless webhooks function is gone', () => {
  expect(exists('api/webhooks.js')).toBe(false);
});

test('the local webhooks router is gone', () => {
  expect(exists('backend/routes/webhooks.js')).toBe(false);
});

test('the n8n directory is gone', () => {
  expect(exists('n8n')).toBe(false);
});

test('the n8n runbooks are gone', () => {
  expect(exists('docs/N8N_SETUP.md')).toBe(false);
  expect(exists('docs/N8N_HANDS_ON_TUTORIAL.md')).toBe(false);
});

test('the local server no longer mounts a webhooks router', () => {
  const server = fs.readFileSync(path.join(repoRoot, 'backend/server.js'), 'utf8');
  expect(server).not.toMatch(/routes\/webhooks/);
  expect(server).not.toMatch(/["']\/api\/webhooks["']/);
});

test('vercel no longer routes /api/webhooks', () => {
  const vercel = fs.readFileSync(path.join(repoRoot, 'vercel.json'), 'utf8');
  expect(vercel).not.toMatch(/api\/webhooks/);
});

test('no serverless function still advertises the webhook secret header', () => {
  // The header was only ever there so n8n could authenticate. Leaving it in the
  // CORS allowlist would imply a surface that no longer exists.
  const offenders = fs
    .readdirSync(path.join(repoRoot, 'api'))
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
    .filter((f) => /x-webhook-secret/i.test(fs.readFileSync(path.join(repoRoot, 'api', f), 'utf8')));

  expect(offenders).toEqual([]);
});

test('a request to a former webhook endpoint 404s on the local server', async () => {
  // Mount a live router, then confirm the retired path falls through. Asserting
  // on the files alone would not catch a stray mount added elsewhere.
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = { get: (s, p, cb) => cb(null, null) }; next(); });
  app.use('/api/activity', require('../backend/routes/activity'));

  for (const p of ['/api/webhooks/health', '/api/webhooks/financial-summary', '/api/webhooks/budget-alerts']) {
    const res = await request(app).get(p);
    expect(res.status).toBe(404);
  }
});
