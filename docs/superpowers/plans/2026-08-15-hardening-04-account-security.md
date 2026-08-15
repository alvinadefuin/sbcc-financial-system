# Church Readiness Hardening — Plan 4: Account Security and Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the Google Forms path and its dead code, lock accounts after repeated failed passwords, give every user a way to change their password that cuts off every other session, close the last remaining role-safety race, and migrate production.

**Architecture:** Session revocation hangs on one integer. `users.token_version` is copied into each JWT as a `tv` claim, and every authentication middleware compares the claim against the stored column on each request. Changing a password increments the column, so every previously issued token for that user stops verifying. That check is the only new per-request database read in this plan, and it lives in one shared helper so there is exactly one place to get it right.

**Tech Stack:** Node 18+, Express 4, PostgreSQL (Neon) via `pg`, Jest 30, Supertest 7, React 18, Testing Library, bcryptjs, jsonwebtoken.

---

## Context You Need Before Starting

**Plans 1, 2 and 3 are merged to `main`** (merge commit `5c8bb10`). Role gates, soft delete, `withTransaction`, and the activity log are all in place. Read Plan 3's "Three Non-Obvious Rules" before touching any handler in this plan — all three still apply, and Task 4 deliberately changes one of the cases Rule 3 describes.

**The schema this plan needs already exists on the development branch** — verified 2026-08-15:

```
users.failed_login_attempts  integer      not null default 0
users.locked_until           timestamptz  null
users.token_version          integer      not null default 0
```

**Production has none of the hardening schema at all** — verified 2026-08-15: no `activity_log`, no audit columns on `collections`/`expenses`, none of the three `users` columns. Task 12 applies the whole migration from the spec, covering Plans 2, 3 and 4 in one pass. Nothing in Plans 1–4 has shipped to production yet.

**Jest 30 flag.** `--testPathPatterns` (plural) in `backend/`. The frontend's older Jest uses the singular `--testPathPattern`.

**Always run backend tests from `backend/`.** Running `npx jest` from the repo root picks up a different, npx-fetched Jest that ignores `backend/jest.config.js` and fails with `Cannot find module 'supertest'`. The shell's working directory persists between commands, so a `cd` in an earlier command will follow you into the next one — prefix every test command with its own `cd`.

**`jest.mock()` factories may only close over `mock`-prefixed names.** Name the shared mock `mockDb`.

**CRA forces `resetMocks: true`.** In frontend tests, declare bare `jest.fn()` in the `jest.mock` factory and set every return value with `mockResolvedValue` in `beforeEach`. An implementation written inside the factory is stripped before each test and the function returns `undefined`, which surfaces as a confusing crash inside the component rather than a mocking error.

**The dev JWT secret** used by tests is the literal `your-secret-key-change-this`.

**Database branches.** Neon project `small-bar-42939262`, development `br-super-resonance-a4koenk7`, production `br-wild-mode-a4o3z1nc`.

**Existing test patterns:** `api/auth.roles.test.js` and `api/auth.activity.test.js` (mock `./_lib/database` including `withTransaction`, mount the exported app, sign a JWT, drive with Supertest), `backend/routes/activity.test.js` (fake callback-style `req.db`), `frontend/src/components/ActivityLogView.test.js` (mock `../utils/api`, render, `waitFor`).

---

## Four Non-Obvious Rules

**Rule 1 — a missing `tv` claim means zero, not "reject".** Every token in circulation right now was signed before this plan and carries no `tv`. Rejecting those would sign out every user the moment this deploys, including both super administrators. `token_version` defaults to `0`, so treating an absent claim as `0` lets existing sessions continue while still rejecting a token whose user has since been bumped to `1`. Use `(user.tv ?? 0) === (row.token_version ?? 0)`.

**Rule 2 — a revoked token must answer `401`, not `403`.** The axios interceptor in `frontend/src/utils/api.js` clears the stored token and redirects only on `401`; a `403` is passed through to the component. If a revoked token returned `403`, the user would sit in a dashboard where every request fails and nothing ever sends them back to the login screen. Malformed and expired tokens keep returning `403` — that is pre-existing behaviour and this plan does not change it.

**Rule 3 — check the lock before checking the password.** If the handler verifies the password first and only then reports the lock, the response time and status differ between a locked account with the right password and a locked account with the wrong one, which tells an attacker when they have guessed correctly. The lock check goes immediately after the user lookup, before `bcrypt.compareSync`.

**Rule 4 — changing your own password must hand back a new token.** `POST /api/auth/change-password` increments `token_version`, which invalidates the very token that authorised the request. Without a fresh token in the response the user is signed out the instant they succeed, which reads as a failure. The handler signs and returns a replacement carrying the new `tv`, and the frontend stores it.

---

## File Structure

**Created:**
- `api/_lib/tokenVersion.js` — the single `assertTokenCurrent()` check shared by all three serverless auth helpers
- `api/_lib/tokenVersion.test.js`
- `api/auth.lockout.test.js` — lockout behaviour
- `api/auth.password.test.js` — both password endpoints and revocation
- `backend/middleware/auth.js` — currently an empty, unreferenced file; becomes the shared local-server middleware
- `backend/middleware/auth.test.js`
- `backend/routes/auth.roles.test.js` — pins the local server's role behaviour, which has never had a test
- `frontend/src/components/ChangePasswordModal.js`
- `frontend/src/components/ChangePasswordModal.test.js`
- `api/forms.removed.test.js` — pins that the retired path is gone

**Modified:**
- `api/_lib/expressAuth.js`, `api/_lib/auth.js` — `tv` check
- `api/auth.js` — `tv` claim on both sign sites, lockout, two password endpoints, transaction-scoped super-admin guard
- `backend/routes/auth.js` — `tv` claim, the silent-drop fix, the last-super-admin guard, lockout
- `backend/routes/{collections,expenses,budget,reports,activity}.js` — use the shared middleware instead of six private copies
- `backend/server.js` — drop the forms mount
- `vercel.json` — drop the forms rewrite
- `frontend/src/utils/api.js` — `changePassword`, `setUserPassword`
- `frontend/src/components/Dashboard.js` — "Change password" in the sidebar footer
- `frontend/src/components/LoginNew.js` → renamed to `Login.js`, plus the two GSI fixes
- `frontend/src/App.js`, `frontend/src/App.test.js`, `frontend/src/App.mobile.test.js`, `frontend/src/components/LoginNew.test.js` — follow the rename

**Deleted:** `api/forms.js`, `backend/routes/forms.js`, `google-forms-integration/`, `frontend/src/components/Login.js` (the unreferenced one), `backend/seedJanuary2023.js`, `backend/test-postgres.js`, `backend/updateDatabaseSchema.js`

**Not in this plan, by design:** enforcing `is_active` at token-verification time (a deactivated user keeps their session until it expires — the spec does not ask for it, and adding it would change the meaning of every existing auth test); any admin "unlock now" action (the spec deliberately relies on the lock expiring); rate limiting beyond per-account lockout.

---

## Task 1: Remove the Retired Google Forms Path

The Forms ingestion path is superseded by the mobile PWA. It also carries two publicly readable debug endpoints in the same router, so removing it closes those without a separate change. Verified before removal: no frontend code references `/api/forms`, and the n8n webhook routes are in `webhooks.js` and are untouched.

**Files:**
- Create: `api/forms.removed.test.js`
- Delete: `api/forms.js`, `backend/routes/forms.js`, `google-forms-integration/`
- Modify: `backend/server.js`, `vercel.json`

- [ ] **Step 1: Write the failing test**

Create `api/forms.removed.test.js`:

```javascript
const fs = require('fs');
const path = require('path');

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

test('the webhook path used by n8n survives the removal', () => {
  expect(fs.existsSync(path.join(repoRoot, 'api/webhooks.js'))).toBe(true);
  const server = fs.readFileSync(path.join(repoRoot, 'backend/server.js'), 'utf8');
  expect(server).toMatch(/\/api\/webhooks/);
});
```

and, in the same file, a live check that the path really is unroutable rather than merely unmounted:

```javascript
const express = require('express');
const request = require('supertest');

test('a request to a former forms endpoint 404s on the local server', async () => {
  // Mount every router the real server mounts except forms, then confirm the
  // path falls through. Asserting on the file alone would not catch a stray
  // mount added elsewhere.
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = { get: (s, p, cb) => cb(null, null) }; next(); });
  app.use('/api/webhooks', require('../backend/routes/webhooks'));

  const res = await request(app).get('/api/forms/responses');
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="forms.removed"`
Expected: FAIL — the files still exist and both mounts are still present. (The 404 test passes from the start, because that app never mounts forms; it exists to catch a mount reintroduced later.)

- [ ] **Step 3: Delete the files**

```bash
git rm api/forms.js backend/routes/forms.js
git rm -r google-forms-integration
```

- [ ] **Step 4: Remove the mount from the local server**

In `backend/server.js`, delete the require (around line 30):

```javascript
const formsRoutes = require("./routes/forms");
```

and the mount (around line 98):

```javascript
app.use("/api/forms", formsRoutes);
```

- [ ] **Step 5: Remove the Vercel rewrite**

In `vercel.json`, delete this line from `rewrites`:

