# Church Readiness Hardening — Plan 1: Foundation & Authorization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict financial record mutations to `admin`/`super_admin`, make super-admin roles manageable through the API, and guarantee the system can never be left without a super administrator.

**Architecture:** `api/` (Vercel serverless) and `backend/routes/` (local Express) are duplicated implementations of the same endpoints; both must change together. Three files currently define byte-identical copies of the same JWT middleware, so this plan first consolidates them into `api/_lib/auth.js`, then applies role gates on top of the shared helper. Schema columns for all four plans are applied up front in one additive migration, because unused columns are harmless and this avoids repeated production migrations.

**Tech Stack:** Node 18+, Express 4, PostgreSQL (Neon), `jsonwebtoken`, Jest 30, Supertest 7, React 18.

---

## Context You Need Before Starting

**The two code paths.** `api/*.js` are the Vercel serverless functions that run in production. `backend/routes/*.js` are the local Express dev server. They implement the same endpoints separately. A change to only one causes production and local behaviour to diverge. Every task below that touches an endpoint changes both.

**Jest 30 flag change.** The flag is `--testPathPatterns` (plural). `--testPathPattern` was removed and will error.

**The dev JWT secret** used by existing tests is the literal string `your-secret-key-change-this`, which is the fallback in `api/_lib/auth.js:3`. Tests sign tokens with it directly.

**Existing test pattern** lives in `backend/routes/collections.dupe.test.js`: mock the database, mount the router on a bare Express app, sign a JWT, drive it with Supertest.

**Database branches.** Neon project `small-bar-42939262`. Development branch is `br-super-resonance-a4koenk7`; production is `br-wild-mode-a4o3z1nc`. Apply and verify on development first.

**Two super administrators exist:** `admin@sbcc.church` and `adefuinalvin1@gmail.com`. Production also has `member@sbcc.church` with role `user`.

---

## File Structure

**Created:**
- `backend/jest.config.js` — jest config extending test discovery to `api/`
- `api/_lib/expressAuth.js` — shared Express middleware (`verifyToken`, `checkRole`)
- `api/_lib/expressAuth.test.js` — unit tests for the shared middleware
- `api/collections.auth.test.js` — role gate tests for collections
- `api/expenses.auth.test.js` — role gate tests for expenses
- `api/auth.roles.test.js` — super-admin grant/revoke and last-super-admin guard tests

**Modified:**
- `api/collections.js` — remove local `verifyToken`, import shared, add `checkRole` to mutations
- `api/expenses.js` — same
- `api/auth.js` — remove local `verifyJWT`/`checkRole`, import shared, add role management rules
- `backend/routes/collections.js`, `backend/routes/expenses.js` — mirror role gates
- `frontend/src/components/FinancialRecordsManager.js` — hide edit/delete for unpermitted roles
- `frontend/src/components/FinancialRecordsManager.test.js` — tests for the above

**Why a new file rather than extending `api/_lib/auth.js`:** that file already exports `authenticateToken`/`requireRole`, which are *handler wrappers* (`fn(handler) => handler`), a different calling convention from Express middleware (`fn(req,res,next)`). Mixing both conventions in one module invites using the wrong one. `expressAuth.js` holds the Express-middleware convention only.

---

## Task 1: Test Harness for `api/`

`api/` currently has zero tests, so the production code path is untested. Supertest lives in `backend/node_modules` and cannot resolve from `api/`, which `moduleDirectories` fixes.

**Files:**
- Create: `backend/jest.config.js`

- [x] **Step 1: Create the jest config**

```javascript
// backend/jest.config.js
module.exports = {
  rootDir: __dirname,
  roots: ['<rootDir>', '<rootDir>/../api'],
  testEnvironment: 'node',
  // supertest and jest live in backend/node_modules; tests under ../api
  // resolve up to the repo root, so point module resolution back here.
  moduleDirectories: ['node_modules', '<rootDir>/node_modules'],
};
```

- [x] **Step 2: Write a smoke test proving `api/` handlers are testable**

