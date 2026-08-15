# Church Readiness Hardening — Plan 2: Soft Delete & Per-Record Audit Columns

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make deletion of financial records reversible and attributable — `DELETE` becomes an `UPDATE` stamping `deleted_at`/`deleted_by`, `PUT` stamps `updated_at`/`updated_by`, and every read of `collections` or `expenses` excludes soft-deleted rows.

**Architecture:** The columns already exist on the Neon development branch (applied in Plan 1, Task 2). This plan changes behaviour only. The highest-consequence failure mode is a *missed* read site quietly leaking deleted records into financial totals, so every read goes through one shared SQL predicate (`notDeleted()`) rather than 30 hand-written clauses, and each read surface gets its own regression test. As in Plan 1, `api/` (Vercel) and `backend/routes/` (local Express) are duplicated implementations and both must change together.

**Tech Stack:** Node 18+, Express 4, PostgreSQL (Neon), Jest 30, Supertest 7, React 18.

---

## Context You Need Before Starting

**Plan 1 is merged to `main`.** The role gates, `api/_lib/expressAuth.js`, and `backend/jest.config.js` are already in place. The four audit columns and the `activity_log` table already exist on the development branch. This plan adds no schema.

**Jest 30 flag.** `--testPathPatterns` (plural) in `backend/`. The frontend's older Jest uses the singular `--testPathPattern`.

**Always run backend tests from `backend/`.** Running `npx jest` from the repo root picks up a different, npx-fetched Jest that ignores `backend/jest.config.js` and fails with `Cannot find module 'supertest'`. If you see that error, you are in the wrong directory.

**`jest.mock()` factories may only close over `mock`-prefixed names.** Jest hoists `jest.mock()` above your `const` declarations. A factory referencing a plain `db` throws `Invalid variable access: db` and the whole suite fails to load. Name the shared mock `mockDb`. This bit Plan 1 — do not repeat it.

**The dev JWT secret** used by tests is the literal `your-secret-key-change-this`.

**Existing test patterns:** `api/collections.auth.test.js` (mock `./_lib/database`, mount the exported app, sign a JWT, drive with Supertest) and `backend/routes/collections.dupe.test.js` (inject a fake `req.db` and inspect the captured SQL).

**How these tests assert.** The read-filter tests assert on the **SQL text** the handler sends to the database. That is more implementation-coupled than asserting on returned rows, and it is a deliberate trade: the mocked `db` never actually filters anything, so a row-level assertion would pass even with the filter missing. The SQL assertion is what actually catches a missed read site. Task 12 adds one real end-to-end check against the development branch to cover what the mocks cannot.

**Database branches.** Neon project `small-bar-42939262`, development branch `br-super-resonance-a4koenk7`. Production migration is still deferred until after Plan 4.

**The local Express server only translates `?` → `$n`.** `backend/config/database-pg.js:325-341` does nothing else. Any `strftime(...)` left in `backend/routes/` is already broken against PostgreSQL — a pre-existing bug (e.g. `backend/routes/expenses.js:35`). Do not try to fix it here; just do not introduce more.

---

## Two Non-Obvious Rules

These are the two places where "add the filter everywhere" is the *wrong* answer. Both are easy to get wrong and neither is called out in the spec.

**Rule 1 — the control-number query must NOT be filtered.** `collections.control_number` carries a `UNIQUE` constraint (`collections_control_number_key`). `api/collections.js:110` finds the highest existing control number to generate the next one. A soft-deleted row still occupies its control number. Filtering deleted rows out of that query makes it generate a number that collides with a soft-deleted row, and the insert fails on the unique constraint. This query must keep seeing every row.

**Rule 2 — in a `LEFT JOIN`, the filter goes in the `ON` clause, never the `WHERE`.** `api/budget.js:165` and `:200` left-join `expenses` onto budget categories. Moving the predicate to `WHERE` converts the outer join to an inner one and silently drops every budget category with no matching expense, so categories vanish from the comparison report.

---

## File Structure

**Created:**
- `api/_lib/softDelete.js` — the shared `notDeleted()` predicate; deliberately zero-dependency
- `api/_lib/softDelete.test.js` — unit tests for it
- `api/collections.softdelete.test.js` — delete/update behaviour and read filtering for collections
- `api/expenses.softdelete.test.js` — same for expenses
- `api/reads.softdelete.test.js` — read-surface regression tests for reports, budget, webhooks

**Modified:**
- `api/_lib/database.js` — re-export `notDeleted`
- `api/collections.js`, `api/expenses.js` — soft delete, audit stamps, read filters
- `api/reports.js`, `api/budget.js`, `api/webhooks.js`, `api/forms.js` — read filters
- `backend/routes/collections.js`, `expenses.js`, `reports.js`, `budget.js`, `webhooks.js`, `forms.js` — mirror all of the above

**Why `api/_lib/softDelete.js` and not `api/_lib/database.js`:** the spec says the fragment is exported from `database.js`, and Task 1 does re-export it from there so that interface holds. But the predicate itself lives in its own file because `backend/routes/` needs it too, and requiring `api/_lib/database.js` from the local Express server would instantiate a second `pg` Pool inside a process that already has its own database connection. A zero-dependency module can be required safely from both.

**Not in this plan, by design:** the activity log (Plan 3), a restore UI (out of scope per spec — recovery is a manual `UPDATE ... SET deleted_at = NULL`), and any frontend display of "last edited by". The columns exist to make that display cheap later; nothing renders them yet.

---

## Task 1: The Shared `notDeleted` Predicate

**Files:**
- Create: `api/_lib/softDelete.js`, `api/_lib/softDelete.test.js`
- Modify: `api/_lib/database.js`

- [x] **Step 1: Write the failing test**

Create `api/_lib/softDelete.test.js`:

```javascript
const { notDeleted } = require('./softDelete');

test('notDeleted returns an unqualified predicate by default', () => {
  expect(notDeleted()).toBe('deleted_at IS NULL');
});

test('notDeleted qualifies the column when given a table alias', () => {
  expect(notDeleted('e')).toBe('e.deleted_at IS NULL');
});

test('notDeleted is re-exported from the database module', () => {
  const db = require('./database');
  expect(db.notDeleted('c')).toBe('c.deleted_at IS NULL');
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="softDelete"`
Expected: FAIL — `Cannot find module './softDelete'`.

- [x] **Step 3: Write the implementation**

Create `api/_lib/softDelete.js`:

```javascript
// Zero-dependency on purpose: backend/routes/ requires this file directly, and
// pulling in api/_lib/database.js would instantiate a second pg Pool inside the
// local Express server, which already manages its own connection.

/**
 * SQL predicate selecting only live (non-soft-deleted) rows.
 * Pass a table alias whenever the query touches more than one table.
 *
 * Placement rules:
 *   - building a whereConditions array -> whereConditions.push(notDeleted())
 *   - an existing WHERE clause          -> ` AND ${notDeleted()}`
 *   - a LEFT JOIN                       -> inside the ON clause, never the WHERE
 */
function notDeleted(alias) {
  return alias ? `${alias}.deleted_at IS NULL` : 'deleted_at IS NULL';
}

module.exports = { notDeleted };
```

