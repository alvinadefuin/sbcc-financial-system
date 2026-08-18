# Expense Write Path and Budget Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an expense record a single line item — one category, one subcategory, one amount — so `PUT /api/expenses/:id` works at all, pastoral spend reaches the report, and the budget tables exist in production.

**Architecture:** A new shared module, `api/_lib/expenseTaxonomy.js`, owns the only map from subcategory label to amount column to fund. Both expense route implementations classify writes through it instead of trusting a client-supplied `category` or `fund_source`. `reportService` is **not** modified — it already reads amount columns and already sums `fund_source='pastoral_team'` rows, so correct writes light it up on their own. The budget tables are created and seeded by hand-run SQL, per the repo's no-migration-runner convention.

**Tech Stack:** Node.js, CommonJS, Express + Vercel serverless, PostgreSQL (Neon), Jest + supertest (`cd backend && npm test` covers both directories).

**Spec:** `docs/superpowers/specs/2026-08-17-expense-write-path-and-budget-seed-design.md`

---

## Background an engineer needs before starting

**The two-copy rule.** Every endpoint exists twice: `api/*.js` is production (Vercel), `backend/routes/*.js` is local development. A behaviour change to one without the other means local dev silently disagrees with production. Tasks 3 and 4 each edit both copies in the same task — do not split them across commits.

**But `api/_lib/` is shared, not mirrored.** `backend/routes/expenses.js:4-5` requires `../../api/_lib/softDelete` and `../../api/_lib/activityLog` directly. The new taxonomy module lives in `api/_lib/` and is required by both route files. One file, one copy, no parity test needed for it.

**`reportService` is the exception — it is a mirrored pair** (`backend/services/reportService.js` and `api/_lib/reportService.js`), guarded by `backend/services/reportService.parity.test.js`, which compares the two sources line by line after stripping comments. **Neither copy may gain a `require`**, because the relative path would differ between them and the parity test would fail. The dependency runs one way only: `expenseTaxonomy` requires `reportService`, never the reverse.

**Both database layers accept `?` placeholders.** `api/_lib/database.js:31` rewrites `?` to `$1, $2, ...` for PostgreSQL, and its `run()` appends `RETURNING *` to any INSERT so `result.lastID` works. The existing `api/expenses.js` uses `$n` literals; new statements in this plan use `?` in both copies so the two read alike.

**Both copies expose the same transaction helper.** `db.withTransaction(async (tx) => ...)` in the serverless copy, `req.db.withTransaction(...)` in Express. Inside the callback use **only** `tx.run` / `tx.get` — the serverless pool is capped at one connection, so calling the module-level `db.get` inside a transaction deadlocks.

**Why the amount key classifies the row, not `category`.** Mobile renders one amount input per active decimal expense custom field and posts the whole form flat, so the payload carries `utilities: 500` keyed by the real column name — trustworthy — next to a `category` string from a hardcoded list that has drifted (`MobileSubmitForm.js:5` offers `workers_share`, which matches no column). Reading the amount key makes the drifted field irrelevant, which is what lets this change leave both forms alone.

**Zero rows are at stake.** Production `expenses` has never held a row, so there is no data to migrate and no behaviour anyone depends on. `collections` is untouched by this plan.

**Known non-regressions, both documented in `CLAUDE.md`:**
- `backend/services/googleSheetsService.test.js` fails if Google credentials exist locally at `backend/config/google-credentials.json`. Environmental.
- Roughly one run in twenty, a supertest file reports `Exceeded timeout of 5000 ms` or `Parse Error: Expected HTTP/, RTSP/ or ICE/`. Transport-level only — re-run before believing it. **A genuine assertion failure is never this bug.**

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `api/_lib/expenseTaxonomy.js` | Create | The only map: subcategory label ↔ amount column ↔ fund. Classifies a request body into line items |
| `api/_lib/expenseTaxonomy.test.js` | Create | Unit tests for the module, including that its column list matches both schema files |
| `api/_lib/activityLog.js` | Modify (`:39-44`) | `EXPENSE_FIELDS` replaced with the real columns plus the three classifying fields |
| `api/_lib/activityLog.test.js` | Modify | Assert no field in the list is absent from the schema |
| `api/expenses.js` | Modify (`POST` ~`:61-158`, `PUT` ~`:183-270`) | Serverless expense writes |
| `backend/routes/expenses.js` | Modify (`POST` ~`:50-196`, `PUT` ~`:240-330`) | Express expense writes, same behaviour |
| `api/expenses.activity.test.js` | Modify | New cases for classification, fan-out, and the `PUT` repair |
| `backend/services/reportService.test.js` | Modify | Regression tests proving the report needs no change |
| `backend/config/database.js` | Modify | Unique index on `budget_categories`; seven ministry rows in the seed |
| `backend/config/database-pg.js` | Modify | Same unique index, so a fresh database matches production |
| `docs/superpowers/plans/2026-08-19-...-production-sql.md` | N/A | The hand-run SQL lives in Task 6 of this file, not a separate document |
| `CLAUDE.md` | Modify | Drop the stale `fund_allocation` claim; record the line-item model |

`api/_lib/expenseTaxonomy.js` is expected to land at roughly 120 lines. Neither route file grows: the `POST` and `PUT` handlers get shorter, because a 17-name destructure and a 17-term sum are replaced by one call.

---

## Task 1: The taxonomy module

**Files:**
- Create: `api/_lib/expenseTaxonomy.js`
- Create: `api/_lib/expenseTaxonomy.test.js`

- [x] **Step 1: Write the failing test**

Create `api/_lib/expenseTaxonomy.test.js`:

