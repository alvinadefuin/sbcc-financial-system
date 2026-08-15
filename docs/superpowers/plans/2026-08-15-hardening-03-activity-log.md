# Church Readiness Hardening — Plan 3: Activity Log

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Record who did what, in an append-only `activity_log` written inside the same transaction as the mutation it describes, and expose that history to super administrators through `GET /api/activity` and a read-only Activity page.

**Architecture:** Per-record `updated_by`/`deleted_by` columns (Plan 2) hold only the latest change; the log holds the history. Every mutation handler moves inside a new `db.withTransaction()` helper so the record write and its log entry commit or fail together — a mutation is never silently unlogged. All log writes go through one `logActivity()` helper, so there is exactly one call site per mutation and one place where the `changes` diff is computed and redacted.

**Tech Stack:** Node 18+, Express 4, PostgreSQL (Neon) via `pg`, Jest 30, Supertest 7, React 18, Testing Library.

---

## Context You Need Before Starting

**Plans 1 and 2 are merged to `main`.** Role gates (`checkRole`), soft delete, and the `notDeleted()` predicate are in place. The `activity_log` table already exists on the development branch with exactly the columns this plan writes — verified 2026-08-15:

```
id serial pk | occurred_at timestamptz not null default now() | actor_email text | actor_role text
action text not null | entity_type text | entity_id integer | summary text | changes jsonb
```

**This plan adds no schema.** Production migration is still deferred until after Plan 4.

**Jest 30 flag.** `--testPathPatterns` (plural) in `backend/`. The frontend's older Jest uses the singular `--testPathPattern`.

**Always run backend tests from `backend/`.** Running `npx jest` from the repo root picks up a different, npx-fetched Jest that ignores `backend/jest.config.js` and fails with `Cannot find module 'supertest'`. If you see that error, you are in the wrong directory. Note also that the shell's working directory persists between commands.

**`jest.mock()` factories may only close over `mock`-prefixed names.** Jest hoists `jest.mock()` above your `const` declarations. A factory referencing a plain `db` throws `Invalid variable access: db`. Name the shared mock `mockDb`. This bit Plan 1 — do not repeat it.

**The dev JWT secret** used by tests is the literal `your-secret-key-change-this`.

**Existing test patterns:** `api/auth.roles.test.js` (mock `./_lib/database`, mount the exported app, sign a JWT, drive with Supertest), `api/collections.softdelete.test.js` (same, plus assertions on captured SQL), and `frontend/src/components/CustomFieldsManager.test.js` (`jest.mock('../utils/api', () => ({ ... }))`, render, `waitFor`).

**Database branches.** Neon project `small-bar-42939262`, development branch `br-super-resonance-a4koenk7`, production `br-wild-mode-a4o3z1nc`.

**Scope calls made when this plan was written:**

- `auth.login_success` / `auth.login_failed` are implemented here (Task 6) even though the spec discusses them under the lockout section, because the login endpoint already exists. Plan 4 then only adds the lockout counters.
- `auth.password_change` is **not** in this plan — the endpoint it belongs to does not exist until Plan 4.
- The local Express server mirrors both the logging (Task 10) and the read endpoint (Task 11), matching how Plans 1 and 2 handled `api/` vs `backend/routes/` duplication.

---

## Three Non-Obvious Rules

These are the three ways this plan goes wrong quietly. None of them produce an obvious error message.

**Rule 1 — never touch `db` inside a `withTransaction` callback.** The pool in `api/_lib/database.js` is created with `max: 1`. Inside a transaction, that single connection is checked out. A `db.get(...)` in the callback asks the pool for a second connection, waits for one that cannot be released until the transaction ends, and stalls until `connectionTimeoutMillis` (10s) fires. Use the `tx` runner the callback is handed, for **every** statement. This is also why `saveCustomFieldValues()` and `enrichRecordsWithCustomFields()` — which use the pooled `db` internally — must stay outside the transaction.

**Rule 2 — the diff must normalize types, or every update logs every field.** PostgreSQL returns `numeric` columns as strings (`"100.00"`) and `date` columns as `Date` objects in local time (a `2026-06-12` row comes back as `2026-06-11T16:00:00.000Z` in Manila). The request body sends `100` and `"2026-06-12"`. A naive `before[f] !== after[f]` reports all 17 amount columns as changed on every edit, which makes `changes` useless. `diffFields()` normalizes both sides before comparing, and diffs only an explicit field list.

**Rule 3 — `logActivity` takes a runner, not a connection.** `db` and `tx` expose the same `run(sql, params)` shape, so one helper serves both. Transactional callers pass `tx`; the one genuinely non-transactional caller (a failed login, which mutates nothing else) passes `db`. Do not add a second logging function.

---

## File Structure

**Created:**
- `api/_lib/activityLog.js` — `logActivity()`, `diffFields()`, the action whitelist, and the redaction set
- `api/_lib/activityLog.test.js` — unit tests for the diff and the insert
- `api/_lib/database.test.js` — unit tests for `withTransaction` against a fake `pg` client
- `api/activity.js` — the `GET /api/activity` serverless function
- `api/activity.test.js` — authorization, pagination, and filter tests
- `api/collections.activity.test.js`, `api/expenses.activity.test.js`, `api/auth.activity.test.js` — one log-behaviour suite per mutation surface
- `backend/routes/activity.js` — the same read endpoint on the local Express server
- `backend/routes/activity.test.js`
- `frontend/src/components/ActivityLogView.js` — the read-only Activity page
- `frontend/src/components/ActivityLogView.test.js`

**Modified:**
- `api/_lib/database.js` — add `withTransaction`, share one runner factory
- `api/collections.js`, `api/expenses.js` — drop dead `fund_allocation` writes, wrap mutations in transactions, log them
- `api/auth.js` — log login outcomes and user create/update
- `backend/routes/collections.js`, `backend/routes/expenses.js` — mirror
- `backend/config/database-pg.js` — add `withTransaction`
- `backend/server.js` — mount `/api/activity`
- `frontend/src/utils/api.js` — add `getActivity`, remove the dead `getFundAllocationSummary`
- `frontend/src/components/Dashboard.js` — Activity nav item, `super_admin` only
- `vercel.json` — route `/api/activity`
- `api/collections.softdelete.test.js` — drop the test for the endpoint removed in Task 1

**Not in this plan, by design:** forms removal, login lockout, password management, and token revocation (Plan 4); production migration (after Plan 4); any UI for editing or deleting log entries — the table is append-only and no application code ever updates or deletes from it.

---

## Task 1: Remove the Dead `fund_allocation` Writes

`fund_allocation` does not exist on either Neon branch — it is a SQLite-era table that never made it into PostgreSQL. Every write to it raises `relation "fund_allocation" does not exist`, so `POST /api/collections` currently returns 500 **after** the collection row has already been committed by its own autocommit, and `GET /api/collections/fund-allocation/summary` always 500s. Nothing consumes it: `api/_lib/reportService.js` computes fund allocation from the `pbcm_share` / `pastoral_team_share` / `operational_fund_share` columns on `collections`, and `getFundAllocationSummary` in the frontend API service is called by no component.

This must be resolved before Task 4: once POST is transactional, the failing insert would roll the real record back.

**Files:**
- Modify: `api/collections.js`, `backend/routes/collections.js`, `frontend/src/utils/api.js`, `api/collections.softdelete.test.js`

- [x] **Step 1: Replace the obsolete test with one that pins the new behaviour**

In `api/collections.softdelete.test.js`, delete this test entirely:

```javascript
  test('the fund allocation summary excludes allocations of deleted collections', async () => {
    mockDb.get.mockResolvedValue({});
    await request(app)
      .get('/api/collections/fund-allocation/summary')
      .set('Authorization', ADMIN);

    const call = mockDb.get.mock.calls.find(([sql]) => /total_tithes/i.test(sql));
    expect(call[0]).toMatch(/JOIN collections/i);
    expect(call[0]).toMatch(/deleted_at IS NULL/i);
  });
```

and replace this test:

```javascript
  test('DELETE preserves the fund_allocation children', async () => {
    await request(app).delete('/api/collections/7').set('Authorization', ADMIN);

    const statements = sqlOf(mockDb.run.mock.calls);
    expect(statements.some((s) => /DELETE\s+FROM\s+fund_allocation/i.test(s))).toBe(false);
  });
```

with:

```javascript
  test('no handler writes the dead fund_allocation table', async () => {
    await request(app).delete('/api/collections/7').set('Authorization', ADMIN);
    await request(app)
      .post('/api/collections')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });
    await request(app)
      .put('/api/collections/7')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    const statements = sqlOf(mockDb.run.mock.calls);
    expect(statements.some((s) => /fund_allocation/i.test(s))).toBe(false);
  });
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="collections.softdelete"`
Expected: FAIL — the POST and PUT handlers still issue `fund_allocation` statements.

- [x] **Step 3: Remove the insert from the collections POST handler**

In `api/collections.js`, delete this block from `app.post('/api/collections', ...)`:

```javascript
    await db.run(
      `INSERT INTO fund_allocation (
        collection_id, date, general_tithes_amount,
        pbcm_allocation, pastoral_team_allocation, operational_allocation
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [collectionId, date, generalTithesAmount, pbcmShare, pastoralTeamShare, operationalFundShare]
    );

```

`generalTithesAmount` is still used to compute the three share values, so leave its declaration alone.

- [x] **Step 4: Remove the update from the collections PUT handler**

In `api/collections.js`, delete this block from `app.put('/api/collections/:id', ...)`:

```javascript
    await db.run(
      `UPDATE fund_allocation SET
        date = $1, general_tithes_amount = $2,
        pbcm_allocation = $3, pastoral_team_allocation = $4, operational_allocation = $5
      WHERE collection_id = $6`,
      [date, generalTithesAmount, pbcmShare, pastoralTeamShare, operationalFundShare, id]
    );