```json
    { "source": "/api/forms/:path*", "destination": "/api/forms" },
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="forms.removed"`
Expected: PASS, 7 tests.

Run: `grep -rn --include="*.js" "api/forms\|routes/forms" api backend frontend/src`
Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add -A api backend/server.js vercel.json api/forms.removed.test.js
git commit -m "feat: remove the retired Google Forms ingestion path"
```

---

## Task 2: Remove Dead Files and Free the `Login` Name

`frontend/src/components/Login.js` is the only unreferenced component in the codebase — `App.js` imports `LoginNew`. The three backend scripts are referenced nowhere; `updateDatabaseSchema.js` is the urgent one, because it is SQLite-only and performs `DROP TABLE expenses`.

**Files:**
- Delete: `frontend/src/components/Login.js`, `backend/seedJanuary2023.js`, `backend/test-postgres.js`, `backend/updateDatabaseSchema.js`
- Rename: `frontend/src/components/LoginNew.js` → `Login.js`, `LoginNew.test.js` → `Login.test.js`
- Modify: `frontend/src/App.js`, `frontend/src/App.test.js`, `frontend/src/App.mobile.test.js`

- [ ] **Step 1: Confirm nothing references what is about to be deleted**

Run:

```bash
grep -rn --include="*.js" "seedJanuary2023\|test-postgres\|updateDatabaseSchema" backend frontend/src api
grep -rn --include="*.js" "components/Login\"" frontend/src
```

Expected: the first returns nothing. The second returns nothing (every import says `components/LoginNew`). If either returns a hit, stop and resolve it before deleting.

- [ ] **Step 2: Delete the dead files**

```bash
git rm frontend/src/components/Login.js
git rm backend/seedJanuary2023.js backend/test-postgres.js backend/updateDatabaseSchema.js
```

- [ ] **Step 3: Rename the real login component**

```bash
git mv frontend/src/components/LoginNew.js frontend/src/components/Login.js
git mv frontend/src/components/LoginNew.test.js frontend/src/components/Login.test.js
```

- [ ] **Step 4: Update the import in `App.js`**

In `frontend/src/App.js` line 3, replace:

```javascript
import Login from "./components/LoginNew";
```

with:

```javascript
import Login from "./components/Login";
```

- [ ] **Step 5: Update the three test files that name the old module**

In `frontend/src/components/Login.test.js` line 3, replace:

```javascript
import Login from './LoginNew';
```

with:

```javascript
import Login from './Login';
```

In `frontend/src/App.test.js` line 12 and `frontend/src/App.mobile.test.js` line 13, replace:

```javascript
jest.mock('./components/LoginNew', () => ({ onLogin }) => <div>Login</div>);
```

with:

```javascript
jest.mock('./components/Login', () => ({ onLogin }) => <div>Login</div>);
```

- [ ] **Step 6: Run to verify**

Run: `grep -rn --include="*.js" "LoginNew" frontend/src`
Expected: no matches.

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false`
Expected: PASS, all suites.

Run: `cd frontend && CI=true npx react-scripts build`
Expected: `Compiled successfully.`

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src backend
git commit -m "refactor: drop dead scripts and rename LoginNew to Login"
```

---

## Task 3: The `tv` Claim and the Shared Version Check

This is the task the rest of the plan's revocation depends on. It adds one database read per authenticated request; that cost is the price of being able to cut off a lost phone, and it is concentrated in one helper.

**Files:**
- Create: `api/_lib/tokenVersion.js`, `api/_lib/tokenVersion.test.js`
- Modify: `api/_lib/expressAuth.js`, `api/_lib/auth.js`, `api/auth.js`

- [ ] **Step 1: Write the failing test**

Create `api/_lib/tokenVersion.test.js`:

```javascript
const mockDb = { get: jest.fn(), all: jest.fn(), run: jest.fn() };
jest.mock('./database', () => mockDb);

const { assertTokenCurrent } = require('./tokenVersion');

beforeEach(() => {
  jest.clearAllMocks();
});

test('accepts a token whose tv matches the stored version', async () => {
  mockDb.get.mockResolvedValue({ token_version: 3 });
  await expect(assertTokenCurrent({ id: 1, tv: 3 })).resolves.toBe(true);
});

test('rejects a token whose tv is behind the stored version', async () => {
  mockDb.get.mockResolvedValue({ token_version: 4 });
  await expect(assertTokenCurrent({ id: 1, tv: 3 })).resolves.toBe(false);
});

test('treats a token minted before this feature as version zero', async () => {
  // Every token in circulation today has no tv claim. Rejecting them would
  // sign out every user the moment this deploys.
  mockDb.get.mockResolvedValue({ token_version: 0 });
  await expect(assertTokenCurrent({ id: 1 })).resolves.toBe(true);
});

test('rejects a pre-feature token once that user has been bumped', async () => {
  mockDb.get.mockResolvedValue({ token_version: 1 });
  await expect(assertTokenCurrent({ id: 1 })).resolves.toBe(false);
});

test('rejects a token for a user that no longer exists', async () => {
  mockDb.get.mockResolvedValue(null);
  await expect(assertTokenCurrent({ id: 99, tv: 0 })).resolves.toBe(false);
});

test('rejects a token carrying no user id', async () => {
  await expect(assertTokenCurrent({ tv: 0 })).resolves.toBe(false);
  expect(mockDb.get).not.toHaveBeenCalled();
});