```js
const fs = require('fs');
const path = require('path');
const {
  FUNDS,
  AMOUNT_COLUMNS,
  resolveAmountKey,
  normalizeSubcategory,
  resolveExpenseTarget,
  resolveExpenseLines,
} = require('./expenseTaxonomy');

// The eleven values MobileSubmitForm.js:5 offers as `category`. Ten are amount
// column keys; `workers_share` is not a column at all and needs the alias.
const MOBILE_LEGACY_CATEGORIES = [
  'workers_share', 'supplies', 'utilities', 'building_maintenance',
  'vehicle_maintenance', 'transportation_gas', 'honorarium',
  'fellowship_events', 'abccop_national', 'cbcc_share', 'kabalikat_share',
];

describe('the taxonomy itself', () => {
  test('three funds, each with its fund_source', () => {
    expect(FUNDS.map((f) => [f.category, f.fundSource])).toEqual([
      ['PBCM Share/PDOT', 'pbcm_share'],
      ['Pastoral Team', 'pastoral_team'],
      ['Operational Fund', 'operational'],
    ]);
  });

  test('no subcategory label appears under two funds', () => {
    const labels = FUNDS.flatMap((f) => f.subcategories.map((s) => s.label.toLowerCase()));
    expect(new Set(labels).size).toBe(labels.length);
  });

  test('the seven ministries have no column', () => {
    const pastoral = FUNDS.find((f) => f.category === 'Pastoral Team');
    expect(pastoral.subcategories).toHaveLength(7);
    expect(pastoral.subcategories.every((s) => s.column === null)).toBe(true);
  });

  test('AMOUNT_COLUMNS is the 17 real amount columns', () => {
    expect(AMOUNT_COLUMNS).toHaveLength(17);
    expect(AMOUNT_COLUMNS[0]).toBe('pbcm_share_expense');
  });

  // This is the assertion that would have caught the PUT bug in the first place.
  test('every amount column exists in both schema files', () => {
    const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
    const sqlite = read('../../backend/config/database.js');
    const postgres = read('../../backend/config/database-pg.js');
    for (const col of AMOUNT_COLUMNS) {
      expect(sqlite).toContain(`${col} DECIMAL`);
      expect(postgres).toContain(`${col} DECIMAL`);
    }
  });
});

describe('resolving one value', () => {
  test('an amount column key resolves to its fund and label', () => {
    expect(resolveAmountKey('utilities')).toEqual({
      category: 'Operational Fund',
      subcategory: 'Utilities',
      fundSource: 'operational',
      column: 'utilities',
    });
  });

  test('an unknown amount key resolves to nothing', () => {
    expect(resolveAmountKey('kabisig_fund')).toBeNull();
  });

  test('normalizeSubcategory accepts a canonical label, any case', () => {
    expect(normalizeSubcategory('utilities')).toBe('Utilities');
    expect(normalizeSubcategory('  Building Maintenance ')).toBe('Building Maintenance');
  });

  test('normalizeSubcategory resolves every legacy mobile category', () => {
    for (const value of MOBILE_LEGACY_CATEGORIES) {
      expect(normalizeSubcategory(value)).not.toBeNull();
    }
    expect(normalizeSubcategory('workers_share')).toBe("Pastoral & Worker Support");
  });

  test('normalizeSubcategory rejects the unknown', () => {
    expect(normalizeSubcategory('kabisig_fund')).toBeNull();
    expect(normalizeSubcategory('')).toBeNull();
    expect(normalizeSubcategory(undefined)).toBeNull();
  });

  test('a ministry resolves to the pastoral fund with no column', () => {
    expect(resolveExpenseTarget('Pastoral Team', 'Benevolence')).toEqual({
      category: 'Pastoral Team',
      subcategory: 'Benevolence',
      fundSource: 'pastoral_team',
      column: null,
    });
  });

  test('the subcategory wins; a disagreeing category is ignored', () => {
    expect(resolveExpenseTarget('Operational Fund', 'Benevolence').fundSource).toBe('pastoral_team');
  });

  test('a legacy single category value still classifies', () => {
    expect(resolveExpenseTarget('supplies', undefined).subcategory).toBe('Supplies');
  });
});

describe('resolving a request body into lines', () => {
  test('one amount makes one line', () => {
    const { lines, reason } = resolveExpenseLines({ date: '2026-08-15', utilities: 500 });
    expect(reason).toBeNull();
    expect(lines).toEqual([
      {
        category: 'Operational Fund', subcategory: 'Utilities',
        fundSource: 'operational', column: 'utilities', amount: 500,
      },
    ]);
  });

  test('several amounts make several lines', () => {
    const { lines } = resolveExpenseLines({ date: '2026-08-15', utilities: 500, supplies: 120 });
    expect(lines.map((l) => [l.subcategory, l.amount])).toEqual([
      ['Utilities', 500],
      ['Supplies', 120],
    ]);
  });

  test('zero and blank amounts are not lines', () => {
    const { lines, reason } = resolveExpenseLines({
      date: '2026-08-15', utilities: 500, supplies: 0, honorarium: '', kabisig_fund: '',
    });
    expect(lines).toHaveLength(1);
    expect(reason).toBeNull();
  });

  test('an amount on an unknown field is refused, not dropped', () => {
    const { lines, unknown, reason } = resolveExpenseLines({ date: '2026-08-15', kabisig_fund: 400 });
    expect(reason).toBe('unknown-amount-field');
    expect(unknown).toEqual(['kabisig_fund']);
    expect(lines).toEqual([]);
  });

  test('total_amount plus a category is the fallback path', () => {
    const { lines } = resolveExpenseLines({
      date: '2026-08-15', category: 'Pastoral Team', subcategory: 'Benevolence', total_amount: 2000,
    });
    expect(lines).toEqual([
      {
        category: 'Pastoral Team', subcategory: 'Benevolence',
        fundSource: 'pastoral_team', column: null, amount: 2000,
      },
    ]);
  });

  test('total_amount with no usable category is unclassified', () => {
    expect(resolveExpenseLines({ date: '2026-08-15', total_amount: 100 }).reason)
      .toBe('unclassified-category');
  });

  test('no amount at all says so', () => {
    expect(resolveExpenseLines({ date: '2026-08-15', category: 'supplies' }).reason).toBe('no-amount');
  });
});
```

- [x] **Step 2: Run it to make sure it fails**

Run: `cd backend && npx jest ../api/_lib/expenseTaxonomy.test.js`
Expected: FAIL — `Cannot find module './expenseTaxonomy'`

- [x] **Step 3: Write the module**

Create `api/_lib/expenseTaxonomy.js`:

```js
// The single source for what an expense may be filed against.
//
// An expense row is one line item: one category, one subcategory, one amount.
// The subcategory names an amount column and the column names the subcategory,
// so a write can be classified from either end. The seven pastoral ministries
// have no column of their own — those rows carry total_amount and are found by
// fund_source instead, which is what aggregateExpenses already sums.
//
// The labels are taken from reportService rather than restated, because they
// double as the budget_categories.subcategory lookup key that the Expenses tab
// uses to find each row's budget. A shared import makes drift impossible. The
// dependency runs one way only: reportService must never require this module,
// or its two mirrored copies would need different relative paths and
// reportService.parity.test.js would fail.
const { OPERATIONAL_EXPENSE_CATEGORIES, PASTORAL_MINISTRIES } = require('./reportService');

const PBCM_SUBCATEGORY = 'PBCM Share';
const PBCM_COLUMN = 'pbcm_share_expense';

const FUNDS = [
  {
    category: 'PBCM Share/PDOT',
    fundSource: 'pbcm_share',
    subcategories: [{ label: PBCM_SUBCATEGORY, column: PBCM_COLUMN }],
  },
  {
    category: 'Pastoral Team',
    fundSource: 'pastoral_team',
    subcategories: PASTORAL_MINISTRIES.map((m) => ({ label: m.label, column: null })),
  },
  {
    category: 'Operational Fund',
    fundSource: 'operational',
    subcategories: OPERATIONAL_EXPENSE_CATEGORIES.map((c) => ({ label: c.label, column: c.key })),
  },
];

const AMOUNT_COLUMNS = [PBCM_COLUMN, ...OPERATIONAL_EXPENSE_CATEGORIES.map((c) => c.key)];

// MobileSubmitForm.js:5 offers this as a category. It matches no column and no
// budget line; the church means pastoral and worker support by it.
const LEGACY_ALIASES = { workers_share: 'Pastoral & Worker Support' };

// Everything a request body may carry that is not an amount. Any other key
// holding a positive number is treated as an amount and must resolve, so money
// is never accepted and silently discarded.
const NON_AMOUNT_KEYS = new Set([
  'id', 'date', 'particular', 'forms_number', 'cheque_number',
  'category', 'subcategory', 'fund_source', 'total_amount',
  'budget_amount', 'percentage_allocation', 'force', 'submitted_via',
]);

const byLabel = new Map();
const byColumn = new Map();
for (const fund of FUNDS) {
  for (const sub of fund.subcategories) {
    const target = {
      category: fund.category,
      subcategory: sub.label,
      fundSource: fund.fundSource,
      column: sub.column,
    };
    byLabel.set(sub.label.toLowerCase(), target);
    if (sub.column) byColumn.set(sub.column, target);
  }
}

function resolveAmountKey(key) {
  return byColumn.get(key) || null;
}

function normalizeSubcategory(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const direct = byLabel.get(raw.toLowerCase());
  if (direct) return direct.subcategory;
  if (LEGACY_ALIASES[raw]) return LEGACY_ALIASES[raw];

  const column = byColumn.get(raw);
  return column ? column.subcategory : null;
}

// The subcategory identifies the fund on its own, since no label is shared. The
// category is only consulted when no subcategory was sent — the shape mobile
// posts, and the shape a cascade client will post before it learns the split.
function resolveExpenseTarget(category, subcategory) {
  const label = normalizeSubcategory(subcategory) || normalizeSubcategory(category);
  if (!label) return null;
  return byLabel.get(label.toLowerCase()) || null;
}

// Classifies a whole request body. Returns { lines, unknown, reason }:
//   reason === null                    -> lines holds one entry per line item
//   reason === 'unknown-amount-field'  -> unknown names the offending keys
//   reason === 'unclassified-category' -> an amount, but nothing to file it under
//   reason === 'no-amount'             -> nothing to record
function resolveExpenseLines(body) {
  const src = body || {};
  const lines = [];
  const unknown = [];

  for (const [key, raw] of Object.entries(src)) {
    if (NON_AMOUNT_KEYS.has(key)) continue;
    const amount = parseFloat(raw);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const target = resolveAmountKey(key);
    if (target) lines.push({ ...target, amount });
    else unknown.push(key);
  }

  if (unknown.length) return { lines: [], unknown, reason: 'unknown-amount-field' };
  if (lines.length) return { lines, unknown: [], reason: null };

  const total = parseFloat(src.total_amount);
  if (Number.isFinite(total) && total > 0) {
    const target = resolveExpenseTarget(src.category, src.subcategory);
    if (target) return { lines: [{ ...target, amount: total }], unknown: [], reason: null };
    return { lines: [], unknown: [], reason: 'unclassified-category' };
  }

  return { lines: [], unknown: [], reason: 'no-amount' };
}

// Every amount column zeroed except the line's own. Callers spread this in
// AMOUNT_COLUMNS order so the column list and the parameters cannot drift apart.
function amountColumnValues(line) {
  const values = {};
  for (const column of AMOUNT_COLUMNS) values[column] = 0;
  if (line.column) values[line.column] = line.amount;
  return values;
}

module.exports = {
  FUNDS,
  AMOUNT_COLUMNS,
  LEGACY_ALIASES,
  resolveAmountKey,
  normalizeSubcategory,
  resolveExpenseTarget,
  resolveExpenseLines,
  amountColumnValues,
};
```