```

- [x] **Step 5: Remove the dead summary endpoint**

In `api/collections.js`, delete the entire handler, from its comment through its closing `});`:

```javascript
// GET /api/collections/fund-allocation/summary
app.get('/api/collections/fund-allocation/summary', verifyToken, async (req, res) => {
```

- [x] **Step 6: Mirror all three removals on the local Express server**

In `backend/routes/collections.js`, delete the `INSERT INTO fund_allocation (...)` call in the POST handler (around line 222), the `UPDATE fund_allocation SET ...` call in the PUT handler (around line 361), and the whole `router.get("/fund-allocation/summary", ...)` route (around line 410).

- [x] **Step 7: Remove the unused frontend API method**

In `frontend/src/utils/api.js`, delete the whole `getFundAllocationSummary` method:

```javascript
  async getFundAllocationSummary(month = null, year = null) {
```

through its closing brace. No component calls it.

- [x] **Step 8: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="collections"`
Expected: PASS, with one fewer test than before in `collections.softdelete`.

Run: `grep -rn --include="*.js" fund_allocation api backend/routes frontend/src`
Expected: no matches.

- [x] **Step 9: Commit**

```bash
git add api/collections.js backend/routes/collections.js frontend/src/utils/api.js api/collections.softdelete.test.js
git commit -m "fix: remove dead fund_allocation writes that broke record creation"
```

---

## Task 2: The `withTransaction` Helper

**Files:**
- Create: `api/_lib/database.test.js`
- Modify: `api/_lib/database.js`

- [x] **Step 1: Write the failing test**

Create `api/_lib/database.test.js`:

```javascript
// A fake pg so the transaction mechanics can be tested without a database.
const mockClient = { query: jest.fn(async () => ({ rows: [], rowCount: 0 })), release: jest.fn() };
const mockPool = {
  connect: jest.fn(async () => mockClient),
  query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
  on: jest.fn(),
};
jest.mock('pg', () => ({ Pool: jest.fn(() => mockPool) }));

process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/test';
const { withTransaction } = require('./database');

const sqlOf = () => mockClient.query.mock.calls.map(([sql]) => sql);

beforeEach(() => {
  jest.clearAllMocks();
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

test('wraps the callback in BEGIN/COMMIT and returns its value', async () => {
  const result = await withTransaction(async (tx) => {
    await tx.run('UPDATE collections SET total_amount = $1 WHERE id = $2', [5, 7]);
    return 'done';
  });

  expect(result).toBe('done');
  expect(sqlOf()).toEqual([
    'BEGIN',
    'UPDATE collections SET total_amount = $1 WHERE id = $2',
    'COMMIT',
  ]);
  expect(mockClient.release).toHaveBeenCalled();
});

test('rolls back and rethrows when the callback throws', async () => {
  await expect(
    withTransaction(async (tx) => {
      await tx.run('UPDATE collections SET total_amount = $1 WHERE id = $2', [5, 7]);
      throw new Error('log write failed');
    })
  ).rejects.toThrow('log write failed');

  expect(sqlOf()).toContain('ROLLBACK');
  expect(sqlOf()).not.toContain('COMMIT');
  expect(mockClient.release).toHaveBeenCalled();
});

test('releases the connection even when COMMIT itself fails', async () => {
  mockClient.query.mockImplementation(async (sql) => {
    if (sql === 'COMMIT') throw new Error('connection lost');
    return { rows: [], rowCount: 0 };
  });

  await expect(withTransaction(async () => {})).rejects.toThrow('connection lost');
  expect(mockClient.release).toHaveBeenCalled();
});

test('tx.run converts ? placeholders and reports affected rows', async () => {
  mockClient.query.mockResolvedValue({ rows: [], rowCount: 3 });

  const res = await withTransaction((tx) => tx.run('DELETE FROM x WHERE a = ? AND b = ?', [1, 2]));

  expect(sqlOf()).toContain('DELETE FROM x WHERE a = $1 AND b = $2');
  expect(res).toEqual({ changes: 3 });
});

test('tx.run appends RETURNING * to inserts so lastID is available', async () => {
  mockClient.query.mockResolvedValue({ rows: [{ id: 42 }], rowCount: 1 });

  const res = await withTransaction((tx) => tx.run('INSERT INTO x (a) VALUES ($1)', [1]));

  expect(sqlOf()).toContain('INSERT INTO x (a) VALUES ($1) RETURNING *');
  expect(res).toEqual({ lastID: 42, changes: 1 });
});

test('tx.get returns the first row and tx.all returns every row', async () => {
  mockClient.query.mockResolvedValue({ rows: [{ id: 1 }, { id: 2 }], rowCount: 2 });

  const [one, many] = await withTransaction(async (tx) => [
    await tx.get('SELECT * FROM x'),
    await tx.all('SELECT * FROM x'),
  ]);

  expect(one).toEqual({ id: 1 });
  expect(many).toHaveLength(2);
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="_lib/database"`
Expected: FAIL — `withTransaction is not a function`.

- [x] **Step 3: Rewrite `api/_lib/database.js`**

Replace the whole file with this. The three query shapes are now built once by `makeRunner` and shared between the pooled helpers and the transaction runner, so a transaction behaves exactly like a plain call:

```javascript
const { Pool } = require('pg');
const { notDeleted } = require('./softDelete');

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
      min: 0,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
      application_name: 'sbcc-financial-system-vercel',
    });

    pool.on('error', (err) => {
      if (err.message !== 'Connection terminated unexpectedly') {
        console.error('PostgreSQL pool error:', err.message);
      }
    });
  }
  return pool;
}

// Convert SQLite ? placeholders to PostgreSQL $1, $2, etc.
function convertPlaceholders(query) {
  let pgQuery = query;
  let paramIndex = 1;
  while (pgQuery.includes('?')) {
    pgQuery = pgQuery.replace('?', '$' + paramIndex);
    paramIndex++;
  }
  return pgQuery;
}

/**
 * Builds the get/all/run trio over any query function, so a transaction's
 * checked-out client behaves identically to the shared pool.
 */
function makeRunner(query) {
  return {
    get: async (sql, params = []) => {
      const result = await query(convertPlaceholders(sql), params);
      return result.rows[0] || null;
    },
    all: async (sql, params = []) => {
      const result = await query(convertPlaceholders(sql), params);
      return result.rows;
    },
    run: async (sql, params = []) => {
      let pgQuery = convertPlaceholders(sql);

      // Handle INSERT queries to return lastID
      if (pgQuery.trim().toLowerCase().startsWith('insert') && !pgQuery.toLowerCase().includes('returning')) {
        pgQuery += ' RETURNING *';
        const result = await query(pgQuery, params);
        return { lastID: result.rows[0]?.id, changes: result.rowCount };
      }

      const result = await query(pgQuery, params);
      return { changes: result.rowCount };
    },
  };
}

const pooled = makeRunner((sql, params) => getPool().query(sql, params));

const get = pooled.get;
const all = pooled.all;
const run = pooled.run;

/**
 * Runs `fn` inside a single database transaction.
 *
 * The callback is handed a `tx` runner with the same get/all/run interface as
 * this module. Use it for EVERY statement inside the callback: the pool is
 * capped at one connection, so calling the module-level get/all/run in here
 * waits for a connection that cannot be freed until this transaction ends.
 */
async function withTransaction(fn) {
  const client = await getPool().connect();
  const tx = makeRunner((sql, params) => client.query(sql, params));

  try {
    await client.query('BEGIN');
    const result = await fn(tx);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { get, all, run, getPool, notDeleted, withTransaction };
```

- [x] **Step 4: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="_lib/database"`
Expected: PASS, 6 tests.

- [x] **Step 5: Run the whole api suite to confirm the refactor changed no behaviour**

Run: `cd backend && npx jest --testPathPatterns="api"`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add api/_lib/database.js api/_lib/database.test.js
git commit -m "feat: add withTransaction helper to the database module"
```

---

## Task 3: The `logActivity` Helper and Field Diff

**Files:**
- Create: `api/_lib/activityLog.js`, `api/_lib/activityLog.test.js`

- [x] **Step 1: Write the failing test**

Create `api/_lib/activityLog.test.js`:

```javascript
const { logActivity, diffFields, ACTIONS, COLLECTION_FIELDS } = require('./activityLog');

const runner = () => ({ run: jest.fn(async () => ({ changes: 1 })) });

describe('logActivity', () => {
  test('inserts one row carrying actor, action, entity and summary', async () => {
    const tx = runner();

    await logActivity(tx, {
      actor: { email: 'admin@sbcc.church', role: 'admin' },
      action: ACTIONS.RECORD_CREATE,
      entityType: 'collection',
      entityId: 7,
      summary: 'Created collection 2026-08-15 for 5,000.00',
    });

    expect(tx.run).toHaveBeenCalledTimes(1);
    const [sql, params] = tx.run.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO activity_log/i);
    expect(params).toEqual([
      'admin@sbcc.church',
      'admin',
      'record.create',
      'collection',
      7,
      'Created collection 2026-08-15 for 5,000.00',
      null,
    ]);
  });

  test('serialises changes to JSON', async () => {
    const tx = runner();

    await logActivity(tx, {
      actor: { email: 'a@b.c', role: 'admin' },
      action: ACTIONS.RECORD_UPDATE,
      entityType: 'expense',
      entityId: 3,
      changes: { supplies: { from: 100, to: 250 } },
    });

    const params = tx.run.mock.calls[0][1];
    expect(JSON.parse(params[6])).toEqual({ supplies: { from: 100, to: 250 } });
  });

  test('accepts a null actor, for a failed login with an unknown email', async () => {
    const tx = runner();

    await logActivity(tx, { actor: null, action: ACTIONS.LOGIN_FAILED, summary: 'nobody@example.com' });

    const params = tx.run.mock.calls[0][1];
    expect(params[0]).toBeNull();
    expect(params[1]).toBeNull();
  });

  test('refuses an action outside the whitelist', async () => {
    const tx = runner();

    await expect(
      logActivity(tx, { actor: null, action: 'record.frobnicate' })
    ).rejects.toThrow(/unknown activity action/i);
    expect(tx.run).not.toHaveBeenCalled();
  });
});

describe('diffFields', () => {
  test('reports only fields that actually changed', () => {
    const before = { date: '2026-08-15', particular: 'Sunday Service', total_amount: '100.00' };
    const after = { date: '2026-08-15', particular: 'Sunday Worship', total_amount: 100 };

    expect(diffFields(before, after, ['date', 'particular', 'total_amount'])).toEqual({
      particular: { from: 'Sunday Service', to: 'Sunday Worship' },
    });
  });

  test('treats a numeric string and its number as equal', () => {
    const diff = diffFields({ total_amount: '2500.00' }, { total_amount: 2500 }, ['total_amount']);
    expect(diff).toBeNull();
  });

  test('treats a Date column and its YYYY-MM-DD string as equal', () => {
    // pg returns `date` columns as local-midnight Date objects.
    const stored = new Date(2026, 7, 15);
    expect(diffFields({ date: stored }, { date: '2026-08-15' }, ['date'])).toBeNull();
  });

  test('treats null, undefined and empty string as the same absence', () => {
    expect(diffFields({ particular: null }, { particular: '' }, ['particular'])).toBeNull();
  });

  test('ignores fields the update did not supply', () => {
    const diff = diffFields({ particular: 'a', youth: '5.00' }, { particular: 'b' }, ['particular', 'youth']);
    expect(diff).toEqual({ particular: { from: 'a', to: 'b' } });
  });

  test('never records password material', () => {
    const diff = diffFields(
      { name: 'Alvin', password_hash: '$2a$old' },
      { name: 'Alvin B', password_hash: '$2a$new', password: 'hunter2' },
      ['name', 'password_hash', 'password']
    );
    expect(diff).toEqual({ name: { from: 'Alvin', to: 'Alvin B' } });
    expect(JSON.stringify(diff)).not.toMatch(/hunter2|\$2a\$/);
  });

  test('returns null rather than an empty object when nothing changed', () => {
    expect(diffFields({ a: 1 }, { a: 1 }, ['a'])).toBeNull();
  });

  test('exports the editable collection fields it diffs', () => {
    expect(COLLECTION_FIELDS).toContain('general_tithes_offering');
    expect(COLLECTION_FIELDS).not.toContain('created_by');
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="activityLog"`
Expected: FAIL — `Cannot find module './activityLog'`.

- [x] **Step 3: Write the implementation**

Create `api/_lib/activityLog.js`:

```javascript
// Append-only activity log. Every mutation writes exactly one row through
// logActivity(), inside the same transaction as the mutation itself, so the log
// can never disagree with what happened.
//
// No application code ever UPDATEs or DELETEs from activity_log.

const ACTIONS = {
  RECORD_CREATE: 'record.create',
  RECORD_UPDATE: 'record.update',
  RECORD_DELETE: 'record.delete',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  LOGIN_SUCCESS: 'auth.login_success',
  LOGIN_FAILED: 'auth.login_failed',
  PASSWORD_CHANGE: 'auth.password_change',
};

const KNOWN_ACTIONS = new Set(Object.values(ACTIONS));

// Never written to `changes` or `summary`, whatever the caller passes.
const REDACTED_FIELDS = new Set([
  'password',
  'password_hash',
  'current_password',
  'new_password',
  'token',
  'authorization',
]);

// The fields each PUT handler can actually change. Diffing an explicit list
// keeps generated columns and timestamps out of the log.
const COLLECTION_FIELDS = [
  'date', 'particular', 'control_number', 'payment_method', 'total_amount',
  'general_tithes_offering', 'bank_interest',
  'sisterhood_san_juan', 'sisterhood_labuin', 'brotherhood', 'youth', 'couples',
  'sunday_school', 'special_purpose_pledge',
];

const EXPENSE_FIELDS = [
  'date', 'particular', 'forms_number', 'cheque_number', 'total_amount',
  'workers_share', 'fellowship_expense', 'supplies', 'utilities', 'building_maintenance',
  'benevolence_donations', 'honorarium', 'vehicle_maintenance', 'gasoline_transport',
  'pbcm_share', 'mission_evangelism', 'admin_expense', 'worship_music', 'discipleship', 'pastoral_care',
];

const USER_FIELDS = ['name', 'role', 'is_active'];

/**
 * Canonical string for comparison. PostgreSQL hands back numeric columns as
 * strings and date columns as local-midnight Date objects, while the request
 * body carries numbers and 'YYYY-MM-DD' strings — without this every edit would
 * look like it changed every field.
 */
function normalize(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'object') return JSON.stringify(value);
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return String(asNumber);
  return String(value);
}

/** Presentable form for storage: dates as YYYY-MM-DD, amounts as numbers. */
function forLog(value) {
  if (value === undefined || value === '') return null;
  if (value instanceof Date) return normalize(value);
  if (value === null || typeof value === 'object' || typeof value === 'boolean') return value;
  const asNumber = Number(value);
  return Number.isFinite(asNumber) && value !== '' ? asNumber : value;
}

/**
 * Field-level before/after diff, restricted to `fields` and to values the
 * update actually supplied. Returns null when nothing changed.
 */
function diffFields(before, after, fields) {
  const changes = {};

  for (const field of fields) {
    if (REDACTED_FIELDS.has(field)) continue;
    if (!after || !(field in after)) continue;
    if (normalize(before ? before[field] : null) === normalize(after[field])) continue;

    changes[field] = { from: forLog(before ? before[field] : null), to: forLog(after[field]) };
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

/**
 * Writes one activity row.
 *
 * @param runner  Anything with run(sql, params) — pass the `tx` from
 *                db.withTransaction() for a logged mutation, or the `db` module
 *                itself for a standalone event that mutates nothing else.
 */
async function logActivity(runner, entry) {
  const { actor, action, entityType = null, entityId = null, summary = null, changes = null } = entry;

  if (!KNOWN_ACTIONS.has(action)) {
    throw new Error(`Unknown activity action: ${action}`);
  }

  await runner.run(
    `INSERT INTO activity_log (actor_email, actor_role, action, entity_type, entity_id, summary, changes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      actor ? actor.email || null : null,
      actor ? actor.role || null : null,
      action,
      entityType,
      entityId,
      summary,
      changes ? JSON.stringify(changes) : null,
    ]
  );
}

module.exports = {
  logActivity,
  diffFields,
  ACTIONS,
  REDACTED_FIELDS,
  COLLECTION_FIELDS,
  EXPENSE_FIELDS,
  USER_FIELDS,
};
```

- [x] **Step 4: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="activityLog"`
Expected: PASS, 13 tests.

- [x] **Step 5: Commit**

```bash
git add api/_lib/activityLog.js api/_lib/activityLog.test.js
git commit -m "feat: add activity log helper with redacted field diffing"
```

---

## Task 4: Log Collection Mutations

**Files:**
- Create: `api/collections.activity.test.js`
- Modify: `api/collections.js`

- [x] **Step 1: Write the failing test**

Create `api/collections.activity.test.js`:

```javascript
const request = require('supertest');
const jwt = require('jsonwebtoken');

// The tx handed to the withTransaction callback. Handler statements and the log
// insert both land here, which is the point: one transaction, one commit.
const mockTx = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 42 })),
};
const mockDb = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 42 })),
  withTransaction: jest.fn(async (fn) => fn(mockTx)),
};
jest.mock('./_lib/database', () => ({
  ...mockDb,
  notDeleted: (alias) => (alias ? `${alias}.deleted_at IS NULL` : 'deleted_at IS NULL'),
}));
jest.mock('./_lib/customFieldsHelper', () => ({
  enrichRecordsWithCustomFields: jest.fn(async (rows) => rows),
  getCustomFieldValues: jest.fn(async () => ({})),
  saveCustomFieldValues: jest.fn(async () => {}),
}));

const app = require('./collections');
const JWT_SECRET = 'your-secret-key-change-this';
const ADMIN =
  'Bearer ' + jwt.sign({ id: 1, email: 'admin@sbcc.church', role: 'admin' }, JWT_SECRET);

const logCall = () => mockTx.run.mock.calls.find(([sql]) => /INSERT INTO activity_log/i.test(sql));

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.run.mockResolvedValue({ changes: 1, lastID: 42 });
  mockTx.get.mockResolvedValue(null);
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 42 });
  mockDb.get.mockResolvedValue(null);
  mockDb.all.mockResolvedValue([]);
  mockDb.withTransaction.mockImplementation(async (fn) => fn(mockTx));
});

describe('collection create', () => {
  test('logs record.create with the actor and the new id', async () => {
    const res = await request(app)
      .post('/api/collections')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    expect(res.status).toBe(200);
    const [, params] = logCall();
    expect(params[0]).toBe('admin@sbcc.church');
    expect(params[1]).toBe('admin');
    expect(params[2]).toBe('record.create');
    expect(params[3]).toBe('collection');
    expect(params[4]).toBe(42);
  });

  test('writes the record and the log entry through the same transaction', async () => {
    await request(app)
      .post('/api/collections')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
    const statements = mockTx.run.mock.calls.map(([sql]) => sql);
    expect(statements.some((s) => /INSERT INTO collections/i.test(s))).toBe(true);
    expect(statements.some((s) => /INSERT INTO activity_log/i.test(s))).toBe(true);
  });

  test('a failing log write fails the request rather than committing unlogged', async () => {
    mockDb.withTransaction.mockRejectedValue(new Error('activity_log insert failed'));

    const res = await request(app)
      .post('/api/collections')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    expect(res.status).toBe(500);
  });
});

describe('collection update', () => {
  test('logs record.update with a diff of only the changed fields', async () => {
    mockDb.get.mockResolvedValue({
      id: 7, date: '2026-08-15', particular: 'Sunday Service',
      total_amount: '100.00', general_tithes_offering: '100.00',
    });

    const res = await request(app)
      .put('/api/collections/7')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', particular: 'Sunday Worship', general_tithes_offering: 100 });

    expect(res.status).toBe(200);
    const [, params] = logCall();
    expect(params[2]).toBe('record.update');
    expect(params[4]).toBe(7);
    expect(JSON.parse(params[6])).toEqual({
      particular: { from: 'Sunday Service', to: 'Sunday Worship' },
    });
  });

  test('logs no changes payload when the figures are identical', async () => {
    mockDb.get.mockResolvedValue({
      id: 7, date: '2026-08-15', particular: 'Sunday Service',
      total_amount: '100.00', general_tithes_offering: '100.00',
    });

    await request(app)
      .put('/api/collections/7')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', particular: 'Sunday Service', general_tithes_offering: 100 });

    expect(logCall()[1][6]).toBeNull();
  });

  test('does not log when the record does not exist', async () => {
    mockDb.get.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/collections/404')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    expect(res.status).toBe(404);
    expect(logCall()).toBeUndefined();
  });
});

describe('collection delete', () => {
  test('logs record.delete with a summary naming the record', async () => {
    mockDb.get.mockResolvedValue({ id: 7, date: '2026-08-15', total_amount: '5000.00' });

    const res = await request(app).delete('/api/collections/7').set('Authorization', ADMIN);

    expect(res.status).toBe(200);
    const [, params] = logCall();
    expect(params[2]).toBe('record.delete');
    expect(params[3]).toBe('collection');
    expect(params[4]).toBe(7);
    expect(params[5]).toMatch(/5000|5,000/);
  });

  test('does not log when nothing was deleted', async () => {
    mockDb.get.mockResolvedValue(null);

    const res = await request(app).delete('/api/collections/7').set('Authorization', ADMIN);

    expect(res.status).toBe(404);
    expect(logCall()).toBeUndefined();
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="collections.activity"`
Expected: FAIL — no `activity_log` insert anywhere, and `db.withTransaction` is never called.

- [x] **Step 3: Import the helper**

At the top of `api/collections.js`, below the `softDelete` require, add:

```javascript
const { logActivity, diffFields, ACTIONS, COLLECTION_FIELDS } = require('./_lib/activityLog');
```

- [x] **Step 4: Add a summary formatter**

Directly below `const canMutate = checkRole(['admin', 'super_admin']);` in `api/collections.js`, add:

```javascript
const asDate = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value || ''));
const summarise = (verb, row) =>
  `${verb} collection ${asDate(row.date)} for ${Number(row.total_amount || 0).toFixed(2)}`;
```

- [x] **Step 5: Wrap the create in a transaction and log it**

In `app.post('/api/collections', ...)`, the duplicate check and control-number lookup stay where they are — they are reads and run before the transaction opens.

**The retry must wrap the transaction, not sit inside it.** In PostgreSQL a failed statement poisons its transaction: every subsequent statement returns `current transaction is aborted, commands ignored until end of transaction block`. Retrying the `INSERT` inside the same transaction therefore cannot work. Each attempt gets its own transaction instead, so a control-number collision rolls back cleanly and the next attempt starts fresh.

Replace the body of the `try` block, from `let collectionId;` down to and including the closing brace of the `for` loop, with:

```javascript
    let collectionId;
    let ctrlNum = finalControlNumber;

    // One transaction per attempt: a unique-constraint failure aborts its own
    // transaction, so the retry has to open a new one.
    for (let attempt = 0; attempt <= 5; attempt++) {
      try {
        await db.withTransaction(async (tx) => {
          const result = await tx.run(
            `INSERT INTO collections (
              date, particular, control_number, payment_method, total_amount,
              general_tithes_offering, bank_interest,
              sisterhood_san_juan, sisterhood_labuin, brotherhood, youth, couples, sunday_school, special_purpose_pledge,
              pbcm_share, pastoral_team_share, operational_fund_share,
              created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
            [
              date, particular || 'Collection Entry', ctrlNum, payment_method || 'Cash',
              calculatedTotal, general_tithes_offering || 0, bank_interest || 0,
              sisterhood_san_juan || 0, sisterhood_labuin || 0, brotherhood || 0,
              youth || 0, couples || 0, sunday_school || 0, special_purpose_pledge || 0,
              pbcmShare, pastoralTeamShare, operationalFundShare, req.user.email,
            ]
          );
          collectionId = result.lastID;

          await logActivity(tx, {
            actor: req.user,
            action: ACTIONS.RECORD_CREATE,
            entityType: 'collection',
            entityId: collectionId,
            summary: summarise('Created', { date, total_amount: calculatedTotal }),
          });
        });
        break;
      } catch (insertErr) {
        const isCtrlConflict = insertErr.code === '23505' &&
          (insertErr.constraint?.includes('control_number') || insertErr.detail?.includes('control_number'));
        if (isCtrlConflict && attempt < 5) {
          const parts = ctrlNum.split('-');
          const nextSeq = String((parseInt(parts[parts.length - 1]) || 0) + 1).padStart(3, '0');
          ctrlNum = `${parts.slice(0, -1).join('-')}-${nextSeq}`;
          continue;
        }
        throw insertErr;
      }
    }