Create `api/health.test.js`:

```javascript
const request = require('supertest');
const app = require('./health');

test('GET /api/health returns ok', async () => {
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
});
```

- [x] **Step 3: Run it**

Run: `cd backend && npx jest --testPathPatterns="health"`
Expected: PASS, 1 test.

- [x] **Step 4: Confirm the existing suite still runs**

Run: `cd backend && npm test`
Expected: 8 suites. `services/googleSheetsService.test.js` fails **only if** you have a local `backend/config/google-credentials.json` — that is a known pre-existing local-only failure, not caused by this work. Everything else passes.

- [x] **Step 5: Commit**

```bash
git add backend/jest.config.js api/health.test.js
git commit -m "test: extend jest to cover api/ serverless handlers"
```

---

## Task 2: Additive Schema Migration (Development Branch)

Adds every column needed by all four plans in one pass. All statements are idempotent and additive; existing code ignores unknown columns.

**Files:** none (database only)

- [x] **Step 1: Apply to the development branch**

Run this against Neon project `small-bar-42939262`, branch `br-super-resonance-a4koenk7`:

```sql
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS activity_log (
  id            serial PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_email   text,
  actor_role    text,
  action        text NOT NULL,
  entity_type   text,
  entity_id     integer,
  summary       text,
  changes       jsonb
);

CREATE INDEX IF NOT EXISTS activity_log_occurred_at_idx ON activity_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_entity_idx ON activity_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS collections_not_deleted_idx ON collections (deleted_at);
CREATE INDEX IF NOT EXISTS expenses_not_deleted_idx ON expenses (deleted_at);
```

- [x] **Step 2: Verify the columns landed**

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE (table_name = 'collections' AND column_name IN ('updated_at','updated_by','deleted_at','deleted_by'))
   OR (table_name = 'expenses'    AND column_name IN ('updated_at','updated_by','deleted_at','deleted_by'))
   OR (table_name = 'users'       AND column_name IN ('failed_login_attempts','locked_until','token_version'))
ORDER BY table_name, column_name;
```

Expected: 11 rows.

- [x] **Step 3: Confirm the running app is unaffected**

Run: `curl -s http://localhost:3001/api/health`
Expected: `{"status":"OK",...}`. Existing code ignores the new columns.

**Do not apply to production in this task.** Production migration happens after Plan 4, following a `scripts/backup-database.sh` run.

---

## Task 3: Shared Express Auth Middleware

`api/collections.js:19`, `api/expenses.js`, and `api/auth.js:175` each define an identical JWT middleware under two different names (`verifyToken`, `verifyJWT`). Consolidate before adding role logic, so the gate is defined once.

**Files:**
- Create: `api/_lib/expressAuth.js`, `api/_lib/expressAuth.test.js`

- [x] **Step 1: Write the failing test**

Create `api/_lib/expressAuth.test.js`:

```javascript
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
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="expressAuth"`
Expected: FAIL — `Cannot find module './expressAuth'`.

- [x] **Step 3: Write the implementation**

Create `api/_lib/expressAuth.js`:

```javascript
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth');

/**
 * Express middleware: verifies the bearer token and sets req.user.
 * 401 when no token is supplied, 403 when the token is invalid.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}

/**
 * Express middleware factory: requires req.user.role to be one of `roles`.
 * Must run after verifyToken.
 */
function checkRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { verifyToken, checkRole };
```

- [x] **Step 4: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="expressAuth"`
Expected: PASS, 5 tests.

- [x] **Step 5: Commit**

```bash
git add api/_lib/expressAuth.js api/_lib/expressAuth.test.js
git commit -m "refactor: extract shared Express auth middleware"
```

---

## Task 4: Role Gates on Collections (`api/`)

**Files:**
- Create: `api/collections.auth.test.js`
- Modify: `api/collections.js` — delete the local `verifyToken` (lines 19-29), import the shared pair, add `checkRole` to POST/PUT/DELETE

- [x] **Step 1: Write the failing test**

Create `api/collections.auth.test.js`:

```javascript
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

