const fs = require('fs');
const path = require('path');

// Revocation only works if EVERY authenticated route checks token_version. That
// check lives in api/_lib/{auth,expressAuth}.js and api/auth.js's verifyJWT; a
// handler that calls jwt.verify itself silently opts out of it, and a revoked
// token keeps working there. Two such holes existed before this test — the four
// serverless functions below, and GET /api/auth/me on both servers.

const apiDir = __dirname;
const backendRoutes = path.join(__dirname, '..', 'backend', 'routes');

const ALLOWED = new Set([
  // The shared helpers themselves — this is where verification belongs.
  path.join(apiDir, '_lib', 'auth.js'),
  path.join(apiDir, '_lib', 'expressAuth.js'),
  // api/auth.js hosts verifyJWT, which does the token_version check inline.
  path.join(apiDir, 'auth.js'),
  path.join(backendRoutes, '..', 'middleware', 'auth.js'),
]);

const sourceFiles = (dir) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'))
    .map((f) => path.join(dir, f));

const offenders = (files) =>
  files.filter((f) => !ALLOWED.has(f) && /jwt\.verify\s*\(/.test(fs.readFileSync(f, 'utf8')));

test('no serverless function verifies a token without the token_version check', () => {
  expect(offenders(sourceFiles(apiDir))).toEqual([]);
});

test('no local route verifies a token without the token_version check', () => {
  expect(offenders(sourceFiles(backendRoutes))).toEqual([]);
});

test('api/auth.js verifyJWT is the only inline verifier there, and it checks the version', () => {
  const src = fs.readFileSync(path.join(apiDir, 'auth.js'), 'utf8');
  expect((src.match(/jwt\.verify\s*\(/g) || []).length).toBe(1);
  expect(src).toMatch(/assertTokenCurrent/);
});