```

Everything after the loop — the `custom_fields` block and the `res.json(...)` — is unchanged. Custom fields must stay outside the transaction: `saveCustomFieldValues` uses the pooled `db` and would deadlock inside one (Rule 1).

- [x] **Step 6: Read the record before updating so the diff has a `before`**

In `app.put('/api/collections/:id', ...)`, immediately after the share calculations and before the `try` block, insert:

```javascript
  const before = await db.get(
    `SELECT * FROM collections WHERE id = $1 AND ${notDeleted()}`,
    [id]
  );
  if (!before) {
    return res.status(404).json({ error: 'Collection not found' });
  }
```

- [x] **Step 7: Wrap the update in a transaction and log it**

Still in the PUT handler, replace the `const result = await db.run(...)` call and the `if (result.changes === 0)` check that follows it with:

```javascript
    const changes = diffFields(before, req.body, COLLECTION_FIELDS);

    await db.withTransaction(async (tx) => {
      const result = await tx.run(
        `UPDATE collections SET
          date = $1, particular = $2, control_number = $3, payment_method = $4, total_amount = $5,
          general_tithes_offering = $6, bank_interest = $7,
          sisterhood_san_juan = $8, sisterhood_labuin = $9, brotherhood = $10, youth = $11, couples = $12,
          sunday_school = $13, special_purpose_pledge = $14,
          pbcm_share = $15, pastoral_team_share = $16, operational_fund_share = $17,
          updated_at = now(), updated_by = $18
        WHERE id = $19 AND ${notDeleted()}`,
        [
          date, particular || 'Collection Entry', control_number, payment_method || 'Cash',
          calculatedTotal, general_tithes_offering || 0, bank_interest || 0,
          sisterhood_san_juan || 0, sisterhood_labuin || 0, brotherhood || 0,
          youth || 0, couples || 0, sunday_school || 0, special_purpose_pledge || 0,
          pbcmShare, pastoralTeamShare, operationalFundShare, req.user.email, id,
        ]
      );

      if (result.changes === 0) {
        const err = new Error('Collection not found');
        err.notFound = true;
        throw err;
      }

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.RECORD_UPDATE,
        entityType: 'collection',
        entityId: parseInt(id, 10),
        summary: summarise('Updated', { date, total_amount: calculatedTotal }),
        changes,
      });
    });
```

and extend that handler's `catch` block so a rolled-back not-found still answers 404:

```javascript
  } catch (err) {
    if (err.notFound) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
```

- [x] **Step 8: Wrap the delete in a transaction and log it**

Replace the body of `app.delete('/api/collections/:id', ...)`'s `try` block with:

```javascript
    const before = await db.get(
      `SELECT id, date, total_amount FROM collections WHERE id = $1 AND ${notDeleted()}`,
      [id]
    );
    if (!before) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    await db.withTransaction(async (tx) => {
      const result = await tx.run(
        `UPDATE collections SET deleted_at = now(), deleted_by = $1
         WHERE id = $2 AND ${notDeleted()}`,
        [req.user.email, id]
      );

      if (result.changes === 0) {
        const err = new Error('Collection not found');
        err.notFound = true;
        throw err;
      }

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.RECORD_DELETE,
        entityType: 'collection',
        entityId: parseInt(id, 10),
        summary: summarise('Deleted', before),
      });
    });

    res.json({ message: 'Collection deleted successfully' });