- [x] **Step 4: Run the tests and make sure they pass**

Run: `cd backend && npx jest ../api/_lib/expenseTaxonomy.test.js`
Expected: PASS — 19 tests

- [x] **Step 5: Confirm the report parity guard is undisturbed**

Run: `cd backend && npx jest services/reportService.parity.test.js`
Expected: PASS, 2 tests. Neither `reportService` copy was touched; this proves it.

- [x] **Step 6: Commit**

```bash
git add api/_lib/expenseTaxonomy.js api/_lib/expenseTaxonomy.test.js
git commit -m "feat: add the expense taxonomy that maps subcategories to columns and funds"
```

---

## Task 2: Audit the fields that actually exist

`EXPENSE_FIELDS` (`api/_lib/activityLog.js:39-44`) lists fifteen amount columns of
which only five are real. An expense edit therefore diffs ten columns that do not
exist and ignores twelve that do. The module is shared, so this is one fix.

**Files:**
- Modify: `api/_lib/activityLog.js:39-44`
- Test: `api/_lib/activityLog.test.js`

- [x] **Step 1: Write the failing test**

Append to `api/_lib/activityLog.test.js`:

```js
describe('EXPENSE_FIELDS matches the schema', () => {
  const { AMOUNT_COLUMNS } = require('./expenseTaxonomy');
  const { EXPENSE_FIELDS } = require('./activityLog');

  test('every amount column is audited', () => {
    for (const column of AMOUNT_COLUMNS) {
      expect(EXPENSE_FIELDS).toContain(column);
    }
  });

  test('the classifying fields are audited', () => {
    expect(EXPENSE_FIELDS).toContain('category');
    expect(EXPENSE_FIELDS).toContain('subcategory');
    expect(EXPENSE_FIELDS).toContain('fund_source');
  });

  test('no audited field is absent from the schema', () => {
    const fs = require('fs');
    const path = require('path');
    const schema = fs.readFileSync(
      path.join(__dirname, '../../backend/config/database-pg.js'), 'utf8'
    );
    // The schema block for expenses, so a name from another table cannot pass.
    const expenses = schema.slice(
      schema.indexOf('CREATE TABLE IF NOT EXISTS expenses'),
      schema.indexOf('CREATE TABLE IF NOT EXISTS custom_fields')
    );
    for (const field of EXPENSE_FIELDS) {
      expect(expenses).toContain(field);
    }
  });
});
```

- [x] **Step 2: Run it to make sure it fails**

Run: `cd backend && npx jest ../api/_lib/activityLog.test.js -t "EXPENSE_FIELDS matches the schema"`
Expected: FAIL — `expect(EXPENSE_FIELDS).toContain("pbcm_share_expense")`, and the schema test fails on `workers_share`.

- [x] **Step 3: Replace the list**

In `api/_lib/activityLog.js`, replace the `EXPENSE_FIELDS` declaration:

```js
// An expense is one line item, so an edit can change what it is filed against as
// well as its amount. The amount columns are listed explicitly rather than
// imported: activityLog is required by every route file, and pulling in the
// taxonomy (which requires reportService) would drag the report module into
// every request path. The list is asserted against the schema in the tests.
const EXPENSE_FIELDS = [
  'date', 'particular', 'forms_number', 'cheque_number', 'total_amount',
  'category', 'subcategory', 'fund_source',
  'pbcm_share_expense', 'pastoral_worker_support', 'cap_assistance', 'honorarium',
  'conference_seminar', 'fellowship_events', 'anniversary_christmas', 'supplies',
  'utilities', 'vehicle_maintenance', 'lto_registration', 'transportation_gas',
  'building_maintenance', 'abccop_national', 'cbcc_share', 'kabalikat_share',
  'abccop_community',
];
```

- [x] **Step 4: Run the tests and make sure they pass**

Run: `cd backend && npx jest ../api/_lib/activityLog.test.js`
Expected: PASS, all tests in the file.

- [x] **Step 5: Confirm the existing diff test still passes**

Run: `cd backend && npx jest ../api/expenses.activity.test.js -t "updating an expense logs only the fields that changed"`
Expected: PASS. It edits `supplies`, which is in both the old list and the new one.

- [x] **Step 6: Commit**

```bash
git add api/_lib/activityLog.js api/_lib/activityLog.test.js
git commit -m "fix: audit the expense columns that exist instead of ten that do not"
```

---

## Task 3: `POST /api/expenses` writes line items

The handler stops destructuring seventeen names and summing them, and instead asks
the taxonomy what the body means. A body carrying several amounts becomes several
rows in one transaction — the way `Jan25` records a cheque covering several lines.

**Files:**
- Modify: `api/expenses.js` (imports, and the `POST` handler at `:61-158`)
- Modify: `backend/routes/expenses.js` (imports, and the `POST` handler at `:50-196`)
- Test: `api/expenses.activity.test.js`

- [x] **Step 1: Write the failing tests**

Append to `api/expenses.activity.test.js`:

```js
const insertCalls = () =>
  mockTx.run.mock.calls.filter(([sql]) => /INSERT INTO expenses/i.test(sql));

describe('POST classifies from the amount key', () => {
  test('one amount writes one row, classified and funded', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 500 });

    expect(res.status).toBe(200);
    const [sql, params] = insertCalls()[0];
    expect(sql).toMatch(/INSERT INTO expenses/i);
    expect(params).toContain('Operational Fund');
    expect(params).toContain('Utilities');
    expect(params).toContain('operational');
    expect(params).toContain(500);
  });

  test('a client-supplied fund_source is ignored', async () => {
    await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 500, fund_source: 'pastoral_team' });

    const [, params] = insertCalls()[0];
    expect(params).toContain('operational');
    expect(params).not.toContain('pastoral_team');
  });

  test('a pastoral line stores total_amount and no amount column', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({
        date: '2026-08-15', category: 'Pastoral Team',
        subcategory: 'Benevolence', total_amount: 2000,
      });

    expect(res.status).toBe(200);
    const [, params] = insertCalls()[0];
    expect(params).toContain('pastoral_team');
    expect(params).toContain('Benevolence');
    // total_amount is 2000; every one of the 17 amount columns is zero.
    expect(params.filter((p) => p === 2000)).toHaveLength(1);
  });

  test('a legacy mobile category still classifies', async () => {
    await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', category: 'workers_share', total_amount: 300 });

    const [, params] = insertCalls()[0];
    expect(params).toContain("Pastoral & Worker Support");
    expect(params).toContain('operational');
  });

  test('an amount on an unknown field is refused by name', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', kabisig_fund: 400 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/kabisig_fund/);
    expect(insertCalls()).toHaveLength(0);
  });

  test('a body with no amount is refused', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', category: 'supplies' });

    expect(res.status).toBe(400);
    expect(insertCalls()).toHaveLength(0);
  });

  test('a missing date is still refused', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ utilities: 500 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/date/i);
  });
});

describe('POST fans out a multi-line voucher', () => {
  test('two amounts write two rows sharing the voucher fields', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({
        date: '2026-08-15', particular: 'Electric Expense',
        cheque_number: '276296', forms_number: '2025-001',
        utilities: 12287.8, supplies: 128.55,
      });

    expect(res.status).toBe(200);
    expect(insertCalls()).toHaveLength(2);

    for (const [, params] of insertCalls()) {
      expect(params).toContain('Electric Expense');
      expect(params).toContain('276296');
      expect(params).toContain('2025-001');
    }
    expect(insertCalls()[0][1]).toContain('Utilities');
    expect(insertCalls()[1][1]).toContain('Supplies');
  });

  test('the response carries every id', async () => {
    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 500, supplies: 120 });

    expect(res.body.ids).toHaveLength(2);
    expect(res.body.id).toBe(res.body.ids[0]);
  });

  test('both rows and both log entries share one transaction', async () => {
    await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 500, supplies: 120 });

    expect(mockDb.withTransaction).toHaveBeenCalledTimes(1);
    const logs = mockTx.run.mock.calls.filter(([sql]) => /INSERT INTO activity_log/i.test(sql));
    expect(logs).toHaveLength(2);
  });

  test('a failure part-way through rolls the whole voucher back', async () => {
    // withTransaction propagates; the real implementation ROLLBACKs on throw.
    mockTx.run.mockImplementation(async (sql) => {
      if (/INSERT INTO expenses/i.test(sql) && insertCalls().length === 2) {
        throw new Error('constraint violation');
      }
      return { changes: 1, lastID: 42 };
    });

    const res = await request(app)
      .post('/api/expenses')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 500, supplies: 120 });

    expect(res.status).toBe(500);
  });
});
```

- [x] **Step 2: Run them to make sure they fail**

Run: `cd backend && npx jest ../api/expenses.activity.test.js -t "POST classifies"`
Expected: FAIL — the first test gets 400 (`Date and category are required`), because the current handler demands a `category` and never writes `Utilities`.

- [x] **Step 3: Rewrite the serverless `POST`**

In `api/expenses.js`, add to the imports at the top:

```js
const {
  AMOUNT_COLUMNS,
  resolveExpenseLines,
  amountColumnValues,
} = require('./_lib/expenseTaxonomy');
```

Then replace the whole `app.post('/api/expenses', ...)` handler with:

```js
// POST /api/expenses
//
// An expense is one line item. A body carrying several amounts is one voucher
// covering several lines, so it becomes one row per amount — all sharing the
// voucher's date, particular, forms number and cheque number, the way the
// church's own ledger records a cheque that pays for several things.
app.post('/api/expenses', verifyToken, canCreate, async (req, res) => {
  const { date, particular, forms_number, cheque_number, budget_amount, percentage_allocation } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  const { lines, unknown, reason } = resolveExpenseLines(req.body);

  if (reason === 'unknown-amount-field') {
    return res.status(400).json({
      error: `Unknown expense amount field: ${unknown.join(', ')}. It is not a budget subcategory, so the amount would not be recorded anywhere.`,
    });
  }
  if (reason === 'unclassified-category') {
    return res.status(400).json({
      error: 'Category must name a budget category or subcategory',
    });
  }
  if (!lines.length) {
    return res.status(400).json({
      error: 'Either total_amount or individual expense amounts must be provided',
    });
  }

  // Duplicate detection, per line: a re-submitted voucher repeats a line's
  // amount on the same date, which is exactly what this should catch.
  if (!req.body.force) {
    for (const line of lines) {
      const dup = await db.get(
        `SELECT id, created_by, date FROM expenses WHERE date = ? AND total_amount = ? AND ${notDeleted()}`,
        [date, line.amount]
      );
      if (dup) {
        return res.status(409).json({
          error: 'Duplicate entry detected',
          conflict: {
            id: dup.id, submitted_by: dup.created_by,
            date: dup.date, total_amount: line.amount,
          },
        });
      }
    }
  }

  const insertSql = `INSERT INTO expenses (
      date, particular, forms_number, cheque_number, category, subcategory,
      total_amount, budget_amount, percentage_allocation, fund_source,
      ${AMOUNT_COLUMNS.join(', ')}, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${AMOUNT_COLUMNS.map(() => '?').join(', ')}, ?)`;

  try {
    const ids = [];

    await db.withTransaction(async (tx) => {
      for (const line of lines) {
        const amounts = amountColumnValues(line);
        const result = await tx.run(insertSql, [
          date, particular || 'Expense Entry', forms_number, cheque_number,
          line.category, line.subcategory, line.amount,
          budget_amount || 0, percentage_allocation || 0, line.fundSource,
          ...AMOUNT_COLUMNS.map((column) => amounts[column]),
          req.user.email,
        ]);
        ids.push(result.lastID);

        await logActivity(tx, {
          actor: req.user,
          action: ACTIONS.RECORD_CREATE,
          entityType: 'expense',
          entityId: result.lastID,
          summary: summarise('Created', { date, total_amount: line.amount }),
        });
      }
    });

    res.json({ id: ids[0], ids, message: 'Expense added successfully' });
  } catch (err) {
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

- [x] **Step 4: Run the serverless tests and make sure they pass**

Run: `cd backend && npx jest ../api/expenses.activity.test.js ../api/expenses.auth.test.js ../api/expenses.softdelete.test.js`
Expected: PASS. The pre-existing cases keep working — they post `{ category: 'supplies', supplies: 100 }`, whose amount key classifies the row and whose `category` value the taxonomy would have resolved anyway.

- [x] **Step 5: Mirror it into the Express copy**

In `backend/routes/expenses.js`, add to the imports:

```js
const {
  AMOUNT_COLUMNS,
  resolveExpenseLines,
  amountColumnValues,
} = require('../../api/_lib/expenseTaxonomy');
```

Replace the whole `router.post("/", ...)` handler body with the same logic. It
differs from the serverless copy in exactly two ways — `req.db` instead of `db`,
and the callback-style `get` — so keep everything else identical:

```js
router.post("/", authenticateToken, canCreate, async (req, res) => {
  const { date, particular, forms_number, cheque_number, budget_amount, percentage_allocation } = req.body;

  if (!date) {
    return res.status(400).json({ error: "Date is required" });
  }

  const { lines, unknown, reason } = resolveExpenseLines(req.body);

  if (reason === 'unknown-amount-field') {
    return res.status(400).json({
      error: `Unknown expense amount field: ${unknown.join(', ')}. It is not a budget subcategory, so the amount would not be recorded anywhere.`,
    });
  }
  if (reason === 'unclassified-category') {
    return res.status(400).json({
      error: 'Category must name a budget category or subcategory',
    });
  }
  if (!lines.length) {
    return res.status(400).json({
      error: 'Either total_amount or individual expense amounts must be provided',
    });
  }

  const findDuplicate = (amount) => new Promise((resolve, reject) => {
    req.db.get(
      `SELECT id, created_by, date FROM expenses WHERE date = ? AND total_amount = ? AND ${notDeleted()}`,
      [date, amount],
      (err, row) => (err ? reject(err) : resolve(row))
    );
  });

  if (!req.body.force) {
    for (const line of lines) {
      const dup = await findDuplicate(line.amount);
      if (dup) {
        return res.status(409).json({
          error: 'Duplicate entry detected',
          conflict: {
            id: dup.id, submitted_by: dup.created_by,
            date: dup.date, total_amount: line.amount,
          },
        });
      }
    }
  }

  const insertSql = `INSERT INTO expenses (
      date, particular, forms_number, cheque_number, category, subcategory,
      total_amount, budget_amount, percentage_allocation, fund_source,
      ${AMOUNT_COLUMNS.join(', ')}, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${AMOUNT_COLUMNS.map(() => '?').join(', ')}, ?)`;

  try {
    const ids = [];

    await req.db.withTransaction(async (tx) => {
      for (const line of lines) {
        const amounts = amountColumnValues(line);
        const result = await tx.run(insertSql, [
          date, particular || 'Expense Entry', forms_number, cheque_number,
          line.category, line.subcategory, line.amount,
          budget_amount || 0, percentage_allocation || 0, line.fundSource,
          ...AMOUNT_COLUMNS.map((column) => amounts[column]),
          req.user.email,
        ]);
        ids.push(result.lastID);

        await logActivity(tx, {
          actor: req.user,
          action: ACTIONS.RECORD_CREATE,
          entityType: 'expense',
          entityId: result.lastID,
          summary: `Created expense ${asDateString(date)} for ${Number(line.amount || 0).toFixed(2)}`,
        });
      }
    });

    res.json({ id: ids[0], ids, message: "Expense added successfully" });
  } catch (err) {
    console.error("Database error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});
```

- [x] **Step 6: Run the Express tests**

Run: `cd backend && npx jest routes/expenses.auth.test.js`
Expected: PASS, 5 tests. The `user role can create` case posts `{ date, total_amount: 100 }` with no category, which now returns 400 rather than 500 — either way not 403, which is what it asserts.

- [x] **Step 7: Commit**

```bash
git add api/expenses.js backend/routes/expenses.js api/expenses.activity.test.js
git commit -m "feat: classify expense writes by amount column and fan out a multi-line voucher"
```

---

## Task 4: Repair `PUT /api/expenses/:id`

Both copies currently write ten columns that exist in no schema and in no
database, and never write `category`, `subcategory`, or `fund_source`. The
statement cannot execute. An edit addresses one existing row, so it resolves the
same way a create does but never fans out.

**Files:**
- Modify: `api/expenses.js` (the `PUT` handler at `:183-270`)
- Modify: `backend/routes/expenses.js` (the `PUT` handler at `:240-330`)
- Test: `api/expenses.activity.test.js`

- [x] **Step 1: Write the failing tests**

Append to `api/expenses.activity.test.js`:

```js
describe('PUT writes columns that exist', () => {
  const { AMOUNT_COLUMNS } = require('./_lib/expenseTaxonomy');
  const updateCall = () =>
    mockTx.run.mock.calls.find(([sql]) => /UPDATE expenses SET/i.test(sql) && !/deleted_at = now\(\)/i.test(sql));

  // The regression test for the actual defect.
  test('the statement names no column absent from the schema', async () => {
    getReturns({ id: 3, date: '2026-08-15', supplies: '100.00' });

    await request(app)
      .put('/api/expenses/3')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', supplies: 250 });

    const [sql] = updateCall();
    for (const dead of [
      'workers_share', 'fellowship_expense', 'benevolence_donations',
      'gasoline_transport', 'pbcm_share =', 'mission_evangelism',
      'admin_expense', 'worship_music', 'discipleship',
    ]) {
      expect(sql).not.toContain(dead);
    }
    for (const column of AMOUNT_COLUMNS) {
      expect(sql).toContain(column);
    }
  });

  test('an edit persists what the row is filed against', async () => {
    getReturns({ id: 3, date: '2026-08-15', supplies: '100.00' });

    const res = await request(app)
      .put('/api/expenses/3')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 250 });

    expect(res.status).toBe(200);
    const [sql, params] = updateCall();
    expect(sql).toMatch(/category = \?/);
    expect(sql).toMatch(/subcategory = \?/);
    expect(sql).toMatch(/fund_source = \?/);
    expect(params).toContain('Utilities');
    expect(params).toContain('operational');
  });

  test('changing the subcategory moves the amount to the new column', async () => {
    getReturns({ id: 3, date: '2026-08-15', supplies: '100.00', utilities: '0.00' });

    await request(app)
      .put('/api/expenses/3')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 250 });

    const [sql, params] = updateCall();
    const columnOrder = sql
      .slice(sql.indexOf('SET'))
      .match(/(\w+) = \?/g)
      .map((m) => m.replace(' = ?', ''));
    expect(params[columnOrder.indexOf('utilities')]).toBe(250);
    expect(params[columnOrder.indexOf('supplies')]).toBe(0);
  });

  test('an edit may not become two line items', async () => {
    getReturns({ id: 3, date: '2026-08-15', supplies: '100.00' });

    const res = await request(app)
      .put('/api/expenses/3')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 250, supplies: 100 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/single line item/i);
  });

  test('an unknown amount field is refused on edit too', async () => {
    getReturns({ id: 3, date: '2026-08-15' });

    const res = await request(app)
      .put('/api/expenses/3')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', kabisig_fund: 400 });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/kabisig_fund/);
  });

  test('a category change is audited', async () => {
    getReturns({
      id: 3, date: '2026-08-15', category: 'Operational Fund',
      subcategory: 'Supplies', supplies: '100.00',
    });

    await request(app)
      .put('/api/expenses/3')
      .set('Authorization', ADMIN)
      .send({ date: '2026-08-15', utilities: 100 });

    const changes = JSON.parse(logCall()[1][6]);
    expect(changes.subcategory).toEqual({ from: 'Supplies', to: 'Utilities' });
  });
});
```

- [x] **Step 2: Run them to make sure they fail**

Run: `cd backend && npx jest ../api/expenses.activity.test.js -t "PUT writes columns that exist"`
Expected: FAIL — the statement still contains `workers_share`.

- [x] **Step 3: Rewrite the serverless `PUT`**

In `api/expenses.js`, replace the whole `app.put('/api/expenses/:id', ...)` handler with:

```js
// PUT /api/expenses/:id
//
// One row is one line item, so an edit resolves exactly like a create but never
// fans out: a voucher line cannot become two lines by being edited. Add the
// second line as its own record instead.
app.put('/api/expenses/:id', verifyToken, canMutate, async (req, res) => {
  const { id } = req.params;
  const { date, particular, forms_number, cheque_number } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  const { lines, unknown, reason } = resolveExpenseLines(req.body);

  if (reason === 'unknown-amount-field') {
    return res.status(400).json({
      error: `Unknown expense amount field: ${unknown.join(', ')}. It is not a budget subcategory, so the amount would not be recorded anywhere.`,
    });
  }
  if (reason === 'unclassified-category') {
    return res.status(400).json({
      error: 'Category must name a budget category or subcategory',
    });
  }
  if (!lines.length) {
    return res.status(400).json({
      error: 'Either total_amount or individual expense amounts must be provided',
    });
  }
  if (lines.length > 1) {
    return res.status(400).json({
      error: 'An expense edit must address a single line item. Record the other amounts as their own entries.',
    });
  }

  const [line] = lines;
  const amounts = amountColumnValues(line);

  const before = await db.get(
    `SELECT * FROM expenses WHERE id = ? AND ${notDeleted()}`,
    [id]
  );
  if (!before) {
    return res.status(404).json({ error: 'Expense not found' });
  }

  const updateSql = `UPDATE expenses SET
      date = ?, particular = ?, forms_number = ?, cheque_number = ?,
      category = ?, subcategory = ?, fund_source = ?, total_amount = ?,
      ${AMOUNT_COLUMNS.map((column) => `${column} = ?`).join(', ')},
      updated_at = now(), updated_by = ?
    WHERE id = ? AND ${notDeleted()}`;

  try {
    // Diff against the resolved values, not the raw body: the body says
    // `utilities: 250`, while what changed is the subcategory and two columns.
    const changes = diffFields(before, {
      ...req.body,
      category: line.category,
      subcategory: line.subcategory,
      fund_source: line.fundSource,
      total_amount: line.amount,
      ...amounts,
    }, EXPENSE_FIELDS);

    await db.withTransaction(async (tx) => {
      const result = await tx.run(updateSql, [
        date, particular || 'Expense Entry', forms_number, cheque_number,
        line.category, line.subcategory, line.fundSource, line.amount,
        ...AMOUNT_COLUMNS.map((column) => amounts[column]),
        req.user.email, id,
      ]);

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
        summary: summarise('Updated', { date, total_amount: line.amount }),
        changes,
      });
    });

    res.json({ message: 'Expense updated successfully' });
  } catch (err) {
    if (err.notFound) {
      return res.status(404).json({ error: 'Expense not found' });
    }
    console.error('Database error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

- [x] **Step 4: Run the serverless tests and make sure they pass**

Run: `cd backend && npx jest ../api/expenses.activity.test.js ../api/expenses.softdelete.test.js ../api/expenses.auth.test.js`
Expected: PASS. `expenses.softdelete.test.js`'s `PUT stamps updated_at and updated_by` case still finds `updated_at = now()` and `deleted_at IS NULL` in the new statement.

- [x] **Step 5: Mirror it into the Express copy**

In `backend/routes/expenses.js`, replace the whole `router.put("/:id", ...)` handler with
the same logic, substituting `req.db` for `db`, and reading `before` through the
callback style already used elsewhere in that file:

```js
router.put("/:id", authenticateToken, canMutate, async (req, res) => {
  const { id } = req.params;
  const { date, particular, forms_number, cheque_number } = req.body;

  if (!date) {
    return res.status(400).json({ error: "Date is required" });
  }

  const { lines, unknown, reason } = resolveExpenseLines(req.body);

  if (reason === 'unknown-amount-field') {
    return res.status(400).json({
      error: `Unknown expense amount field: ${unknown.join(', ')}. It is not a budget subcategory, so the amount would not be recorded anywhere.`,
    });
  }
  if (reason === 'unclassified-category') {
    return res.status(400).json({
      error: 'Category must name a budget category or subcategory',
    });
  }
  if (!lines.length) {
    return res.status(400).json({
      error: 'Either total_amount or individual expense amounts must be provided',
    });
  }
  if (lines.length > 1) {
    return res.status(400).json({
      error: 'An expense edit must address a single line item. Record the other amounts as their own entries.',
    });
  }

  const [line] = lines;
  const amounts = amountColumnValues(line);

  const before = await new Promise((resolve, reject) => {
    req.db.get(
      `SELECT * FROM expenses WHERE id = ? AND ${notDeleted()}`,
      [id],
      (err, row) => (err ? reject(err) : resolve(row))
    );
  });
  if (!before) {
    return res.status(404).json({ error: "Expense not found" });
  }

  const updateSql = `UPDATE expenses SET
      date = ?, particular = ?, forms_number = ?, cheque_number = ?,
      category = ?, subcategory = ?, fund_source = ?, total_amount = ?,
      ${AMOUNT_COLUMNS.map((column) => `${column} = ?`).join(', ')},
      updated_at = now(), updated_by = ?
    WHERE id = ? AND ${notDeleted()}`;

  try {
    const changes = diffFields(before, {
      ...req.body,
      category: line.category,
      subcategory: line.subcategory,
      fund_source: line.fundSource,
      total_amount: line.amount,
      ...amounts,
    }, EXPENSE_FIELDS);

    await req.db.withTransaction(async (tx) => {
      const result = await tx.run(updateSql, [
        date, particular || 'Expense Entry', forms_number, cheque_number,
        line.category, line.subcategory, line.fundSource, line.amount,
        ...AMOUNT_COLUMNS.map((column) => amounts[column]),
        req.user.email, id,
      ]);

      if (result.changes === 0) {
        const notFound = new Error("Expense not found");
        notFound.notFound = true;
        throw notFound;
      }

      await logActivity(tx, {
        actor: req.user,
        action: ACTIONS.RECORD_UPDATE,
        entityType: 'expense',
        entityId: parseInt(id, 10),
        summary: `Updated expense ${asDateString(date)} for ${Number(line.amount || 0).toFixed(2)}`,
        changes,
      });
    });

    res.json({ message: "Expense updated successfully" });
  } catch (err) {
    if (err.notFound) {
      return res.status(404).json({ error: "Expense not found" });
    }
    console.error("Database error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
```

- [x] **Step 6: Run the whole expense surface in both directories**

Run: `cd backend && npx jest expenses`
Expected: PASS across `routes/expenses.auth.test.js`, `../api/expenses.auth.test.js`, `../api/expenses.activity.test.js`, `../api/expenses.softdelete.test.js`.

- [x] **Step 7: Commit**

```bash
git add api/expenses.js backend/routes/expenses.js api/expenses.activity.test.js
git commit -m "fix: write real columns and the row's classification on an expense edit"
```

---

## Task 5: Prove the report needs no change

The Expenses tab's "Pastoral Team (10%)" row has been structurally ₱0.00 because
nothing ever wrote `fund_source='pastoral_team'`. `aggregateExpenses:189` already
sums exactly those rows, so correct writes light it up with **no edit to either
`reportService` copy**. Lock that in.

**Files:**
- Test: `backend/services/reportService.test.js`

- [x] **Step 1: Write the tests**

Append to `backend/services/reportService.test.js`:

```js
describe("pastoral line items reach the Expenses tab", () => {
  const pastoralSection = (agg) => agg.sections.find((s) => s.label === "Pastoral Team (10%)");

  test("a pastoral_team row reports under Pastoral Team", () => {
    const agg = aggregateExpenses(
      [{
        date: "2026-03-08", total_amount: 2000, fund_source: "pastoral_team",
        category: "Pastoral Team", subcategory: "Benevolence",
      }],
      []
    );

    const row = pastoralSection(agg).rows[0];
    expect(row.months[2]).toBe(2000);
    expect(row.total).toBe(2000);
  });

  test("an operational line item does not leak into the pastoral row", () => {
    const agg = aggregateExpenses(
      [{
        date: "2026-03-08", total_amount: 500, fund_source: "operational",
        category: "Operational Fund", subcategory: "Utilities", utilities: 500,
      }],
      []
    );

    expect(pastoralSection(agg).rows[0].total).toBe(0);
    const operational = agg.sections.find((s) => s.label === "Operational Fund (80%)");
    expect(operational.rows.find((r) => r.key === "utilities").total).toBe(500);
    // The row is counted once, not once per reading.
    expect(agg.grandTotal).toBe(500);
  });

  test("the seven ministry budget rows leave the offering target alone", () => {
    const operationalBudget = [
      { category: "Operational Fund", subcategory: "Utilities", budget_amount: 15000 },
    ];
    const withMinistries = [
      ...operationalBudget,
      ...PASTORAL_MINISTRIES.map((m) => ({
        category: "Pastoral Team", subcategory: m.label, budget_amount: 9500 * m.pct,
      })),
    ];

    const colAgg = aggregateCollections([col("2026-03-08", { general_tithes_offering: 1000, total_amount: 1000 })]);
    const before = buildOfferingTarget(colAgg, aggregateExpenses([], operationalBudget), 2026);
    const after = buildOfferingTarget(colAgg, aggregateExpenses([], withMinistries), 2026);

    expect(after.requiredMonthly).toBe(before.requiredMonthly);
    expect(after.operationalBudget).toBe(15000);
  });
});
```

- [x] **Step 2: Run them**

Run: `cd backend && npx jest services/reportService.test.js -t "pastoral line items reach the Expenses tab"`
Expected: PASS, 3 tests, **with no change to `reportService.js`**. If any fails, something in Task 3 or 4 wrote the wrong `fund_source` or double-counted an amount — fix the write path, not the report.

- [x] **Step 3: Confirm the mirrored pair is still identical**

Run: `cd backend && npx jest services/reportService.parity.test.js`
Expected: PASS, 2 tests.

- [x] **Step 4: Commit**

```bash
git add backend/services/reportService.test.js
git commit -m "test: pin that correct expense writes light up the pastoral report row"
```

---

## Task 6: The budget tables

Production has no `budget_plan` and no `budget_categories`. The report sync
swallows their absence (`api/reports.js:147`) and carries on with no budget, which
is why the OFFERING TARGET block renders nothing. Creating and seeding them is
what makes Phase 1's second feature visible.

**Files:**
- Modify: `backend/config/database-pg.js` (after the `budget_categories` definition at `:189-199`)
- Modify: `backend/config/database.js` (the `budget_categories` definition, and `seedBudgetCategories()` at `:267-286`)
- Test: `api/_lib/expenseTaxonomy.test.js` (the ministry labels must match the seed)

- [x] **Step 1: Write the failing test**

Append to `api/_lib/expenseTaxonomy.test.js`:

```js
describe('the seed agrees with the taxonomy', () => {
  const fs = require('fs');
  const path = require('path');
  const seed = fs.readFileSync(
    path.join(__dirname, '../../backend/config/database.js'), 'utf8'
  );

  test('every operational subcategory has a seeded budget row', () => {
    const operational = FUNDS.find((f) => f.category === 'Operational Fund');
    for (const sub of operational.subcategories) {
      expect(seed).toContain(`subcategory: '${sub.label}'`);
    }
  });

  test('every ministry has a seeded budget row', () => {
    const pastoral = FUNDS.find((f) => f.category === 'Pastoral Team');
    for (const sub of pastoral.subcategories) {
      expect(seed).toContain(`subcategory: '${sub.label}'`);
    }
  });

  test('the seeded budget_categories rows are unique per plan', () => {
    const pg = fs.readFileSync(
      path.join(__dirname, '../../backend/config/database-pg.js'), 'utf8'
    );
    for (const source of [seed, pg]) {
      expect(source).toMatch(/budget_categories_plan_cat_subcat/);
    }
  });
});
```

- [x] **Step 2: Run it to make sure it fails**

Run: `cd backend && npx jest ../api/_lib/expenseTaxonomy.test.js -t "the seed agrees with the taxonomy"`
Expected: FAIL — the ministry rows are not seeded and neither schema names the unique index.

- [x] **Step 3: Add the unique index to the PostgreSQL schema**

In `backend/config/database-pg.js`, immediately after the `budget_categories`
`CREATE TABLE` block (ends at `:199`), add:

```sql
        -- budget_categories carries no natural key of its own, so a re-run of
        -- the seed would duplicate every row. This index is what lets the seed
        -- statements use ON CONFLICT DO NOTHING and stay idempotent.
        CREATE UNIQUE INDEX IF NOT EXISTS budget_categories_plan_cat_subcat
          ON budget_categories (budget_plan_id, category, subcategory);
```

- [x] **Step 4: Add the same index to the SQLite schema**

In `backend/config/database.js`, immediately after the `budget_categories`
`CREATE TABLE` block, add:

```sql
      CREATE UNIQUE INDEX IF NOT EXISTS budget_categories_plan_cat_subcat
        ON budget_categories (budget_plan_id, category, subcategory);
```

- [x] **Step 5: Seed the seven ministry rows**

In `backend/config/database.js`, in `seedBudgetCategories()`, insert these seven
entries immediately after the existing `Pastoral Team` row. **Keep that parent
row**: the Expenses tab looks up the exact key `"Pastoral Team"`
(`reportService.js:175`), and `buildOfferingTarget` sums only the Operational Fund
section, so the children cannot skew the offering target.

```js
      // The 10% pastoral share split seven ways, per the workbook's
      // "BD Per Revised" — the same percentages reportService uses for the
      // Summary tab's ministry rows. These are what Spent and Remaining will be
      // measured against; they sum to the 9,500.00 parent exactly.
      { category: 'Pastoral Team', subcategory: 'CE', percentage: 10.00, amount: 950.00 },
      { category: 'Pastoral Team', subcategory: 'Worship/Prayer/Music', percentage: 25.00, amount: 2375.00 },
      { category: 'Pastoral Team', subcategory: 'Mission/Evangelism', percentage: 15.00, amount: 1425.00 },
      { category: 'Pastoral Team', subcategory: 'Discipleship/Fellowship', percentage: 10.00, amount: 950.00 },
      { category: 'Pastoral Team', subcategory: 'Admin & Finance', percentage: 10.00, amount: 950.00 },
      { category: 'Pastoral Team', subcategory: 'Benevolence', percentage: 25.00, amount: 2375.00 },
      { category: 'Pastoral Team', subcategory: 'Pastoral Care', percentage: 5.00, amount: 475.00 },
```

- [x] **Step 6: Run the tests and make sure they pass**

Run: `cd backend && npx jest ../api/_lib/expenseTaxonomy.test.js`
Expected: PASS, all tests including the three new seed cases.

- [x] **Step 7: Commit**

```bash
git add backend/config/database.js backend/config/database-pg.js api/_lib/expenseTaxonomy.test.js
git commit -m "feat: seed the seven pastoral ministry budget rows and key budget_categories"
```

- [x] **Step 8: Run the production SQL by hand**

> **Applied 2026-08-19 to the Neon `development` branch only**
> (`br-super-resonance-a4koenk7`), at the user's direction — **not** to
> `production` (`br-wild-mode-a4o3z1nc`), where `budget_plan` and
> `budget_categories` still do not exist. On `development` the two `CREATE TABLE`
> statements and the unique index were already in place, so the run was the two
> `INSERT`s; re-running them left the row count at 25, confirming idempotency.
> Production remains outstanding — run the same block there when ready.

There is no migration runner. Run this against the production database
(`sbcc-financial-system`) exactly as written. Every statement is idempotent, so a
partial run can be repeated safely.

```sql
CREATE TABLE IF NOT EXISTS budget_plan (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  target_offering DECIMAL(10,2) NOT NULL,
  pbcm_percentage DECIMAL(5,2) DEFAULT 10.00,
  pastoral_team_percentage DECIMAL(5,2) DEFAULT 10.00,
  operational_percentage DECIMAL(5,2) DEFAULT 80.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  UNIQUE(year)
);

CREATE TABLE IF NOT EXISTS budget_categories (
  id SERIAL PRIMARY KEY,
  budget_plan_id INTEGER REFERENCES budget_plan(id),
  category TEXT NOT NULL,
  subcategory TEXT,
  percentage DECIMAL(5,2) DEFAULT 0,
  budget_amount DECIMAL(10,2) DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS budget_categories_plan_cat_subcat
  ON budget_categories (budget_plan_id, category, subcategory);

-- 109,916.67 is the required monthly offering the workbook's BD Per Revised E1
-- computes, and what buildOfferingTarget re-derives from the operational lines.
INSERT INTO budget_plan (year, target_offering, created_by)
VALUES (2026, 109916.67, 'system-seed')
ON CONFLICT (year) DO NOTHING;

INSERT INTO budget_categories (budget_plan_id, category, subcategory, percentage, budget_amount)
SELECT bp.id, v.category, v.subcategory, v.percentage, v.budget_amount
FROM budget_plan bp
CROSS JOIN (VALUES
  ('PBCM Share/PDOT',  'PBCM Share',                           10.00,  9500.00),
  ('Pastoral Team',    'Pastoral Team',                        10.00,  9500.00),
  ('Pastoral Team',    'CE',                                   10.00,   950.00),
  ('Pastoral Team',    'Worship/Prayer/Music',                 25.00,  2375.00),
  ('Pastoral Team',    'Mission/Evangelism',                   15.00,  1425.00),
  ('Pastoral Team',    'Discipleship/Fellowship',              10.00,   950.00),
  ('Pastoral Team',    'Admin & Finance',                      10.00,   950.00),
  ('Pastoral Team',    'Benevolence',                          25.00,  2375.00),
  ('Pastoral Team',    'Pastoral Care',                         5.00,   475.00),
  ('Operational Fund', 'Pastoral & Worker Support',              NULL, 31291.67),
  ('Operational Fund', 'CAP-Churches Assistance Program',        NULL,  1000.00),
  ('Operational Fund', 'Honorarium',                             NULL,  7000.00),
  ('Operational Fund', 'Conference/Seminar/Retreat/Assembly',    NULL,  1000.00),
  ('Operational Fund', 'Fellowship Events',                      NULL,  1275.00),
  ('Operational Fund', 'Anniversary/Christmas Events',           NULL, 14833.33),
  ('Operational Fund', 'Supplies',                               NULL,  3000.00),
  ('Operational Fund', 'Utilities',                              NULL, 15000.00),
  ('Operational Fund', 'Vehicle Maintenance',                    NULL,  5000.00),
  ('Operational Fund', 'LTO Registration',                       NULL,   416.67),
  ('Operational Fund', 'Transportation & Gas',                   NULL,  3500.00),
  ('Operational Fund', 'Building Maintenance',                   NULL,  3000.00),
  ('Operational Fund', 'ABCCOP National',                        NULL,   400.00),
  ('Operational Fund', 'CBCC Share',                             NULL,   600.00),
  ('Operational Fund', 'Kabalikat Share',                        NULL,   200.00),
  ('Operational Fund', 'ABCCOP Community Day',                   NULL,   416.67)
) AS v(category, subcategory, percentage, budget_amount)
WHERE bp.year = 2026
ON CONFLICT (budget_plan_id, category, subcategory) DO NOTHING;
```

- [x] **Step 9: Verify what landed**

```sql
SELECT category, count(*) AS rows, sum(budget_amount) AS total
FROM budget_categories bc
JOIN budget_plan bp ON bp.id = bc.budget_plan_id
WHERE bp.year = 2026
GROUP BY category ORDER BY category;
```

Expected exactly:

| category | rows | total |
|---|---|---|
| Operational Fund | 16 | 87933.34 |
| PBCM Share/PDOT | 1 | 9500.00 |
| Pastoral Team | 8 | 19000.00 |

The `Pastoral Team` total is 19,000.00 because the parent row and its seven
children are both present by design — the children sum to the 9,500.00 parent.
Nothing sums that column across categories: `buildOfferingTarget` reads only the
Operational Fund section, and the Expenses tab looks each row up by its own
subcategory. The operational total of 87,933.34 ÷ 0.80 is the 109,916.67 the
OFFERING TARGET block reports; the third decimal comes from the two 416.67 lines
that are 5,000 ÷ 12 in the workbook.

---

## Task 7: Full verification and the documentation correction

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-17-expense-write-path-and-budget-seed-design.md`

- [x] **Step 1: Run the whole server-side suite**

Run: `cd backend && npm test`
Expected: **41 suites** — the 40 that exist today plus the one file this plan
creates, `api/_lib/expenseTaxonomy.test.js`. Every one passes except the two known
non-regressions described at the top of this plan.

- [x] **Step 2: Confirm both route copies still load**

Run:

```bash
cd backend && node -e "
process.env.DATABASE_URL = 'postgres://unused';
const t = require('../api/_lib/expenseTaxonomy');
const need = ['FUNDS','AMOUNT_COLUMNS','resolveAmountKey','normalizeSubcategory','resolveExpenseTarget','resolveExpenseLines','amountColumnValues'];
need.forEach(k => { if (!(k in t)) throw new Error('taxonomy missing ' + k); });
if (t.AMOUNT_COLUMNS.length !== 17) throw new Error('expected 17 amount columns, got ' + t.AMOUNT_COLUMNS.length);
const { EXPENSE_FIELDS } = require('../api/_lib/activityLog');
t.AMOUNT_COLUMNS.forEach(c => { if (!EXPENSE_FIELDS.includes(c)) throw new Error('unaudited column ' + c); });
console.log('taxonomy exposes all', need.length, 'members and every column is audited');
"
```

Expected: `taxonomy exposes all 7 members and every column is audited`

- [x] **Step 3: Build the frontend**

Run: `cd frontend && npm run build`
Expected: `Compiled successfully` (warnings acceptable, errors not). Nothing in the
frontend changed, so this is a regression check on the completion bar.

- [x] **Step 4: Correct the stale soft-delete claim in `CLAUDE.md`**

`fund_allocation` exists only in the SQLite schema; it is absent from
`database-pg.js` and from production, and no route or service references it. In the
"Soft delete" section, replace:

```markdown
`DELETE` on a collection or expense is an `UPDATE` setting `deleted_at` and
`deleted_by`. Rows and their `fund_allocation` children are never physically
removed; recovery is a manual `UPDATE ... SET deleted_at = NULL`.
```

with:

```markdown
`DELETE` on a collection or expense is an `UPDATE` setting `deleted_at` and
`deleted_by`. Rows are never physically removed; recovery is a manual
`UPDATE ... SET deleted_at = NULL`. (`fund_allocation` appears in the SQLite
schema only — it is absent from `database-pg.js` and from production, and no route
or service reads it.)
```

- [x] **Step 5: Record the expense record model in `CLAUDE.md`**

Add to the "Architecture Notes" section, after "Soft delete — every read must filter":

```markdown
### An expense row is one line item

One `category`, one `subcategory`, one `total_amount`, and exactly one of the 17
amount columns populated — mirroring the church's own ledger, where each voucher
line names a single category. A submission carrying several amounts is one voucher
covering several lines and becomes one row per amount, sharing the voucher's date,
particular, forms number and cheque number.

`api/_lib/expenseTaxonomy.js` is the only place that maps a subcategory to its
column and fund. Both expense route copies classify writes through it and derive
`fund_source` from the category — a client-supplied `fund_source` is ignored, and
an amount on a field that is not a budget subcategory is a `400` rather than a
silent drop. It takes its labels from `reportService` so they cannot drift from the
report's row labels, which double as the `budget_categories.subcategory` lookup
key. The dependency runs one way: **`reportService` must never require it**, or its
two mirrored copies would need different relative paths and
`reportService.parity.test.js` would fail.
```

- [x] **Step 6: Mark the spec complete**

In `docs/superpowers/specs/2026-08-17-expense-write-path-and-budget-seed-design.md`,
change the `**Status:** Approved` line to `**Status:** Implemented`.

- [x] **Step 7: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-08-17-expense-write-path-and-budget-seed-design.md
git commit -m "docs: record the expense line-item model and drop the stale fund_allocation claim"
```

- [x] **Step 8: Confirm the tree is clean**

Run: `git status`
Expected: no modified tracked files. The untracked `scratch/` and `.claude/` entries
were already untracked before this work.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 The contract — category, subcategory, total_amount | Tasks 3 and 4 |
| §2 Server derives, never trusts; amount key authoritative | Task 3 Step 3 |
| §2 Fan-out of a multi-amount payload, one transaction | Task 3 Steps 1, 3 |
| §2 `kabisig_fund` → 400, never a silent drop | Task 1 (`resolveExpenseLines`), Task 3 |
| §2 `EXPENSE_FIELDS` replaced | Task 2 |
| §2 Duplicate detection, per line | Task 3 Step 3 |
| §3 One taxonomy, deriving labels from `reportService` | Task 1 |
| §4 The `PUT` fix | Task 4 |
| §5 Desktop form deliberately untouched | No task — verified by Task 7 Step 3 building an unchanged frontend |
| §6 Budget tables created, unique index, 2026 seed, 7 ministry children, parent kept | Task 6 |
| §7 Testing, both copies, parity | Tasks 1–5; parity asserted in Task 1 Step 5 and Task 5 Step 3 |
| §8 Church items: 2026 figures, Kabisig Fund | Not code — carried in the spec's "Open items" |
| Correction: stale `fund_allocation` note | Task 7 Step 4 |
| No `ALTER TABLE` on `expenses` | Task 6 touches only the budget tables |

**Placeholder scan:** none. Every code step carries its code; every run step carries
its command and expected output. The only prose-only steps are Task 7's
documentation edits, which quote the exact before and after text.

**Type consistency checked:** `resolveExpenseLines` returns
`{ lines, unknown, reason }` in Task 1 and is destructured that way in Tasks 3 and
4. A line is `{ category, subcategory, fundSource, column, amount }` — `fundSource`
is camelCase throughout, and the `fund_source` snake_case form appears only as a
database column name and a request-body key. `amountColumnValues(line)` returns an
object keyed by column name, always spread in `AMOUNT_COLUMNS` order so the column
list and the parameter array cannot drift. `AMOUNT_COLUMNS` is used for the INSERT
list, the UPDATE `SET` list, the audit assertion, and the schema test — one
definition, four readers.

**One risk worth naming:** Task 4's `changing the subcategory moves the amount`
test derives the column order by regex from the generated SQL rather than assuming
a position. That is deliberate — the `SET` clause is built from `AMOUNT_COLUMNS`,
so hardcoding an index would make the test a copy of the implementation rather
than a check on it.