const app = require('./collections');
const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church', role }, JWT_SECRET);

describe('collections role gates', () => {
  test('user role cannot create', async () => {
    const res = await request(app)
      .post('/api/collections')
      .set('Authorization', tokenFor('user'))
      .send({ date: '2026-08-15', total_amount: 100 });
    expect(res.status).toBe(403);
  });

  test('user role cannot update', async () => {
    const res = await request(app)
      .put('/api/collections/1')
      .set('Authorization', tokenFor('user'))
      .send({ date: '2026-08-15' });
    expect(res.status).toBe(403);
  });

  test('user role cannot delete', async () => {
    const res = await request(app)
      .delete('/api/collections/1')
      .set('Authorization', tokenFor('user'));
    expect(res.status).toBe(403);
  });

  test('user role can still read', async () => {
    const res = await request(app)
      .get('/api/collections')
      .set('Authorization', tokenFor('user'));
    expect(res.status).toBe(200);
  });

  test('admin role is not blocked by the role gate on delete', async () => {
    const res = await request(app)
      .delete('/api/collections/1')
      .set('Authorization', tokenFor('admin'));
    expect(res.status).not.toBe(403);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="collections.auth"`
Expected: FAIL — the three `user` mutation tests return 200/404/500 instead of 403, because no role gate exists yet.

- [x] **Step 3: Replace the local middleware with the shared one**

In `api/collections.js`, delete the local `function verifyToken(req, res, next) { ... }` block (lines 19-29) and change the imports at the top:

```javascript
const { JWT_SECRET } = require('./_lib/auth');
const { verifyToken, checkRole } = require('./_lib/expressAuth');
```

Remove the now-unused `const jwt = require('jsonwebtoken');` if nothing else in the file uses `jwt`.

- [x] **Step 4: Add the role gate to each mutating route**

Change the three route registrations so `checkRole` runs after `verifyToken`:

```javascript
const canMutate = checkRole(['admin', 'super_admin']);

app.post('/api/collections', verifyToken, canMutate, async (req, res) => {
app.put('/api/collections/:id', verifyToken, canMutate, async (req, res) => {
app.delete('/api/collections/:id', verifyToken, canMutate, async (req, res) => {
```

Leave every `app.get(...)` registration unchanged.

- [x] **Step 5: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="collections"`
Expected: PASS — 5 new tests, plus the existing `collections.dupe` suite still green.

- [x] **Step 6: Commit**

```bash
git add api/collections.js api/collections.auth.test.js
git commit -m "feat: restrict collection mutations to admin and super_admin"
```

---

## Task 5: Role Gates on Expenses (`api/`)

**Files:**
- Create: `api/expenses.auth.test.js`
- Modify: `api/expenses.js`

- [x] **Step 1: Write the failing test**

Create `api/expenses.auth.test.js`:

```javascript
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
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="expenses.auth"`
Expected: FAIL on the three `user` mutation tests.

- [x] **Step 3: Apply the same change as Task 4**

In `api/expenses.js`, delete the local `verifyToken` definition, import the shared middleware, and gate the mutations:

```javascript
const { JWT_SECRET } = require('./_lib/auth');
const { verifyToken, checkRole } = require('./_lib/expressAuth');

const canMutate = checkRole(['admin', 'super_admin']);

app.post('/api/expenses', verifyToken, canMutate, async (req, res) => {
app.put('/api/expenses/:id', verifyToken, canMutate, async (req, res) => {
app.delete('/api/expenses/:id', verifyToken, canMutate, async (req, res) => {
```

- [x] **Step 4: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="expenses"`
Expected: PASS, 5 tests.

- [x] **Step 5: Commit**

```bash
git add api/expenses.js api/expenses.auth.test.js
git commit -m "feat: restrict expense mutations to admin and super_admin"
```

---

## Task 6: Mirror Role Gates in `backend/routes/`

Without this, the local dev server allows what production forbids, and bugs found locally will not reproduce in production.

**Files:**
- Modify: `backend/routes/collections.js`, `backend/routes/expenses.js`

- [x] **Step 1: Add a role check to the local routers**

`backend/routes/` files use their own local auth middleware and take `req.db` from the server. Add this helper near the top of **each** file, after the existing requires:

```javascript
function checkRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

const canMutate = checkRole(['admin', 'super_admin']);
```

- [x] **Step 2: Apply it to the mutating routes**

These routers register routes as `router.post("/", authenticateToken, handler)`. Insert `canMutate` immediately after the existing auth middleware argument, leaving the handler untouched.

In `backend/routes/collections.js`:

```javascript
router.post("/", authenticateToken, canMutate, async (req, res) => {
router.put("/:id", authenticateToken, canMutate, async (req, res) => {
router.delete("/:id", authenticateToken, canMutate, async (req, res) => {
```

In `backend/routes/expenses.js`:

```javascript
router.post("/", authenticateToken, canMutate, async (req, res) => {
router.put("/:id", authenticateToken, canMutate, async (req, res) => {
router.delete("/:id", authenticateToken, canMutate, async (req, res) => {
```

If the existing middleware in these files is named something other than `authenticateToken`, keep whatever name is already there and simply add `canMutate` after it. Leave every `router.get(...)` registration unchanged.

- [x] **Step 3: Verify the existing route tests still pass**

Run: `cd backend && npx jest --testPathPatterns="routes"`
Expected: PASS. Note `collections.dupe.test.js` signs a token without a `role` claim, so it will now hit the 403 gate. Update that test's token to include `role: 'admin'`:

```javascript
const AUTH = 'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church', role: 'admin' }, JWT_SECRET);
```

- [x] **Step 4: Re-run**

Run: `cd backend && npm test`
Expected: all suites pass except the known local-only `googleSheetsService` failure.

- [x] **Step 5: Commit**

```bash
git add backend/routes/collections.js backend/routes/expenses.js backend/routes/collections.dupe.test.js
git commit -m "feat: mirror record mutation role gates on the local Express server"
```

---

## Task 7: Super-Admin Role Management

Currently `api/auth.js:278` reads `if (role !== undefined && role !== 'super_admin')`, which *silently drops* a `super_admin` role change and returns 200. Replace silent failure with explicit behaviour: super admins may grant and revoke the role; everyone else gets 403.

**Files:**
- Create: `api/auth.roles.test.js`
- Modify: `api/auth.js`

- [x] **Step 1: Write the failing test**

Create `api/auth.roles.test.js`:

```javascript
const request = require('supertest');
const jwt = require('jsonwebtoken');

const db = { get: jest.fn(), all: jest.fn(), run: jest.fn() };
jest.mock('./_lib/database', () => db);

const app = require('./auth');
const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 9, email: 'actor@sbcc.church', role }, JWT_SECRET);

beforeEach(() => {
  jest.clearAllMocks();
  db.run.mockResolvedValue({ rowCount: 1 });
});

test('admin cannot promote a user to super_admin', async () => {
  db.get.mockResolvedValue({ id: 1, email: 'target@sbcc.church', role: 'user' });

  const res = await request(app)
    .put('/api/auth/users/1')
    .set('Authorization', tokenFor('admin'))
    .send({ role: 'super_admin' });

  expect(res.status).toBe(403);
});

test('super_admin can promote a user to super_admin', async () => {
  db.get.mockResolvedValue({ id: 1, email: 'target@sbcc.church', role: 'admin' });

  const res = await request(app)
    .put('/api/auth/users/1')
    .set('Authorization', tokenFor('super_admin'))
    .send({ role: 'super_admin' });

  expect(res.status).toBe(200);
  const roleUpdate = db.run.mock.calls.find(([sql]) => /role\s*=/.test(sql));
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
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="auth.roles"`
Expected: FAIL — `admin cannot promote` returns 200 (silent drop), and `super_admin can promote` finds no role update.

- [x] **Step 3: Replace the silent drop with an explicit rule**

In `api/auth.js`, inside the `PUT /api/auth/users/:id` handler, add this check alongside the existing guards (before the update array is built):

```javascript
if (role === 'super_admin' && req.user.role !== 'super_admin') {
  return res.status(403).json({ error: 'Only super administrators can grant super admin' });
}
```

Then change the role-update condition from:

```javascript
if (role !== undefined && role !== 'super_admin') {
```

to:

```javascript
if (role !== undefined) {
```

Leave the `POST /api/auth/users` refusal at line 221 exactly as it is — the role is granted by promotion, never at creation.

- [x] **Step 4: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="auth.roles"`
Expected: PASS, 3 tests.

- [x] **Step 5: Commit**

```bash
git add api/auth.js api/auth.roles.test.js
git commit -m "feat: let super admins grant and revoke super_admin explicitly"
```

---

## Task 8: Last-Super-Admin Guard

Task 7 makes demotion possible, so the system can now reach zero super administrators. This guard closes that path. It also covers deactivation, which was already possible.

**Files:**
- Modify: `api/auth.js`, `api/auth.roles.test.js`

- [x] **Step 1: Write the failing test**

Append to `api/auth.roles.test.js`:

```javascript
describe('last-super-admin guard', () => {
  test('demoting the only active super_admin is refused with 409', async () => {
    db.get
      .mockResolvedValueOnce({ id: 1, email: 'last@sbcc.church', role: 'super_admin' })
      .mockResolvedValueOnce({ count: '1' });

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/last super admin/i);
  });

  test('deactivating the only active super_admin is refused with 409', async () => {
    db.get
      .mockResolvedValueOnce({ id: 1, email: 'last@sbcc.church', role: 'super_admin' })
      .mockResolvedValueOnce({ count: '1' });

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ is_active: false });

    expect(res.status).toBe(409);
  });

  test('demoting one of two super_admins is allowed', async () => {
    db.get
      .mockResolvedValueOnce({ id: 1, email: 'one@sbcc.church', role: 'super_admin' })
      .mockResolvedValueOnce({ count: '2' });

    const res = await request(app)
      .put('/api/auth/users/1')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="auth.roles"`
Expected: FAIL — the two guard tests return 200 instead of 409.

- [x] **Step 3: Implement the guard**

In `api/auth.js`, inside `PUT /api/auth/users/:id`, after the target `user` is loaded and after the super-admin-grant check from Task 7, insert:

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

- [x] **Step 4: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="auth.roles"`
Expected: PASS, 6 tests.

- [x] **Step 5: Run the whole backend suite**

Run: `cd backend && npm test`
Expected: all pass except the known local-only `googleSheetsService` failure.

- [x] **Step 6: Commit**

```bash
git add api/auth.js api/auth.roles.test.js
git commit -m "feat: refuse changes that would remove the last super admin"
```

---

## Task 9: Hide Edit and Delete Controls for Unpermitted Roles

The API now returns 403, but a `user` still sees buttons that cannot work. Hide them, while still handling a 403 in case a role changes mid-session.

**Files:**
- Modify: `frontend/src/components/FinancialRecordsManager.js`, `frontend/src/components/FinancialRecordsManager.test.js`

- [x] **Step 1: Write the failing test**

Append to `frontend/src/components/FinancialRecordsManager.test.js`:

```javascript
describe('role-based controls', () => {
  test('user role sees no edit or delete buttons', async () => {
    render(<FinancialRecordsManager user={{ role: 'user', email: 'm@sbcc.church' }} />);
    await waitFor(() => screen.getByText('Test Collection'));

    expect(screen.queryByTitle('Edit')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
  });

  test('admin role sees edit and delete buttons', async () => {
    render(<FinancialRecordsManager user={{ role: 'admin', email: 'a@sbcc.church' }} />);
    await waitFor(() => screen.getByText('Test Collection'));

    expect(screen.getByTitle('Edit')).toBeInTheDocument();
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false --testPathPattern="FinancialRecordsManager"`

(Note: the frontend uses an older Jest via react-scripts, so the flag here is the **singular** `--testPathPattern`.)

Expected: FAIL — the `user` test finds Edit and Delete buttons.

- [x] **Step 3: Accept the prop and gate the controls**

In `frontend/src/components/FinancialRecordsManager.js`, change the component signature:

```javascript
const FinancialRecordsManager = ({ onDataChange, user }) => {
  const canMutate = ['admin', 'super_admin'].includes(user?.role);
```

Wrap the Edit and Delete buttons in the record row (currently `FinancialRecordsManager.js:1016-1030`) so they render only when permitted. Replace that block with exactly this — the markup is unchanged apart from the surrounding conditional:

```javascript
{canMutate && (
  <>
    <button
      onClick={() => handleEditRecord(record)}
      className="p-1.5 rounded-lg text-[#b89048] hover:text-[#c49030] hover:bg-amber-50 transition"
      title="Edit"
    >
      <Edit3 className="w-4 h-4" />
    </button>
    <button
      onClick={() => handleDeleteRecord(record.id)}
      className="p-1.5 rounded-lg text-[#b89048] hover:text-rose-600 hover:bg-rose-50 transition"
      title="Delete"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </>
)}
```

The icon components are `Edit3` and `Trash2` (already imported at the top of the file). Do not substitute `Edit2` — it is not imported.

- [x] **Step 4: Pass the prop from the parent**

In `frontend/src/components/Dashboard.js`, find where `FinancialRecordsManager` is rendered and add the `user` prop:

```javascript
<FinancialRecordsManager onDataChange={handleDataChange} user={user} />
```

If the parent does not already hold a `user` object, pass the one it received from `App.js`.

- [x] **Step 5: Surface a real message when the API refuses**

Hiding the buttons is not sufficient on its own: a role can change while someone is signed in, and the record list is also reachable with a stale page. `frontend/src/utils/api.js` converts failures into `new Error(error.response?.data?.error || "...")`, so the HTTP status is gone by the time the component sees it — but the server's own message survives. A 403 therefore arrives as `"Insufficient permissions"`.

In `FinancialRecordsManager.js:536`, change the `catch` block of `handleDeleteRecord` from:

```javascript
} catch (error) {
  console.error("Error deleting record:", error);
  showNotification("Failed to delete record", "error");
}
```

to:

```javascript
} catch (error) {
  console.error("Error deleting record:", error);
  showNotification(error.message || "Failed to delete record", "error");
}
```

Make the same change in the `catch` block of `handleSubmit`, replacing its generic failure message with `error.message || "<existing generic message>"`.

- [x] **Step 6: Run to verify it passes**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false --testPathPattern="FinancialRecordsManager"`
Expected: PASS — the 4 existing tests plus 2 new ones.

- [x] **Step 7: Run the full frontend suite and build**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false`
Expected: all suites pass.

Run: `cd frontend && CI=true npx react-scripts build`
Expected: `Compiled successfully.`

- [x] **Step 8: Commit**

```bash
git add frontend/src/components/FinancialRecordsManager.js frontend/src/components/FinancialRecordsManager.test.js frontend/src/components/Dashboard.js
git commit -m "feat: hide record edit and delete controls from unpermitted roles"
```

---

## Verification Before Moving to Plan 2

- [x] `cd backend && npm test` — all pass except the known local-only `googleSheetsService` failure
- [x] `cd frontend && CI=true npx react-scripts test --watchAll=false` — all pass
- [x] `cd frontend && CI=true npx react-scripts build` — compiles
- [x] Development branch has all 11 new columns and the `activity_log` table
- [ ] Manual check: sign in as `member@sbcc.church` (role `user`) against the local server and confirm the records list renders without Edit/Delete controls

**Not done in this plan, by design:** production migration, soft delete behaviour, activity logging, forms removal, and account security. Those are Plans 2 through 4.