```

and give that handler the same not-found catch:

```javascript
  } catch (err) {
    if (err.notFound) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
```

- [x] **Step 9: Update the Plan 2 delete tests for the new pre-read**

`api/collections.softdelete.test.js` drives DELETE and PUT with `mockDb.get` returning `null`, which now means "record not found". Add `withTransaction` to its database mock and make the pre-read return a row. In that file, change the mock:

```javascript
jest.mock('./_lib/database', () => ({
  ...mockDb,
  notDeleted: (alias) => (alias ? `${alias}.deleted_at IS NULL` : 'deleted_at IS NULL'),
}));
```

so that `mockDb` above it gains the transaction runner:

```javascript
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
```

In its `beforeEach`, add:

```javascript
  mockTx.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.withTransaction.mockImplementation(async (fn) => fn(mockTx));
```

The soft-delete assertions inspect `mockDb.run`, but the mutations now run on `mockTx`. Change `sqlOf(mockDb.run.mock.calls)` to `sqlOf([...mockDb.run.mock.calls, ...mockTx.run.mock.calls])` in the delete tests, and change the two `mockDb.run.mock.calls.find(...)` lookups in the delete and PUT tests to search `mockTx.run.mock.calls` instead. Then set the pre-read row in the tests that expect success:

```javascript
    mockDb.get.mockResolvedValue({ id: 7, date: '2026-08-15', total_amount: '5000.00' });
```

and for `deleting an already-deleted record returns 404`, keep `mockDb.get` returning `null` — the pre-read is now what produces the 404.

- [x] **Step 10: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="collections"`
Expected: PASS — `collections.activity` (9 tests), `collections.softdelete`, `collections.auth`, and `collections.dupe` all green.

- [x] **Step 11: Commit**

```bash
git add api/collections.js api/collections.activity.test.js api/collections.softdelete.test.js
git commit -m "feat: log collection creates, updates and deletes transactionally"
```

---

## Task 5: Log Expense Mutations

Same shape as Task 4, minus custom fields and the control-number retry.

**Files:**
- Create: `api/expenses.activity.test.js`
- Modify: `api/expenses.js`, `api/expenses.softdelete.test.js`

- [x] **Step 1: Write the failing test**

Create `api/expenses.activity.test.js`:

```javascript
const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockTx = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 42 })),
};
const mockDb = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 42 })),
  withTransaction: jest.fn(async (fn) => fn(mockTx)),
};
jest.mock('./_lib/database', () => ({
  ...mockDb,
  notDeleted: (alias) => (alias ? `${alias}.deleted_at IS NULL` : 'deleted_at IS NULL'),
}));

const app = require('./expenses');
const JWT_SECRET = 'your-secret-key-change-this';
const ADMIN =
  'Bearer ' + jwt.sign({ id: 1, email: 'admin@sbcc.church', role: 'admin' }, JWT_SECRET);

const logCall = () => mockTx.run.mock.calls.find(([sql]) => /INSERT INTO activity_log/i.test(sql));

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.run.mockResolvedValue({ changes: 1, lastID: 42 });
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 42 });
  mockDb.get.mockResolvedValue(null);
  mockDb.all.mockResolvedValue([]);
  mockDb.withTransaction.mockImplementation(async (fn) => fn(mockTx));
});

test('creating an expense logs record.create for the expense entity', async () => {
  const res = await request(app)
    .post('/api/expenses')
    .set('Authorization', ADMIN)
    .send({ date: '2026-08-15', category: 'supplies', supplies: 100 });

  expect(res.status).toBe(200);
  const [, params] = logCall();
  expect(params[0]).toBe('admin@sbcc.church');
  expect(params[2]).toBe('record.create');
  expect(params[3]).toBe('expense');
  expect(params[4]).toBe(42);
});

test('the insert and the log entry share one transaction', async () => {
  await request(app)
    .post('/api/expenses')
    .set('Authorization', ADMIN)
    .send({ date: '2026-08-15', category: 'supplies', supplies: 100 });

  expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
  const statements = mockTx.run.mock.calls.map(([sql]) => sql);
  expect(statements.some((s) => /INSERT INTO expenses/i.test(s))).toBe(true);
  expect(statements.some((s) => /INSERT INTO activity_log/i.test(s))).toBe(true);
});

test('updating an expense logs only the fields that changed', async () => {
  mockDb.get.mockResolvedValue({
    id: 3, date: '2026-08-15', particular: 'Office run', supplies: '100.00', utilities: '0.00',
  });

  const res = await request(app)
    .put('/api/expenses/3')
    .set('Authorization', ADMIN)
    .send({ date: '2026-08-15', particular: 'Office run', supplies: 250 });

  expect(res.status).toBe(200);
  const [, params] = logCall();
  expect(params[2]).toBe('record.update');
  expect(JSON.parse(params[6])).toEqual({ supplies: { from: 100, to: 250 } });
});

test('deleting an expense logs record.delete', async () => {
  mockDb.get.mockResolvedValue({ id: 3, date: '2026-08-15', total_amount: '250.00' });

  const res = await request(app).delete('/api/expenses/3').set('Authorization', ADMIN);

  expect(res.status).toBe(200);
  expect(logCall()[1][2]).toBe('record.delete');
  expect(logCall()[1][4]).toBe(3);
});

test('a missing expense is neither updated nor logged', async () => {
  mockDb.get.mockResolvedValue(null);

  const res = await request(app).delete('/api/expenses/404').set('Authorization', ADMIN);

  expect(res.status).toBe(404);
  expect(logCall()).toBeUndefined();
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="expenses.activity"`
Expected: FAIL on all five.

- [x] **Step 3: Import the helper and add a formatter**

At the top of `api/expenses.js`, below the `softDelete` require, add:

```javascript
const { logActivity, diffFields, ACTIONS, EXPENSE_FIELDS } = require('./_lib/activityLog');
```

and below `const canMutate = checkRole(['admin', 'super_admin']);` add:

```javascript
const asDate = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value || ''));
const summarise = (verb, row) =>
  `${verb} expense ${asDate(row.date)} for ${Number(row.total_amount || 0).toFixed(2)}`;
```

- [x] **Step 4: Wrap the create in a transaction and log it**

In `app.post('/api/expenses', ...)`, replace the `const result = await db.run(...)` insert and the `res.json(...)` that follows with:

```javascript
    let expenseId;

    await db.withTransaction(async (tx) => {
      const result = await tx.run(
        `INSERT INTO expenses (
          date, particular, forms_number, cheque_number, category, subcategory,
          total_amount, budget_amount, percentage_allocation, fund_source,
          pbcm_share_expense, pastoral_worker_support, cap_assistance, honorarium,
          conference_seminar, fellowship_events, anniversary_christmas, supplies,
          utilities, vehicle_maintenance, lto_registration, transportation_gas,
          building_maintenance, abccop_national, cbcc_share, kabalikat_share, abccop_community,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)`,
        [
          date, particular || 'Expense Entry', forms_number, cheque_number,
          category, subcategory, calculatedTotal, budget_amount || 0,
          percentage_allocation || 0, fund_source || 'operational',
          pbcm_share_expense || 0, pastoral_worker_support || 0,
          cap_assistance || 0, honorarium || 0,
          conference_seminar || 0, fellowship_events || 0,
          anniversary_christmas || 0, supplies || 0,
          utilities || 0, vehicle_maintenance || 0,
          lto_registration || 0, transportation_gas || 0,
          building_maintenance || 0, abccop_national || 0,
          cbcc_share || 0, kabalikat_share || 0,
          abccop_community || 0, req.user.email,
        ]
      );
      expenseId = result.lastID;

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.RECORD_CREATE,
        entityType: 'expense',
        entityId: expenseId,
        summary: summarise('Created', { date, total_amount: calculatedTotal }),
      });
    });

    res.json({ id: expenseId, message: 'Expense added successfully' });
```

- [x] **Step 5: Wrap the update in a transaction and log it**

In `app.put('/api/expenses/:id', ...)`, immediately before the `try` block, insert the pre-read:

```javascript
  const before = await db.get(
    `SELECT * FROM expenses WHERE id = $1 AND ${notDeleted()}`,
    [id]
  );
  if (!before) {
    return res.status(404).json({ error: 'Expense not found' });
  }
```

then replace the `const result = await db.run(...)` update and its `if (result.changes === 0)` check with:

```javascript
    const changes = diffFields(before, req.body, EXPENSE_FIELDS);

    await db.withTransaction(async (tx) => {
      const result = await tx.run(
        `UPDATE expenses SET
          date = $1, particular = $2, forms_number = $3, cheque_number = $4, total_amount = $5,
          workers_share = $6, fellowship_expense = $7, supplies = $8, utilities = $9, building_maintenance = $10,
          benevolence_donations = $11, honorarium = $12, vehicle_maintenance = $13, gasoline_transport = $14,
          pbcm_share = $15, mission_evangelism = $16, admin_expense = $17, worship_music = $18, discipleship = $19, pastoral_care = $20,
          updated_at = now(), updated_by = $21
        WHERE id = $22 AND ${notDeleted()}`,
        [
          date, particular || 'Expense Entry', forms_number, cheque_number, calculatedTotal,
          workers_share || 0, fellowship_expense || 0, supplies || 0, utilities || 0,
          building_maintenance || 0, benevolence_donations || 0, honorarium || 0,
          vehicle_maintenance || 0, gasoline_transport || 0, pbcm_share || 0,
          mission_evangelism || 0, admin_expense || 0, worship_music || 0,
          discipleship || 0, pastoral_care || 0, req.user.email, id,
        ]
      );

      if (result.changes === 0) {
        const err = new Error('Expense not found');
        err.notFound = true;
        throw err;
      }

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.RECORD_UPDATE,
        entityType: 'expense',
        entityId: parseInt(id, 10),
        summary: summarise('Updated', { date, total_amount: calculatedTotal }),
        changes,
      });
    });
```

- [x] **Step 6: Wrap the delete in a transaction and log it**

Replace the body of `app.delete('/api/expenses/:id', ...)`'s `try` block with:

```javascript
    const before = await db.get(
      `SELECT id, date, total_amount FROM expenses WHERE id = $1 AND ${notDeleted()}`,
      [id]
    );
    if (!before) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    await db.withTransaction(async (tx) => {
      const result = await tx.run(
        `UPDATE expenses SET deleted_at = now(), deleted_by = $1
         WHERE id = $2 AND ${notDeleted()}`,
        [req.user.email, id]
      );

      if (result.changes === 0) {
        const err = new Error('Expense not found');
        err.notFound = true;
        throw err;
      }

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.RECORD_DELETE,
        entityType: 'expense',
        entityId: parseInt(id, 10),
        summary: summarise('Deleted', before),
      });
    });

    res.json({ message: 'Expense deleted successfully' });
```

- [x] **Step 7: Give both handlers the not-found catch**

In the PUT and DELETE handlers of `api/expenses.js`, replace each `catch (err) {` block with:

```javascript
  } catch (err) {
    if (err.notFound) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
```

- [x] **Step 8: Update the Plan 2 expense tests for the transaction and the pre-read**

In `api/expenses.softdelete.test.js`, replace the mock block at the top:

```javascript
const mockDb = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 1 })),
};
```

with:

```javascript
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
```

and replace its `beforeEach` with:

```javascript
beforeEach(() => {
  jest.clearAllMocks();
  mockTx.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.all.mockResolvedValue([]);
  mockDb.get.mockResolvedValue({ id: 7, date: '2026-08-15', total_amount: '250.00' });
  mockDb.withTransaction.mockImplementation(async (fn) => fn(mockTx));
});
```

The mutations now run on `mockTx`, so in the three soft-delete tests change every `mockDb.run.mock.calls` to `mockTx.run.mock.calls`. In `deleting an already-deleted record returns 404`, replace `mockDb.run.mockResolvedValue({ changes: 0 })` with `mockDb.get.mockResolvedValue(null)` — the pre-read is now what produces the 404. Leave the read-filtering tests alone: they still assert on `mockDb.get` / `mockDb.all`, which is where reads still go.

- [x] **Step 9: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="expenses"`
Expected: PASS across `expenses.activity`, `expenses.softdelete`, and `expenses.auth`.

- [x] **Step 10: Commit**

```bash
git add api/expenses.js api/expenses.activity.test.js api/expenses.softdelete.test.js
git commit -m "feat: log expense creates, updates and deletes transactionally"
```

---

## Task 6: Log Authentication and User Administration

**Files:**
- Create: `api/auth.activity.test.js`
- Modify: `api/auth.js`

- [x] **Step 1: Write the failing test**

Create `api/auth.activity.test.js`:

```javascript
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const mockTx = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 5 })),
};
const mockDb = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 5 })),
  withTransaction: jest.fn(async (fn) => fn(mockTx)),
};
jest.mock('./_lib/database', () => mockDb);

const app = require('./auth');
const JWT_SECRET = 'your-secret-key-change-this';
const SUPER =
  'Bearer ' + jwt.sign({ id: 9, email: 'boss@sbcc.church', role: 'super_admin' }, JWT_SECRET);

const PASSWORD = 'correct-horse';
const USER = {
  id: 3,
  email: 'member@sbcc.church',
  name: 'Member',
  role: 'user',
  is_active: true,
  password_hash: bcrypt.hashSync(PASSWORD, 10),
};

const logFrom = (calls) => calls.find(([sql]) => /INSERT INTO activity_log/i.test(sql));
const txLog = () => logFrom(mockTx.run.mock.calls);
const dbLog = () => logFrom(mockDb.run.mock.calls);

beforeEach(() => {
  jest.clearAllMocks();
  mockTx.run.mockResolvedValue({ changes: 1, lastID: 5 });
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 5 });
  mockDb.get.mockResolvedValue(null);
  mockDb.withTransaction.mockImplementation(async (fn) => fn(mockTx));
});

describe('login', () => {
  test('a successful login logs auth.login_success for that user', async () => {
    mockDb.get.mockResolvedValue(USER);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: USER.email, password: PASSWORD });

    expect(res.status).toBe(200);
    const [, params] = txLog();
    expect(params[0]).toBe('member@sbcc.church');
    expect(params[1]).toBe('user');
    expect(params[2]).toBe('auth.login_success');
  });

  test('a wrong password logs auth.login_failed against the known account', async () => {
    mockDb.get.mockResolvedValue(USER);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: USER.email, password: 'wrong' });

    expect(res.status).toBe(401);
    const [, params] = dbLog();
    expect(params[0]).toBe('member@sbcc.church');
    expect(params[2]).toBe('auth.login_failed');
  });

  test('a login for an unknown email logs with a null actor', async () => {
    mockDb.get.mockResolvedValue(null);

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });

    const [, params] = dbLog();
    expect(params[0]).toBeNull();
    expect(params[2]).toBe('auth.login_failed');
    expect(params[5]).toMatch(/nobody@example\.com/);
  });

  test('no log entry ever carries password material', async () => {
    mockDb.get.mockResolvedValue(USER);

    await request(app)
      .post('/api/auth/login')
      .send({ email: USER.email, password: PASSWORD });
    await request(app)
      .post('/api/auth/login')
      .send({ email: USER.email, password: 'hunter2' });

    const everything = JSON.stringify([...mockTx.run.mock.calls, ...mockDb.run.mock.calls]);
    expect(everything).not.toMatch(/hunter2/);
    expect(everything).not.toMatch(/\$2a\$/);
    expect(everything).not.toMatch(new RegExp(PASSWORD));
  });
});