test('reads only the one column it needs, by id', async () => {
  mockDb.get.mockResolvedValue({ token_version: 0 });
  await assertTokenCurrent({ id: 7, tv: 0 });

  const [sql, params] = mockDb.get.mock.calls[0];
  expect(sql).toMatch(/SELECT token_version FROM users WHERE id = \$1/i);
  expect(params).toEqual([7]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="tokenVersion"`
Expected: FAIL — `Cannot find module './tokenVersion'`.

- [ ] **Step 3: Write the helper**

Create `api/_lib/tokenVersion.js`:

```javascript
const db = require('./database');

/**
 * True when the caller's token is still the current one for that user.
 *
 * Revocation works by incrementing users.token_version; a token carries the
 * value it was minted with in its `tv` claim. A token minted before this
 * feature existed has no `tv` at all — that is treated as 0, which matches the
 * column default, so deploying this does not sign everyone out. A user whose
 * version has since been bumped no longer matches, and their old tokens fail.
 *
 * This is one extra read per authenticated request. It is the whole mechanism
 * by which a lost device can be cut off, so it runs on every authenticated
 * route rather than only on sensitive ones.
 */
async function assertTokenCurrent(user) {
  if (!user || user.id === undefined || user.id === null) return false;

  const row = await db.get('SELECT token_version FROM users WHERE id = $1', [user.id]);
  if (!row) return false;

  return (user.tv ?? 0) === (row.token_version ?? 0);
}

module.exports = { assertTokenCurrent };
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="tokenVersion"`
Expected: PASS, 7 tests.

- [ ] **Step 5: Enforce it in the Express-style middleware**

Replace the `verifyToken` function in `api/_lib/expressAuth.js` with:

```javascript
/**
 * Express middleware: verifies the bearer token and sets req.user.
 * 401 when no token is supplied or the token has been revoked, 403 when the
 * token is malformed or expired.
 *
 * A revoked token answers 401 deliberately: the frontend's axios interceptor
 * clears the session and redirects on 401 only, so a 403 here would strand the
 * user in a dashboard where every request fails.
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  try {
    if (!(await assertTokenCurrent(claims))) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.', code: 'TOKEN_REVOKED' });
    }
  } catch (err) {
    console.error('Token version check failed:', err.message);
    return res.status(500).json({ error: 'Authentication check failed' });
  }

  req.user = claims;
  next();
}
```

and add the import at the top of the file, below the existing `JWT_SECRET` require:

```javascript
const { assertTokenCurrent } = require('./tokenVersion');
```

- [ ] **Step 6: Enforce it in the serverless handler wrapper**

In `api/_lib/auth.js`, add the import below the `JWT_SECRET` declaration:

```javascript
const { assertTokenCurrent } = require('./tokenVersion');
```

and replace the body of `authenticateToken` with:

```javascript
function authenticateToken(handler) {
  return async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    let claims;
    try {
      claims = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    try {
      if (!(await assertTokenCurrent(claims))) {
        return res.status(401).json({ error: 'Session expired. Please sign in again.', code: 'TOKEN_REVOKED' });
      }
    } catch (err) {
      console.error('Token version check failed:', err.message);
      return res.status(500).json({ error: 'Authentication check failed' });
    }

    req.user = claims;
    return handler(req, res);
  };
}
```

`api/_lib/auth.js` does not currently require the database. Adding `tokenVersion` pulls `_lib/database` into it, which is already required by every function that uses this wrapper, so no new module reaches a process that did not already have it.

- [ ] **Step 7: Enforce it in `api/auth.js`'s own middleware**

`api/auth.js` defines a third copy, `verifyJWT` (around line 190). Replace it with:

```javascript
async function verifyJWT(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  try {
    if (!(await assertTokenCurrent(claims))) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.', code: 'TOKEN_REVOKED' });
    }
  } catch (err) {
    console.error('Token version check failed:', err.message);
    return res.status(500).json({ error: 'Authentication check failed' });
  }

  req.user = claims;
  next();
}
```

and add the import at the top of `api/auth.js`, below the `activityLog` require:

```javascript
const { assertTokenCurrent } = require('./_lib/tokenVersion');
```

- [ ] **Step 8: Put `tv` into every token this file mints, and shorten the PWA session**

In `api/auth.js`, the password-login sign call (around line 56) becomes:

```javascript
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, tv: user.token_version ?? 0 },
      JWT_SECRET,
      { expiresIn: pwa ? '7d' : '24h' }
    );
```

The `30d` → `7d` change is the PWA lifetime reduction from the spec. The Google sign-in call (around line 161) becomes:

```javascript
      const token = jwt.sign(
        { id: existingUser.id, email: existingUser.email, role: existingUser.role, name: googleUser.name, tv: existingUser.token_version ?? 0 },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
```

- [ ] **Step 9: Give the existing suites a `token_version` row to read**

Every suite that mounts an app and drives an authenticated route now hits `assertTokenCurrent`, which calls `db.get`. Suites whose `mockDb.get` resolves `null` by default would start returning 401.

In each of `api/auth.roles.test.js`, `api/auth.activity.test.js`, `api/collections.auth.test.js`, `api/expenses.auth.test.js`, `api/collections.activity.test.js`, `api/expenses.activity.test.js`, `api/collections.softdelete.test.js`, `api/expenses.softdelete.test.js`, `api/reads.softdelete.test.js` and `api/activity.test.js`, make the token-version lookup answer before any other `get` behaviour by adding this to the top of the existing `beforeEach`:

```javascript
  // Auth now reads token_version on every request; answer that lookup first and
  // let each test's own mockResolvedValue handle the rest.
  mockDb.get.mockImplementation(async (sql) =>
    /SELECT token_version/i.test(sql) ? { token_version: 0 } : null
  );
```

For a test that then sets `mockDb.get.mockResolvedValue(row)` for its own lookup, replace that call with:

```javascript
  mockDb.get.mockImplementation(async (sql) =>
    /SELECT token_version/i.test(sql) ? { token_version: 0 } : row
  );
```

where `row` is whatever that test previously passed to `mockResolvedValue`. Work through the failures reported in Step 10 one file at a time rather than editing all ten pre-emptively.

- [ ] **Step 10: Run the whole api suite**

Run: `cd backend && npx jest --testPathPatterns="api"`
Expected: PASS. Any 401 in a test that previously expected 200 means that suite still needs the Step 9 treatment.

- [ ] **Step 11: Commit**

```bash
git add api/_lib/tokenVersion.js api/_lib/tokenVersion.test.js api/_lib/expressAuth.js api/_lib/auth.js api/auth.js api/*.test.js
git commit -m "feat: carry token_version in the JWT and reject stale tokens"
```

---

## Task 4: Database-Backed Login Lockout

Vercel cannot share an in-memory counter between invocations, so the counter lives in `users`.

**This changes the one non-transactional `logActivity` caller from Plan 3.** A failed login for a *known* account now also writes `failed_login_attempts`, so the log entry and the counter must commit together — Plan 3's Rule 3 case no longer applies to it. A failed login for an *unknown* email still mutates nothing and still logs through the pooled `db`.

**Files:**
- Create: `api/auth.lockout.test.js`
- Modify: `api/auth.js`

- [ ] **Step 1: Write the failing test**

Create `api/auth.lockout.test.js`:

```javascript
const request = require('supertest');
const bcrypt = require('bcryptjs');

const mockTx = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 1 })),
};
const mockDb = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 1 })),
  withTransaction: jest.fn(async (fn) => fn(mockTx)),
};
jest.mock('./_lib/database', () => mockDb);

const app = require('./auth');

const PASSWORD = 'correct-horse';
const baseUser = {
  id: 3,
  email: 'member@sbcc.church',
  name: 'Member',
  role: 'user',
  is_active: true,
  token_version: 0,
  failed_login_attempts: 0,
  locked_until: null,
  password_hash: bcrypt.hashSync(PASSWORD, 10),
};

const userIs = (overrides) => {
  const row = { ...baseUser, ...overrides };
  mockDb.get.mockImplementation(async (sql) =>
    /SELECT token_version/i.test(sql) ? { token_version: row.token_version } : row
  );
};

const sqlOn = (runner) => runner.run.mock.calls.map(([sql]) => sql).join('\n');

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.withTransaction.mockImplementation(async (fn) => fn(mockTx));
});

test('a wrong password increments the failure counter in the same transaction as the log', async () => {
  userIs({ failed_login_attempts: 0 });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: baseUser.email, password: 'wrong' });

  expect(res.status).toBe(401);
  expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
  expect(sqlOn(mockTx)).toMatch(/failed_login_attempts/i);
  expect(sqlOn(mockTx)).toMatch(/INSERT INTO activity_log/i);
});

test('the fifth consecutive failure sets locked_until', async () => {
  userIs({ failed_login_attempts: 4 });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: baseUser.email, password: 'wrong' });

  expect(res.status).toBe(401);
  const lock = mockTx.run.mock.calls.find(([sql]) => /locked_until/i.test(sql));
  expect(lock).toBeDefined();
  expect(lock[0]).toMatch(/locked_until\s*=\s*now\(\)\s*\+/i);
});

test('a fourth failure does not lock the account', async () => {
  userIs({ failed_login_attempts: 3 });

  await request(app).post('/api/auth/login').send({ email: baseUser.email, password: 'wrong' });

  expect(mockTx.run.mock.calls.find(([sql]) => /locked_until\s*=\s*now\(\)/i.test(sql))).toBeUndefined();
});

test('a locked account is refused with 423 even when the password is correct', async () => {
  userIs({ locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: baseUser.email, password: PASSWORD });

  expect(res.status).toBe(423);
  expect(res.body.retry_after_seconds).toBeGreaterThan(0);
  expect(res.body.token).toBeUndefined();
});

test('a locked account answers 423 identically for a wrong password, revealing nothing', async () => {
  userIs({ locked_until: new Date(Date.now() + 10 * 60 * 1000).toISOString() });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: baseUser.email, password: 'wrong' });

  expect(res.status).toBe(423);
});

test('an expired lock lets the correct password through', async () => {
  userIs({ locked_until: new Date(Date.now() - 60 * 1000).toISOString(), failed_login_attempts: 5 });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: baseUser.email, password: PASSWORD });

  expect(res.status).toBe(200);
  expect(res.body.token).toBeDefined();
});

test('a successful login clears the counter and the lock', async () => {
  userIs({ failed_login_attempts: 3 });

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: baseUser.email, password: PASSWORD });

  expect(res.status).toBe(200);
  const reset = mockTx.run.mock.calls.find(([sql]) => /failed_login_attempts\s*=\s*0/i.test(sql));
  expect(reset).toBeDefined();
  expect(reset[0]).toMatch(/locked_until\s*=\s*NULL/i);
});

test('an unknown email still logs without opening a transaction', async () => {
  mockDb.get.mockImplementation(async (sql) =>
    /SELECT token_version/i.test(sql) ? { token_version: 0 } : null
  );

  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'nobody@example.com', password: 'whatever' });

  expect(res.status).toBe(401);
  expect(mockDb.withTransaction).not.toHaveBeenCalled();
  expect(sqlOn(mockDb)).toMatch(/INSERT INTO activity_log/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="auth.lockout"`
Expected: FAIL — no lockout logic exists.

- [ ] **Step 3: Add the lockout constants**

In `api/auth.js`, directly below the `assertTokenCurrent` require added in Task 3, add:

```javascript
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;
```

- [ ] **Step 4: Refuse a locked account before checking the password**

In `app.post('/api/auth/login', ...)`, directly after the `const user = await db.get(...)` line and **before** the credential check, insert:

```javascript
    // Before bcrypt, deliberately: answering after the password check would make
    // a locked account with the right password distinguishable from one with the
    // wrong password.
    if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
      const retryAfter = Math.ceil((new Date(user.locked_until) - new Date()) / 1000);
      return res.status(423).json({
        error: 'Account temporarily locked after repeated failed sign-ins. Try again shortly.',
        retry_after_seconds: retryAfter,
      });
    }
```

- [ ] **Step 5: Count the failure and lock on the fifth**

Replace the whole failure branch — the block added in Plan 3 — with:

```javascript
    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      if (user) {
        // The counter and its log entry now commit together: a failure that is
        // counted but unlogged, or logged but uncounted, would misrepresent what
        // happened.
        const attempts = (user.failed_login_attempts || 0) + 1;
        const locking = attempts >= MAX_FAILED_LOGINS;

        await db.withTransaction(async (tx) => {
          if (locking) {
            await tx.run(
              `UPDATE users SET failed_login_attempts = $1,
                 locked_until = now() + ($2 || ' minutes')::interval
               WHERE id = $3`,
              [attempts, String(LOCKOUT_MINUTES), user.id]
            );
          } else {
            await tx.run('UPDATE users SET failed_login_attempts = $1 WHERE id = $2', [attempts, user.id]);
          }

          await logActivity(tx, {
            actor: { email: user.email, role: user.role },
            action: ACTIONS.LOGIN_FAILED,
            summary: locking
              ? `Failed password login — account locked for ${LOCKOUT_MINUTES} minutes`
              : `Failed password login (${attempts} of ${MAX_FAILED_LOGINS})`,
          });
        });
      } else {
        // Nothing to bind this to — no account matched, so no row is mutated.
        await logActivity(db, {
          actor: null,
          action: ACTIONS.LOGIN_FAILED,
          summary: `Failed login for unknown email ${email}`,
        });
      }

      return res.status(401).json({ error: 'Invalid credentials' });
    }
```

- [ ] **Step 6: Clear the counter on success**

Replace the success transaction with:

```javascript
    await db.withTransaction(async (tx) => {
      await tx.run(
        `UPDATE users SET last_login = CURRENT_TIMESTAMP,
           failed_login_attempts = 0, locked_until = NULL
         WHERE id = $1`,
        [user.id]
      );
      await logActivity(tx, {
        actor: { email: user.email, role: user.role },
        action: ACTIONS.LOGIN_SUCCESS,
        summary: pwa ? 'Signed in from mobile' : 'Signed in',
      });
    });
```

- [ ] **Step 7: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="auth"`
Expected: PASS — `auth.lockout` (8 tests) plus `auth.roles` and `auth.activity` still green.

- [ ] **Step 8: Commit**

```bash
git add api/auth.js api/auth.lockout.test.js
git commit -m "feat: lock an account for 15 minutes after five failed sign-ins"
```

---

## Task 5: Password Change and Administrative Reset

Both endpoints increment `token_version`, which is what makes them the revocation mechanism. `POST /api/auth/change-password` therefore has to hand back a replacement token (Rule 4); the administrative reset does not, because it is bumping somebody else.

**Files:**
- Create: `api/auth.password.test.js`
- Modify: `api/auth.js`

- [ ] **Step 1: Write the failing test**

Create `api/auth.password.test.js`:

```javascript
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const mockTx = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 1 })),
};
const mockDb = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 1 })),
  withTransaction: jest.fn(async (fn) => fn(mockTx)),
};
jest.mock('./_lib/database', () => mockDb);

const app = require('./auth');
const JWT_SECRET = 'your-secret-key-change-this';

const CURRENT = 'current-pass-1';
const USER = {
  id: 3,
  email: 'member@sbcc.church',
  name: 'Member',
  role: 'user',
  is_active: true,
  token_version: 2,
  password_hash: bcrypt.hashSync(CURRENT, 10),
};

const tokenFor = (claims) => 'Bearer ' + jwt.sign(claims, JWT_SECRET);
const MEMBER = tokenFor({ id: 3, email: USER.email, role: 'user', tv: 2 });
const SUPER = tokenFor({ id: 9, email: 'boss@sbcc.church', role: 'super_admin', tv: 0 });
const ADMIN = tokenFor({ id: 8, email: 'adm@sbcc.church', role: 'admin', tv: 0 });

// Answer the auth token_version probe, then the handler's own user lookup.
const lookupsReturn = (row, version = 2) => {
  mockDb.get.mockImplementation(async (sql) =>
    /SELECT token_version/i.test(sql) ? { token_version: version } : row
  );
};

const logCall = () => mockTx.run.mock.calls.find(([sql]) => /INSERT INTO activity_log/i.test(sql));

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.withTransaction.mockImplementation(async (fn) => fn(mockTx));
  lookupsReturn(USER);
});

describe('POST /api/auth/change-password', () => {
  test('rejects an unauthenticated caller', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ current_password: CURRENT, new_password: 'brand-new-pass' });

    expect(res.status).toBe(401);
  });

  test('rejects a wrong current password', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', MEMBER)
      .send({ current_password: 'not-it', new_password: 'brand-new-pass' });

    expect(res.status).toBe(401);
    expect(mockDb.withTransaction).not.toHaveBeenCalled();
  });

  test('rejects a new password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', MEMBER)
      .send({ current_password: CURRENT, new_password: 'short7c' });

    expect(res.status).toBe(400);
    expect(mockDb.withTransaction).not.toHaveBeenCalled();
  });

  test('stores a bcrypt hash, never the plaintext', async () => {
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', MEMBER)
      .send({ current_password: CURRENT, new_password: 'brand-new-pass' });

    const update = mockTx.run.mock.calls.find(([sql]) => /password_hash/i.test(sql));
    expect(update[1].some((p) => typeof p === 'string' && p.startsWith('$2'))).toBe(true);
    expect(JSON.stringify(mockTx.run.mock.calls)).not.toMatch(/brand-new-pass/);
  });

  test('increments token_version and returns a replacement token carrying it', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', MEMBER)
      .send({ current_password: CURRENT, new_password: 'brand-new-pass' });

    expect(res.status).toBe(200);
    const update = mockTx.run.mock.calls.find(([sql]) => /token_version/i.test(sql));
    expect(update[0]).toMatch(/token_version\s*=\s*token_version\s*\+\s*1/i);

    // Without a fresh token the caller is signed out the moment they succeed.
    expect(res.body.token).toBeDefined();
    expect(jwt.verify(res.body.token, JWT_SECRET).tv).toBe(3);
  });

  test('logs auth.password_change for the acting user', async () => {
    await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', MEMBER)
      .send({ current_password: CURRENT, new_password: 'brand-new-pass' });

    const [, params] = logCall();
    expect(params[0]).toBe('member@sbcc.church');
    expect(params[2]).toBe('auth.password_change');
    expect(JSON.stringify(params)).not.toMatch(/brand-new-pass|current-pass-1/);
  });
});

describe('PUT /api/auth/users/:id/password', () => {
  test('a super_admin may reset another account', async () => {
    const res = await request(app)
      .put('/api/auth/users/3/password')
      .set('Authorization', SUPER)
      .send({ new_password: 'reset-by-boss' });

    expect(res.status).toBe(200);
    const update = mockTx.run.mock.calls.find(([sql]) => /token_version/i.test(sql));
    expect(update[0]).toMatch(/token_version\s*=\s*token_version\s*\+\s*1/i);
  });

  test('an admin may not', async () => {
    const res = await request(app)
      .put('/api/auth/users/3/password')
      .set('Authorization', ADMIN)
      .send({ new_password: 'reset-by-admin' });

    expect(res.status).toBe(403);
    expect(mockDb.withTransaction).not.toHaveBeenCalled();
  });

  test('rejects a short password', async () => {
    const res = await request(app)
      .put('/api/auth/users/3/password')
      .set('Authorization', SUPER)
      .send({ new_password: 'short7c' });

    expect(res.status).toBe(400);
  });

  test('404s for a user that does not exist', async () => {
    lookupsReturn(null, 0);

    const res = await request(app)
      .put('/api/auth/users/404/password')
      .set('Authorization', SUPER)
      .send({ new_password: 'reset-by-boss' });

    expect(res.status).toBe(404);
  });

  test('logs auth.password_change against the target account, with no new token', async () => {
    const res = await request(app)
      .put('/api/auth/users/3/password')
      .set('Authorization', SUPER)
      .send({ new_password: 'reset-by-boss' });

    const [, params] = logCall();
    expect(params[0]).toBe('boss@sbcc.church');
    expect(params[2]).toBe('auth.password_change');
    expect(params[3]).toBe('user');
    expect(params[4]).toBe(3);
    expect(res.body.token).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="auth.password"`
Expected: FAIL — both endpoints return 404.

- [ ] **Step 3: Add a shared validation constant**

In `api/auth.js`, below `LOCKOUT_MINUTES`, add:

```javascript
const MIN_PASSWORD_LENGTH = 8;
```

- [ ] **Step 4: Add the self-service endpoint**

In `api/auth.js`, directly above the `// DELETE /api/auth/users/:id` comment, add:

```javascript
// POST /api/auth/change-password — any authenticated user, own account only.
app.post('/api/auth/change-password', verifyJWT, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (new_password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.password_hash || !bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hash = bcrypt.hashSync(new_password, 10);

    await db.withTransaction(async (tx) => {
      await tx.run(
        `UPDATE users SET password_hash = $1, token_version = token_version + 1,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [hash, user.id]
      );

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.PASSWORD_CHANGE,
        entityType: 'user',
        entityId: user.id,
        summary: 'Changed their own password; other sessions signed out',
      });
    });

    // The bump above invalidated the token that authorised this request, so the
    // caller needs the replacement or they are signed out on success.
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name, tv: (user.token_version ?? 0) + 1 },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ message: 'Password changed successfully', token });
  } catch (err) {
    console.error('Password change error:', err.message);
    res.status(500).json({ error: 'Failed to change password' });
  }
});
```

- [ ] **Step 5: Add the administrative reset**

Directly below it, add:

```javascript
// PUT /api/auth/users/:id/password — super administrators only.
// Signs the target out of every device, and is the recovery path when one super
// administrator is locked out: the other resets it without database access.
app.put('/api/auth/users/:id/password', verifyJWT, checkRole(['super_admin']), async (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;

  if (!new_password) {
    return res.status(400).json({ error: 'New password is required' });
  }
  if (new_password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  try {
    const user = await db.get('SELECT id, email, role FROM users WHERE id = $1', [id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hash = bcrypt.hashSync(new_password, 10);

    await db.withTransaction(async (tx) => {
      await tx.run(
        `UPDATE users SET password_hash = $1, token_version = token_version + 1,
           failed_login_attempts = 0, locked_until = NULL,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [hash, id]
      );

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.PASSWORD_CHANGE,
        entityType: 'user',
        entityId: parseInt(id, 10),
        summary: `Reset the password for ${user.email}; their sessions were signed out`,
      });
    });

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Password reset error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});
```

Clearing `failed_login_attempts` and `locked_until` here is deliberate: a reset is exactly the moment a locked-out colleague needs to get back in, and making them wait out a lock they can no longer trigger would be pointless.

- [ ] **Step 6: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="auth"`
Expected: PASS — `auth.password` (11 tests) plus every other auth suite.

- [ ] **Step 7: Commit**

```bash
git add api/auth.js api/auth.password.test.js
git commit -m "feat: add password change and administrative reset with session revocation"
```

---

## Task 6: Close the Last-Super-Admin Race

Plan 1 added the guard, but it counts with a pooled `db.get` *before* opening the transaction that performs the change. Two demotions arriving together can both read `count = 2` and both proceed, leaving zero super administrators — the exact outcome the guard exists to prevent. The spec requires the count inside the transaction.

A bare `SELECT COUNT(*)` inside the transaction is not enough either: two concurrent transactions can still each see the pre-change count. The count must lock the rows it counts, so `SELECT id ... FOR UPDATE` is used and the rows are counted in JavaScript. `FOR UPDATE` cannot be combined with an aggregate.

**Files:**
- Modify: `api/auth.js`, `api/auth.roles.test.js`

- [ ] **Step 1: Write the failing test**

Append to `api/auth.roles.test.js`:

```javascript
describe('last-super-admin guard runs inside the transaction', () => {
  test('the count that guards the change is taken on the transaction, not the pool', async () => {
    mockDb.get.mockImplementation(async (sql) =>
      /SELECT token_version/i.test(sql) ? { token_version: 0 } : { id: 1, email: 'boss@sbcc.church', role: 'super_admin', is_active: true }
    );
    mockTx.all.mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    const counted = mockTx.all.mock.calls.find(([sql]) => /super_admin/i.test(sql));
    expect(counted).toBeDefined();
    expect(counted[0]).toMatch(/FOR UPDATE/i);
  });

  test('demoting the only active super admin is refused with 409', async () => {
    mockDb.get.mockImplementation(async (sql) =>
      /SELECT token_version/i.test(sql) ? { token_version: 0 } : { id: 1, email: 'boss@sbcc.church', role: 'super_admin', is_active: true }
    );
    mockTx.all.mockResolvedValue([{ id: 1 }]);

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/last super admin/i);
  });

  test('deactivating the only active super admin is refused with 409', async () => {
    mockDb.get.mockImplementation(async (sql) =>
      /SELECT token_version/i.test(sql) ? { token_version: 0 } : { id: 1, email: 'boss@sbcc.church', role: 'super_admin', is_active: true }
    );
    mockTx.all.mockResolvedValue([{ id: 1 }]);

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ is_active: false });

    expect(res.status).toBe(409);
  });
});
```

Add `all` to the `mockTx` declaration at the top of that file if it is not already there:

```javascript
const mockTx = { get: jest.fn(), all: jest.fn(), run: jest.fn() };
```

and add to its `beforeEach`:

```javascript
  mockTx.all.mockResolvedValue([{ id: 1 }, { id: 2 }]);
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="auth.roles"`
Expected: FAIL — the count still runs on `mockDb.get`, so `mockTx.all` is never called.

- [ ] **Step 3: Move the guard inside the transaction**

In `api/auth.js`'s `app.put('/api/auth/users/:id', ...)`, delete this pre-transaction block:

```javascript
    // Refuse any change that would leave the system with no active super admin.
    const isDemotion = role !== undefined && role !== 'super_admin' && user.role === 'super_admin';
    const isDeactivation = is_active === false && user.role === 'super_admin';

    if (isDemotion || isDeactivation) {
      const row = await db.get(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'super_admin' AND is_active = true"
      );
      if (parseInt(row.count, 10) <= 1) {
        return res.status(409).json({
          error: 'Cannot remove the last super admin. Promote another account first.',
        });
      }
    }
```

and replace the transaction body with:

```javascript
    const isDemotion = role !== undefined && role !== 'super_admin' && user.role === 'super_admin';
    const isDeactivation = is_active === false && user.role === 'super_admin';
    const changes = diffFields(user, req.body, USER_FIELDS);

    await db.withTransaction(async (tx) => {
      if (isDemotion || isDeactivation) {
        // FOR UPDATE, and counted in JS because an aggregate cannot carry it.
        // Locking the rows serialises two concurrent demotions, so they cannot
        // both read "there are still two of us" and both proceed.
        const supers = await tx.all(
          "SELECT id FROM users WHERE role = 'super_admin' AND is_active = true FOR UPDATE"
        );
        if (supers.length <= 1) {
          const err = new Error('Cannot remove the last super admin. Promote another account first.');
          err.conflict = true;
          throw err;
        }
      }

      await tx.run(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.USER_UPDATE,
        entityType: 'user',
        entityId: parseInt(id, 10),
        summary: `Updated account ${user.email}`,
        changes,
      });
    });
```

- [ ] **Step 4: Answer the thrown conflict with 409**

Replace that handler's `catch` block with:

```javascript
  } catch (err) {
    if (err.conflict) {
      return res.status(409).json({ error: err.message });
    }
    console.error('User update error:', err.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
```

- [ ] **Step 5: Make the deletion refusal say what it means**

The spec requires the guard to cover deletion as well. `DELETE /api/auth/users/:id` already refuses to remove *any* `super_admin` — its SQL is `DELETE FROM users WHERE id = $1 AND role != 'super_admin'` — so the last one can never be deleted. That is stricter than the guard needs to be and is correct, but it reports the refusal as `404 User not found or cannot be deleted`, which reads like the account does not exist and sends the caller looking for the wrong problem.

Append to `api/auth.roles.test.js`:

```javascript
test('deleting a super admin is refused with a 409 that explains why', async () => {
  mockDb.get.mockImplementation(async (sql) =>
    /SELECT token_version/i.test(sql) ? { token_version: 0 } : { id: 1, email: 'boss@sbcc.church', role: 'super_admin', is_active: true }
  );

  const res = await request(app)
    .delete('/api/auth/users/1')
    .set('Authorization', tokenFor('super_admin'));

  expect(res.status).toBe(409);
  expect(res.body.error).toMatch(/super admin/i);
  expect(mockDb.run.mock.calls.some(([sql]) => /DELETE FROM users/i.test(sql))).toBe(false);
});
```

Run: `cd backend && npx jest --testPathPatterns="auth.roles"`
Expected: FAIL — the handler answers `404`.

Then in `api/auth.js`, replace the body of `app.delete('/api/auth/users/:id', ...)`'s `try` block with:

```javascript
    const target = await db.get('SELECT id, email, role FROM users WHERE id = $1', [id]);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (target.role === 'super_admin') {
      return res.status(409).json({
        error: 'Cannot delete a super admin. Demote the account first, which is itself refused if it is the last one.',
      });
    }

    const result = await db.run('DELETE FROM users WHERE id = $1', [id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
```

Run: `cd backend && npx jest --testPathPatterns="auth.roles"`
Expected: PASS.

- [ ] **Step 6: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="auth"`
Expected: PASS across every auth suite.

- [ ] **Step 7: Commit**

```bash
git add api/auth.js api/auth.roles.test.js
git commit -m "fix: evaluate the last-super-admin guard inside its transaction"
```

---

## Task 7: Bring the Local Express Server Into Line

`backend/routes/auth.js` never received Plan 1's role fixes. Line 285 still reads `if (role !== undefined && role !== "super_admin")`, which is spec Problem 1 verbatim: promoting someone to `super_admin` returns `200` while silently changing nothing. It also has no last-super-admin guard, no lockout, and no `tv` claim.

Separately, six route files each carry a private copy of `authenticateToken`, and `backend/middleware/auth.js` exists but is **empty and imported by nothing**. Adding the `tv` check to six copies is worse than filling the file that was clearly meant to hold it.

**Files:**
- Create: `backend/middleware/auth.test.js`, `backend/routes/auth.roles.test.js`
- Modify: `backend/middleware/auth.js`, `backend/routes/{auth,collections,expenses,budget,reports,activity}.js`

- [ ] **Step 1: Write the failing middleware test**

Create `backend/middleware/auth.test.js`:

```javascript
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const { authenticateToken, requireRole } = require('./auth');

const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (claims) => 'Bearer ' + jwt.sign(claims, JWT_SECRET);

const makeApp = (db, guards = [authenticateToken]) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = db; next(); });
  app.get('/thing', ...guards, (req, res) => res.json({ ok: true, email: req.user.email }));
  return app;
};

const dbWithVersion = (version) => ({
  get: jest.fn((sql, params, cb) => cb(null, { token_version: version })),
});

test('a valid current token passes through', async () => {
  const res = await request(makeApp(dbWithVersion(2)))
    .get('/thing')
    .set('Authorization', tokenFor({ id: 1, email: 'a@b.c', role: 'admin', tv: 2 }));

  expect(res.status).toBe(200);
  expect(res.body.email).toBe('a@b.c');
});

test('a revoked token is refused with 401 so the client signs out', async () => {
  const res = await request(makeApp(dbWithVersion(3)))
    .get('/thing')
    .set('Authorization', tokenFor({ id: 1, email: 'a@b.c', role: 'admin', tv: 2 }));

  expect(res.status).toBe(401);
  expect(res.body.code).toBe('TOKEN_REVOKED');
});

test('a token minted before the tv claim existed still works', async () => {
  const res = await request(makeApp(dbWithVersion(0)))
    .get('/thing')
    .set('Authorization', tokenFor({ id: 1, email: 'a@b.c', role: 'admin' }));

  expect(res.status).toBe(200);
});

test('no token is 401', async () => {
  const res = await request(makeApp(dbWithVersion(0))).get('/thing');
  expect(res.status).toBe(401);
});

test('a garbage token is 403', async () => {
  const res = await request(makeApp(dbWithVersion(0)))
    .get('/thing')
    .set('Authorization', 'Bearer not-a-token');

  expect(res.status).toBe(403);
});

test('requireRole refuses a role outside the list', async () => {
  const res = await request(makeApp(dbWithVersion(0), [authenticateToken, requireRole(['super_admin'])]))
    .get('/thing')
    .set('Authorization', tokenFor({ id: 1, email: 'a@b.c', role: 'admin', tv: 0 }));

  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="middleware/auth"`
Expected: FAIL — `authenticateToken is not a function` (the file is empty).

- [ ] **Step 3: Fill the empty middleware file**

Replace the contents of `backend/middleware/auth.js` (it is currently a zero-byte file) with:

```javascript
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

/**
 * The local server's single auth middleware. Six route files previously kept
 * private copies of this; they all delegate here so the token-version check
 * exists in one place.
 *
 * 401 for a missing or revoked token, 403 for a malformed or expired one. The
 * split matters: the frontend clears the session on 401 only.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  let claims;
  try {
    claims = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.sendStatus(403);
  }

  req.db.get(
    "SELECT token_version FROM users WHERE id = ?",
    [claims.id],
    (err, row) => {
      if (err) {
        console.error("Token version check failed:", err.message);
        return res.status(500).json({ error: "Authentication check failed" });
      }
      // A token minted before this feature carries no tv; 0 matches the column
      // default, so deploying does not sign everyone out.
      if (!row || (claims.tv ?? 0) !== (row.token_version ?? 0)) {
        return res
          .status(401)
          .json({ error: "Session expired. Please sign in again.", code: "TOKEN_REVOKED" });
      }
      req.user = claims;
      next();
    }
  );
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole, checkRole: requireRole, JWT_SECRET };
```

`checkRole` is exported as an alias because the route files use both names.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="middleware/auth"`
Expected: PASS, 6 tests.

- [ ] **Step 5: Point the six route files at it**

In each of `backend/routes/collections.js`, `expenses.js`, `budget.js`, `reports.js`, `activity.js` and `auth.js`, delete that file's local `const authenticateToken = (req, res, next) => { ... };` definition and its local `function checkRole(roles) { ... }` / `requireRole` definition, and add near the top, below the other requires:

```javascript
const { authenticateToken, requireRole, checkRole, JWT_SECRET } = require("../middleware/auth");
```

Then delete each file's now-duplicated `const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";` line. Leave every `router.get(...)` / `router.post(...)` argument list untouched — the names are unchanged, so the routes need no edits.

- [ ] **Step 6: Give the route suites a token_version row**

`backend/routes/activity.test.js`, `backend/routes/activity.mutations.test.js` and `backend/routes/collections.dupe.test.js` supply a fake `req.db`. Their `get` stubs must now answer the token-version probe. In each, wrap the existing `get` implementation:

```javascript
  get: jest.fn((sql, params, cb) => {
    if (/token_version/i.test(sql)) return cb(null, { token_version: 0 });
    // ...the file's existing behaviour, unchanged...
  }),
```

- [ ] **Step 7: Write the failing role test for the local server**

Create `backend/routes/auth.roles.test.js`:

```javascript
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 9, email: 'actor@sbcc.church', role, tv: 0 }, JWT_SECRET);

const makeApp = (target) => {
  const db = {
    get: jest.fn((sql, params, cb) => {
      if (/token_version/i.test(sql)) return cb(null, { token_version: 0 });
      return cb(null, target);
    }),
    all: jest.fn((sql, params, cb) => cb(null, [{ id: 1 }, { id: 2 }])),
    run: jest.fn(function (sql, params, cb) { if (cb) cb.call({ changes: 1, lastID: 1 }, null); }),
  };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = db; next(); });
  app.use('/api/auth', require('./auth'));
  return { app, db };
};

test('promoting to super_admin as an admin is an explicit 403, not a silent no-op', async () => {
  const { app, db } = makeApp({ id: 1, email: 't@sbcc.church', role: 'user', is_active: true });

  const res = await request(app)
    .put('/api/auth/users/1')
    .set('Authorization', tokenFor('admin'))
    .send({ role: 'super_admin' });

  expect(res.status).toBe(403);
  expect(db.run.mock.calls.some(([sql]) => /role\s*=/.test(sql))).toBe(false);
});

test('a super_admin may promote another account to super_admin', async () => {
  const { app, db } = makeApp({ id: 1, email: 't@sbcc.church', role: 'admin', is_active: true });

  const res = await request(app)
    .put('/api/auth/users/1')
    .set('Authorization', tokenFor('super_admin'))
    .send({ role: 'super_admin' });

  expect(res.status).toBe(200);
  const roleUpdate = db.run.mock.calls.find(([sql]) => /role\s*=/.test(sql));
  expect(roleUpdate[1]).toContain('super_admin');
});
```

- [ ] **Step 8: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="routes/auth.roles"`
Expected: FAIL — the first test gets `200` because the promotion is silently dropped.

- [ ] **Step 9: Fix the silent drop on the local server**

In `backend/routes/auth.js`, add this guard beside the existing `role === "admin"` check (around line 269):

```javascript
    if (role === "super_admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Only super administrators can grant super admin" });
    }
```

Then change the update-building guard (around line 285) from:

```javascript
    if (role !== undefined && role !== "super_admin") {
```

to:

```javascript
    if (role !== undefined) {
```

The `role !== "super_admin"` condition was what silently dropped the change; the explicit `403` above now handles the case it was standing in for.

- [ ] **Step 10: Carry the `tv` claim on the local server's tokens**

In `backend/routes/auth.js`, add `tv: user.token_version ?? 0` to the payload of the sign call at line 38 and `tv: existingUser.token_version ?? 0` to the one at line 122, and change `expiresIn: pwa ? "30d" : "24h"` to `expiresIn: pwa ? "7d" : "24h"`.

- [ ] **Step 11: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="routes|middleware"`
Expected: PASS across every backend route and middleware suite.

- [ ] **Step 12: Commit**

```bash
git add backend/middleware backend/routes
git commit -m "refactor: share one auth middleware locally and fix the silent role drop"
```

---

## Task 8: The Change-Password Form

**Files:**
- Create: `frontend/src/components/ChangePasswordModal.js`, `frontend/src/components/ChangePasswordModal.test.js`
- Modify: `frontend/src/utils/api.js`, `frontend/src/components/Dashboard.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ChangePasswordModal.test.js`:

```javascript
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChangePasswordModal from './ChangePasswordModal';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  changePassword: jest.fn(),
}));

// CRA sets resetMocks: true, so implementations belong here, not in the factory.
beforeEach(() => {
  apiService.changePassword.mockResolvedValue({ message: 'Password changed successfully', token: 'new-token' });
});

const fill = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const renderModal = (props = {}) =>
  render(<ChangePasswordModal onClose={() => {}} {...props} />);

test('refuses a new password shorter than 8 characters without calling the API', async () => {
  renderModal();

  fill(/current password/i, 'whatever1');
  fill(/^new password/i, 'short7c');
  fill(/confirm/i, 'short7c');
  fireEvent.click(screen.getByRole('button', { name: /change password/i }));

  await waitFor(() => expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument());
  expect(apiService.changePassword).not.toHaveBeenCalled();
});

test('refuses a mismatched confirmation without calling the API', async () => {
  renderModal();

  fill(/current password/i, 'whatever1');
  fill(/^new password/i, 'brand-new-pass');
  fill(/confirm/i, 'brand-new-pazz');
  fireEvent.click(screen.getByRole('button', { name: /change password/i }));

  await waitFor(() => expect(screen.getByText(/do not match/i)).toBeInTheDocument());
  expect(apiService.changePassword).not.toHaveBeenCalled();
});

test('submits both passwords when the form is valid', async () => {
  renderModal();

  fill(/current password/i, 'current-pass-1');
  fill(/^new password/i, 'brand-new-pass');
  fill(/confirm/i, 'brand-new-pass');
  fireEvent.click(screen.getByRole('button', { name: /change password/i }));

  await waitFor(() =>
    expect(apiService.changePassword).toHaveBeenCalledWith('current-pass-1', 'brand-new-pass')
  );
});

test('reports a rejected current password from the server', async () => {
  apiService.changePassword.mockRejectedValue({
    response: { status: 401, data: { error: 'Current password is incorrect' } },
  });
  renderModal();

  fill(/current password/i, 'wrong-one-here');
  fill(/^new password/i, 'brand-new-pass');
  fill(/confirm/i, 'brand-new-pass');
  fireEvent.click(screen.getByRole('button', { name: /change password/i }));

  await waitFor(() => expect(screen.getByText(/current password is incorrect/i)).toBeInTheDocument());
});

test('tells the user other devices were signed out, then closes', async () => {
  const onClose = jest.fn();
  renderModal({ onClose });

  fill(/current password/i, 'current-pass-1');
  fill(/^new password/i, 'brand-new-pass');
  fill(/confirm/i, 'brand-new-pass');
  fireEvent.click(screen.getByRole('button', { name: /change password/i }));

  await waitFor(() => expect(screen.getByText(/other devices/i)).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /done/i }));
  expect(onClose).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false --testPathPattern=ChangePasswordModal`
Expected: FAIL — cannot resolve `./ChangePasswordModal`.

- [ ] **Step 3: Add the API method**

In `frontend/src/utils/api.js`, directly above the closing `}` of the class, add:

```javascript
  async changePassword(currentPassword, newPassword) {
    const response = await this.api.post("/api/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
    // The server bumped token_version, which retired the token we authenticated
    // with. Store the replacement or the next request signs the user out.
    if (response.data?.token) {
      localStorage.setItem("authToken", response.data.token);
    }
    return response.data;
  }

  async setUserPassword(id, newPassword) {
    const response = await this.api.put(`/api/auth/users/${id}/password`, {
      new_password: newPassword,
    });
    return response.data;
  }
```

- [ ] **Step 4: Write the component**

Create `frontend/src/components/ChangePasswordModal.js`:

```javascript
import React, { useState } from "react";
import apiService from "../utils/api";

const MIN_LENGTH = 8;

const ChangePasswordModal = ({ onClose }) => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);

    if (next.length < MIN_LENGTH) {
      setError(`New password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (next !== confirm) {
      setError("The new passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      await apiService.changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || "Could not change the password. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const field = (id, label, value, setter) => (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold text-[#b89048]">{label}</label>
      <input
        id={id}
        type="password"
        value={value}
        onChange={(e) => setter(e.target.value)}
        className="text-sm border border-[#e8d090] rounded-lg px-3 py-2"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(61,42,8,0.35)" }}>
      <div className="bg-white rounded-2xl border border-[#e8d090] w-full max-w-sm p-5">
        <h2 className="text-base font-bold text-[#3d2a08] mb-4">Change password</h2>

        {done ? (
          <>
            <p className="text-sm text-[#3d2a08] mb-4">
              Password changed. You have been signed out on your other devices.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full px-3 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "#b8860b" }}
            >
              Done
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            {field("current-password", "Current password", current, setCurrent)}
            {field("new-password", "New password", next, setNext)}
            {field("confirm-password", "Confirm new password", confirm, setConfirm)}

            {error && <p className="text-sm text-[#b3452f]">{error}</p>}

            <div className="flex gap-2 mt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-3 py-2 rounded-lg border border-[#e8d090] text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: "#b8860b" }}
              >
                {saving ? "Changing…" : "Change password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChangePasswordModal;
```

The label for the new-password field is matched in the tests with `/^new password/i`, which is why "Confirm new password" is worded to not start with "New".

- [ ] **Step 5: Run to verify it passes**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false --testPathPattern=ChangePasswordModal`
Expected: PASS, 5 tests.

- [ ] **Step 6: Open it from the sidebar**

In `frontend/src/components/Dashboard.js`, add the import below the `ActivityLogView` import:

```javascript
import ChangePasswordModal from "./ChangePasswordModal";
```

add `KeyRound` to the `lucide-react` import list, add the state below `showActivityLog`:

```javascript
  const [showChangePassword, setShowChangePassword] = useState(false);
```

and in the sidebar's "Sign out at the bottom" block, directly above the existing `<button onClick={onLogout}`, add:

```javascript
            <button
              onClick={() => setShowChangePassword(true)}
              onMouseEnter={(e) => showTooltip(e, "Change Password")}
              onMouseLeave={hideTooltip}
              className={`w-full flex items-center rounded-xl text-sm font-medium text-[#8a6a2a] hover:bg-[#fff8e0] border border-transparent transition-all duration-150 mb-1
                ${sidebarCollapsed ? "lg:justify-center lg:px-0 lg:py-2.5 px-3 py-2.5 gap-3" : "gap-3 px-3 py-2.5"}`}
            >
              <KeyRound className={`flex-shrink-0 ${sidebarCollapsed ? "lg:w-5 lg:h-5 w-4 h-4" : "w-4 h-4"}`} />
              <span className={sidebarCollapsed ? "lg:hidden" : ""}>Change Password</span>
            </button>
```

Finally, directly before the closing `</div>` of the component's outermost element, add:

```javascript
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
```

- [ ] **Step 7: Run the whole frontend suite**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false`
Expected: PASS.

Run: `cd frontend && CI=true npx react-scripts build`
Expected: `Compiled successfully.`

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/ChangePasswordModal.js frontend/src/components/ChangePasswordModal.test.js frontend/src/utils/api.js frontend/src/components/Dashboard.js
git commit -m "feat: let any signed-in user change their password"
```

---

## Task 9: Silence the Two Google Sign-In Warnings

`initializeGoogle` is called from a `useEffect` keyed on `[googleConfig, loginMethod]`, so toggling between password and Google sign-in calls `google.accounts.id.initialize()` a second time, which GSI warns about. Separately, `renderButton` is passed `width: "100%"`, which it rejects — it wants a pixel number.

**Files:**
- Modify: `frontend/src/components/Login.js` (renamed in Task 2)

- [ ] **Step 1: Initialise once**

In `frontend/src/components/Login.js`, change the React import on line 1 to:

```javascript
import React, { useState, useEffect, useRef } from "react";
```

add a ref beside the other state declarations:

```javascript
  const initialisedRef = useRef(false);
```

and in `initializeGoogle`, wrap the `initialize` call so it runs only once:

```javascript
      // GSI warns when initialize() is called twice. This effect re-runs on every
      // loginMethod toggle, so only the button needs re-rendering after the first.
      if (!initialisedRef.current) {
        window.google.accounts.id.initialize({
          client_id: googleConfig.clientId,
          callback: handleGoogleResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
        });
        initialisedRef.current = true;
      }
```

- [ ] **Step 2: Give the button a pixel width**

In the same function, replace:

```javascript
                width: "100%",
```

with:

```javascript
                width: 320,
```

- [ ] **Step 3: Verify**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false --testPathPattern=Login`
Expected: PASS.

Run: `cd frontend && CI=true npx react-scripts build`
Expected: `Compiled successfully.`

Then load the app in a browser, open the console, and toggle between password and Google sign-in twice. Expected: no `GSI_LOGGER` warnings about repeated initialisation or invalid width.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Login.js
git commit -m "fix: initialise Google sign-in once and give its button a pixel width"
```

---

## Task 10: Full-Suite Checkpoint Before Touching Production

Nothing in Plans 1–4 has reached production. This is the last gate before it does.

- [ ] **Step 1: Backend**

Run: `cd backend && npm test`
Expected: all pass except the known local-only `googleSheetsService` failure ("not ready when no env var and no credentials file" — it fails because the developer machine has Google credentials configured).

- [ ] **Step 2: Frontend**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false`
Expected: all pass.

- [ ] **Step 3: Build**

Run: `cd frontend && CI=true npx react-scripts build`
Expected: `Compiled successfully.`

- [ ] **Step 4: Confirm the removals stuck**

Run:

```bash
grep -rn --include="*.js" "LoginNew\|api/forms\|routes/forms\|fund_allocation" api backend frontend/src
```

Expected: only `api/collections.softdelete.test.js`, which names `fund_allocation` to assert its absence.

- [ ] **Step 5: Confirm every token-minting site carries `tv`**

Run:

```bash
grep -rn -A4 "jwt.sign" api/auth.js backend/routes/auth.js | grep -c "tv:"
```

Expected: `4`.

---

## Task 11: Migrate the Development Branch and Re-Verify

The development branch already has every column and table this plan needs, so this task re-runs the spec migration there to prove it is idempotent before it touches production. Running an `IF NOT EXISTS` migration against a branch that already has everything must be a no-op.

- [ ] **Step 1: Record the before state**

Against Neon project `small-bar-42939262`, branch `br-super-resonance-a4koenk7`:

```sql
SELECT
  (SELECT count(*) FROM users) AS users,
  (SELECT count(*) FROM collections) AS collections,
  (SELECT count(*) FROM expenses) AS expenses,
  (SELECT count(*) FROM activity_log) AS log_entries;
```

Write the four numbers down.

- [ ] **Step 2: Apply the migration**

Run the full migration from the spec's Migration Plan section against `br-super-resonance-a4koenk7` — the three `ALTER TABLE` statements, the `CREATE TABLE IF NOT EXISTS activity_log`, and the four `CREATE INDEX IF NOT EXISTS` statements.

Expected: no error. Every `ADD COLUMN IF NOT EXISTS` is a no-op here; the four indexes may be newly created, which is the point of running it.

- [ ] **Step 3: Confirm nothing changed**

Re-run Step 1's query. Expected: identical numbers.

```sql
SELECT indexname FROM pg_indexes
WHERE indexname IN ('activity_log_occurred_at_idx','activity_log_entity_idx',
                    'collections_not_deleted_idx','expenses_not_deleted_idx')
ORDER BY indexname;
```

Expected: all four rows.

- [ ] **Step 4: Re-run the suites against the migrated branch**

Run: `cd backend && npm test`
Expected: unchanged from Task 10.

---

## Task 12: Migrate Production

**This is the only irreversible step in the plan.** The schema is additive — no existing column or row is modified — so currently deployed code, which ignores the new columns, keeps working after it. That is why the migration can safely precede the deploy.

- [ ] **Step 1: Back up production**

Run: `./scripts/backup-database.sh`

Confirm the dump file exists and is non-empty before continuing. Do not proceed on a failed or zero-byte backup.

- [ ] **Step 2: Record the before state**

Against branch `br-wild-mode-a4o3z1nc`:

```sql
SELECT
  (SELECT count(*) FROM users) AS users,
  (SELECT count(*) FROM collections) AS collections,
  (SELECT count(*) FROM expenses) AS expenses;
```

Write the three numbers down. `activity_log` does not exist yet on this branch, so do not query it.

- [ ] **Step 3: Apply the migration**

Run the same migration from the spec against `br-wild-mode-a4o3z1nc`. Unlike the development branch, every statement here does real work.

- [ ] **Step 4: Verify the shape**

```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='users' AND column_name IN ('failed_login_attempts','locked_until','token_version')) AS user_cols,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='collections' AND column_name IN ('updated_at','updated_by','deleted_at','deleted_by')) AS coll_cols,
  (SELECT count(*) FROM information_schema.columns
     WHERE table_name='expenses' AND column_name IN ('updated_at','updated_by','deleted_at','deleted_by')) AS exp_cols,
  (SELECT count(*) FROM information_schema.tables WHERE table_name='activity_log') AS has_log;
```

Expected: `3`, `4`, `4`, `1`.

- [ ] **Step 5: Verify no data moved**

Re-run Step 2's query. Expected: the same three numbers.

```sql
SELECT count(*) AS live_collections FROM collections WHERE deleted_at IS NULL;
```

Expected: equal to the total collections count — the new column is `NULL` everywhere, so nothing reads as deleted.

- [ ] **Step 6: Confirm both super administrators survived**

```sql
SELECT email, role, is_active, token_version, failed_login_attempts, locked_until
FROM users WHERE role = 'super_admin' ORDER BY email;
```

Expected: two active rows — `admin@sbcc.church` and `adefuinalvin1@gmail.com` — each with `token_version = 0`, `failed_login_attempts = 0`, `locked_until` null. If only one appears, stop: the last-super-admin guard and the mutual password-reset recovery path both assume two.

- [ ] **Step 7: Commit the checkpoint**

```bash
git commit --allow-empty -m "chore: apply the hardening migration to the production branch"
```

---

## Task 13: End-to-End Verification

Run against the development branch with the local server: `cd backend && npm run dev`.

Mint tokens using the server's own dotenv chain so the real `JWT_SECRET` is used and never printed:

```bash
cd backend && node -e "
const path=require('path');
require('dotenv').config({path:path.join(process.cwd(),'.env.development')});
require('dotenv').config({path:path.join(process.cwd(),'.env.development.local'),override:true});
const jwt=require('jsonwebtoken');
const S=process.env.JWT_SECRET;
console.log('SUPER='+jwt.sign({id:1,email:'admin@sbcc.church',role:'super_admin',tv:0},S,{expiresIn:'2h'}));
" > /tmp/sbcc-tokens.env
```

- [ ] **Step 1: A stale token is refused with 401**

Sign a token with `tv: 99` for user 1 and call any authenticated route with it.

Expected: `401` and a body containing `"code":"TOKEN_REVOKED"` — not `403`, or the browser would never sign the user out (Rule 2).

- [ ] **Step 2: A token with no `tv` claim still works**

Sign a token for user 1 omitting `tv` entirely and call `GET /api/collections`.

Expected: `200`. This is the graceful-rollout guarantee from Rule 1; if it fails, deploying would sign out every existing session.

- [ ] **Step 3: Lockout, on a throwaway account**

Create a test user, set a known password hash on it, then post five wrong passwords to `POST /api/auth/login`.

Expected: the first four return `401`; the fifth returns `401` and sets `locked_until`. Confirm:

```sql
SELECT email, failed_login_attempts, locked_until > now() AS locked FROM users WHERE email = '<test-account>';
```

Expected: `failed_login_attempts = 5`, `locked = true`.

- [ ] **Step 4: The lock hides whether the password was right**

Post the *correct* password for that locked account.

Expected: `423` with a positive `retry_after_seconds`, and no token in the body. Post a wrong password: `423` as well, indistinguishable from the previous response.

- [ ] **Step 5: A password change cuts off the old session**

With a valid token for the test account, call `POST /api/auth/change-password` with the correct current password and a new one of at least 8 characters.

Expected: `200`, a `token` in the body, and:

```sql
SELECT token_version, failed_login_attempts, locked_until FROM users WHERE email = '<test-account>';
```

showing `token_version` incremented. Now call `GET /api/collections` with the **old** token: expected `401` / `TOKEN_REVOKED`. With the **new** token: expected `200`.

- [ ] **Step 6: The log recorded it without leaking the password**

```sql
SELECT action, actor_email, entity_type, entity_id, summary, changes
FROM activity_log ORDER BY id DESC LIMIT 10;
```

Expected: `auth.password_change`, plus `auth.login_failed` rows from Step 3. Confirm no row contains the plaintext password or a `$2` hash prefix:

```sql
SELECT count(*) AS leaks FROM activity_log
WHERE summary LIKE '%$2%' OR changes::text LIKE '%$2%';
```

Expected: `0`.

- [ ] **Step 7: The last-super-admin guard still holds**

With a `super_admin` token, attempt to demote one of the two super administrators.

Expected: `200` — two exist, so the guard permits it. Immediately promote them back, then confirm that demoting when only one active `super_admin` remains returns `409`. Do this by temporarily setting the *other* super admin's `is_active = false` via SQL, attempting the demotion, expecting `409`, then restoring `is_active = true`.

- [ ] **Step 8: Remove the test account and restore the counts**

```sql
DELETE FROM activity_log WHERE entity_type = 'user' AND entity_id = <test-user-id>;
DELETE FROM activity_log WHERE actor_email = '<test-account>';
DELETE FROM users WHERE email = '<test-account>';
```

Re-run Task 11 Step 1's counts and confirm they match what you wrote down. Confirm both super administrators are `is_active = true` with their original roles.

- [ ] **Step 9: Commit**

```bash
git commit --allow-empty -m "test: verify lockout, revocation and role safety end-to-end"
```

---

## Verification Before Declaring the Hardening Complete

- [ ] `cd backend && npm test` — all pass except the known local-only `googleSheetsService` failure
- [ ] `cd frontend && CI=true npx react-scripts test --watchAll=false` — all pass
- [ ] `cd frontend && CI=true npx react-scripts build` — compiles
- [ ] `grep -rn --include="*.js" "LoginNew\|api/forms\|routes/forms" api backend frontend/src` returns nothing
- [ ] Every `jwt.sign` payload in `api/auth.js` and `backend/routes/auth.js` includes `tv`
- [ ] Every authenticated route rejects a token whose `tv` is behind the stored `token_version`, with `401` and `code: TOKEN_REVOKED`
- [ ] A token carrying no `tv` claim is still accepted while the user's `token_version` is `0`
- [ ] Five failed sign-ins lock an account for 15 minutes; a locked account answers `423` identically for right and wrong passwords
- [ ] A password change increments `token_version`, returns a replacement token, and invalidates the previous one
- [ ] `PUT /api/auth/users/:id/password` is `super_admin` only and clears the target's lock
- [ ] Demoting or deactivating the last active `super_admin` returns `409`, with the count taken via `FOR UPDATE` inside the transaction; deleting any `super_admin` returns `409` with a message naming the reason
- [ ] Promoting to `super_admin` as an `admin` returns an explicit `403` on both servers, never a silent `200`
- [ ] No activity log entry contains a password, a hash, or a token
- [ ] Production carries all three `users` columns, both sets of audit columns, `activity_log`, and all four indexes
- [ ] Production still has two active `super_admin` accounts

**Deployment order, after all tasks pass:** the migration (Task 12) is already applied and is additive, so deploy the application code last. Once deployed, existing sessions continue to work — every one of them has `token_version = 0` and no `tv` claim, which Rule 1 accepts.