- [x] **Step 4: Re-export it from the database module**

In `api/_lib/database.js`, add this require at the top of the file, below `const { Pool } = require('pg');`:

```javascript
const { notDeleted } = require('./softDelete');
```

and change the final line from:

```javascript
module.exports = { get, all, run, getPool };
```

to:

```javascript
module.exports = { get, all, run, getPool, notDeleted };
```

- [x] **Step 5: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="softDelete"`
Expected: PASS, 3 tests.

- [x] **Step 6: Commit**

```bash
git add api/_lib/softDelete.js api/_lib/softDelete.test.js api/_lib/database.js
git commit -m "feat: add shared notDeleted SQL predicate"
```

---

## Task 2: Soft Delete and Audit Stamps for Collections (`api/`)

**Files:**
- Create: `api/collections.softdelete.test.js`
- Modify: `api/collections.js`

- [x] **Step 1: Write the failing test**

Create `api/collections.softdelete.test.js`:

```javascript
const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockDb = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 1 })),
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

const sqlOf = (calls) => calls.map(([sql]) => sql);

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.all.mockResolvedValue([]);
  mockDb.get.mockResolvedValue(null);
});

describe('collections soft delete', () => {
  test('DELETE issues an UPDATE stamping deleted_at, not a physical DELETE', async () => {
    const res = await request(app).delete('/api/collections/7').set('Authorization', ADMIN);

    expect(res.status).toBe(200);
    const statements = sqlOf(mockDb.run.mock.calls);
    const stamp = statements.find((s) => /UPDATE collections/i.test(s));
    expect(stamp).toMatch(/deleted_at\s*=\s*now\(\)/i);
    expect(stamp).toMatch(/deleted_by/i);
    expect(statements.some((s) => /DELETE\s+FROM\s+collections/i.test(s))).toBe(false);
  });

  test('DELETE records the acting user as deleted_by', async () => {
    await request(app).delete('/api/collections/7').set('Authorization', ADMIN);

    const call = mockDb.run.mock.calls.find(([sql]) => /UPDATE collections/i.test(sql));
    expect(call[1]).toContain('admin@sbcc.church');
  });

  test('DELETE preserves the fund_allocation children', async () => {
    await request(app).delete('/api/collections/7').set('Authorization', ADMIN);

    const statements = sqlOf(mockDb.run.mock.calls);
    expect(statements.some((s) => /DELETE\s+FROM\s+fund_allocation/i.test(s))).toBe(false);
  });

  test('deleting an already-deleted record returns 404', async () => {
    mockDb.run.mockResolvedValue({ changes: 0 });

    const res = await request(app).delete('/api/collections/7').set('Authorization', ADMIN);
    expect(res.status).toBe(404);
  });

  test('PUT stamps updated_at and updated_by', async () => {
    const res = await request(app)
      .put('/api/collections/7')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    expect(res.status).toBe(200);
    const call = mockDb.run.mock.calls.find(([sql]) => /UPDATE collections/i.test(sql));
    expect(call[0]).toMatch(/updated_at\s*=\s*now\(\)/i);
    expect(call[0]).toMatch(/updated_by/i);
    expect(call[1]).toContain('admin@sbcc.church');
  });

  test('PUT refuses to resurrect a soft-deleted record', async () => {
    const call = () =>
      mockDb.run.mock.calls.find(([sql]) => /UPDATE collections/i.test(sql));

    await request(app)
      .put('/api/collections/7')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    expect(call()[0]).toMatch(/deleted_at IS NULL/i);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="collections.softdelete"`
Expected: FAIL — the delete tests find a physical `DELETE FROM collections`, and the PUT tests find no `updated_at`.

- [x] **Step 3: Import the predicate**

At the top of `api/collections.js`, change:

```javascript
const db = require('./_lib/database');
```

to:

```javascript
const db = require('./_lib/database');
const { notDeleted } = require('./_lib/softDelete');
```

- [x] **Step 4: Replace the DELETE handler**

In `api/collections.js`, replace the whole `app.delete('/api/collections/:id', ...)` handler body with:

```javascript
// DELETE /api/collections/:id  — soft delete; the row and its fund_allocation
// children are preserved. Recovery is a manual UPDATE ... SET deleted_at = NULL.
app.delete('/api/collections/:id', verifyToken, canMutate, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.run(
      `UPDATE collections SET deleted_at = now(), deleted_by = $1
       WHERE id = $2 AND ${notDeleted()}`,
      [req.user.email, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    res.json({ message: 'Collection deleted successfully' });
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

Note the `DELETE FROM fund_allocation` statement is gone entirely — the children stay.

- [x] **Step 5: Stamp the PUT handler**

In the `app.put('/api/collections/:id', ...)` handler, change the `UPDATE collections` statement from:

```javascript
        pbcm_share = $15, pastoral_team_share = $16, operational_fund_share = $17
      WHERE id = $18`,
```

to:

```javascript
        pbcm_share = $15, pastoral_team_share = $16, operational_fund_share = $17,
        updated_at = now(), updated_by = $18
      WHERE id = $19 AND ${notDeleted()}`,
```

and change the last line of its parameter array from:

```javascript
        pbcmShare, pastoralTeamShare, operationalFundShare, id,
```

to:

```javascript
        pbcmShare, pastoralTeamShare, operationalFundShare, req.user.email, id,
```

- [x] **Step 6: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="collections"`
Expected: PASS — 6 new tests, plus the existing `collections.auth` and `collections.dupe` suites still green.

- [x] **Step 7: Commit**

```bash
git add api/collections.js api/collections.softdelete.test.js
git commit -m "feat: soft delete collections and stamp audit columns"
```

---

## Task 3: Soft Delete and Audit Stamps for Expenses (`api/`)

**Files:**
- Create: `api/expenses.softdelete.test.js`
- Modify: `api/expenses.js`

- [x] **Step 1: Write the failing test**

Create `api/expenses.softdelete.test.js`:

```javascript
const request = require('supertest');
const jwt = require('jsonwebtoken');

const mockDb = {
  get: jest.fn(async () => null),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1, lastID: 1 })),
};
jest.mock('./_lib/database', () => ({
  ...mockDb,
  notDeleted: (alias) => (alias ? `${alias}.deleted_at IS NULL` : 'deleted_at IS NULL'),
}));

const app = require('./expenses');
const JWT_SECRET = 'your-secret-key-change-this';
const ADMIN =
  'Bearer ' + jwt.sign({ id: 1, email: 'admin@sbcc.church', role: 'admin' }, JWT_SECRET);

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.run.mockResolvedValue({ changes: 1, lastID: 1 });
  mockDb.all.mockResolvedValue([]);
  mockDb.get.mockResolvedValue(null);
});

describe('expenses soft delete', () => {
  test('DELETE issues an UPDATE stamping deleted_at, not a physical DELETE', async () => {
    const res = await request(app).delete('/api/expenses/7').set('Authorization', ADMIN);

    expect(res.status).toBe(200);
    const statements = mockDb.run.mock.calls.map(([sql]) => sql);
    const stamp = statements.find((s) => /UPDATE expenses/i.test(s));
    expect(stamp).toMatch(/deleted_at\s*=\s*now\(\)/i);
    expect(statements.some((s) => /DELETE\s+FROM\s+expenses/i.test(s))).toBe(false);
  });

  test('DELETE records the acting user as deleted_by', async () => {
    await request(app).delete('/api/expenses/7').set('Authorization', ADMIN);

    const call = mockDb.run.mock.calls.find(([sql]) => /UPDATE expenses/i.test(sql));
    expect(call[1]).toContain('admin@sbcc.church');
  });

  test('deleting an already-deleted record returns 404', async () => {
    mockDb.run.mockResolvedValue({ changes: 0 });

    const res = await request(app).delete('/api/expenses/7').set('Authorization', ADMIN);
    expect(res.status).toBe(404);
  });

  test('PUT stamps updated_at and updated_by and will not resurrect a deleted row', async () => {
    const res = await request(app)
      .put('/api/expenses/7')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', supplies: 100 });

    expect(res.status).toBe(200);
    const call = mockDb.run.mock.calls.find(([sql]) => /UPDATE expenses/i.test(sql));
    expect(call[0]).toMatch(/updated_at\s*=\s*now\(\)/i);
    expect(call[0]).toMatch(/deleted_at IS NULL/i);
    expect(call[1]).toContain('admin@sbcc.church');
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="expenses.softdelete"`
Expected: FAIL — physical `DELETE FROM expenses` found, no `updated_at` on the PUT.

- [x] **Step 3: Import the predicate**

At the top of `api/expenses.js`, change:

```javascript
const db = require('./_lib/database');
```

to:

```javascript
const db = require('./_lib/database');
const { notDeleted } = require('./_lib/softDelete');
```

- [x] **Step 4: Replace the DELETE handler**

Replace the whole `app.delete('/api/expenses/:id', ...)` handler with:

```javascript
// DELETE /api/expenses/:id — soft delete; the row is preserved.
app.delete('/api/expenses/:id', verifyToken, canMutate, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.run(
      `UPDATE expenses SET deleted_at = now(), deleted_by = $1
       WHERE id = $2 AND ${notDeleted()}`,
      [req.user.email, id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

- [x] **Step 5: Stamp the PUT handler**

In the `app.put('/api/expenses/:id', ...)` handler, change:

```javascript
        pbcm_share = $15, mission_evangelism = $16, admin_expense = $17, worship_music = $18, discipleship = $19, pastoral_care = $20
      WHERE id = $21`,
```

to:

```javascript
        pbcm_share = $15, mission_evangelism = $16, admin_expense = $17, worship_music = $18, discipleship = $19, pastoral_care = $20,
        updated_at = now(), updated_by = $21
      WHERE id = $22 AND ${notDeleted()}`,
```

and change the last line of its parameter array from:

```javascript
        discipleship || 0, pastoral_care || 0, id,
```

to:

```javascript
        discipleship || 0, pastoral_care || 0, req.user.email, id,
```

- [x] **Step 6: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="expenses"`
Expected: PASS — 4 new tests plus the existing `expenses.auth` suite.

- [x] **Step 7: Commit**

```bash
git add api/expenses.js api/expenses.softdelete.test.js
git commit -m "feat: soft delete expenses and stamp audit columns"
```

---

## Task 4: Filter Every Collections Read (`api/`)

Six read sites in this file. One of them — the control-number query — must deliberately stay unfiltered (Rule 1 above).

**Files:**
- Modify: `api/collections.js`, `api/collections.softdelete.test.js`

- [x] **Step 1: Write the failing test**

Append to `api/collections.softdelete.test.js`:

```javascript
describe('collections read filtering', () => {
  test('the record list excludes deleted rows', async () => {
    await request(app).get('/api/collections').set('Authorization', ADMIN);

    expect(mockDb.all.mock.calls[0][0]).toMatch(/deleted_at IS NULL/i);
  });

  test('the record list still filters by month when both filters apply', async () => {
    await request(app)
      .get('/api/collections?month=8&year=2026')
      .set('Authorization', ADMIN);

    const sql = mockDb.all.mock.calls[0][0];
    expect(sql).toMatch(/deleted_at IS NULL/i);
    expect(sql).toMatch(/to_char/i);
  });

  test('fetching one record by id excludes deleted rows', async () => {
    mockDb.get.mockResolvedValue({ id: 7 });
    await request(app).get('/api/collections/7').set('Authorization', ADMIN);

    const call = mockDb.get.mock.calls.find(([sql]) => /FROM collections/i.test(sql));
    expect(call[0]).toMatch(/deleted_at IS NULL/i);
  });

  test('the detailed summary excludes deleted rows', async () => {
    mockDb.get.mockResolvedValue({});
    await request(app)
      .get('/api/collections/summary/detailed')
      .set('Authorization', ADMIN);

    const call = mockDb.get.mock.calls.find(([sql]) => /total_collections/i.test(sql));
    expect(call[0]).toMatch(/deleted_at IS NULL/i);
  });

  test('the fund allocation summary excludes allocations of deleted collections', async () => {
    mockDb.get.mockResolvedValue({});
    await request(app)
      .get('/api/collections/fund-allocation/summary')
      .set('Authorization', ADMIN);

    const call = mockDb.get.mock.calls.find(([sql]) => /total_tithes/i.test(sql));
    expect(call[0]).toMatch(/JOIN collections/i);
    expect(call[0]).toMatch(/deleted_at IS NULL/i);
  });

  test('duplicate detection ignores deleted rows', async () => {
    await request(app)
      .post('/api/collections')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    const call = mockDb.get.mock.calls.find(([sql]) => /created_by, date FROM collections/i.test(sql));
    expect(call[0]).toMatch(/deleted_at IS NULL/i);
  });

  test('control number generation still sees deleted rows (unique constraint)', async () => {
    await request(app)
      .post('/api/collections')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', general_tithes_offering: 100 });

    const call = mockDb.get.mock.calls.find(([sql]) => /control_number LIKE/i.test(sql));
    expect(call[0]).not.toMatch(/deleted_at IS NULL/i);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="collections.softdelete"`
Expected: FAIL on the six filtering tests. The control-number test passes already — that is intentional; it is a guard against a later over-correction, not a red test.

- [x] **Step 3: Filter the record list**

In the `app.get('/api/collections', ...)` handler, immediately after the `else if (month && year) { ... }` block and before `if (whereConditions.length > 0)`, insert:

```javascript
  whereConditions.push(notDeleted());
```

- [x] **Step 4: Filter the single-record read**

Change:

```javascript
    const row = await db.get('SELECT * FROM collections WHERE id = $1', [id]);
```

to:

```javascript
    const row = await db.get(
      `SELECT * FROM collections WHERE id = $1 AND ${notDeleted()}`,
      [id]
    );
```

- [x] **Step 5: Filter the detailed summary**

In `app.get('/api/collections/summary/detailed', ...)`, replace the where-building block:

```javascript
  let whereClause = '';
  let params = [];

  if (month && year) {
    whereClause = " WHERE to_char(date, 'YYYY-MM') = $1";
    params.push(`${year}-${month.padStart(2, '0')}`);
  }
```

with:

```javascript
  const whereConditions = [notDeleted()];
  const params = [];

  if (month && year) {
    whereConditions.push("to_char(date, 'YYYY-MM') = $1");
    params.push(`${year}-${month.padStart(2, '0')}`);
  }

  const whereClause = ' WHERE ' + whereConditions.join(' AND ');
```

The rest of the handler is unchanged — it already interpolates `${whereClause}`.

- [x] **Step 6: Fix the fund allocation summary**

`fund_allocation` has no foreign key to `collections`, so soft-deleting a collection leaves its allocation row behind and still counted. The query must join.

In `app.get('/api/collections/fund-allocation/summary', ...)`, replace the where-building block:

```javascript
  let whereClause = '';
  let params = [];

  if (month && year) {
    whereClause = " WHERE to_char(date, 'YYYY-MM') = $1";
    params.push(`${year}-${month.padStart(2, '0')}`);
  }
```

with:

```javascript
  const whereConditions = [notDeleted('c')];
  const params = [];

  if (month && year) {
    whereConditions.push("to_char(fa.date, 'YYYY-MM') = $1");
    params.push(`${year}-${month.padStart(2, '0')}`);
  }

  const whereClause = ' WHERE ' + whereConditions.join(' AND ');
```

and replace the query itself:

```javascript
      `SELECT
        SUM(general_tithes_amount) as total_tithes,
        SUM(pbcm_allocation) as total_pbcm,
        SUM(pastoral_team_allocation) as total_pastoral,
        SUM(operational_allocation) as total_operational
      FROM fund_allocation${whereClause}`,
```

with:

```javascript
      `SELECT
        SUM(fa.general_tithes_amount) as total_tithes,
        SUM(fa.pbcm_allocation) as total_pbcm,
        SUM(fa.pastoral_team_allocation) as total_pastoral,
        SUM(fa.operational_allocation) as total_operational
      FROM fund_allocation fa
      JOIN collections c ON c.id = fa.collection_id${whereClause}`,
```

Both `fund_allocation` and `collections` have a `date` column, so every column reference here must be alias-qualified or PostgreSQL raises `column reference "date" is ambiguous`.

- [x] **Step 7: Filter duplicate detection**

A record that was deleted should not block re-entering the same figures. Change:

```javascript
      'SELECT id, created_by, date FROM collections WHERE date = $1 AND total_amount = $2',
```

to:

```javascript
      `SELECT id, created_by, date FROM collections
       WHERE date = $1 AND total_amount = $2 AND ${notDeleted()}`,
```

- [x] **Step 8: Leave the control-number query alone**

Find this query and add the comment above it. Do **not** add a filter:

```javascript
      // Deliberately unfiltered: control_number is UNIQUE, and a soft-deleted row
      // still occupies its number. Filtering here would generate a colliding value.
      `SELECT control_number FROM collections WHERE control_number LIKE $1 ORDER BY control_number DESC LIMIT 1`,
```

- [x] **Step 9: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="collections"`
Expected: PASS — 13 tests in `collections.softdelete`, plus `collections.auth` and `collections.dupe` still green.

- [x] **Step 10: Commit**

```bash
git add api/collections.js api/collections.softdelete.test.js
git commit -m "feat: exclude soft-deleted collections from every read"
```

---

## Task 5: Filter Every Expenses Read (`api/`)

Three read sites. No control-number equivalent here — `expenses` has no unique business key.

**Files:**
- Modify: `api/expenses.js`, `api/expenses.softdelete.test.js`

- [x] **Step 1: Write the failing test**

Append to `api/expenses.softdelete.test.js`:

```javascript
describe('expenses read filtering', () => {
  test('the record list excludes deleted rows', async () => {
    await request(app).get('/api/expenses').set('Authorization', ADMIN);

    expect(mockDb.all.mock.calls[0][0]).toMatch(/deleted_at IS NULL/i);
  });

  test('fetching one record by id excludes deleted rows', async () => {
    mockDb.get.mockResolvedValue({ id: 7 });
    await request(app).get('/api/expenses/7').set('Authorization', ADMIN);

    const call = mockDb.get.mock.calls.find(([sql]) => /FROM expenses/i.test(sql));
    expect(call[0]).toMatch(/deleted_at IS NULL/i);
  });

  test('duplicate detection ignores deleted rows', async () => {
    await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', category: 'supplies', supplies: 100 });

    const call = mockDb.get.mock.calls.find(([sql]) => /created_by, date FROM expenses/i.test(sql));
    expect(call[0]).toMatch(/deleted_at IS NULL/i);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="expenses.softdelete"`
Expected: FAIL on all three.

- [x] **Step 3: Filter the record list**

In `app.get('/api/expenses', ...)`, immediately after the `else if (month && year) { ... }` block and before `if (whereConditions.length > 0)`, insert:

```javascript
  whereConditions.push(notDeleted());
```

- [x] **Step 4: Filter the single-record read**

Change:

```javascript
    const row = await db.get('SELECT * FROM expenses WHERE id = $1', [id]);
```

to:

```javascript
    const row = await db.get(
      `SELECT * FROM expenses WHERE id = $1 AND ${notDeleted()}`,
      [id]
    );
```

- [x] **Step 5: Filter duplicate detection**

Change:

```javascript
      'SELECT id, created_by, date FROM expenses WHERE date = $1 AND total_amount = $2',
```

to:

```javascript
      `SELECT id, created_by, date FROM expenses
       WHERE date = $1 AND total_amount = $2 AND ${notDeleted()}`,
```

- [x] **Step 6: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="expenses"`
Expected: PASS, 7 tests in `expenses.softdelete`.

- [x] **Step 7: Commit**

```bash
git add api/expenses.js api/expenses.softdelete.test.js
git commit -m "feat: exclude soft-deleted expenses from every read"
```

---

## Task 6: Filter the Remaining Read Surfaces (`api/`)

Reports (which also feeds the Google Sheets export), budget comparison, and the webhook financial summary. These are the surfaces where a leak turns into a wrong number on a financial report, so each gets its own test.

**Files:**
- Create: `api/reads.softdelete.test.js`
- Modify: `api/reports.js`, `api/budget.js`, `api/webhooks.js`

- [x] **Step 1: Write the failing test**

Create `api/reads.softdelete.test.js`:

```javascript
const fs = require('fs');
const path = require('path');

// These four files each read collections/expenses for a financial surface. A
// missed filter here puts deleted money back into a report, so assert on the
// source directly: every SELECT touching either table must carry the predicate.
const FILES = ['reports.js', 'budget.js', 'webhooks.js', 'forms.js'];

const readSource = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');

describe.each(FILES)('%s read surfaces', (file) => {
  test('every collections/expenses SELECT filters soft-deleted rows', () => {
    const source = readSource(file);

    // Split on statement boundaries so each SELECT is checked on its own.
    const selects = source
      .split(/db\.(?:get|all)\(/)
      .slice(1)
      .filter((chunk) => /FROM\s+(collections|expenses)\b/i.test(chunk));

    expect(selects.length).toBeGreaterThan(0);

    for (const stmt of selects) {
      const head = stmt.slice(0, stmt.indexOf('`', stmt.indexOf('`') + 1) + 1);
      expect(head).toMatch(/deleted_at IS NULL/i);
    }
  });
});

describe('budget comparison', () => {
  test('places the filter in the LEFT JOIN ON clause, not the WHERE', () => {
    const source = readSource('budget.js');
    const joins = source.match(/LEFT JOIN expenses e ON[\s\S]*?(?=\n\s*(?:WHERE|GROUP|ORDER|`))/gi) || [];

    expect(joins.length).toBe(2);
    for (const join of joins) {
      expect(join).toMatch(/e\.deleted_at IS NULL/i);
    }
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `cd backend && npx jest --testPathPatterns="reads.softdelete"`
Expected: FAIL for all four files and for the budget join test.

- [x] **Step 3: Filter the report reads**

`api/reports.js` feeds both the report endpoints and the Google Sheets export (`buildSheetGrids` at line 173 consumes exactly these two result sets), so fixing these two queries covers both surfaces.

Add the import at the top of `api/reports.js`:

```javascript
const { notDeleted } = require('./_lib/softDelete');
```

Change:

```javascript
      "SELECT * FROM collections WHERE date >= $1 AND date <= $2 ORDER BY date",
```

to:

```javascript
      `SELECT * FROM collections WHERE date >= $1 AND date <= $2 AND ${notDeleted()} ORDER BY date`,
```

and change:

```javascript
      "SELECT * FROM expenses WHERE date >= $1 AND date <= $2 ORDER BY date",
```

to:

```javascript
      `SELECT * FROM expenses WHERE date >= $1 AND date <= $2 AND ${notDeleted()} ORDER BY date`,
```

- [x] **Step 4: Filter the budget comparison joins**

Add the import at the top of `api/budget.js`:

```javascript
const { notDeleted } = require('./_lib/softDelete');
```

These are `LEFT JOIN`s. The predicate goes in the `ON` clause — moving it to `WHERE` would drop every budget category with no matching expense (Rule 2).

Change:

```javascript
      LEFT JOIN expenses e ON e.category = bc.category AND e.subcategory = bc.subcategory AND ${dateFilter}
```

to:

```javascript
      LEFT JOIN expenses e ON e.category = bc.category AND e.subcategory = bc.subcategory AND ${notDeleted('e')} AND ${dateFilter}
```

and change:

```javascript
      LEFT JOIN expenses e ON e.category = bc.category
        AND (bc.subcategory IS NULL OR e.subcategory = bc.subcategory)
        AND to_char(e.date, 'YYYY') = $${params.length}
```

to:

```javascript
      LEFT JOIN expenses e ON e.category = bc.category
        AND (bc.subcategory IS NULL OR e.subcategory = bc.subcategory)
        AND ${notDeleted('e')}
        AND to_char(e.date, 'YYYY') = $${params.length}
```

- [x] **Step 5: Filter the webhook reads**

Add the import at the top of `api/webhooks.js`:

```javascript
const { notDeleted } = require('./_lib/softDelete');
```

There are five reads. Change each as follows.

The year-to-date expense total:

```javascript
      `SELECT SUM(total_amount) as ytd_expenses FROM expenses WHERE to_char(date, 'YYYY') = $1 AND ${notDeleted()}`,
```

The financial summary pair:

```javascript
      `SELECT COUNT(*) as count, SUM(total_amount) as total,
        SUM(general_tithes_offering) as tithes, SUM(bank_interest) as interest
      FROM collections WHERE date BETWEEN $1 AND $2 AND ${notDeleted()}`,
```

```javascript
      `SELECT COUNT(*) as count, SUM(total_amount) as total,
        SUM(pbcm_share_expense) as pbcm, SUM(pastoral_worker_support) as pastoral
      FROM expenses WHERE date BETWEEN $1 AND $2 AND ${notDeleted()}`,
```

And the recent-activity `UNION ALL` — add the predicate to **both** halves:

```javascript
      FROM collections
      WHERE created_at > NOW() - INTERVAL '${hours} hours' AND ${notDeleted()}
```

```javascript
      FROM expenses
      WHERE created_at > NOW() - INTERVAL '${hours} hours' AND ${notDeleted()}
```

- [x] **Step 6: Filter the forms reads (interim)**

`api/forms.js` is deleted entirely in Plan 4, but until then its two debug endpoints are publicly readable and would expose soft-deleted records. Filter them now; the whole file goes later.

Add the import at the top of `api/forms.js`:

```javascript
const { notDeleted } = require('./_lib/softDelete');
```

Change the expense lookup:

```javascript
      `SELECT id, total_amount FROM expenses
```

so that its `WHERE` clause gains `AND ${notDeleted()}`, and change both debug listings:

```javascript
      `SELECT 'collection' as type, date, particular, total_amount, created_by, submitted_via FROM collections WHERE submitted_via = 'google_form' AND ${notDeleted()} ORDER BY created_at DESC LIMIT $1`,
```

```javascript
      `SELECT 'expense' as type, date, particular, total_amount, created_by, submitted_via FROM expenses WHERE submitted_via = 'google_form' AND ${notDeleted()} ORDER BY created_at DESC LIMIT $1`,
```

- [x] **Step 7: Run to verify it passes**

Run: `cd backend && npx jest --testPathPatterns="reads.softdelete"`
Expected: PASS, 5 tests.

- [x] **Step 8: Run the whole api suite**

Run: `cd backend && npx jest --testPathPatterns="api"`
Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add api/reports.js api/budget.js api/webhooks.js api/forms.js api/reads.softdelete.test.js
git commit -m "feat: exclude soft-deleted records from reports, budget, and webhook reads"
```

---

## Task 7: Mirror Soft Delete in `backend/routes/`

Without this the local dev server still hard-deletes, so a bug found locally will not reproduce in production — and worse, local testing physically destroys rows.

`backend/routes/` files use callback-style `req.db` and `?` placeholders. The adapter converts `?` to `$n` and nothing else, so write plain SQL and keep `?` for parameters.

**Files:**
- Modify: `backend/routes/collections.js`, `backend/routes/expenses.js`

- [x] **Step 1: Import the predicate in both files**

At the top of `backend/routes/collections.js` and `backend/routes/expenses.js`, after the existing requires, add:

```javascript
const { notDeleted } = require('../../api/_lib/softDelete');
```

This is safe because `api/_lib/softDelete.js` has no dependencies — it does not pull the `pg` Pool from `api/_lib/database.js` into this process.

- [x] **Step 2: Replace the collections DELETE handler**

In `backend/routes/collections.js`, replace the whole `router.delete("/:id", ...)` handler with:

```javascript
// Soft delete: the row and its fund_allocation children are preserved.
router.delete("/:id", authenticateToken, canMutate, (req, res) => {
  const { id } = req.params;

  req.db.run(
    `UPDATE collections SET deleted_at = now(), deleted_by = ? WHERE id = ? AND ${notDeleted()}`,
    [req.user.email, id],
    function (err) {
      if (err) {
        console.error("Database error:", err.message);
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "Collection not found" });
      }
      res.json({ message: "Collection deleted successfully" });
    }
  );
});
```

The previous handler's `DELETE FROM fund_allocation` step is gone.

- [x] **Step 3: Replace the expenses DELETE handler**

In `backend/routes/expenses.js`, replace the whole `router.delete("/:id", ...)` handler with:

```javascript
// Soft delete: the row is preserved.
router.delete("/:id", authenticateToken, canMutate, (req, res) => {
  const { id } = req.params;

  req.db.run(
    `UPDATE expenses SET deleted_at = now(), deleted_by = ? WHERE id = ? AND ${notDeleted()}`,
    [req.user.email, id],
    function (err) {
      if (err) {
        console.error("Database error:", err.message);
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "Expense not found" });
      }
      res.json({ message: "Expense deleted successfully" });
    }
  );
});
```

- [x] **Step 4: Stamp the collections PUT handler**

In `backend/routes/collections.js`, change the `UPDATE collections SET` template literal (around line 313) from:

```javascript
    UPDATE collections SET
      date = ?, particular = ?, control_number = ?, payment_method = ?, total_amount = ?,
      general_tithes_offering = ?, bank_interest = ?,
      sisterhood_san_juan = ?, sisterhood_labuin = ?, brotherhood = ?, youth = ?, couples = ?, 
      sunday_school = ?, special_purpose_pledge = ?,
      pbcm_share = ?, pastoral_team_share = ?, operational_fund_share = ?
    WHERE id = ?
```

to:

```javascript
    UPDATE collections SET
      date = ?, particular = ?, control_number = ?, payment_method = ?, total_amount = ?,
      general_tithes_offering = ?, bank_interest = ?,
      sisterhood_san_juan = ?, sisterhood_labuin = ?, brotherhood = ?, youth = ?, couples = ?, 
      sunday_school = ?, special_purpose_pledge = ?,
      pbcm_share = ?, pastoral_team_share = ?, operational_fund_share = ?,
      updated_at = now(), updated_by = ?
    WHERE id = ? AND ${notDeleted()}
```

Note this makes the surrounding string a template literal — if it is currently declared with `const query = \`` it already is one, so no quote change is needed.

Then in its parameter array, change:

```javascript
      operationalFundShare,
      id,
    ],
```

to:

```javascript
      operationalFundShare,
      req.user.email,
      id,
    ],
```

- [x] **Step 5: Stamp the expenses PUT handler**

In `backend/routes/expenses.js`, change the `UPDATE expenses SET` template literal (around line 281) from:

```javascript
    UPDATE expenses SET
      date = ?, particular = ?, forms_number = ?, cheque_number = ?, total_amount = ?,
      workers_share = ?, fellowship_expense = ?, supplies = ?, utilities = ?, building_maintenance = ?,
      benevolence_donations = ?, honorarium = ?, vehicle_maintenance = ?, gasoline_transport = ?,
      pbcm_share = ?, mission_evangelism = ?, admin_expense = ?, worship_music = ?, discipleship = ?, pastoral_care = ?
    WHERE id = ?
```

to:

```javascript
    UPDATE expenses SET
      date = ?, particular = ?, forms_number = ?, cheque_number = ?, total_amount = ?,
      workers_share = ?, fellowship_expense = ?, supplies = ?, utilities = ?, building_maintenance = ?,
      benevolence_donations = ?, honorarium = ?, vehicle_maintenance = ?, gasoline_transport = ?,
      pbcm_share = ?, mission_evangelism = ?, admin_expense = ?, worship_music = ?, discipleship = ?, pastoral_care = ?,
      updated_at = now(), updated_by = ?
    WHERE id = ? AND ${notDeleted()}
```

Then in its parameter array, change:

```javascript
      discipleship || 0,
      pastoral_care || 0,
      id,
```

to:

```javascript
      discipleship || 0,
      pastoral_care || 0,
      req.user.email,
      id,
```

Because these use positional `?` placeholders rather than numbered ones, no renumbering is needed — only the parameter array order matters.

- [x] **Step 6: Verify the existing route tests still pass**

Run: `cd backend && npx jest --testPathPatterns="routes"`
Expected: PASS. `collections.dupe.test.js` drives `POST` only and is unaffected by these handlers.

- [x] **Step 7: Commit**

```bash
git add backend/routes/collections.js backend/routes/expenses.js
git commit -m "feat: mirror soft delete on the local Express server"
```

---

## Task 8: Mirror Read Filtering in `backend/routes/`

**Files:**
- Modify: `backend/routes/collections.js`, `expenses.js`, `reports.js`, `budget.js`, `webhooks.js`, `forms.js`

- [x] **Step 1: Filter the two record lists**

In `backend/routes/collections.js` and `backend/routes/expenses.js`, each `router.get("/")` handler builds a `whereConditions` array. In both, immediately after the `else if (month && year) { ... }` block, insert:

```javascript
  whereConditions.push(notDeleted());
```

- [x] **Step 2: Filter the single-record reads**

In `backend/routes/collections.js`:

```javascript
  req.db.get(`SELECT * FROM collections WHERE id = ? AND ${notDeleted()}`, [id], async (err, row) => {
```

In `backend/routes/expenses.js`:

```javascript
  req.db.get(`SELECT * FROM expenses WHERE id = ? AND ${notDeleted()}`, [id], (err, row) => {
```

- [x] **Step 3: Filter both duplicate-detection queries**

In `backend/routes/collections.js`:

```javascript
          `SELECT id, created_by, date FROM collections WHERE date = ? AND total_amount = ? AND payment_method = ? AND ${notDeleted()}`,
```

In `backend/routes/expenses.js`:

```javascript
        `SELECT id, created_by, date FROM expenses WHERE date = ? AND total_amount = ? AND ${notDeleted()}`,
```

- [x] **Step 4: Leave the control-number query alone**

In `backend/routes/collections.js`, add the comment above the `control_number LIKE` query and add no filter — same reason as Task 4, Step 8:

```javascript
          // Deliberately unfiltered: control_number is UNIQUE, and a soft-deleted
          // row still occupies its number.
          `SELECT control_number FROM collections WHERE control_number LIKE ? ORDER BY control_number DESC LIMIT 1`,
```

- [x] **Step 5: Filter the collections detailed summary**

In `backend/routes/collections.js`, replace the where-building block for the `summary/detailed` route:

```javascript
  if (month && year) {
    whereClause = ' WHERE strftime("%Y-%m", date) = ?';
    params.push(`${year}-${month.padStart(2, "0")}`);
  }
```

with:

```javascript
  const whereConditions = [notDeleted()];
  if (month && year) {
    whereConditions.push(`to_char(date, 'YYYY-MM') = ?`);
    params.push(`${year}-${month.padStart(2, "0")}`);
  }
  whereClause = ' WHERE ' + whereConditions.join(' AND ');
```

This also replaces the SQLite-only `strftime` with the PostgreSQL `to_char` the adapter actually needs, matching what `api/collections.js` already does.

- [x] **Step 6: Fix the fund allocation summary**

Apply the same join as Task 4, Step 6. Replace the `FROM fund_allocation${whereClause}` query with:

```javascript
    SELECT
      SUM(fa.general_tithes_amount) as total_tithes,
      SUM(fa.pbcm_allocation) as total_pbcm,
      SUM(fa.pastoral_team_allocation) as total_pastoral,
      SUM(fa.operational_allocation) as total_operational
    FROM fund_allocation fa
    JOIN collections c ON c.id = fa.collection_id${whereClause}
```

and replace that route's where-building block:

```javascript
  if (month && year) {
    whereClause = ' WHERE strftime("%Y-%m", date) = ?';
    params.push(`${year}-${month.padStart(2, "0")}`);
  }
```

with:

```javascript
  const whereConditions = [notDeleted('c')];
  if (month && year) {
    whereConditions.push(`to_char(fa.date, 'YYYY-MM') = ?`);
    params.push(`${year}-${month.padStart(2, "0")}`);
  }
  whereClause = ' WHERE ' + whereConditions.join(' AND ');
```

Both tables have a `date` column, so the month filter must be qualified as `fa.date` or PostgreSQL raises `column reference "date" is ambiguous`.

- [x] **Step 7: Filter reports, budget, webhooks, and forms**

Add the import to each of `backend/routes/reports.js`, `budget.js`, `webhooks.js`, and `forms.js`:

```javascript
const { notDeleted } = require('../../api/_lib/softDelete');
```

**`backend/routes/reports.js`** — change:

```javascript
    const collections = await dbAll(req.db, "SELECT * FROM collections WHERE date >= ? AND date <= ? ORDER BY date", [dateFrom, dateTo]);
    const expenses = await dbAll(req.db, "SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date", [dateFrom, dateTo]);
```

to:

```javascript
    const collections = await dbAll(req.db, `SELECT * FROM collections WHERE date >= ? AND date <= ? AND ${notDeleted()} ORDER BY date`, [dateFrom, dateTo]);
    const expenses = await dbAll(req.db, `SELECT * FROM expenses WHERE date >= ? AND date <= ? AND ${notDeleted()} ORDER BY date`, [dateFrom, dateTo]);
```

Note both become template literals — the quotes change from `"` to backticks.

**`backend/routes/budget.js`** — the predicate goes in the `ON` clause (Rule 2). Change:

```javascript
    LEFT JOIN expenses e ON e.category = bc.category AND e.subcategory = bc.subcategory AND ${dateFilter}
```

to:

```javascript
    LEFT JOIN expenses e ON e.category = bc.category AND e.subcategory = bc.subcategory AND ${notDeleted('e')} AND ${dateFilter}
```

and change:

```javascript
    LEFT JOIN expenses e ON e.category = bc.category 
      AND (bc.subcategory IS NULL OR e.subcategory = bc.subcategory)
      AND strftime('%Y', e.date) = ?
```

to:

```javascript
    LEFT JOIN expenses e ON e.category = bc.category 
      AND (bc.subcategory IS NULL OR e.subcategory = bc.subcategory)
      AND ${notDeleted('e')}
      AND strftime('%Y', e.date) = ?
```

Leave the `strftime` alone — it is a pre-existing PostgreSQL incompatibility and fixing it is out of scope here.

**`backend/routes/webhooks.js`** — five reads. Change the financial-summary pair:

```javascript
    FROM collections
    WHERE date BETWEEN ? AND ?`,
```

to:

```javascript
    FROM collections
    WHERE date BETWEEN ? AND ? AND ${notDeleted()}`,
```

and:

```javascript
        FROM expenses
        WHERE date BETWEEN ? AND ?`,
```

to:

```javascript
        FROM expenses
        WHERE date BETWEEN ? AND ? AND ${notDeleted()}`,
```

Change the year-to-date total:

```javascript
        `SELECT SUM(total_amount) as ytd_expenses
         FROM expenses
         WHERE strftime('%Y', date) = ?`,
```

to:

```javascript
        `SELECT SUM(total_amount) as ytd_expenses
         FROM expenses
         WHERE strftime('%Y', date) = ? AND ${notDeleted()}`,
```

And change **both** halves of the recent-activity `UNION ALL`:

```javascript
    FROM collections
    WHERE created_at > datetime('now', '-${hours} hours')
```

to:

```javascript
    FROM collections
    WHERE created_at > datetime('now', '-${hours} hours') AND ${notDeleted()}
```

and:

```javascript
    FROM expenses
    WHERE created_at > datetime('now', '-${hours} hours')
```

to:

```javascript
    FROM expenses
    WHERE created_at > datetime('now', '-${hours} hours') AND ${notDeleted()}
```

**`backend/routes/forms.js`** — three reads. Add `AND ${notDeleted()}` to the `WHERE` clause of the `SELECT id, total_amount FROM expenses` lookup, and change both debug listings:

```javascript
    "SELECT 'collection' as type, date, particular, total_amount, created_by, submitted_via FROM collections WHERE submitted_via = 'google_form' ORDER BY created_at DESC LIMIT ?",
```

to:

```javascript
    `SELECT 'collection' as type, date, particular, total_amount, created_by, submitted_via FROM collections WHERE submitted_via = 'google_form' AND ${notDeleted()} ORDER BY created_at DESC LIMIT ?`,
```

and:

```javascript
        "SELECT 'expense' as type, date, particular, total_amount, created_by, submitted_via FROM expenses WHERE submitted_via = 'google_form' ORDER BY created_at DESC LIMIT ?",
```

to:

```javascript
        `SELECT 'expense' as type, date, particular, total_amount, created_by, submitted_via FROM expenses WHERE submitted_via = 'google_form' AND ${notDeleted()} ORDER BY created_at DESC LIMIT ?`,
```

- [x] **Step 8: Verify nothing regressed**

Run: `cd backend && npm test`
Expected: all suites pass except the known local-only `googleSheetsService` failure.

- [x] **Step 9: Commit**

```bash
git add backend/routes/
git commit -m "feat: exclude soft-deleted records from local Express reads"
```

---

## Task 9: End-to-End Verification Against the Development Branch

The mocked tests prove the SQL carries the predicate. This task proves the predicate actually works against a real PostgreSQL database — that the column names are right, the fund-allocation join returns rows, and the budget `LEFT JOIN` still returns categories with no expenses.

**Files:** none (verification only)

- [x] **Step 1: Restart the local server against the development branch**

The server must be running with `NODE_ENV=development` so it loads `backend/.env.development`, which points at `br-super-resonance-a4koenk7`.

Run: `cd backend && npm run dev`
Expected: `🌍 Environment: development` and the server listening on 3001.

- [x] **Step 2: Confirm a baseline count**

Run against Neon project `small-bar-42939262`, branch `br-super-resonance-a4koenk7`:

```sql
SELECT count(*) FILTER (WHERE deleted_at IS NULL) AS live,
       count(*) FILTER (WHERE deleted_at IS NOT NULL) AS deleted
FROM collections;
```

Expected: `deleted` is 0 before you start.

- [x] **Step 3: Soft delete one record through the API and confirm the row survives**

Pick a live collection id from the previous query, then run:

```sql
SELECT id, deleted_at, deleted_by FROM collections WHERE id = <id>;
```

after issuing the DELETE through the running server as an `admin` user. Expected: exactly one row, with `deleted_at` set and `deleted_by` holding the acting email. The row is still present — this is the whole point.

- [x] **Step 4: Confirm the record disappears from every read surface**

```sql
-- the fund_allocation child must survive
SELECT count(*) FROM fund_allocation WHERE collection_id = <id>;
```

Expected: 1.

Then confirm through the API that `GET /api/collections`, `GET /api/collections/:id`, `GET /api/collections/summary/detailed`, and `GET /api/collections/fund-allocation/summary` no longer include or count the deleted record.

- [x] **Step 5: Confirm the budget comparison still lists empty categories**

Call the budget comparison endpoint and confirm categories with zero matching expenses are still present with `actual_amount` 0. If they vanished, the filter was placed in a `WHERE` instead of the `LEFT JOIN ON` — go back to Task 6, Step 4.

- [x] **Step 6: Restore the record**

```sql
UPDATE collections SET deleted_at = NULL, deleted_by = NULL WHERE id = <id>;
```

Expected: the record reappears in every surface. This is also the documented recovery procedure.

- [x] **Step 7: Run the full suites**

Run: `cd backend && npm test`
Expected: all pass except the known local-only `googleSheetsService` failure.

Run: `cd frontend && CI=true npx react-scripts test --watchAll=false`
Expected: all pass. No frontend change is expected in this plan; this confirms none was needed.

Run: `cd frontend && CI=true npx react-scripts build`
Expected: `Compiled successfully.`

- [x] **Step 8: Commit**

```bash
git commit --allow-empty -m "test: verify soft delete end-to-end on the development branch"
```

---

## Verification Before Moving to Plan 3

- [x] `cd backend && npm test` — all pass except the known local-only `googleSheetsService` failure
- [x] `cd frontend && CI=true npx react-scripts test --watchAll=false` — all pass
- [x] `cd frontend && CI=true npx react-scripts build` — compiles
- [x] `grep -rn "DELETE FROM collections\|DELETE FROM expenses" api/ backend/routes/` returns nothing
- [x] Every `FROM collections` / `FROM expenses` read in `api/` and `backend/routes/` carries `deleted_at IS NULL`, except the two control-number queries
- [x] A soft-deleted record is invisible in the record list, single-record read, detailed summary, fund-allocation summary, reports, Sheets export, budget comparison, and webhook summary
- [x] The `fund_allocation` child row of a soft-deleted collection still exists in the database

**Not done in this plan, by design:** the activity log and `GET /api/activity` (Plan 3); forms removal, login lockout, password management, and token revocation (Plan 4); production migration (after Plan 4). No restore UI — recovery is the manual `UPDATE` in Task 9, Step 6.

---

## Execution Notes (2026-08-15)

Deviations from the plan as written, and what could not be verified as specified.

**Task 6's test needed two fixes to be able to pass.** As drafted, `api/reads.softdelete.test.js` scanned the raw source but asserted on `/deleted_at IS NULL/` — a string that never appears there, because the implementation writes `AND ${notDeleted()}`. The assertion now accepts either form (`/deleted_at IS NULL|notDeleted\(/`); `softDelete.test.js` already proves the expansion. Second, the chunk filter matched only `FROM (collections|expenses)`, which `budget.js` never contains — it reaches `expenses` solely through `LEFT JOIN` — so that file's assertion could never find a statement to check. The filter now matches `FROM|JOIN`.

**One read site the plan did not list.** `backend/routes/forms.js` has a fourth read — the Google Forms duplicate check (`SELECT ... FROM expenses WHERE created_by = ? ...`, the `checkDuplicateSql` template). It is filtered here, matching the plan's own rule that a deleted record must not block re-entering the same figures.

**`fund_allocation` does not exist on either Neon branch.** It is a SQLite-era table that never made it into PostgreSQL, so Task 9 Step 4's child-row check could not be run, and `GET /api/collections/fund-allocation/summary` errors with `relation "fund_allocation" does not exist` both before and after this work. The Task 4 / Task 8 join was still applied so the query is correct if the table is ever created; it is not a new regression. Note this also means `POST /api/collections` fails at its `INSERT INTO fund_allocation` step on PostgreSQL — a pre-existing bug worth its own fix.

**Task 9 Step 5 was verified structurally, not from data.** The development branch has zero budget plans, categories, and expenses, so the comparison endpoint returns `[]` and cannot demonstrate anything. Rule 2 was instead proved directly against the branch with synthetic rows: with the predicate in the `ON` clause a category whose only expense is soft-deleted still appears with `actual` 0; moved to the `WHERE` clause that category disappears entirely. Worth noting the plan's stated failure mode is slightly off — for an `IS NULL` predicate, a `WHERE` placement does *not* drop categories with no matching expense at all (their null-extended `deleted_at` is NULL, which passes); it drops categories whose only matching expenses are deleted.

**Two pre-existing PostgreSQL incompatibilities confirmed, not fixed** (out of scope per the plan): `backend/routes/collections.js` and `backend/routes/expenses.js` still use `strftime("%Y-%m", date)` in their list handlers, so `GET /api/collections?month=&year=` fails with `column "%Y-%m" does not exist` on the local server; and `GET /api/budget/available/:year/:category` reuses `$2` for both a `to_char(...) = $2` and a `bp.year = $2` comparison, failing with `operator does not exist: integer = text`. Both reproduce identically on `main`.

**Verified end-to-end on `br-super-resonance-a4koenk7`:** deleting collection 2 through the running dev server left the row in place with `deleted_at` and `deleted_by = admin@sbcc.church` stamped, returned 404 on a repeat delete, and removed it from the record list, the single-record read, and the detailed summary (total 25,830.00 → 20,830.00, records 2 → 1) on both the local Express server and the Vercel `api/` handlers. The manual `UPDATE ... SET deleted_at = NULL` restored it to every surface.