describe('user administration', () => {
  test('creating a user logs user.create with the new account id', async () => {
    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', SUPER)
      .send({ email: 'new@sbcc.church', name: 'New Person', role: 'user' });

    expect(res.status).toBe(200);
    const [, params] = txLog();
    expect(params[0]).toBe('boss@sbcc.church');
    expect(params[2]).toBe('user.create');
    expect(params[3]).toBe('user');
    expect(params[4]).toBe(5);
    expect(params[5]).toMatch(/new@sbcc\.church/);
  });

  test('updating a user logs user.update with a role diff', async () => {
    mockDb.get.mockResolvedValue({ id: 3, email: 'member@sbcc.church', name: 'Member', role: 'user', is_active: true });

    const res = await request(app)
      .put('/api/auth/users/3')
      .set('Authorization', SUPER)
      .send({ role: 'admin' });

    expect(res.status).toBe(200);
    const [, params] = txLog();
    expect(params[2]).toBe('user.update');
    expect(params[4]).toBe(3);
    expect(JSON.parse(params[6])).toEqual({ role: { from: 'user', to: 'admin' } });
  });

  test('a rejected promotion writes no log entry', async () => {
    mockDb.get.mockResolvedValue({ id: 3, email: 'member@sbcc.church', role: 'user', is_active: true });
    const ADMIN = 'Bearer ' + jwt.sign({ id: 8, email: 'adm@sbcc.church', role: 'admin' }, JWT_SECRET);

    const res = await request(app)
      .put('/api/auth/users/3')
      .set('Authorization', ADMIN)
      .send({ role: 'super_admin' });

    expect(res.status).toBe(403);
    expect(txLog()).toBeUndefined();
    expect(dbLog()).toBeUndefined();
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="auth.activity"`
Expected: FAIL on all seven.

- [x] **Step 3: Import the helper**

At the top of `api/auth.js`, below `const db = require('./_lib/database');`, add:

```javascript
const { logActivity, diffFields, ACTIONS, USER_FIELDS } = require('./_lib/activityLog');
```

- [x] **Step 4: Log both login outcomes**

In `app.post('/api/auth/login', ...)`, replace the failure branch:

```javascript
    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
```

with:

```javascript
    if (!user || !user.password_hash || !bcrypt.compareSync(password, user.password_hash)) {
      // No other mutation to bind this to, so it goes straight through the pool.
      // The attempted address lives in `summary` when it matches no account.
      await logActivity(db, {
        actor: user ? { email: user.email, role: user.role } : null,
        action: ACTIONS.LOGIN_FAILED,
        summary: user ? 'Failed password login' : `Failed login for unknown email ${email}`,
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }
```

and replace the `last_login` update:

```javascript
    await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
```

with:

```javascript
    await db.withTransaction(async (tx) => {
      await tx.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);
      await logActivity(tx, {
        actor: { email: user.email, role: user.role },
        action: ACTIONS.LOGIN_SUCCESS,
        summary: pwa ? 'Signed in from mobile' : 'Signed in',
      });
    });
```

The disabled-account branch stays where it is, between them: an inactive account with the right password is not a failed password attempt.

- [x] **Step 5: Log user creation**

In `app.post('/api/auth/users', ...)`, replace:

```javascript
    const result = await db.run(
      'INSERT INTO users (email, name, role, created_by) VALUES ($1, $2, $3, $4)',
      [email, name, role, req.user.email]
    );
```

with:

```javascript
    let newUserId;
    await db.withTransaction(async (tx) => {
      const result = await tx.run(
        'INSERT INTO users (email, name, role, created_by) VALUES ($1, $2, $3, $4)',
        [email, name, role, req.user.email]
      );
      newUserId = result.lastID;

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.USER_CREATE,
        entityType: 'user',
        entityId: newUserId,
        summary: `Created ${role} account ${email}`,
      });
    });
```

and change the response to use it:

```javascript
    res.json({
      id: newUserId,
      message: 'User created successfully',
      email,
      name,
      role,
    });
```

- [x] **Step 6: Log user updates**

In `app.put('/api/auth/users/:id', ...)`, replace:

```javascript
    await db.run(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
```

with:

```javascript
    const changes = diffFields(user, req.body, USER_FIELDS);

    await db.withTransaction(async (tx) => {
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

Every guard above this point — the super-admin checks, the last-super-admin `409`, and the self-disable `400` — returns before the transaction opens, so a rejected request writes nothing.

- [x] **Step 7: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="auth"`
Expected: PASS — `auth.activity` (7 tests) and the existing `auth.roles` suite.

- [x] **Step 8: Commit**

```bash
git add api/auth.js api/auth.activity.test.js
git commit -m "feat: log login outcomes and user administration"
```

---

## Task 7: The `GET /api/activity` Endpoint

**Files:**
- Create: `api/activity.js`, `api/activity.test.js`
- Modify: `vercel.json`

- [x] **Step 1: Write the failing test**

Create `api/activity.test.js`:

```javascript
const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockDb = { get: jest.fn(), all: jest.fn(), run: jest.fn() };
jest.mock('./_lib/database', () => mockDb);

const app = require('./activity');
const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'actor@sbcc.church', role }, JWT_SECRET);

const ENTRY = {
  id: 1,
  occurred_at: '2026-08-15T04:00:00.000Z',
  actor_email: 'admin@sbcc.church',
  actor_role: 'admin',
  action: 'record.update',
  entity_type: 'collection',
  entity_id: 7,
  summary: 'Updated collection 2026-08-15 for 5000.00',
  changes: { particular: { from: 'a', to: 'b' } },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.all.mockResolvedValue([ENTRY]);
  mockDb.get.mockResolvedValue({ count: '1' });
});

describe('authorization', () => {
  test('super_admin may read the log', async () => {
    const res = await request(app).get('/api/activity').set('Authorization', tokenFor('super_admin'));
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  test('admin may not', async () => {
    const res = await request(app).get('/api/activity').set('Authorization', tokenFor('admin'));
    expect(res.status).toBe(403);
  });

  test('user may not', async () => {
    const res = await request(app).get('/api/activity').set('Authorization', tokenFor('user'));
    expect(res.status).toBe(403);
  });

  test('an unauthenticated request is refused', async () => {
    const res = await request(app).get('/api/activity');
    expect(res.status).toBe(401);
  });
});

describe('pagination', () => {
  test('defaults to 50 rows, newest first', async () => {
    await request(app).get('/api/activity').set('Authorization', tokenFor('super_admin'));

    const [sql, params] = mockDb.all.mock.calls[0];
    expect(sql).toMatch(/ORDER BY occurred_at DESC/i);
    expect(params).toContain(50);
    expect(params).toContain(0);
  });

  test('honours limit and offset', async () => {
    await request(app)
      .get('/api/activity?limit=10&offset=20')
      .set('Authorization', tokenFor('super_admin'));

    const params = mockDb.all.mock.calls[0][1];
    expect(params).toContain(10);
    expect(params).toContain(20);
  });

  test('caps an absurd limit at 200', async () => {
    await request(app)
      .get('/api/activity?limit=100000')
      .set('Authorization', tokenFor('super_admin'));

    expect(mockDb.all.mock.calls[0][1]).toContain(200);
  });

  test('ignores a non-numeric limit', async () => {
    await request(app)
      .get('/api/activity?limit=abc')
      .set('Authorization', tokenFor('super_admin'));

    expect(mockDb.all.mock.calls[0][1]).toContain(50);
  });
});

describe('filters', () => {
  test('filters by entity', async () => {
    await request(app)
      .get('/api/activity?entity_type=collection&entity_id=7')
      .set('Authorization', tokenFor('super_admin'));

    const [sql, params] = mockDb.all.mock.calls[0];
    expect(sql).toMatch(/entity_type = \$1/);
    expect(sql).toMatch(/entity_id = \$2/);
    expect(params.slice(0, 2)).toEqual(['collection', 7]);
  });

  test('filters by actor', async () => {
    await request(app)
      .get('/api/activity?actor_email=admin@sbcc.church')
      .set('Authorization', tokenFor('super_admin'));

    const [sql, params] = mockDb.all.mock.calls[0];
    expect(sql).toMatch(/actor_email = \$1/);
    expect(params[0]).toBe('admin@sbcc.church');
  });

  test('filters by date range', async () => {
    await request(app)
      .get('/api/activity?from=2026-08-01&to=2026-08-31')
      .set('Authorization', tokenFor('super_admin'));

    const [sql, params] = mockDb.all.mock.calls[0];
    expect(sql).toMatch(/occurred_at >= \$1/);
    expect(sql).toMatch(/occurred_at < \$2/);
    expect(params[0]).toBe('2026-08-01');
  });

  test('the count query carries the same filters', async () => {
    await request(app)
      .get('/api/activity?entity_type=expense')
      .set('Authorization', tokenFor('super_admin'));

    const [sql, params] = mockDb.get.mock.calls[0];
    expect(sql).toMatch(/COUNT\(\*\)/i);
    expect(sql).toMatch(/entity_type = \$1/);
    expect(params).toEqual(['expense']);
  });

  test('an unknown query parameter is ignored rather than injected', async () => {
    await request(app)
      .get('/api/activity?order_by=drop+table')
      .set('Authorization', tokenFor('super_admin'));

    expect(mockDb.all.mock.calls[0][0]).not.toMatch(/drop/i);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="api/activity"`
Expected: FAIL — `Cannot find module './activity'`.

- [x] **Step 3: Write the endpoint**

Create `api/activity.js`:

```javascript
const express = require('express');
const db = require('./_lib/database');
const { verifyToken, checkRole } = require('./_lib/expressAuth');

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** Whole numbers only, within bounds, falling back to `fallback`. */
function boundedInt(value, fallback, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

/**
 * Builds the shared WHERE clause. Only the four documented filters are read
 * from the query string; anything else is ignored, and every value is a bound
 * parameter.
 */
function buildFilters(query) {
  const conditions = [];
  const params = [];

  if (query.entity_type) {
    conditions.push(`entity_type = $${params.length + 1}`);
    params.push(query.entity_type);
  }
  if (query.entity_id) {
    conditions.push(`entity_id = $${params.length + 1}`);
    params.push(parseInt(query.entity_id, 10));
  }
  if (query.actor_email) {
    conditions.push(`actor_email = $${params.length + 1}`);
    params.push(query.actor_email);
  }
  if (query.from) {
    conditions.push(`occurred_at >= $${params.length + 1}`);
    params.push(query.from);
  }
  if (query.to) {
    // Exclusive upper bound so a plain YYYY-MM-DD includes that whole day.
    conditions.push(`occurred_at < ($${params.length + 1}::date + 1)`);
    params.push(query.to);
  }

  return {
    where: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

// GET /api/activity — super administrators only.
app.get('/api/activity', verifyToken, checkRole(['super_admin']), async (req, res) => {
  const limit = boundedInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const offset = boundedInt(req.query.offset, 0);
  const { where, params } = buildFilters(req.query);

  try {
    const countRow = await db.get(`SELECT COUNT(*) AS count FROM activity_log${where}`, params);

    const entries = await db.all(
      `SELECT id, occurred_at, actor_email, actor_role, action, entity_type, entity_id, summary, changes
       FROM activity_log${where}
       ORDER BY occurred_at DESC, id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    res.json({
      entries,
      total: parseInt(countRow?.count ?? '0', 10),
      limit,
      offset,
    });
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
```

- [x] **Step 4: Route it on Vercel**

In `vercel.json`, add a rewrite alongside the others so query strings reach the function:

```json
    { "source": "/api/activity/:path*", "destination": "/api/activity" },
```

- [x] **Step 5: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="api/activity"`
Expected: PASS, 13 tests.

- [x] **Step 6: Commit**

```bash
git add api/activity.js api/activity.test.js vercel.json
git commit -m "feat: add super-admin activity log endpoint"
```

---

## Task 8: Frontend API Method and Activity Page

**Files:**
- Create: `frontend/src/components/ActivityLogView.js`, `frontend/src/components/ActivityLogView.test.js`
- Modify: `frontend/src/utils/api.js`

- [x] **Step 1: Write the failing test**

Create `frontend/src/components/ActivityLogView.test.js`:

```javascript
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ActivityLogView from './ActivityLogView';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  getActivity: jest.fn(),
}));

const ENTRIES = [
  {
    id: 2,
    occurred_at: '2026-08-15T04:10:00.000Z',
    actor_email: 'admin@sbcc.church',
    actor_role: 'admin',
    action: 'record.update',
    entity_type: 'collection',
    entity_id: 7,
    summary: 'Updated collection 2026-08-15 for 5000.00',
    changes: { particular: { from: 'Sunday Service', to: 'Sunday Worship' } },
  },
  {
    id: 1,
    occurred_at: '2026-08-15T04:00:00.000Z',
    actor_email: 'boss@sbcc.church',
    actor_role: 'super_admin',
    action: 'auth.login_success',
    entity_type: null,
    entity_id: null,
    summary: 'Signed in',
    changes: null,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  apiService.getActivity.mockResolvedValue({ entries: ENTRIES, total: 2, limit: 50, offset: 0 });
});

test('lists each entry with its actor and summary', async () => {
  render(<ActivityLogView />);

  await waitFor(() => expect(screen.getByText(/Updated collection/)).toBeInTheDocument());
  expect(screen.getByText('admin@sbcc.church')).toBeInTheDocument();
  expect(screen.getByText(/Signed in/)).toBeInTheDocument();
});

test('shows a readable label instead of the raw action key', async () => {
  render(<ActivityLogView />);

  await waitFor(() => expect(screen.getByText('Record updated')).toBeInTheDocument());
  expect(screen.getByText('Signed in')).toBeInTheDocument();
  expect(screen.queryByText('record.update')).not.toBeInTheDocument();
});

test('hides the diff until the entry is expanded', async () => {
  render(<ActivityLogView />);

  await waitFor(() => expect(screen.getByText(/Updated collection/)).toBeInTheDocument());
  expect(screen.queryByText('Sunday Worship')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /details for entry 2/i }));

  expect(screen.getByText(/Sunday Service/)).toBeInTheDocument();
  expect(screen.getByText(/Sunday Worship/)).toBeInTheDocument();
});

test('offers no expander for an entry with no diff', async () => {
  render(<ActivityLogView />);

  await waitFor(() => expect(screen.getByText(/Signed in/)).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /details for entry 1/i })).not.toBeInTheDocument();
});

test('filters by entity type', async () => {
  render(<ActivityLogView />);
  await waitFor(() => expect(apiService.getActivity).toHaveBeenCalled());

  fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'collection' } });

  await waitFor(() =>
    expect(apiService.getActivity).toHaveBeenLastCalledWith(
      expect.objectContaining({ entity_type: 'collection', offset: 0 })
    )
  );
});

test('pages forward and back', async () => {
  apiService.getActivity.mockResolvedValue({ entries: ENTRIES, total: 120, limit: 50, offset: 0 });
  render(<ActivityLogView />);
  await waitFor(() => expect(apiService.getActivity).toHaveBeenCalled());

  fireEvent.click(screen.getByRole('button', { name: /next/i }));

  await waitFor(() =>
    expect(apiService.getActivity).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50 }))
  );
});

test('says so when there is nothing to show', async () => {
  apiService.getActivity.mockResolvedValue({ entries: [], total: 0, limit: 50, offset: 0 });
  render(<ActivityLogView />);

  await waitFor(() => expect(screen.getByText(/no activity/i)).toBeInTheDocument());
});

test('surfaces a failure instead of rendering an empty list', async () => {
  apiService.getActivity.mockRejectedValue(new Error('boom'));
  render(<ActivityLogView />);

  await waitFor(() => expect(screen.getByText(/could not load/i)).toBeInTheDocument());
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false --testPathPattern=ActivityLogView`
Expected: FAIL — cannot resolve `./ActivityLogView`.

- [x] **Step 3: Add the API method**

In `frontend/src/utils/api.js`, directly above the closing `}` of the class, add:

```javascript
  async getActivity(filters = {}) {
    try {
      const params = {};
      if (filters.entity_type) params.entity_type = filters.entity_type;
      if (filters.entity_id) params.entity_id = filters.entity_id;
      if (filters.actor_email) params.actor_email = filters.actor_email;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      params.limit = filters.limit ?? 50;
      params.offset = filters.offset ?? 0;

      const response = await this.api.get("/api/activity", { params });
      return response.data;
    } catch (error) {
      console.error("Error fetching activity log:", error);
      throw error;
    }
  }
```

- [x] **Step 4: Write the component**

Create `frontend/src/components/ActivityLogView.js`:

```javascript
import React, { useCallback, useEffect, useState } from "react";
import apiService from "../utils/api";

const PAGE_SIZE = 50;

const ACTION_LABELS = {
  "record.create": "Record created",
  "record.update": "Record updated",
  "record.delete": "Record deleted",
  "user.create": "User created",
  "user.update": "User updated",
  "auth.login_success": "Signed in",
  "auth.login_failed": "Sign-in failed",
  "auth.password_change": "Password changed",
};

const ACTION_TONE = {
  "record.create": "#2f7a44",
  "record.update": "#b8860b",
  "record.delete": "#b3452f",
  "auth.login_failed": "#b3452f",
};

const formatWhen = (value) => {
  const when = new Date(value);
  return Number.isNaN(when.getTime())
    ? String(value)
    : when.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
};

const formatValue = (value) => (value === null || value === undefined ? "—" : String(value));

const ActivityLogView = () => {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [entityType, setEntityType] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.getActivity({
        entity_type: entityType || undefined,
        actor_email: actorEmail || undefined,
        limit: PAGE_SIZE,
        offset,
      });
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError("Could not load the activity log. Please try again.");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, actorEmail, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onFilterChange = (setter) => (event) => {
    setOffset(0);
    setter(event.target.value);
  };

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="bg-white rounded-2xl border border-[#e8d090] overflow-hidden">
      <div className="flex flex-wrap gap-3 items-end p-4 border-b border-[#f0e4b0]">
        <div className="flex flex-col gap-1">
          <label htmlFor="activity-type" className="text-xs font-semibold text-[#b89048]">Type</label>
          <select
            id="activity-type"
            value={entityType}
            onChange={onFilterChange(setEntityType)}
            className="text-sm border border-[#e8d090] rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="">All activity</option>
            <option value="collection">Collections</option>
            <option value="expense">Expenses</option>
            <option value="user">Users</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="activity-actor" className="text-xs font-semibold text-[#b89048]">Actor email</label>
          <input
            id="activity-actor"
            type="text"
            value={actorEmail}
            onChange={onFilterChange(setActorEmail)}
            placeholder="anyone"
            className="text-sm border border-[#e8d090] rounded-lg px-2 py-1.5"
          />
        </div>
      </div>

      {error && <p className="p-4 text-sm text-[#b3452f]">{error}</p>}
      {!error && loading && <p className="p-4 text-sm text-[#b89048]">Loading activity…</p>}
      {!error && !loading && entries.length === 0 && (
        <p className="p-4 text-sm text-[#8a6a2a]">No activity recorded yet.</p>
      )}

      {!error && !loading && entries.length > 0 && (
        <ul className="divide-y divide-[#f0e4b0]">
          {entries.map((entry) => (
            <li key={entry.id} className="p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  className="text-xs font-bold uppercase tracking-wide"
                  style={{ color: ACTION_TONE[entry.action] || "#8a6a2a" }}
                >
                  {ACTION_LABELS[entry.action] || entry.action}
                </span>
                <span className="text-sm text-[#3d2a08]">{entry.summary}</span>
                <span className="text-xs text-[#b89048] ml-auto">{formatWhen(entry.occurred_at)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-[#8a6a2a]">
                <span>{entry.actor_email || "unknown"}</span>
                {entry.actor_role && <span>({entry.actor_role})</span>}
                {entry.entity_type && (
                  <span>
                    {entry.entity_type} #{entry.entity_id}
                  </span>
                )}
                {entry.changes && (
                  <button
                    type="button"
                    onClick={() => toggle(entry.id)}
                    aria-label={`Details for entry ${entry.id}`}
                    className="underline text-[#b8860b]"
                  >
                    {expanded.has(entry.id) ? "Hide details" : "Show details"}
                  </button>
                )}
              </div>

              {entry.changes && expanded.has(entry.id) && (
                <table className="mt-2 text-xs w-full">
                  <tbody>
                    {Object.entries(entry.changes).map(([field, diff]) => (
                      <tr key={field}>
                        <td className="py-0.5 pr-3 font-medium text-[#8a6a2a]">{field}</td>
                        <td className="py-0.5 pr-3 text-[#b3452f]">{formatValue(diff.from)}</td>
                        <td className="py-0.5 text-[#2f7a44]">{formatValue(diff.to)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between p-4 border-t border-[#f0e4b0] text-xs text-[#8a6a2a]">
        <span>
          {total === 0 ? "0 entries" : `Showing ${pageStart}–${pageEnd} of ${total}`}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0}
            className="px-3 py-1.5 rounded-lg border border-[#e8d090] disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total}
            className="px-3 py-1.5 rounded-lg border border-[#e8d090] disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActivityLogView;
```

- [x] **Step 5: Run to verify it passes**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false --testPathPattern=ActivityLogView`
Expected: PASS, 8 tests.

- [x] **Step 6: Commit**

```bash
git add frontend/src/components/ActivityLogView.js frontend/src/components/ActivityLogView.test.js frontend/src/utils/api.js
git commit -m "feat: add read-only activity log view"
```

---

## Task 9: Show the Activity Page to Super Administrators Only

**Files:**
- Modify: `frontend/src/components/Dashboard.js`
- Create: `frontend/src/components/Dashboard.activity.test.js`

- [x] **Step 1: Write the failing test**

Create `frontend/src/components/Dashboard.activity.test.js`:

```javascript
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';

jest.mock('../utils/api', () => ({
  getCollections: jest.fn(async () => []),
  getExpenses: jest.fn(async () => []),
  getActivity: jest.fn(async () => ({ entries: [], total: 0, limit: 50, offset: 0 })),
  healthCheck: jest.fn(async () => ({ status: 'OK' })),
}));

const renderAs = (role) =>
  render(<Dashboard user={{ id: 1, email: 'a@b.c', name: 'A', role }} onLogout={() => {}} />);

test('a super admin sees the Activity nav item', async () => {
  renderAs('super_admin');
  await waitFor(() => expect(screen.getByText('Activity Log')).toBeInTheDocument());
});

test('an admin does not', async () => {
  renderAs('admin');
  await waitFor(() => expect(screen.getByText('Users')).toBeInTheDocument());
  expect(screen.queryByText('Activity Log')).not.toBeInTheDocument();
});

test('a plain user does not', async () => {
  renderAs('user');
  // "Reports" is a nav item every role sees, and unlike "Dashboard" it is not
  // also the page heading — so it matches exactly once.
  await waitFor(() => expect(screen.getByText('Reports')).toBeInTheDocument());
  expect(screen.queryByText('Activity Log')).not.toBeInTheDocument();
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false --testPathPattern=Dashboard.activity`
Expected: FAIL — no `Activity Log` nav item exists.

- [x] **Step 3: Import the view**

In `frontend/src/components/Dashboard.js`, below `import CustomFieldsExample from "./CustomFieldsExample";`, add:

```javascript
import ActivityLogView from "./ActivityLogView";
```

and add `History` to the existing `lucide-react` import list at the top of the file.

- [x] **Step 4: Add the sub-view state**

Below `const [showCustomFields, setShowCustomFields] = useState(false);` add:

```javascript
  const [showActivityLog, setShowActivityLog] = useState(false);
```

Then extend the three places that enumerate sub-views:

```javascript
  const clearSubViews = () => {
    setShowRecordsManager(false);
    setShowUserManagement(false);
    setShowCustomFieldsExample(false);
    setShowCustomFields(false);
    setShowActivityLog(false);
  };

  const isSubView = showRecordsManager || showUserManagement || showCustomFieldsExample || showCustomFields || showActivityLog;
```

and in `getPageTitle()`, above the final `return`:

```javascript
    if (showActivityLog) return "Activity Log";
```

- [x] **Step 5: Add the nav item, super admins only**

In `navSections`, after the `Management` section object, add a section that only exists for `super_admin`:

```javascript
    ...(user?.role === "super_admin" ? [{
      label: "Audit",
      items: [
        { id: "activity", label: "Activity Log", icon: History, onClick: () => { clearSubViews(); setShowActivityLog(true); setSidebarOpen(false); }, active: showActivityLog },
      ],
    }] : []),
```

- [x] **Step 6: Render the page**

In the `<main>` block, after the `{showCustomFields && ( ... )}` block, add:

```javascript
          {showActivityLog && (
            <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
              <div className="flex items-stretch gap-3 mb-5">
                <div className="flex-1 p-4" style={{ background: 'linear-gradient(135deg, #fff8e0, #fef3d0)', border: '1.5px solid #e8d090', borderRadius: '14px 14px 14px 4px' }}>
                  <p className="text-sm font-bold text-left" style={{ color: '#c49030', letterSpacing: '0.04em' }}>STEWARDBOX SAYS</p>
                  <p className="text-sm mt-1 text-left" style={{ color: '#3d2a08', lineHeight: 1.4 }}>Every change to a financial record is recorded here, along with who made it. Entries cannot be edited or removed.</p>
                </div>
              </div>
              <ActivityLogView />
            </div>
          )}
```

- [x] **Step 7: Run to verify it passes**

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false --testPathPattern=Dashboard`
Expected: PASS, 3 tests.

- [x] **Step 8: Commit**

```bash
git add frontend/src/components/Dashboard.js frontend/src/components/Dashboard.activity.test.js
git commit -m "feat: surface the activity log to super administrators"
```

---

## Task 10: Mirror Logging on the Local Express Server

Without this, records created against the local dev server carry no history, and the Activity page looks broken in development.

`backend/routes/` uses callback-style `req.db` with `?` placeholders. The adapter in `backend/config/database-pg.js` converts `?` to `$n` and nothing else.

**Files:**
- Modify: `backend/config/database-pg.js`, `backend/routes/collections.js`, `backend/routes/expenses.js`
- Create: `backend/routes/activity.mutations.test.js`

- [x] **Step 1: Write the failing test**

Create `backend/routes/activity.mutations.test.js`:

```javascript
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key-change-this';
const ADMIN =
  'Bearer ' + jwt.sign({ id: 1, email: 'admin@sbcc.church', role: 'admin' }, JWT_SECRET);

// The local server hands routes a callback-style req.db. withTransaction is
// promise-based on both adapters, so the fake mirrors that shape.
const makeDb = () => {
  const tx = { run: jest.fn(async () => ({ changes: 1, lastID: 11 })), get: jest.fn(async () => null), all: jest.fn(async () => []) };
  const db = {
    tx,
    get: jest.fn((sql, params, cb) => cb(null, { id: 7, date: '2026-08-15', total_amount: '5000.00' })),
    all: jest.fn((sql, params, cb) => cb(null, [])),
    run: jest.fn(function (sql, params, cb) { if (cb) cb.call({ changes: 1, lastID: 11 }, null); }),
    withTransaction: jest.fn(async (fn) => fn(tx)),
  };
  return db;
};

const mount = (router, db) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = db; next(); });
  app.use('/api/collections', router);
  return app;
};

const logCall = (db) => db.tx.run.mock.calls.find(([sql]) => /INSERT INTO activity_log/i.test(sql));

test('deleting a collection locally logs record.delete in the same transaction', async () => {
  const db = makeDb();
  const app = mount(require('./collections'), db);

  const res = await request(app).delete('/api/collections/7').set('Authorization', ADMIN);

  expect(res.status).toBe(200);
  expect(db.withTransaction).toHaveBeenCalledTimes(1);
  const [, params] = logCall(db);
  expect(params[0]).toBe('admin@sbcc.church');
  expect(params[2]).toBe('record.delete');
  expect(params[3]).toBe('collection');
});

test('a missing collection is neither deleted nor logged locally', async () => {
  const db = makeDb();
  db.get = jest.fn((sql, params, cb) => cb(null, undefined));
  const app = mount(require('./collections'), db);

  const res = await request(app).delete('/api/collections/7').set('Authorization', ADMIN);

  expect(res.status).toBe(404);
  expect(logCall(db)).toBeUndefined();
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="activity.mutations"`
Expected: FAIL — the local delete handler neither reads the record first nor opens a transaction.

- [x] **Step 3: Add `withTransaction` to the local adapter**

In `backend/config/database-pg.js`, alongside the existing `get`/`all`/`run` wrapper methods, add:

```javascript
  // Runs `fn` inside one transaction. The tx runner takes the same ? placeholders
  // the rest of this adapter accepts, and is promise-based rather than callback
  // style — mutations that log are written with async/await.
  async withTransaction(fn) {
    const client = await this.pool.connect();

    const convert = (query) => {
      let pgQuery = query;
      let paramIndex = 1;
      while (pgQuery.includes('?')) {
        pgQuery = pgQuery.replace('?', '$' + paramIndex);
        paramIndex++;
      }
      return pgQuery;
    };

    const tx = {
      get: async (sql, params = []) => (await client.query(convert(sql), params)).rows[0] || null,
      all: async (sql, params = []) => (await client.query(convert(sql), params)).rows,
      run: async (sql, params = []) => {
        let pgQuery = convert(sql);
        if (pgQuery.trim().toLowerCase().startsWith('insert') && !pgQuery.toLowerCase().includes('returning')) {
          pgQuery += ' RETURNING *';
          const result = await client.query(pgQuery, params);
          return { lastID: result.rows[0]?.id, changes: result.rowCount };
        }
        const result = await client.query(pgQuery, params);
        return { changes: result.rowCount };
      },
    };

    try {
      await client.query('BEGIN');
      const result = await fn(tx);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Rollback failed:', rollbackErr.message);
      }
      throw err;
    } finally {
      client.release();
    }
  }
```

- [x] **Step 4: Import the helper in both route files**

At the top of `backend/routes/collections.js`, below the `softDelete` require, add:

```javascript
const { logActivity, diffFields, ACTIONS, COLLECTION_FIELDS } = require('../../api/_lib/activityLog');
```

and at the top of `backend/routes/expenses.js`:

```javascript
const { logActivity, diffFields, ACTIONS, EXPENSE_FIELDS } = require('../../api/_lib/activityLog');
```

`api/_lib/activityLog.js` has no dependencies, so requiring it here does not pull the `api/` pg Pool into this process — the same reasoning that made `softDelete.js` safe to share in Plan 2.

- [x] **Step 5: Log the local collections delete**

In `backend/routes/collections.js`, replace the whole `router.delete("/:id", ...)` handler with:

```javascript
// Soft delete: the row is preserved, and the deletion is logged in the same transaction.
router.delete("/:id", authenticateToken, canMutate, (req, res) => {
  const { id } = req.params;

  req.db.get(
    `SELECT id, date, total_amount FROM collections WHERE id = ? AND ${notDeleted()}`,
    [id],
    async (err, before) => {
      if (err) {
        console.error("Database error:", err.message);
        return res.status(500).json({ error: err.message });
      }
      if (!before) {
        return res.status(404).json({ error: "Collection not found" });
      }

      try {
        await req.db.withTransaction(async (tx) => {
          const result = await tx.run(
            `UPDATE collections SET deleted_at = now(), deleted_by = ? WHERE id = ? AND ${notDeleted()}`,
            [req.user.email, id]
          );
          if (result.changes === 0) {
            const notFound = new Error("Collection not found");
            notFound.notFound = true;
            throw notFound;
          }

          await logActivity(tx, {
            actor: req.user,
            action: ACTIONS.RECORD_DELETE,
            entityType: 'collection',
            entityId: parseInt(id, 10),
            summary: `Deleted collection ${String(before.date).slice(0, 10)} for ${Number(before.total_amount || 0).toFixed(2)}`,
          });
        });

        res.json({ message: "Collection deleted successfully" });
      } catch (txErr) {
        if (txErr.notFound) {
          return res.status(404).json({ error: "Collection not found" });
        }
        console.error("Database error:", txErr.message);
        res.status(500).json({ error: txErr.message });
      }
    }
  );
});
```

- [x] **Step 6: Log the local expenses delete**

In `backend/routes/expenses.js`, replace the whole `router.delete("/:id", ...)` handler with the same shape:

```javascript
// Soft delete: the row is preserved, and the deletion is logged in the same transaction.
router.delete("/:id", authenticateToken, canMutate, (req, res) => {
  const { id } = req.params;

  req.db.get(
    `SELECT id, date, total_amount FROM expenses WHERE id = ? AND ${notDeleted()}`,
    [id],
    async (err, before) => {
      if (err) {
        console.error("Database error:", err.message);
        return res.status(500).json({ error: err.message });
      }
      if (!before) {
        return res.status(404).json({ error: "Expense not found" });
      }

      try {
        await req.db.withTransaction(async (tx) => {
          const result = await tx.run(
            `UPDATE expenses SET deleted_at = now(), deleted_by = ? WHERE id = ? AND ${notDeleted()}`,
            [req.user.email, id]
          );
          if (result.changes === 0) {
            const notFound = new Error("Expense not found");
            notFound.notFound = true;
            throw notFound;
          }

          await logActivity(tx, {
            actor: req.user,
            action: ACTIONS.RECORD_DELETE,
            entityType: 'expense',
            entityId: parseInt(id, 10),
            summary: `Deleted expense ${String(before.date).slice(0, 10)} for ${Number(before.total_amount || 0).toFixed(2)}`,
          });
        });

        res.json({ message: "Expense deleted successfully" });
      } catch (txErr) {
        if (txErr.notFound) {
          return res.status(404).json({ error: "Expense not found" });
        }
        console.error("Database error:", txErr.message);
        res.status(500).json({ error: txErr.message });
      }
    }
  );
});
```

- [x] **Step 7: Log the local collections create**

The POST handler in `backend/routes/collections.js` already declares `insertQuery` and `baseParams` (around line 163) and retries control-number collisions inside a `new Promise` with a recursive `tryInsert`. Replace that whole promise — from `// Retry up to 5 times if a generated control_number collides with an existing one` through the closing `});` of the `await new Promise(...)` — with a transaction per attempt, for the reason given in Task 4 Step 5:

```javascript
    // Retry up to 5 times if a generated control_number collides. Each attempt
    // is its own transaction: a unique-constraint failure aborts the transaction
    // it happens in, so the retry has to open a new one.
    let collectionId;
    let ctrlNum = finalControlNumber;

    for (let attempt = 0; attempt <= 5; attempt++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await req.db.withTransaction(async (tx) => {
          const params = [...baseParams];
          params[2] = ctrlNum;

          const result = await tx.run(insertQuery, params);
          collectionId = result.lastID;

          await logActivity(tx, {
            actor: req.user,
            action: ACTIONS.RECORD_CREATE,
            entityType: 'collection',
            entityId: collectionId,
            summary: `Created collection ${String(date).slice(0, 10)} for ${Number(calculatedTotal || 0).toFixed(2)}`,
          });
        });
        break;
      } catch (insertErr) {
        const isCtrlConflict =
          (insertErr.code === 'SQLITE_CONSTRAINT' && insertErr.message.includes('control_number')) ||
          (insertErr.code === '23505' && (insertErr.constraint?.includes('control_number') || insertErr.detail?.includes('control_number')));
        if (isCtrlConflict && attempt < 5) {
          const parts = ctrlNum.split('-');
          const nextSeq = String((parseInt(parts[parts.length - 1]) || 0) + 1).padStart(3, '0');
          ctrlNum = `${parts.slice(0, -1).join('-')}-${nextSeq}`;
          continue;
        }
        throw insertErr;
      }
    }
```

- [x] **Step 8: Log the local expenses create**

The POST handler in `backend/routes/expenses.js` has no control-number retry, so it needs no loop. Replace its `req.db.run(insertQuery, params, function (err) { ... })` call — keeping whatever response the existing success branch sends — with:

```javascript
  let expenseId;
  try {
    await req.db.withTransaction(async (tx) => {
      const result = await tx.run(insertQuery, params);
      expenseId = result.lastID;

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.RECORD_CREATE,
        entityType: 'expense',
        entityId: expenseId,
        summary: `Created expense ${String(date).slice(0, 10)} for ${Number(calculatedTotal || 0).toFixed(2)}`,
      });
    });
  } catch (err) {
    console.error("Database error:", err.message);
    return res.status(500).json({ error: err.message });
  }

  res.json({ id: expenseId, message: "Expense added successfully" });
```

using that handler's existing SQL string and parameter array names. If the route is not already declared `async`, change `router.post("/", authenticateToken, canMutate, (req, res) => {` to `router.post("/", authenticateToken, canMutate, async (req, res) => {`.

- [x] **Step 9: Log the local updates**

In `backend/routes/collections.js`, the PUT handler builds `query` and a parameter array and calls `req.db.run(query, [...], async function (err) { ... })`. Add the pre-read and wrap the update, replacing that `req.db.run(...)` call with:

```javascript
  req.db.get(
    `SELECT * FROM collections WHERE id = ? AND ${notDeleted()}`,
    [id],
    async (readErr, before) => {
      if (readErr) {
        console.error("Database error:", readErr.message);
        return res.status(500).json({ error: readErr.message });
      }
      if (!before) {
        return res.status(404).json({ error: "Collection not found" });
      }

      const changes = diffFields(before, req.body, COLLECTION_FIELDS);

      try {
        await req.db.withTransaction(async (tx) => {
          const result = await tx.run(query, updateParams);
          if (result.changes === 0) {
            const notFound = new Error("Collection not found");
            notFound.notFound = true;
            throw notFound;
          }

          await logActivity(tx, {
            actor: req.user,
            action: ACTIONS.RECORD_UPDATE,
            entityType: 'collection',
            entityId: parseInt(id, 10),
            summary: `Updated collection ${String(date).slice(0, 10)} for ${Number(calculatedTotal || 0).toFixed(2)}`,
            changes,
          });
        });

        res.json({ message: "Collection updated successfully" });
      } catch (txErr) {
        if (txErr.notFound) {
          return res.status(404).json({ error: "Collection not found" });
        }
        console.error("Database error:", txErr.message);
        res.status(500).json({ error: txErr.message });
      }
    }
  );
```

where `updateParams` is that handler's existing parameter array, hoisted into a `const` directly above this block so it can be passed to `tx.run`. Everything the old callback did after a successful update — including the custom-fields save — moves into the `try` block after the transaction, not inside it (Rule 1).

Apply the same change to the PUT handler in `backend/routes/expenses.js`, using `FROM expenses`, `EXPENSE_FIELDS`, `entityType: 'expense'`, `Updated expense` in the summary, and `"Expense not found"` / `"Expense updated successfully"` in the responses.

- [x] **Step 10: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="routes"`
Expected: PASS — the two new tests plus `collections.dupe` and `reports` still green.

`collections.dupe.test.js` drives `POST` against a fake `req.db`. It now needs a `withTransaction` on that fake. In its db stub, add:

```javascript
  withTransaction: async (fn) => fn({
    run: async () => ({ changes: 1, lastID: 1 }),
    get: async () => null,
    all: async () => [],
  }),
```

- [x] **Step 11: Commit**

```bash
git add backend/config/database-pg.js backend/routes/collections.js backend/routes/expenses.js backend/routes/activity.mutations.test.js backend/routes/collections.dupe.test.js
git commit -m "feat: mirror transactional activity logging on the local Express server"
```

---

## Task 11: The Local `/api/activity` Route

The frontend in local development talks to `http://localhost:3001` via `REACT_APP_API_URL`, so without this route the Activity page cannot be exercised outside production.

**Files:**
- Create: `backend/routes/activity.js`, `backend/routes/activity.test.js`
- Modify: `backend/server.js`

- [x] **Step 1: Write the failing test**

Create `backend/routes/activity.test.js`:

```javascript
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key-change-this';
const tokenFor = (role) =>
  'Bearer ' + jwt.sign({ id: 1, email: 'actor@sbcc.church', role }, JWT_SECRET);

const ENTRY = {
  id: 1,
  occurred_at: '2026-08-15T04:00:00.000Z',
  actor_email: 'admin@sbcc.church',
  actor_role: 'admin',
  action: 'record.create',
  entity_type: 'collection',
  entity_id: 7,
  summary: 'Created collection 2026-08-15 for 5000.00',
  changes: null,
};

const makeApp = (db) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.db = db; next(); });
  app.use('/api/activity', require('./activity'));
  return app;
};

const db = {
  get: jest.fn((sql, params, cb) => cb(null, { count: '1' })),
  all: jest.fn((sql, params, cb) => cb(null, [ENTRY])),
};

beforeEach(() => jest.clearAllMocks());

test('super_admin reads the log', async () => {
  const res = await request(makeApp(db)).get('/api/activity').set('Authorization', tokenFor('super_admin'));

  expect(res.status).toBe(200);
  expect(res.body.entries).toHaveLength(1);
  expect(res.body.total).toBe(1);
});

test('admin is refused', async () => {
  const res = await request(makeApp(db)).get('/api/activity').set('Authorization', tokenFor('admin'));
  expect(res.status).toBe(403);
});

test('filters and pagination reach the query', async () => {
  await request(makeApp(db))
    .get('/api/activity?entity_type=expense&limit=10&offset=5')
    .set('Authorization', tokenFor('super_admin'));

  const [sql, params] = db.all.mock.calls[0];
  expect(sql).toMatch(/entity_type = \?/);
  expect(params).toEqual(['expense', 10, 5]);
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="routes/activity.test"`
Expected: FAIL — `Cannot find module './activity'`.

- [x] **Step 3: Write the route**

Create `backend/routes/activity.js`:

```javascript
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

function checkRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function boundedInt(value, fallback, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return max !== undefined ? Math.min(parsed, max) : parsed;
}

function buildFilters(query) {
  const conditions = [];
  const params = [];

  if (query.entity_type) { conditions.push('entity_type = ?'); params.push(query.entity_type); }
  if (query.entity_id) { conditions.push('entity_id = ?'); params.push(parseInt(query.entity_id, 10)); }
  if (query.actor_email) { conditions.push('actor_email = ?'); params.push(query.actor_email); }
  if (query.from) { conditions.push('occurred_at >= ?'); params.push(query.from); }
  if (query.to) { conditions.push('occurred_at < (?::date + 1)'); params.push(query.to); }

  return { where: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '', params };
}

// GET /api/activity — super administrators only.
router.get("/", authenticateToken, checkRole(['super_admin']), (req, res) => {
  const limit = boundedInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const offset = boundedInt(req.query.offset, 0);
  const { where, params } = buildFilters(req.query);

  req.db.get(`SELECT COUNT(*) AS count FROM activity_log${where}`, params, (countErr, countRow) => {
    if (countErr) {
      console.error("Database error:", countErr.message);
      return res.status(500).json({ error: countErr.message });
    }

    req.db.all(
      `SELECT id, occurred_at, actor_email, actor_role, action, entity_type, entity_id, summary, changes
       FROM activity_log${where}
       ORDER BY occurred_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
      (err, rows) => {
        if (err) {
          console.error("Database error:", err.message);
          return res.status(500).json({ error: err.message });
        }
        res.json({
          entries: rows || [],
          total: parseInt(countRow?.count ?? '0', 10),
          limit,
          offset,
        });
      }
    );
  });
});

module.exports = router;
```

- [x] **Step 4: Mount it**

In `backend/server.js`, add the require alongside the other route requires:

```javascript
const activityRoutes = require("./routes/activity");
```

and the mount below `app.use("/api/webhooks", webhooksRoutes);`:

```javascript
app.use("/api/activity", activityRoutes);
```

- [x] **Step 5: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="routes/activity.test"`
Expected: PASS, 3 tests.

- [x] **Step 6: Commit**

```bash
git add backend/routes/activity.js backend/routes/activity.test.js backend/server.js
git commit -m "feat: serve the activity log from the local Express server"
```

---

## Task 12: End-to-End Verification Against the Development Branch

The mocked suites prove the SQL is shaped correctly. This proves the transaction actually commits both rows together against real PostgreSQL, that the diff is legible, and that a rollback leaves nothing behind.

**Files:** none (verification only)

- [x] **Step 1: Note the starting counts**

Run against Neon project `small-bar-42939262`, branch `br-super-resonance-a4koenk7`:

```sql
SELECT count(*) AS entries FROM activity_log;
SELECT count(*) FILTER (WHERE deleted_at IS NULL) AS live FROM collections;
```

Write both numbers down — Step 7 restores the branch to them.

- [x] **Step 2: Start the local server against the development branch**

Run: `cd backend && npm run dev`
Expected: `🌍 Environment: development` and the server listening on 3001.

- [x] **Step 3: Create a record and confirm one log row appears with it**

Issue a `POST /api/collections` as an `admin` user, then:

```sql
SELECT id, action, actor_email, actor_role, entity_type, entity_id, summary
FROM activity_log ORDER BY id DESC LIMIT 1;
```

Expected: one `record.create` row naming the acting email, `entity_type = 'collection'`, and `entity_id` equal to the id the API returned. The POST must return 200 — before Task 1 it returned 500.

- [x] **Step 4: Edit it and confirm the diff holds only what changed**

Issue a `PUT` that changes `particular` and nothing else, then:

```sql
SELECT action, changes FROM activity_log ORDER BY id DESC LIMIT 1;
```

Expected: `record.update`, and `changes` containing exactly one key — `particular`, with `from` and `to`. If every amount column appears, the normalization in `diffFields` is not working (Rule 2).

- [x] **Step 5: Delete it and confirm the log survives the record**

Issue a `DELETE`, then:

```sql
SELECT c.deleted_at, c.deleted_by,
       (SELECT count(*) FROM activity_log WHERE entity_type = 'collection' AND entity_id = c.id) AS log_rows
FROM collections c WHERE c.id = <id>;
```

Expected: `deleted_at` set, and three log rows for that record — create, update, delete. The history outlives the soft delete.

- [x] **Step 6: Confirm the endpoint's authorization and shape**

Call `GET /api/activity?limit=5` with a `super_admin` token: 200, newest first, with `total` reflecting the whole table. Call it with an `admin` token: 403. Call it with no token: 401.

- [x] **Step 7: Clean up the test record**

```sql
DELETE FROM activity_log WHERE entity_type = 'collection' AND entity_id = <id>;
DELETE FROM collections WHERE id = <id>;
```

This is the one place the log is deleted from, and it is a manual cleanup of test data — no application code does this. Re-run Step 1's counts and confirm they match what you wrote down.

- [x] **Step 8: Run the full suites**

Run: `cd backend && npm test`
Expected: all pass except the known local-only `googleSheetsService` failure.

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false`
Expected: all pass.

Run: `cd frontend && CI=true npx react-scripts build`
Expected: `Compiled successfully.`

- [x] **Step 9: Commit**

```bash
git commit --allow-empty -m "test: verify the activity log end-to-end on the development branch"
```

---

## Verification Before Moving to Plan 4

- [x] `cd backend && npm test` — all pass except the known local-only `googleSheetsService` failure
- [x] `cd frontend && CI=true npx react-scripts test --watchAll=false` — all pass
- [x] `cd frontend && CI=true npx react-scripts build` — compiles
- [x] `grep -rn --include="*.js" fund_allocation api backend/routes frontend/src` returns nothing
- [x] Every mutation handler in `api/collections.js`, `api/expenses.js`, and `api/auth.js` calls `logActivity` inside a `db.withTransaction` callback — and no handler calls the module-level `db` inside one
- [x] `grep -rn --include="*.js" -e "UPDATE activity_log" -e "DELETE FROM activity_log" api backend` returns nothing: the table is append-only in application code
- [x] A record's log entries survive its soft delete
- [x] `GET /api/activity` answers 200 for `super_admin`, 403 for `admin` and `user`, 401 unauthenticated
- [x] No log entry anywhere contains a password, a hash, or a token

**Not done in this plan, by design:** forms removal, login lockout, password management, and token revocation (Plan 4); production migration (after Plan 4). `auth.password_change` is defined in `ACTIONS` but not yet emitted — Plan 4 wires it when the endpoint exists.

---

## Execution Notes — completed 2026-08-15

Executed on branch `feat/activity-log`. All 12 tasks done; every step verified.

**Final state:** backend 154/155 (the one failure is the known local-only
`googleSheetsService` case this plan predicted), frontend 92/92, `react-scripts
build` compiles.

### Defects found in the plan, and what was done

1. **Task 7 Step 1 — test regex could not match its own implementation.**
   The date-range test asserted `/occurred_at < \$2/`, but Step 3 emits
   `occurred_at < ($2::date + 1)`. Corrected the assertion to
   `/occurred_at < \(\$2::date \+ 1\)/` and added a `params[1]` check. The
   exclusive-day-boundary behaviour was right; only the regex was wrong.

2. **Task 6 — `api/auth.roles.test.js` was not updated.** The plan updated the
   two soft-delete suites for `withTransaction` but missed this Plan 1 suite,
   whose db mock lacked the transaction runner, so `db.withTransaction` was
   undefined and two role tests 500'd. Added `mockTx` + `withTransaction` and
   repointed the role-UPDATE assertion at `mockTx.run`.

3. **Task 10 Step 3 — `withTransaction` had to go on the `getDatabase()`
   wrapper too.** Routes receive `req.db` from `getDatabase()`, not the class
   instance, so a class-only method is invisible to them. Exposed it on both.

4. **Task 9 — two jsdom/CRA gaps.** Rendering the full Dashboard pulls in
   recharts' `ResponsiveContainer`, which constructs a `ResizeObserver` that
   jsdom lacks; added a polyfill to `src/setupTests.js` beside the existing
   `structuredClone` one. Separately, CRA sets `resetMocks: true`, which strips
   implementations declared inside a `jest.mock` factory — `getCollections()`
   returned `undefined` and crashed the render. Moved the return values into
   `beforeEach`.

5. **Task 8 — duplicate label/summary broke three assertions.** A successful
   login's summary is the string `Signed in`, which is also its action label, so
   `getByText(/Signed in/)` matched two elements. `ActivityLogView` now renders
   the summary only when it differs from the label — the row read
   "SIGNED IN  Signed in" otherwise.

6. **Task 10 Steps 5–6 — date formatting bug, caught only end-to-end.** The
   local delete handlers built summaries with `String(before.date).slice(0, 10)`.
   pg returns a `date` column as a `Date`, so this produced
   `"Deleted collection Sat Aug 15 for 5000.00"`. The mocked suites could not
   catch it because they stub `before.date` as a string; only Task 12's live run
   against real PostgreSQL exposed it. Consolidated the formatter into
   `api/_lib/activityLog.js` as `asDateString()` and routed all eight summary
   sites through it, so both servers — which write to the same table — agree.
   Added four unit tests pinning the Date case.

Test-count typos in the plan (Task 3 says 13, is 12; Task 4 says 9, is 8) are
cosmetic and were left alone.

### Task 12 end-to-end results (branch `br-super-resonance-a4koenk7`)

Starting counts: `activity_log` 0 rows, 2 live collections.

- `POST /api/collections` returned **200** (it returned 500 before Task 1) and
  wrote exactly one `record.create` row with the acting email and the returned id.
- A `PUT` changing only `particular` logged `changes` with **exactly one key** —
  confirming Rule 2's normalization: the `numeric` columns (returned as
  `"5000.00"`) and the `date` column (returned as a `Date`) did not register as
  changes.
- After `DELETE`, the record carried `deleted_at`/`deleted_by` and **three** log
  rows survived it — create, update, delete. A repeat delete returned 404.
- `GET /api/activity`: **200** super_admin, **403** admin, **403** user, **401**
  unauthenticated; newest-first with a whole-table `total`.
- Test rows removed; counts confirmed back at 0 / 2.

Verified by inspection: no pooled `db` call appears inside any `withTransaction`
callback (Rule 1), and `logActivity` is called with `db` in exactly one place —
the failed login, which mutates nothing else (Rule 3).

### Carried forward

- **Login logging is Vercel-only.** Task 6 changed `api/auth.js`; Task 10 mirrors
  only collections and expenses, so `backend/routes/auth.js` still logs nothing.
  Local sign-ins therefore produce no `auth.*` rows. This follows the plan's
  stated scope, but Plan 4 should mirror it when it touches the login endpoint.
- The `activity_log` id sequence sits past the deleted test rows. Harmless, and
  production has not been migrated yet.
