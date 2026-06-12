# Google Sheets Financial Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One church-owned Google Spreadsheet that the app updates in place — 5 generated tabs per year (Summary, Collections, Expenses, Collections Detail, Expenses Detail), synced by a button in the Reports tab.

**Architecture:** Server-computed snapshot. `reportService` (pure functions) aggregates DB rows into category × month matrices and 2D sheet grids; `googleSheetsService` (rewritten) talks to the Sheets API via service account; `routes/reports.js` wires them with an idempotent full-overwrite sync. Frontend gets an extracted `ReportsView` component. Spec: `docs/superpowers/specs/2026-06-11-google-sheets-reports-design.md`.

**Tech Stack:** Node/Express, googleapis (already in deps), SQLite + PostgreSQL (Neon) dual support, React + Tailwind, jest + supertest, React Testing Library.

**Key constraints discovered during research:**
- `database-pg.js` only converts `?` placeholders — it does NOT translate `strftime`. All new SQL must be dialect-safe (plain `date >= ? AND date <= ?` ranges; aggregate in JS).
- SQLite db methods are callback-style; the PG adapter's are promise-style. New code uses a `dbAsync` helper that handles both.
- PG (prod) is MISSING `budget_plan`/`budget_categories` tables — this plan adds them.
- PG returns `Date` objects for DATE columns; SQLite returns strings. Helpers handle both.
- `budget_categories.budget_amount` is a MONTHLY figure (verified: Utilities 15000/mo, LTO 416.67 = 5000/12). Annual = ×12.
- JWT payload includes `role` (auth.js:39). Admin = `admin` or `super_admin`.
- Routes get the db via `req.db` (injected in server.js:65-68). Route tests inject a mock db middleware (see `backend/routes/collections.dupe.test.js`).
- Backend test secret: `your-secret-key-change-this` (the `JWT_SECRET` fallback).
- Axios default timeout is 10s (`frontend/src/utils/api.js:12`) — the sync call must override it.

**File map:**

| Action | Path | Responsibility |
|---|---|---|
| Create | `backend/utils/dbAsync.js` | Promise wrapper over callback (SQLite) + promise (PG) db APIs |
| Create | `backend/services/reportService.js` | Pure aggregation + sheet grid building (no I/O) |
| Rewrite | `backend/services/googleSheetsService.js` | Sheets API: credentials, ensureTabs, writeTab, formatTab |
| Create | `backend/routes/reports.js` | sync-sheet / sheet-status / sheet-config endpoints |
| Modify | `backend/config/database.js` | Add `app_settings`, `report_syncs` tables |
| Modify | `backend/config/database-pg.js` | Add `app_settings`, `report_syncs`, `budget_plan`, `budget_categories` |
| Modify | `backend/server.js` | Mount `/api/reports`; remove `/api/google-sheets` |
| Delete | `backend/routes/googleSheets.js` | Superseded (only consumer was the deleted modal) |
| Modify | `frontend/src/utils/api.js` | 3 new methods |
| Create | `frontend/src/components/ReportsView.js` | Extracted reports view + Sheets card |
| Modify | `frontend/src/components/Dashboard.js` | Use ReportsView; drop modal + state |
| Delete | `frontend/src/components/UpdateGoogleSheetModal.js` | Superseded |
| Create | `docs/GOOGLE_SHEETS_REPORT_SETUP.md` | Service-account setup guide |
| Tests | `backend/utils/dbAsync.test.js`, `backend/services/reportService.test.js`, `backend/services/googleSheetsService.test.js`, `backend/routes/reports.test.js`, `frontend/src/components/ReportsView.test.js` | |

All backend test commands run from `backend/`; frontend from `frontend/`. Commit after every task.

---

### Task 1: dbAsync helper

**Files:**
- Create: `backend/utils/dbAsync.js`
- Test: `backend/utils/dbAsync.test.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/utils/dbAsync.test.js
const { dbAll, dbGet, dbRun } = require("./dbAsync");

describe("dbAsync", () => {
  test("resolves via callback style (sqlite3)", async () => {
    const db = { all: (sql, params, cb) => cb(null, [{ id: 1 }]) };
    await expect(dbAll(db, "SELECT 1", [])).resolves.toEqual([{ id: 1 }]);
  });

  test("rejects via callback error (sqlite3)", async () => {
    const db = { get: (sql, params, cb) => cb(new Error("boom")) };
    await expect(dbGet(db, "SELECT 1", [])).rejects.toThrow("boom");
  });

  test("resolves via promise style (pg adapter ignores callback arg)", async () => {
    const db = { all: async (sql, params) => [{ id: 2 }] };
    await expect(dbAll(db, "SELECT 1", [])).resolves.toEqual([{ id: 2 }]);
  });

  test("rejects via promise style", async () => {
    const db = { run: async () => { throw new Error("pg down"); } };
    await expect(dbRun(db, "INSERT", [])).rejects.toThrow("pg down");
  });

  test("params default to empty array", async () => {
    const db = { get: jest.fn((sql, params, cb) => cb(null, { ok: true })) };
    await dbGet(db, "SELECT 1");
    expect(db.get).toHaveBeenCalledWith("SELECT 1", [], expect.any(Function));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest utils/dbAsync.test.js -v`
Expected: FAIL — `Cannot find module './dbAsync'`

- [ ] **Step 3: Write minimal implementation**

```js
// backend/utils/dbAsync.js
// SQLite (sqlite3) db methods are callback-style; the PG adapter
// (config/database-pg.js) exposes async methods that ignore a callback arg.
// These wrappers support both: whichever settles first wins.
function callAsync(db, method, sql, params) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ok = (val) => { if (!settled) { settled = true; resolve(val); } };
    const fail = (err) => { if (!settled) { settled = true; reject(err); } };
    const maybe = db[method](sql, params, (err, result) =>
      err ? fail(err) : ok(result)
    );
    if (maybe && typeof maybe.then === "function") maybe.then(ok, fail);
  });
}

const dbAll = (db, sql, params = []) => callAsync(db, "all", sql, params);
const dbGet = (db, sql, params = []) => callAsync(db, "get", sql, params);
const dbRun = (db, sql, params = []) => callAsync(db, "run", sql, params);

module.exports = { dbAll, dbGet, dbRun };
```

Note: on SQLite, `dbRun` resolves `undefined` (sqlite3's run callback passes no result); on PG it resolves `{ lastID, changes }`. Callers in this plan never use the resolved value of `dbRun`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest utils/dbAsync.test.js -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/utils/dbAsync.js backend/utils/dbAsync.test.js
git commit -m "feat: add dbAsync helper bridging sqlite callback and pg promise APIs"
```

---

### Task 2: Schema additions (both databases)

**Files:**
- Modify: `backend/config/database.js` (after the `custom_field_values` CREATE TABLE, ~line 185, inside the same init SQL template)
- Modify: `backend/config/database-pg.js` (inside `initializeTables()`, after the `custom_field_values` CREATE TABLE, ~line 183)

- [ ] **Step 1: Add tables to SQLite schema**

In `backend/config/database.js`, inside the initialization SQL template literal, after the `custom_field_values` table statement, add:

```sql
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS report_syncs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        year INTEGER NOT NULL,
        spreadsheet_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('success','failed')),
        error TEXT,
        synced_by TEXT,
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
```

- [ ] **Step 2: Add tables to PostgreSQL schema**

In `backend/config/database-pg.js`, inside `initializeTables()`, after the `custom_field_values` CREATE TABLE statement (match the file's existing style — it runs statements via `await this.pool.query(...)` or one combined SQL string; read the file and follow its pattern), add the two tables above in PG dialect PLUS the budget tables that exist in SQLite but are missing in PG:

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

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_by TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS report_syncs (
        id SERIAL PRIMARY KEY,
        year INTEGER NOT NULL,
        spreadsheet_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('success','failed')),
        error TEXT,
        synced_by TEXT,
        synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
```

- [ ] **Step 3: Verify SQLite tables get created**

Run (from `backend/`):

```bash
node -e "
const db = require('./config/database');
setTimeout(() => {
  db.all(\"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('app_settings','report_syncs')\", [], (err, rows) => {
    if (err) throw err;
    console.log(rows.map(r => r.name).sort().join(','));
    process.exit(0);
  });
}, 800);
"
```

Expected output: `app_settings,report_syncs`

- [ ] **Step 4: Verify no existing tests broke**

Run: `npx jest 2>&1 | tail -5`
Expected: all suites pass

- [ ] **Step 5: Commit**

```bash
git add backend/config/database.js backend/config/database-pg.js
git commit -m "feat: add app_settings + report_syncs tables; add missing budget tables to PG schema"
```

---
### Task 3: reportService — aggregateCollections

**Files:**
- Create: `backend/services/reportService.js`
- Test: `backend/services/reportService.test.js`

- [ ] **Step 1: Write the failing test**

```js
// backend/services/reportService.test.js
const {
  aggregateCollections,
} = require("./reportService");

// Fixture: a collection row with all amount columns zeroed
const col = (date, fields = {}) => ({
  date,
  total_amount: 0,
  general_tithes_offering: 0, bank_interest: 0,
  sisterhood_san_juan: 0, sisterhood_labuin: 0, brotherhood: 0,
  youth: 0, couples: 0, sunday_school: 0, special_purpose_pledge: 0,
  pbcm_share: 0, pastoral_team_share: 0, operational_fund_share: 0,
  ...fields,
});

describe("aggregateCollections", () => {
  test("sums categories into month buckets with totals", () => {
    const rows = [
      col("2025-01-05", { general_tithes_offering: 1000, total_amount: 1000, pbcm_share: 100, pastoral_team_share: 100, operational_fund_share: 800 }),
      col("2025-01-19", { general_tithes_offering: 500, youth: 50, total_amount: 550, pbcm_share: 50, pastoral_team_share: 50, operational_fund_share: 400 }),
      col("2025-03-02", { sunday_school: 200, total_amount: 200 }),
    ];
    const agg = aggregateCollections(rows);

    const gto = agg.categories.find((c) => c.key === "general_tithes_offering");
    expect(gto.label).toBe("General Tithes & Offering");
    expect(gto.months[0]).toBe(1500);   // Jan
    expect(gto.months[2]).toBe(0);      // Mar
    expect(gto.total).toBe(1500);

    const ss = agg.categories.find((c) => c.key === "sunday_school");
    expect(ss.months[2]).toBe(200);

    expect(agg.categories).toHaveLength(9);
    expect(agg.monthlyTotals[0]).toBe(1550);
    expect(agg.monthlyTotals[2]).toBe(200);
    expect(agg.grandTotal).toBe(1750);

    expect(agg.shares.pbcm[0]).toBe(150);
    expect(agg.shares.pastoral[0]).toBe(150);
    expect(agg.shares.operational[0]).toBe(1200);
  });

  test("handles Date objects (PostgreSQL returns Date for DATE columns)", () => {
    const agg = aggregateCollections([
      col(new Date(2025, 2, 15), { bank_interest: 33.33, total_amount: 33.33 }),
    ]);
    expect(agg.categories.find((c) => c.key === "bank_interest").months[2]).toBe(33.33);
  });

  test("empty input produces zeroed structure", () => {
    const agg = aggregateCollections([]);
    expect(agg.grandTotal).toBe(0);
    expect(agg.monthlyTotals).toEqual(Array(12).fill(0));
    expect(agg.categories.every((c) => c.total === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest services/reportService.test.js -v`
Expected: FAIL — `Cannot find module './reportService'`

- [ ] **Step 3: Write the implementation**

```js
// backend/services/reportService.js
// Pure aggregation + sheet-grid building. No I/O — callers fetch rows.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const COLLECTION_CATEGORIES = [
  { key: "general_tithes_offering", label: "General Tithes & Offering" },
  { key: "bank_interest", label: "Bank Interest" },
  { key: "sisterhood_san_juan", label: "Sisterhood San Juan" },
  { key: "sisterhood_labuin", label: "Sisterhood Labuin" },
  { key: "brotherhood", label: "Brotherhood" },
  { key: "youth", label: "Youth" },
  { key: "couples", label: "Couples" },
  { key: "sunday_school", label: "Sunday School" },
  { key: "special_purpose_pledge", label: "Special/Pledge" },
];

// label doubles as the budget_categories.subcategory lookup key (exact seeded strings)
const OPERATIONAL_EXPENSE_CATEGORIES = [
  { key: "pastoral_worker_support", label: "Pastoral & Worker Support" },
  { key: "cap_assistance", label: "CAP-Churches Assistance Program" },
  { key: "honorarium", label: "Honorarium" },
  { key: "conference_seminar", label: "Conference/Seminar/Retreat/Assembly" },
  { key: "fellowship_events", label: "Fellowship Events" },
  { key: "anniversary_christmas", label: "Anniversary/Christmas Events" },
  { key: "supplies", label: "Supplies" },
  { key: "utilities", label: "Utilities" },
  { key: "vehicle_maintenance", label: "Vehicle Maintenance" },
  { key: "lto_registration", label: "LTO Registration" },
  { key: "transportation_gas", label: "Transportation & Gas" },
  { key: "building_maintenance", label: "Building Maintenance" },
  { key: "abccop_national", label: "ABCCOP National" },
  { key: "cbcc_share", label: "CBCC Share" },
  { key: "kabalikat_share", label: "Kabalikat Share" },
  { key: "abccop_community", label: "ABCCOP Community Day" },
];

const round2 = (n) => Math.round(n * 100) / 100;
const zeros12 = () => Array(12).fill(0);

// SQLite returns "YYYY-MM-DD" strings; PG returns Date objects
function monthIndex(dateVal) {
  if (dateVal instanceof Date) return dateVal.getMonth();
  return parseInt(String(dateVal).slice(5, 7), 10) - 1;
}

function dateString(dateVal) {
  if (dateVal instanceof Date) return dateVal.toISOString().slice(0, 10);
  return String(dateVal).slice(0, 10);
}

function aggregateCollections(rows) {
  const categories = COLLECTION_CATEGORIES.map((c) => ({ ...c, months: zeros12(), total: 0 }));
  const shares = { pbcm: zeros12(), pastoral: zeros12(), operational: zeros12() };
  const monthlyTotals = zeros12();

  for (const row of rows) {
    const m = monthIndex(row.date);
    if (m < 0 || m > 11 || Number.isNaN(m)) continue;
    for (const cat of categories) {
      const amount = parseFloat(row[cat.key]) || 0;
      if (!amount) continue;
      cat.months[m] = round2(cat.months[m] + amount);
      cat.total = round2(cat.total + amount);
    }
    monthlyTotals[m] = round2(monthlyTotals[m] + (parseFloat(row.total_amount) || 0));
    shares.pbcm[m] = round2(shares.pbcm[m] + (parseFloat(row.pbcm_share) || 0));
    shares.pastoral[m] = round2(shares.pastoral[m] + (parseFloat(row.pastoral_team_share) || 0));
    shares.operational[m] = round2(shares.operational[m] + (parseFloat(row.operational_fund_share) || 0));
  }

  const grandTotal = round2(monthlyTotals.reduce((a, b) => a + b, 0));
  return { categories, monthlyTotals, grandTotal, shares };
}

module.exports = {
  MONTHS,
  COLLECTION_CATEGORIES,
  OPERATIONAL_EXPENSE_CATEGORIES,
  round2,
  monthIndex,
  dateString,
  aggregateCollections,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest services/reportService.test.js -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/reportService.js backend/services/reportService.test.js
git commit -m "feat: add reportService with collections aggregation"
```

---

### Task 4: reportService — aggregateExpenses

**Files:**
- Modify: `backend/services/reportService.js`
- Test: `backend/services/reportService.test.js`

- [ ] **Step 1: Add the failing tests**

Append to `backend/services/reportService.test.js` (add `aggregateExpenses` to the require at the top):

```js
const exp = (date, fields = {}) => ({
  date,
  total_amount: 0,
  fund_source: "operational",
  pbcm_share_expense: 0, pastoral_worker_support: 0, cap_assistance: 0,
  honorarium: 0, conference_seminar: 0, fellowship_events: 0,
  anniversary_christmas: 0, supplies: 0, utilities: 0,
  vehicle_maintenance: 0, lto_registration: 0, transportation_gas: 0,
  building_maintenance: 0, abccop_national: 0, cbcc_share: 0,
  kabalikat_share: 0, abccop_community: 0,
  ...fields,
});

describe("aggregateExpenses", () => {
  const budgetRows = [
    { category: "PBCM Share/PDOT", subcategory: "PBCM Share", budget_amount: 9500 },
    { category: "Pastoral Team", subcategory: "Pastoral Team", budget_amount: 9500 },
    { category: "Operational Fund", subcategory: "Utilities", budget_amount: 15000 },
  ];

  test("groups into three fund sections with budget matching", () => {
    const rows = [
      exp("2025-01-10", { utilities: 500, supplies: 250, total_amount: 750 }),
      exp("2025-01-20", { pbcm_share_expense: 39800, total_amount: 39800 }),
      exp("2025-02-14", { fund_source: "pastoral_team", total_amount: 1200 }),
    ];
    const agg = aggregateExpenses(rows, budgetRows);

    expect(agg.sections.map((s) => s.label)).toEqual([
      "PBCM Share/PDOT (10%)",
      "Pastoral Team (10%)",
      "Operational Fund (80%)",
    ]);

    const pbcm = agg.sections[0].rows[0];
    expect(pbcm.months[0]).toBe(39800);
    expect(pbcm.monthlyBudget).toBe(9500);
    expect(pbcm.annualBudget).toBe(114000);
    expect(pbcm.variance).toBe(114000 - 39800);

    const pastoral = agg.sections[1].rows[0];
    expect(pastoral.months[1]).toBe(1200);
    expect(pastoral.total).toBe(1200);

    const utilities = agg.sections[2].rows.find((r) => r.key === "utilities");
    expect(utilities.months[0]).toBe(500);
    expect(utilities.monthlyBudget).toBe(15000);
    expect(utilities.annualBudget).toBe(180000);
    expect(utilities.variance).toBe(179500);

    const suppliesRow = agg.sections[2].rows.find((r) => r.key === "supplies");
    expect(suppliesRow.monthlyBudget).toBeNull();   // no budget row seeded
    expect(suppliesRow.annualBudget).toBeNull();
    expect(suppliesRow.variance).toBeNull();

    expect(agg.sections[2].rows).toHaveLength(16);
    expect(agg.monthlyTotals[0]).toBe(40550);
    expect(agg.monthlyTotals[1]).toBe(1200);
    expect(agg.grandTotal).toBe(41750);
  });

  test("no budget rows → all budget fields null", () => {
    const agg = aggregateExpenses([exp("2025-04-01", { honorarium: 100, total_amount: 100 })], []);
    expect(agg.sections[2].rows.find((r) => r.key === "honorarium").monthlyBudget).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx jest services/reportService.test.js -v`
Expected: FAIL — `aggregateExpenses is not a function`

- [ ] **Step 3: Implement**

Add to `backend/services/reportService.js` (and export it):

```js
function aggregateExpenses(rows, budgetRows) {
  const budgetBySubcat = {};
  for (const b of budgetRows || []) {
    budgetBySubcat[b.subcategory || b.category] = parseFloat(b.budget_amount) || 0;
  }

  const makeRow = (key, label, budgetKey) => ({
    key,
    label,
    monthlyBudget: budgetKey in budgetBySubcat ? budgetBySubcat[budgetKey] : null,
    months: zeros12(),
    total: 0,
  });

  const pbcmRow = makeRow("pbcm_share_expense", "PBCM Share/PDOT", "PBCM Share");
  const pastoralRow = makeRow("pastoral_team", "Pastoral Team", "Pastoral Team");
  const operationalRows = OPERATIONAL_EXPENSE_CATEGORIES.map((c) => makeRow(c.key, c.label, c.label));

  const monthlyTotals = zeros12();

  for (const row of rows) {
    const m = monthIndex(row.date);
    if (m < 0 || m > 11 || Number.isNaN(m)) continue;
    const add = (target, amount) => {
      if (!amount) return;
      target.months[m] = round2(target.months[m] + amount);
      target.total = round2(target.total + amount);
    };
    add(pbcmRow, parseFloat(row.pbcm_share_expense) || 0);
    if (row.fund_source === "pastoral_team") add(pastoralRow, parseFloat(row.total_amount) || 0);
    for (let i = 0; i < OPERATIONAL_EXPENSE_CATEGORIES.length; i++) {
      add(operationalRows[i], parseFloat(row[OPERATIONAL_EXPENSE_CATEGORIES[i].key]) || 0);
    }
    monthlyTotals[m] = round2(monthlyTotals[m] + (parseFloat(row.total_amount) || 0));
  }

  const finalize = (r) => ({
    ...r,
    annualBudget: r.monthlyBudget == null ? null : round2(r.monthlyBudget * 12),
    variance: r.monthlyBudget == null ? null : round2(r.monthlyBudget * 12 - r.total),
  });

  const sections = [
    { label: "PBCM Share/PDOT (10%)", rows: [finalize(pbcmRow)] },
    { label: "Pastoral Team (10%)", rows: [finalize(pastoralRow)] },
    { label: "Operational Fund (80%)", rows: operationalRows.map(finalize) },
  ];

  const grandTotal = round2(monthlyTotals.reduce((a, b) => a + b, 0));
  return { sections, monthlyTotals, grandTotal };
}
```

Add `aggregateExpenses` to `module.exports`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest services/reportService.test.js -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/reportService.js backend/services/reportService.test.js
git commit -m "feat: add expense aggregation with fund grouping and budget variance"
```

---
### Task 5: reportService — buildSummary

**Files:**
- Modify: `backend/services/reportService.js`
- Test: `backend/services/reportService.test.js`

- [ ] **Step 1: Add the failing test**

Append to the test file (add `buildSummary`, `aggregateCollections`, `aggregateExpenses` to the require):

```js
describe("buildSummary", () => {
  test("computes overview, allocation, and fund position", () => {
    const colAgg = aggregateCollections([
      col("2025-01-05", { general_tithes_offering: 1000, total_amount: 1000, pbcm_share: 100, pastoral_team_share: 100, operational_fund_share: 800 }),
      col("2025-02-02", { general_tithes_offering: 2000, total_amount: 2000, pbcm_share: 200, pastoral_team_share: 200, operational_fund_share: 1600 }),
    ]);
    const expAgg = aggregateExpenses([
      exp("2025-01-10", { utilities: 600, total_amount: 600 }),
      exp("2025-02-14", { pbcm_share_expense: 50, total_amount: 50 }),
    ], []);

    const s = buildSummary(colAgg, expAgg);

    expect(s.monthlyOverview.collections[0]).toBe(1000);
    expect(s.monthlyOverview.expenses[0]).toBe(600);
    expect(s.monthlyOverview.net[0]).toBe(400);
    expect(s.monthlyOverview.net[1]).toBe(1950);
    expect(s.monthlyOverview.runningBalance[0]).toBe(400);
    expect(s.monthlyOverview.runningBalance[1]).toBe(2350);
    expect(s.monthlyOverview.runningBalance[11]).toBe(2350);

    expect(s.fundAllocation).toHaveLength(3);
    expect(s.fundAllocation[0]).toMatchObject({ label: "PBCM/PDOT Share", pct: "10%", total: 300 });
    expect(s.fundAllocation[2]).toMatchObject({ label: "Operational Fund", pct: "80%", total: 2400 });

    // fund position: spent comes from the matching expense section totals
    expect(s.fundPosition[0]).toEqual({ label: "PBCM/PDOT Share", allocated: 300, spent: 50, remaining: 250 });
    expect(s.fundPosition[2]).toEqual({ label: "Operational Fund", allocated: 2400, spent: 600, remaining: 1800 });

    expect(s.totals).toEqual({ collections: 3000, expenses: 650, net: 2350 });
  });
});
```

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `npx jest services/reportService.test.js -v`
Expected: FAIL — `buildSummary is not a function`

- [ ] **Step 3: Implement**

Add to `backend/services/reportService.js` (and export):

```js
function buildSummary(colAgg, expAgg) {
  const net = colAgg.monthlyTotals.map((c, i) => round2(c - expAgg.monthlyTotals[i]));
  const runningBalance = [];
  let acc = 0;
  for (let i = 0; i < 12; i++) {
    acc = round2(acc + net[i]);
    runningBalance.push(acc);
  }

  const sumArr = (arr) => round2(arr.reduce((a, b) => a + b, 0));
  const fundAllocation = [
    { label: "PBCM/PDOT Share", pct: "10%", months: colAgg.shares.pbcm, total: sumArr(colAgg.shares.pbcm) },
    { label: "Pastoral Team", pct: "10%", months: colAgg.shares.pastoral, total: sumArr(colAgg.shares.pastoral) },
    { label: "Operational Fund", pct: "80%", months: colAgg.shares.operational, total: sumArr(colAgg.shares.operational) },
  ];

  // Section order matches fundAllocation order: PBCM, Pastoral, Operational
  const spentPerFund = expAgg.sections.map((s) =>
    round2(s.rows.reduce((sum, r) => sum + r.total, 0))
  );
  const fundPosition = fundAllocation.map((f, i) => ({
    label: f.label,
    allocated: f.total,
    spent: spentPerFund[i],
    remaining: round2(f.total - spentPerFund[i]),
  }));

  return {
    monthlyOverview: {
      collections: colAgg.monthlyTotals,
      expenses: expAgg.monthlyTotals,
      net,
      runningBalance,
    },
    fundAllocation,
    fundPosition,
    totals: {
      collections: colAgg.grandTotal,
      expenses: expAgg.grandTotal,
      net: round2(colAgg.grandTotal - expAgg.grandTotal),
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest services/reportService.test.js -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/reportService.js backend/services/reportService.test.js
git commit -m "feat: add summary builder (overview, fund allocation, fund position)"
```

---

### Task 6: reportService — buildSheetGrids

**Files:**
- Modify: `backend/services/reportService.js`
- Test: `backend/services/reportService.test.js`

Grid objects have shape `{ title, values, fmt }` where `values` is a 2D array (row 0 = sheet row 1) and `fmt` is `{ frozenRowCount, boldRows, currencyRanges }` with 0-based GridRange fields (`startRowIndex`, `endRowIndex` exclusive, `startColumnIndex`, `endColumnIndex` exclusive).

- [ ] **Step 1: Add the failing tests**

Append (add `buildSheetGrids` to the require):

```js
describe("buildSheetGrids", () => {
  const SYNCED = "6/11/2026, 3:42:00 PM";

  function makeGrids() {
    const collections = [
      col("2025-01-05", { general_tithes_offering: 1000, total_amount: 1000, pbcm_share: 100, pastoral_team_share: 100, operational_fund_share: 800, particular: "Sunday Service", control_number: "C-001", payment_method: "Cash" }),
    ];
    const expenses = [
      exp("2025-01-10", { utilities: 600, total_amount: 600, particular: "Meralco", forms_number: "F-01", cheque_number: "", category: "Operational Fund" }),
    ];
    const colAgg = aggregateCollections(collections);
    const expAgg = aggregateExpenses(expenses, [
      { category: "Operational Fund", subcategory: "Utilities", budget_amount: 15000 },
    ]);
    const summary = buildSummary(colAgg, expAgg);
    return buildSheetGrids(2025, { colAgg, expAgg, summary, collectionRows: collections, expenseRows: expenses }, SYNCED);
  }

  test("returns 5 grids with year-prefixed titles in order", () => {
    expect(makeGrids().map((g) => g.title)).toEqual([
      "2025 Summary",
      "2025 Collections",
      "2025 Expenses",
      "2025 Collections Detail",
      "2025 Expenses Detail",
    ]);
  });

  test("collections grid: header, SUM formulas, totals row, sync stamp", () => {
    const grid = makeGrids()[1];
    expect(grid.values[0]).toEqual(["Category", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Total"]);
    // 9 category rows at sheet rows 2-10
    expect(grid.values[1][0]).toBe("General Tithes & Offering");
    expect(grid.values[1][1]).toBe(1000);
    expect(grid.values[1][13]).toBe("=SUM(B2:M2)");
    // totals row at sheet row 11
    expect(grid.values[10][0]).toBe("Total");
    expect(grid.values[10][1]).toBe("=SUM(B2:B10)");
    expect(grid.values[10][13]).toBe("=SUM(N2:N10)");
    // stamp
    expect(grid.values[grid.values.length - 1][0]).toContain(SYNCED);
    expect(grid.fmt.frozenRowCount).toBe(1);
    expect(grid.fmt.boldRows).toEqual([0, 10]);
  });

  test("expenses grid: section rows, budget columns, variance formulas", () => {
    const grid = makeGrids()[2];
    expect(grid.values[0]).toEqual(["Category", "Monthly Budget", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Actual Total", "Annual Budget", "Variance"]);
    expect(grid.values[1]).toEqual(["PBCM Share/PDOT (10%)"]);          // section header
    expect(grid.values[2][0]).toBe("PBCM Share/PDOT");                  // sheet row 3
    expect(grid.values[2][14]).toBe("=SUM(C3:N3)");
    expect(grid.values[3]).toEqual(["Pastoral Team (10%)"]);
    expect(grid.values[5]).toEqual(["Operational Fund (80%)"]);
    const utilRowIdx = grid.values.findIndex((r) => r[0] === "Utilities");
    const sheetRow = utilRowIdx + 1;
    expect(grid.values[utilRowIdx][1]).toBe(15000);
    expect(grid.values[utilRowIdx][15]).toBe(180000);
    expect(grid.values[utilRowIdx][16]).toBe(`=P${sheetRow}-O${sheetRow}`);
    // totals row: first cell "Total", monthly sums span all data rows
    const totalIdx = grid.values.findIndex((r) => r[0] === "Total");
    expect(grid.values[totalIdx][2]).toBe(`=SUM(C2:C${totalIdx})`);
  });

  test("summary grid: title, overview formulas, fund position", () => {
    const grid = makeGrids()[0];
    expect(grid.values[0][0]).toBe("SBCC FINANCIAL REPORT 2025");
    expect(grid.values[1][0]).toContain(SYNCED);
    expect(grid.values[3][0]).toBe("MONTHLY OVERVIEW");
    expect(grid.values[4][0]).toBe("Total Collections");
    expect(grid.values[4][13]).toBe("=SUM(B5:M5)");
    expect(grid.values[6][1]).toBe("=B5-B6");
    expect(grid.values[10]).toEqual(["Fund", "Share", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Total"]);
    expect(grid.values[11][0]).toBe("PBCM/PDOT Share");
    expect(grid.values[11][14]).toBe("=SUM(C12:N12)");
    expect(grid.values[16]).toEqual(["Fund", "Allocated", "Spent", "Remaining"]);
    expect(grid.values[17][3]).toBe("=B18-C18");
  });

  test("detail grids: one row per record with date strings", () => {
    const grids = makeGrids();
    const colDetail = grids[3];
    expect(colDetail.values[0].slice(0, 4)).toEqual(["Date", "Particular", "Control #", "Payment Method"]);
    expect(colDetail.values[1][0]).toBe("2025-01-05");
    expect(colDetail.values[1][1]).toBe("Sunday Service");
    expect(colDetail.values[1][13]).toBe(1000); // Total column
    const expDetail = grids[4];
    expect(expDetail.values[0]).toEqual(["Date", "Particular", "Forms #", "Cheque #", "Category", "Fund Source", "Amount"]);
    expect(expDetail.values[1]).toEqual(["2025-01-10", "Meralco", "F-01", "", "Operational Fund", "operational", 600]);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx jest services/reportService.test.js -v`
Expected: FAIL — `buildSheetGrids is not a function`

- [ ] **Step 3: Implement the grid builders**

Add to `backend/services/reportService.js` (export only `buildSheetGrids`; the per-tab builders stay private):

```js
function colLetter(idx) {
  let s = "";
  let n = idx + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const syncStamp = (syncedAt) => `Last synced from SBCC Financial System on ${syncedAt}`;

function buildSummaryGrid(year, summary, syncedAt) {
  const { monthlyOverview: mo, fundAllocation, fundPosition } = summary;
  const values = [
    [`SBCC FINANCIAL REPORT ${year}`],
    [syncStamp(syncedAt)],
    [],
    ["MONTHLY OVERVIEW", ...MONTHS, "Total"],
    ["Total Collections", ...mo.collections, "=SUM(B5:M5)"],
    ["Total Expenses", ...mo.expenses, "=SUM(B6:M6)"],
    ["Net Surplus/(Deficit)", ...MONTHS.map((_, i) => `=${colLetter(i + 1)}5-${colLetter(i + 1)}6`), "=N5-N6"],
    ["Running Balance", ...mo.runningBalance, ""],
    [],
    ["FUND ALLOCATION (from General Tithes & Offering)"],
    ["Fund", "Share", ...MONTHS, "Total"],
  ];
  fundAllocation.forEach((f) => {
    const r = values.length + 1;
    values.push([f.label, f.pct, ...f.months, `=SUM(C${r}:N${r})`]);
  });
  values.push([]);
  values.push(["FUND POSITION (Year to Date)"]);
  values.push(["Fund", "Allocated", "Spent", "Remaining"]);
  fundPosition.forEach((f) => {
    const r = values.length + 1;
    values.push([f.label, f.allocated, f.spent, `=B${r}-C${r}`]);
  });
  return {
    title: `${year} Summary`,
    values,
    fmt: {
      frozenRowCount: 0,
      boldRows: [0, 3, 9, 10, 15, 16],
      currencyRanges: [
        { startRowIndex: 4, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 14 },
        { startRowIndex: 11, endRowIndex: 14, startColumnIndex: 2, endColumnIndex: 15 },
        { startRowIndex: 17, endRowIndex: 20, startColumnIndex: 1, endColumnIndex: 4 },
      ],
    },
  };
}

function buildCollectionsGrid(year, colAgg, syncedAt) {
  const values = [["Category", ...MONTHS, "Total"]];
  colAgg.categories.forEach((cat) => {
    const r = values.length + 1;
    values.push([cat.label, ...cat.months, `=SUM(B${r}:M${r})`]);
  });
  const lastDataRow = values.length;          // 1-based sheet row of last category
  const totalIdx = values.length;             // 0-based index of totals row
  const totalRow = ["Total"];
  for (let c = 1; c <= 13; c++) {
    const L = colLetter(c);
    totalRow.push(`=SUM(${L}2:${L}${lastDataRow})`);
  }
  values.push(totalRow);
  values.push([]);
  values.push([syncStamp(syncedAt)]);
  return {
    title: `${year} Collections`,
    values,
    fmt: {
      frozenRowCount: 1,
      boldRows: [0, totalIdx],
      currencyRanges: [
        { startRowIndex: 1, endRowIndex: totalIdx + 1, startColumnIndex: 1, endColumnIndex: 14 },
      ],
    },
  };
}

function buildExpensesGrid(year, expAgg, syncedAt) {
  const values = [["Category", "Monthly Budget", ...MONTHS, "Actual Total", "Annual Budget", "Variance"]];
  const sectionRowIdxs = [];
  for (const section of expAgg.sections) {
    sectionRowIdxs.push(values.length);
    values.push([section.label]);
    for (const row of section.rows) {
      const r = values.length + 1;
      values.push([
        row.label,
        row.monthlyBudget == null ? "" : row.monthlyBudget,
        ...row.months,
        `=SUM(C${r}:N${r})`,
        row.annualBudget == null ? "" : row.annualBudget,
        row.annualBudget == null ? "" : `=P${r}-O${r}`,
      ]);
    }
  }
  const lastDataRow = values.length;          // 1-based sheet row of last category row
  const totalIdx = values.length;
  const tr = totalIdx + 1;
  const totalRow = ["Total"];
  for (let c = 1; c <= 16; c++) {
    const L = colLetter(c);
    // SUM over the whole block — text section rows are ignored by SUM
    totalRow.push(L === "Q" ? `=P${tr}-O${tr}` : `=SUM(${L}2:${L}${lastDataRow})`);
  }
  values.push(totalRow);
  values.push([]);
  values.push([syncStamp(syncedAt)]);
  return {
    title: `${year} Expenses`,
    values,
    fmt: {
      frozenRowCount: 1,
      boldRows: [0, ...sectionRowIdxs, totalIdx],
      currencyRanges: [
        { startRowIndex: 1, endRowIndex: totalIdx + 1, startColumnIndex: 1, endColumnIndex: 17 },
      ],
    },
  };
}

function buildCollectionsDetailGrid(year, rows, syncedAt) {
  const values = [[
    "Date", "Particular", "Control #", "Payment Method",
    ...COLLECTION_CATEGORIES.map((c) => c.label),
    "Total",
  ]];
  for (const row of rows) {
    values.push([
      dateString(row.date),
      row.particular || "",
      row.control_number || "",
      row.payment_method || "",
      ...COLLECTION_CATEGORIES.map((c) => parseFloat(row[c.key]) || 0),
      parseFloat(row.total_amount) || 0,
    ]);
  }
  const lastRow = values.length;
  values.push([]);
  values.push([syncStamp(syncedAt)]);
  return {
    title: `${year} Collections Detail`,
    values,
    fmt: {
      frozenRowCount: 1,
      boldRows: [0],
      currencyRanges: [
        { startRowIndex: 1, endRowIndex: lastRow, startColumnIndex: 4, endColumnIndex: 14 },
      ],
    },
  };
}

function buildExpensesDetailGrid(year, rows, syncedAt) {
  const values = [["Date", "Particular", "Forms #", "Cheque #", "Category", "Fund Source", "Amount"]];
  for (const row of rows) {
    values.push([
      dateString(row.date),
      row.particular || "",
      row.forms_number || "",
      row.cheque_number || "",
      row.category || "",
      row.fund_source || "",
      parseFloat(row.total_amount) || 0,
    ]);
  }
  const lastRow = values.length;
  values.push([]);
  values.push([syncStamp(syncedAt)]);
  return {
    title: `${year} Expenses Detail`,
    values,
    fmt: {
      frozenRowCount: 1,
      boldRows: [0],
      currencyRanges: [
        { startRowIndex: 1, endRowIndex: lastRow, startColumnIndex: 6, endColumnIndex: 7 },
      ],
    },
  };
}

function buildSheetGrids(year, { colAgg, expAgg, summary, collectionRows, expenseRows }, syncedAt) {
  return [
    buildSummaryGrid(year, summary, syncedAt),
    buildCollectionsGrid(year, colAgg, syncedAt),
    buildExpensesGrid(year, expAgg, syncedAt),
    buildCollectionsDetailGrid(year, collectionRows, syncedAt),
    buildExpensesDetailGrid(year, expenseRows, syncedAt),
  ];
}
```

Add `buildSummary` and `buildSheetGrids` to `module.exports`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest services/reportService.test.js -v`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/reportService.js backend/services/reportService.test.js
git commit -m "feat: add sheet grid builders for the five report tabs"
```

---
### Task 7: googleSheetsService rewrite

**Files:**
- Rewrite: `backend/services/googleSheetsService.js` (replace entire file — its old methods reference columns that no longer exist and its only consumer is being deleted)
- Test: `backend/services/googleSheetsService.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// backend/services/googleSheetsService.test.js
jest.mock("googleapis", () => {
  const sheetsApi = {
    spreadsheets: {
      get: jest.fn(),
      batchUpdate: jest.fn(),
      values: { clear: jest.fn(), update: jest.fn() },
    },
  };
  return {
    google: {
      auth: { GoogleAuth: jest.fn() },
      sheets: jest.fn(() => sheetsApi),
      __sheetsApi: sheetsApi,
    },
  };
});

const SA_JSON = JSON.stringify({
  client_email: "sa@test.iam.gserviceaccount.com",
  private_key: "fake-key",
});

describe("googleSheetsService", () => {
  let service;
  let sheetsApi;

  beforeEach(() => {
    jest.resetModules();
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = SA_JSON;
    const { google } = require("googleapis");
    sheetsApi = google.__sheetsApi;
    service = require("./googleSheetsService");
  });

  afterEach(() => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  });

  test("initializes from GOOGLE_SERVICE_ACCOUNT_JSON env var", () => {
    expect(service.isReady()).toBe(true);
    expect(service.getServiceAccountEmail()).toBe("sa@test.iam.gserviceaccount.com");
  });

  test("not ready when no env var and no credentials file", () => {
    jest.resetModules();
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const fresh = require("./googleSheetsService");
    // repo has no backend/config/google-credentials.json
    expect(fresh.isReady()).toBe(false);
    expect(fresh.getServiceAccountEmail()).toBeNull();
  });

  test("ensureTabs creates only missing tabs and returns title→sheetId map", async () => {
    service.isReady();
    sheetsApi.spreadsheets.get.mockResolvedValue({
      data: { sheets: [{ properties: { title: "2025 Summary", sheetId: 11 } }] },
    });
    sheetsApi.spreadsheets.batchUpdate.mockResolvedValue({
      data: { replies: [{ addSheet: { properties: { title: "2025 Collections", sheetId: 22 } } }] },
    });

    const map = await service.ensureTabs("sheet-1", ["2025 Summary", "2025 Collections"]);

    expect(map).toEqual({ "2025 Summary": 11, "2025 Collections": 22 });
    expect(sheetsApi.spreadsheets.batchUpdate).toHaveBeenCalledWith({
      spreadsheetId: "sheet-1",
      resource: { requests: [{ addSheet: { properties: { title: "2025 Collections" } } }] },
    });
  });

  test("ensureTabs skips batchUpdate when all tabs exist", async () => {
    service.isReady();
    sheetsApi.spreadsheets.get.mockResolvedValue({
      data: { sheets: [{ properties: { title: "2025 Summary", sheetId: 11 } }] },
    });
    await service.ensureTabs("sheet-1", ["2025 Summary"]);
    expect(sheetsApi.spreadsheets.batchUpdate).not.toHaveBeenCalled();
  });

  test("writeTab clears then updates with USER_ENTERED", async () => {
    service.isReady();
    sheetsApi.spreadsheets.values.clear.mockResolvedValue({});
    sheetsApi.spreadsheets.values.update.mockResolvedValue({});

    await service.writeTab("sheet-1", "2025 Summary", [["a"]]);

    expect(sheetsApi.spreadsheets.values.clear).toHaveBeenCalledWith({
      spreadsheetId: "sheet-1",
      range: "'2025 Summary'",
    });
    expect(sheetsApi.spreadsheets.values.update).toHaveBeenCalledWith({
      spreadsheetId: "sheet-1",
      range: "'2025 Summary'!A1",
      valueInputOption: "USER_ENTERED",
      resource: { values: [["a"]] },
    });
  });

  test("formatTab sends frozen rows, bold rows, and currency formats", async () => {
    service.isReady();
    sheetsApi.spreadsheets.batchUpdate.mockResolvedValue({});

    const fmt = {
      frozenRowCount: 1,
      boldRows: [0, 10],
      currencyRanges: [{ startRowIndex: 1, endRowIndex: 11, startColumnIndex: 1, endColumnIndex: 14 }],
    };
    await service.formatTab("sheet-1", 42, fmt, 17);

    const { requests } = sheetsApi.spreadsheets.batchUpdate.mock.calls[0][0].resource;
    expect(requests[0].updateSheetProperties.properties.gridProperties.frozenRowCount).toBe(1);
    const boldReqs = requests.filter((r) => r.repeatCell?.cell.userEnteredFormat.textFormat?.bold);
    expect(boldReqs).toHaveLength(2);
    expect(boldReqs[0].repeatCell.range).toEqual({ sheetId: 42, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 17 });
    const currencyReqs = requests.filter((r) => r.repeatCell?.cell.userEnteredFormat.numberFormat);
    expect(currencyReqs).toHaveLength(1);
    expect(currencyReqs[0].repeatCell.cell.userEnteredFormat.numberFormat.pattern).toBe('"₱"#,##0.00');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest services/googleSheetsService.test.js -v`
Expected: FAIL — old service has no `ensureTabs`/`writeTab`/`formatTab`/`getServiceAccountEmail`

- [ ] **Step 3: Replace the file**

```js
// backend/services/googleSheetsService.js
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.serviceAccountEmail = null;
    this.initialized = false;
  }

  loadCredentials() {
    try {
      if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      }
      const credentialsPath = path.join(__dirname, "../config/google-credentials.json");
      if (fs.existsSync(credentialsPath)) {
        return JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
      }
    } catch (error) {
      console.error("Failed to load Google credentials:", error.message);
    }
    return null;
  }

  initialize() {
    if (this.initialized) return true;
    const credentials = this.loadCredentials();
    if (!credentials) return false;
    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
    this.sheets = google.sheets({ version: "v4", auth });
    this.serviceAccountEmail = credentials.client_email || null;
    this.initialized = true;
    return true;
  }

  isReady() {
    return this.initialize();
  }

  getServiceAccountEmail() {
    this.initialize();
    return this.serviceAccountEmail;
  }

  async ensureTabs(spreadsheetId, titles) {
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId });
    const byTitle = {};
    for (const sheet of meta.data.sheets) {
      byTitle[sheet.properties.title] = sheet.properties.sheetId;
    }
    const missing = titles.filter((t) => !(t in byTitle));
    if (missing.length > 0) {
      const res = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
          requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
        },
      });
      for (const reply of res.data.replies) {
        byTitle[reply.addSheet.properties.title] = reply.addSheet.properties.sheetId;
      }
    }
    return byTitle;
  }

  async writeTab(spreadsheetId, title, values) {
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${title}'`,
    });
    await this.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${title}'!A1`,
      valueInputOption: "USER_ENTERED",
      resource: { values },
    });
  }

  async formatTab(spreadsheetId, sheetId, fmt, colCount) {
    const requests = [
      {
        updateSheetProperties: {
          properties: { sheetId, gridProperties: { frozenRowCount: fmt.frozenRowCount || 0 } },
          fields: "gridProperties.frozenRowCount",
        },
      },
    ];
    for (const rowIdx of fmt.boldRows || []) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + 1, startColumnIndex: 0, endColumnIndex: colCount },
          cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.94, blue: 0.96 } } },
          fields: "userEnteredFormat(textFormat,backgroundColor)",
        },
      });
    }
    for (const range of fmt.currencyRanges || []) {
      requests.push({
        repeatCell: {
          range: { sheetId, ...range },
          cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: '"₱"#,##0.00' } } },
          fields: "userEnteredFormat.numberFormat",
        },
      });
    }
    await this.sheets.spreadsheets.batchUpdate({ spreadsheetId, resource: { requests } });
  }
}

module.exports = new GoogleSheetsService();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest services/googleSheetsService.test.js -v`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/googleSheetsService.js backend/services/googleSheetsService.test.js
git commit -m "feat: rewrite googleSheetsService with env-var credentials and tab helpers"
```

---

### Task 8: reports route + server wiring

**Files:**
- Create: `backend/routes/reports.js`
- Modify: `backend/server.js` (lines 31 and 98: replace googleSheets route with reports route)
- Delete: `backend/routes/googleSheets.js`
- Test: `backend/routes/reports.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// backend/routes/reports.test.js
const request = require("supertest");
const express = require("express");
const jwt = require("jsonwebtoken");

jest.mock("../services/googleSheetsService", () => ({
  isReady: jest.fn(() => true),
  getServiceAccountEmail: jest.fn(() => "sa@test.iam.gserviceaccount.com"),
  ensureTabs: jest.fn(async (id, titles) => Object.fromEntries(titles.map((t, i) => [t, i]))),
  writeTab: jest.fn(async () => {}),
  formatTab: jest.fn(async () => {}),
}));

const googleSheetsService = require("../services/googleSheetsService");
const reportsRouter = require("./reports");

const JWT_SECRET = "your-secret-key-change-this";
const adminAuth = "Bearer " + jwt.sign({ id: 1, email: "admin@sbcc.church", role: "admin" }, JWT_SECRET);
const userAuth = "Bearer " + jwt.sign({ id: 2, email: "user@sbcc.church", role: "user" }, JWT_SECRET);

// PG-style promise db mock (also exercises dbAsync's promise path)
const makeDb = (overrides = {}) => ({
  get: jest.fn(async (sql) => (sql.includes("app_settings") ? { value: "sheet-123" } : null)),
  all: jest.fn(async () => []),
  run: jest.fn(async () => ({ changes: 1 })),
  ...overrides,
});

function makeApp(db) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = db; next(); });
  app.use("/", reportsRouter);
  return app;
}

afterEach(() => jest.clearAllMocks());

describe("GET /sheet-status", () => {
  test("401 without token", async () => {
    await request(makeApp(makeDb())).get("/sheet-status").expect(401);
  });

  test("returns configured status with url and last sync", async () => {
    const db = makeDb({
      get: jest.fn(async (sql) =>
        sql.includes("app_settings")
          ? { value: "sheet-123" }
          : { year: 2025, status: "success", error: null, synced_by: "admin@sbcc.church", synced_at: "2026-06-11 07:42:00" }
      ),
    });
    const res = await request(makeApp(db)).get("/sheet-status").set("Authorization", userAuth).expect(200);
    expect(res.body).toMatchObject({
      success: true,
      configured: true,
      spreadsheetId: "sheet-123",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-123",
      serviceAccountEmail: "sa@test.iam.gserviceaccount.com",
    });
    expect(res.body.lastSync.year).toBe(2025);
  });

  test("unconfigured when no setting row", async () => {
    const db = makeDb({ get: jest.fn(async () => null) });
    const res = await request(makeApp(db)).get("/sheet-status").set("Authorization", userAuth).expect(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.spreadsheetUrl).toBeNull();
  });
});

describe("PUT /sheet-config", () => {
  test("403 for non-admin", async () => {
    await request(makeApp(makeDb()))
      .put("/sheet-config").set("Authorization", userAuth)
      .send({ spreadsheetId: "abc" }).expect(403);
  });

  test("extracts spreadsheet ID from a full URL and upserts", async () => {
    const db = makeDb();
    const res = await request(makeApp(db))
      .put("/sheet-config").set("Authorization", adminAuth)
      .send({ spreadsheetId: "https://docs.google.com/spreadsheets/d/1AbC-dEf_123456789012345/edit#gid=0" })
      .expect(200);
    expect(res.body.spreadsheetId).toBe("1AbC-dEf_123456789012345");
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO app_settings"),
      ["report_spreadsheet_id", "1AbC-dEf_123456789012345", "admin@sbcc.church"]
    );
  });

  test("400 for garbage input", async () => {
    await request(makeApp(makeDb()))
      .put("/sheet-config").set("Authorization", adminAuth)
      .send({ spreadsheetId: "not a sheet!!" }).expect(400);
  });
});

describe("POST /sync-sheet", () => {
  test("403 for non-admin", async () => {
    await request(makeApp(makeDb()))
      .post("/sync-sheet").set("Authorization", userAuth).send({ year: 2025 }).expect(403);
  });

  test("400 when no spreadsheet configured", async () => {
    const db = makeDb({ get: jest.fn(async () => null) });
    const res = await request(makeApp(db))
      .post("/sync-sheet").set("Authorization", adminAuth).send({ year: 2025 }).expect(400);
    expect(res.body.message).toMatch(/no report spreadsheet configured/i);
  });

  test("503 when credentials not ready", async () => {
    googleSheetsService.isReady.mockReturnValueOnce(false);
    await request(makeApp(makeDb()))
      .post("/sync-sheet").set("Authorization", adminAuth).send({ year: 2025 }).expect(503);
  });

  test("happy path: writes 5 tabs and logs success", async () => {
    const db = makeDb();
    const res = await request(makeApp(db))
      .post("/sync-sheet").set("Authorization", adminAuth).send({ year: 2025 }).expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.tabsUpdated).toEqual([
      "2025 Summary", "2025 Collections", "2025 Expenses",
      "2025 Collections Detail", "2025 Expenses Detail",
    ]);
    expect(googleSheetsService.writeTab).toHaveBeenCalledTimes(5);
    expect(googleSheetsService.formatTab).toHaveBeenCalledTimes(5);
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO report_syncs"),
      [2025, "sheet-123", "admin@sbcc.church"]
    );
  });

  test("google 403 → 502 with share hint and failure logged", async () => {
    const db = makeDb();
    googleSheetsService.writeTab.mockRejectedValueOnce(Object.assign(new Error("denied"), { code: 403 }));
    const res = await request(makeApp(db))
      .post("/sync-sheet").set("Authorization", adminAuth).send({ year: 2025 }).expect(502);
    expect(res.body.message).toContain("sa@test.iam.gserviceaccount.com");
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining("'failed'"),
      [2025, "sheet-123", expect.stringContaining("sa@test.iam.gserviceaccount.com"), "admin@sbcc.church"]
    );
  });

  test("409 when a sync is already running", async () => {
    const db = makeDb();
    let release;
    googleSheetsService.writeTab.mockImplementationOnce(
      () => new Promise((resolve) => { release = resolve; })
    );
    const app = makeApp(db);
    const first = request(app).post("/sync-sheet").set("Authorization", adminAuth).send({ year: 2025 });
    const firstPromise = first.then((r) => r);
    // let the first request reach writeTab
    await new Promise((r) => setTimeout(r, 50));
    await request(app).post("/sync-sheet").set("Authorization", adminAuth).send({ year: 2025 }).expect(409);
    release();
    const firstRes = await firstPromise;
    expect(firstRes.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest routes/reports.test.js -v`
Expected: FAIL — `Cannot find module './reports'`

- [ ] **Step 3: Implement the route**

```js
// backend/routes/reports.js
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const googleSheetsService = require("../services/googleSheetsService");
const { dbAll, dbGet, dbRun } = require("../utils/dbAsync");
const {
  aggregateCollections,
  aggregateExpenses,
  buildSummary,
  buildSheetGrids,
} = require("../services/reportService");

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const SPREADSHEET_ID_KEY = "report_spreadsheet_id";

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

const requireAdmin = (req, res, next) => {
  if (req.user && ["admin", "super_admin"].includes(req.user.role)) return next();
  return res.status(403).json({ success: false, message: "Admin access required" });
};

function extractSpreadsheetId(input) {
  if (!input) return null;
  const urlMatch = String(input).match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  const trimmed = String(input).trim();
  return /^[a-zA-Z0-9-_]{20,}$/.test(trimmed) ? trimmed : null;
}

function friendlyGoogleError(error) {
  const code = error.code || error.response?.status;
  if (code === 403) {
    const email = googleSheetsService.getServiceAccountEmail();
    return `Google denied access. Share the spreadsheet (Editor) with the service account: ${email || "(service account email unavailable)"}`;
  }
  if (code === 404) return "Spreadsheet not found — check the URL/ID in the report settings";
  return error.message || "Failed to update Google Sheet";
}

let syncInProgress = false;

router.get("/sheet-status", authenticateToken, async (req, res) => {
  try {
    const setting = await dbGet(req.db, "SELECT value FROM app_settings WHERE key = ?", [SPREADSHEET_ID_KEY]);
    const lastSync = await dbGet(
      req.db,
      "SELECT year, status, error, synced_by, synced_at FROM report_syncs ORDER BY id DESC LIMIT 1"
    );
    const spreadsheetId = setting?.value || null;
    res.json({
      success: true,
      configured: !!spreadsheetId,
      spreadsheetId,
      spreadsheetUrl: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}` : null,
      credentialsReady: googleSheetsService.isReady(),
      serviceAccountEmail: googleSheetsService.getServiceAccountEmail(),
      lastSync: lastSync || null,
    });
  } catch (error) {
    console.error("Report status error:", error);
    res.status(500).json({ success: false, message: "Failed to load report status" });
  }
});

router.put("/sheet-config", authenticateToken, requireAdmin, async (req, res) => {
  const spreadsheetId = extractSpreadsheetId(req.body.spreadsheetId);
  if (!spreadsheetId) {
    return res.status(400).json({ success: false, message: "Provide a valid Google Sheets URL or spreadsheet ID" });
  }
  try {
    await dbRun(
      req.db,
      `INSERT INTO app_settings (key, value, updated_by, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`,
      [SPREADSHEET_ID_KEY, spreadsheetId, req.user.email]
    );
    res.json({ success: true, spreadsheetId });
  } catch (error) {
    console.error("Report config error:", error);
    res.status(500).json({ success: false, message: "Failed to save spreadsheet settings" });
  }
});

router.post("/sync-sheet", authenticateToken, requireAdmin, async (req, res) => {
  const year = parseInt(req.body.year, 10) || new Date().getFullYear();
  if (syncInProgress) {
    return res.status(409).json({ success: false, message: "A sync is already running — try again shortly" });
  }
  syncInProgress = true;
  let spreadsheetId = null;
  try {
    const setting = await dbGet(req.db, "SELECT value FROM app_settings WHERE key = ?", [SPREADSHEET_ID_KEY]);
    spreadsheetId = setting?.value || null;
    if (!spreadsheetId) {
      return res.status(400).json({ success: false, message: "No report spreadsheet configured. Set it up in the Reports tab first." });
    }
    if (!googleSheetsService.isReady()) {
      return res.status(503).json({ success: false, message: "Google service account credentials are not configured on the server. See docs/GOOGLE_SHEETS_REPORT_SETUP.md." });
    }

    const dateFrom = `${year}-01-01`;
    const dateTo = `${year}-12-31`;
    const collections = await dbAll(req.db, "SELECT * FROM collections WHERE date >= ? AND date <= ? ORDER BY date", [dateFrom, dateTo]);
    const expenses = await dbAll(req.db, "SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date", [dateFrom, dateTo]);
    let budgetRows = [];
    try {
      budgetRows = await dbAll(
        req.db,
        `SELECT bc.category, bc.subcategory, bc.budget_amount
         FROM budget_categories bc
         JOIN budget_plan bp ON bp.id = bc.budget_plan_id
         WHERE bp.year = ?`,
        [year]
      );
    } catch (budgetErr) {
      // Budget tables may not exist yet (older PG deployments) — report still works, budget columns blank
      console.warn("Budget lookup failed, continuing without budget:", budgetErr.message);
    }

    const colAgg = aggregateCollections(collections);
    const expAgg = aggregateExpenses(expenses, budgetRows);
    const summary = buildSummary(colAgg, expAgg);
    const syncedAt = new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" });
    const grids = buildSheetGrids(year, { colAgg, expAgg, summary, collectionRows: collections, expenseRows: expenses }, syncedAt);

    const tabIds = await googleSheetsService.ensureTabs(spreadsheetId, grids.map((g) => g.title));
    for (const grid of grids) {
      await googleSheetsService.writeTab(spreadsheetId, grid.title, grid.values);
      const colCount = Math.max(...grid.values.map((r) => r.length));
      await googleSheetsService.formatTab(spreadsheetId, tabIds[grid.title], grid.fmt, colCount);
    }

    await dbRun(
      req.db,
      "INSERT INTO report_syncs (year, spreadsheet_id, status, synced_by) VALUES (?, ?, 'success', ?)",
      [year, spreadsheetId, req.user.email]
    );
    res.json({ success: true, year, tabsUpdated: grids.map((g) => g.title), syncedAt });
  } catch (error) {
    console.error("Report sync error:", error);
    const message = friendlyGoogleError(error);
    if (spreadsheetId) {
      try {
        await dbRun(
          req.db,
          "INSERT INTO report_syncs (year, spreadsheet_id, status, error, synced_by) VALUES (?, ?, 'failed', ?, ?)",
          [year, spreadsheetId, message, req.user.email]
        );
      } catch (logErr) {
        console.error("Failed to log sync failure:", logErr);
      }
    }
    res.status(502).json({ success: false, message });
  } finally {
    syncInProgress = false;
  }
});

module.exports = router;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest routes/reports.test.js -v`
Expected: PASS (11 tests)

- [ ] **Step 5: Wire into server.js and delete the old route**

In `backend/server.js`:
- Line 31: replace `const googleSheetsRoutes = require("./routes/googleSheets");` with `const reportsRoutes = require("./routes/reports");`
- Line 98: replace `app.use("/api/google-sheets", googleSheetsRoutes);` with `app.use("/api/reports", reportsRoutes);`

Then delete the superseded route:

```bash
git rm backend/routes/googleSheets.js
```

- [ ] **Step 6: Verify the server boots and all backend tests pass**

```bash
node -e "require('./server.js'); setTimeout(() => process.exit(0), 1500);" 2>&1 | head -20
npx jest 2>&1 | tail -5
```

Expected: server starts without errors; all suites pass.

- [ ] **Step 7: Commit**

```bash
git add backend/routes/reports.js backend/routes/reports.test.js backend/server.js
git commit -m "feat: add reports sync/status/config endpoints; remove superseded google-sheets route"
```

---
### Task 9: frontend api.js methods

**Files:**
- Modify: `frontend/src/utils/api.js` (add before the closing `}` of the `ApiService` class, ~line 431)

No dedicated test — `api.js` has no test file; these follow the file's exact existing pattern and are covered by the ReportsView tests (mocked) and route tests (server side).

- [ ] **Step 1: Add the three methods**

```js
  // Reports (Google Sheets) methods
  async getReportSheetStatus() {
    try {
      const response = await this.api.get("/api/reports/sheet-status");
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || "Failed to load report status");
    }
  }

  async syncReportSheet(year) {
    try {
      // Writing 5 tabs can exceed the default 10s timeout
      const response = await this.api.post("/api/reports/sync-sheet", { year }, { timeout: 120000 });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || "Failed to update the Google Sheet report");
    }
  }

  async saveReportSheetConfig(spreadsheetId) {
    try {
      const response = await this.api.put("/api/reports/sheet-config", { spreadsheetId });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.message || "Failed to save spreadsheet settings");
    }
  }
```

- [ ] **Step 2: Verify the frontend still compiles and existing suites pass**

Run (from `frontend/`): `CI=true npm test -- --watchAll=false 2>&1 | tail -5`
Expected: all existing suites pass (a syntax error in api.js would fail them).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/api.js
git commit -m "feat: add report sheet api methods"
```

---

### Task 10: ReportsView component + Dashboard wiring

**Files:**
- Create: `frontend/src/components/ReportsView.js`
- Test: `frontend/src/components/ReportsView.test.js`
- Modify: `frontend/src/components/Dashboard.js`
- Delete: `frontend/src/components/UpdateGoogleSheetModal.js`

- [ ] **Step 1: Write the failing tests**

```jsx
// frontend/src/components/ReportsView.test.js
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import ReportsView from "./ReportsView";
import apiService from "../utils/api";

jest.mock("../utils/api", () => ({
  __esModule: true,
  default: {
    getReportSheetStatus: jest.fn(),
    syncReportSheet: jest.fn(),
    saveReportSheetConfig: jest.fn(),
  },
}));

const baseProps = {
  user: { role: "admin" },
  collections: [],
  expenses: [],
  lastUpdated: new Date("2026-06-11T10:00:00"),
  formatCurrency: (v) => Number(v).toLocaleString(),
};

const configuredStatus = {
  success: true,
  configured: true,
  spreadsheetId: "sheet-123",
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-123",
  credentialsReady: true,
  serviceAccountEmail: "sa@test.iam.gserviceaccount.com",
  lastSync: null,
};

afterEach(() => jest.clearAllMocks());

test("admin sees setup input with service account email when not configured", async () => {
  apiService.getReportSheetStatus.mockResolvedValue({
    ...configuredStatus, configured: false, spreadsheetId: null, spreadsheetUrl: null,
  });
  render(<ReportsView {...baseProps} />);
  expect(await screen.findByPlaceholderText(/docs\.google\.com/)).toBeInTheDocument();
  expect(screen.getByText(/sa@test\.iam\.gserviceaccount\.com/)).toBeInTheDocument();
});

test("non-admin sees ask-your-admin message when not configured", async () => {
  apiService.getReportSheetStatus.mockResolvedValue({
    ...configuredStatus, configured: false, spreadsheetId: null, spreadsheetUrl: null,
  });
  render(<ReportsView {...baseProps} user={{ role: "user" }} />);
  expect(await screen.findByText(/ask your admin/i)).toBeInTheDocument();
  expect(screen.queryByPlaceholderText(/docs\.google\.com/)).not.toBeInTheDocument();
});

test("saving config sends the pasted URL", async () => {
  apiService.getReportSheetStatus.mockResolvedValue({
    ...configuredStatus, configured: false, spreadsheetId: null, spreadsheetUrl: null,
  });
  apiService.saveReportSheetConfig.mockResolvedValue({ success: true, spreadsheetId: "abc" });
  render(<ReportsView {...baseProps} />);
  const input = await screen.findByPlaceholderText(/docs\.google\.com/);
  fireEvent.change(input, { target: { value: "https://docs.google.com/spreadsheets/d/abc/edit" } });
  fireEvent.click(screen.getByRole("button", { name: /save/i }));
  await waitFor(() =>
    expect(apiService.saveReportSheetConfig).toHaveBeenCalledWith("https://docs.google.com/spreadsheets/d/abc/edit")
  );
});

test("configured: update button syncs the selected year and shows success", async () => {
  apiService.getReportSheetStatus.mockResolvedValue(configuredStatus);
  apiService.syncReportSheet.mockResolvedValue({
    success: true, year: 2025,
    tabsUpdated: ["2025 Summary", "2025 Collections", "2025 Expenses", "2025 Collections Detail", "2025 Expenses Detail"],
  });
  render(<ReportsView {...baseProps} />);
  const button = await screen.findByRole("button", { name: /update report/i });
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "2025" } });
  fireEvent.click(button);
  await waitFor(() => expect(apiService.syncReportSheet).toHaveBeenCalledWith(2025));
  expect(await screen.findByText(/updated 5 tabs for 2025/i)).toBeInTheDocument();
  const link = screen.getByRole("link", { name: /open in google sheets/i });
  expect(link).toHaveAttribute("href", "https://docs.google.com/spreadsheets/d/sheet-123");
});

test("configured: failed sync shows the error message", async () => {
  apiService.getReportSheetStatus.mockResolvedValue(configuredStatus);
  apiService.syncReportSheet.mockRejectedValue(new Error("Google denied access. Share the spreadsheet"));
  render(<ReportsView {...baseProps} />);
  fireEvent.click(await screen.findByRole("button", { name: /update report/i }));
  expect(await screen.findByText(/google denied access/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `frontend/`): `CI=true npm test -- --watchAll=false --testPathPattern=ReportsView 2>&1 | tail -10`
Expected: FAIL — `Cannot find module './ReportsView'`

- [ ] **Step 3: Create the component**

```jsx
// frontend/src/components/ReportsView.js
import React, { useState, useEffect, useCallback } from "react";
import { FileSpreadsheet, ExternalLink, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import apiService from "../utils/api";

const REPORT_START_YEAR = 2025;

const ReportsView = ({ user, collections, expenses, lastUpdated, formatCurrency }) => {
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [configInput, setConfigInput] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [showConfigEdit, setShowConfigEdit] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatusError(null);
      setStatus(await apiService.getReportSheetStatus());
    } catch (e) {
      setStatusError(e.message);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleSaveConfig = async () => {
    if (!configInput.trim()) return;
    setSavingConfig(true);
    setSyncResult(null);
    try {
      await apiService.saveReportSheetConfig(configInput.trim());
      setConfigInput("");
      setShowConfigEdit(false);
      await loadStatus();
    } catch (e) {
      setSyncResult({ ok: false, message: e.message });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const data = await apiService.syncReportSheet(year);
      setSyncResult({ ok: true, message: `Updated ${data.tabsUpdated.length} tabs for ${data.year}` });
    } catch (e) {
      setSyncResult({ ok: false, message: e.message });
    } finally {
      setSyncing(false);
      loadStatus();
    }
  };

  const totalCollections = collections.reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0);
  const totalExpenses = expenses.reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0);
  const netBalance = totalCollections - totalExpenses;

  const yearOptions = [];
  for (let y = new Date().getFullYear(); y >= REPORT_START_YEAR; y--) yearOptions.push(y);

  const showSetup = status && (!status.configured || showConfigEdit);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Financial Reports</h2>
        <p className="text-xs text-slate-400 mt-0.5">Last updated: {lastUpdated.toLocaleString()}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Collections Total", value: totalCollections, count: collections.length, colorVal: "text-emerald-700", colorBg: "bg-emerald-500" },
          { label: "Expenses Total", value: totalExpenses, count: expenses.length, colorVal: "text-rose-700", colorBg: "bg-rose-500" },
          { label: "Net Surplus", value: netBalance, count: null, colorVal: netBalance >= 0 ? "text-emerald-700" : "text-rose-700", colorBg: netBalance >= 0 ? "bg-emerald-500" : "bg-rose-500" },
        ].map(({ label, value, count, colorVal, colorBg }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-center gap-2 mb-3"><div className={`w-2 h-2 rounded-full ${colorBg}`} /><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p></div>
            <p className={`text-2xl font-bold tracking-tight ${colorVal}`}>₱{formatCurrency(value)}</p>
            {count !== null && <p className="text-xs text-slate-400 mt-1.5">{count} transactions</p>}
            {count === null && totalExpenses > 0 && <p className="text-xs text-slate-400 mt-1.5">{Math.round((totalCollections / totalExpenses) * 100)}% efficiency ratio</p>}
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <h4 className="text-sm font-bold text-slate-800">Google Sheets Report</h4>
          </div>
          {status?.configured && isAdmin && !showConfigEdit && (
            <button onClick={() => setShowConfigEdit(true)} className="text-xs text-slate-400 hover:text-slate-600 underline">
              Change spreadsheet
            </button>
          )}
        </div>

        {!status && !statusError && <p className="text-sm text-slate-400">Loading…</p>}

        {statusError && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-rose-700">{statusError}</p>
          </div>
        )}

        {showSetup && (
          isAdmin ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Create a Google Sheet, share it as <strong>Editor</strong> with{" "}
                <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded break-all">
                  {status.serviceAccountEmail || "the service account (server credentials not set up yet)"}
                </span>
                , then paste its URL below. The system always updates this same file — it never creates new ones.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={configInput}
                  onChange={(e) => setConfigInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig || !configInput.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
                >
                  {savingConfig ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              The report spreadsheet hasn't been set up yet — ask your admin to configure it.
            </p>
          )
        )}

        {status?.configured && !showConfigEdit && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={year}
                onChange={(e) => setYear(parseInt(e.target.value, 10))}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"
              >
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              {isAdmin && (
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold px-4 py-2 rounded-xl transition"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Updating…" : "Update Report"}
                </button>
              )}
              <a
                href={status.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
              >
                Open in Google Sheets <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            <p className="text-xs text-slate-400">
              {status.lastSync
                ? `Last updated ${new Date(status.lastSync.synced_at).toLocaleString()} by ${status.lastSync.synced_by || "unknown"} (${status.lastSync.year})`
                : "Never synced"}
              {status.lastSync?.status === "failed" && (
                <span className="text-rose-600"> — failed: {status.lastSync.error}</span>
              )}
            </p>

            {isAdmin && !status.credentialsReady && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  Server credentials missing — set the GOOGLE_SERVICE_ACCOUNT_JSON environment variable.
                  See docs/GOOGLE_SHEETS_REPORT_SETUP.md.
                </p>
              </div>
            )}

            {syncResult && (
              <div className={`flex items-start gap-2 rounded-xl px-4 py-3 border ${syncResult.ok ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"}`}>
                {syncResult.ok
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  : <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />}
                <p className={`text-xs ${syncResult.ok ? "text-emerald-700" : "text-rose-700"}`}>{syncResult.message}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsView;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `CI=true npm test -- --watchAll=false --testPathPattern=ReportsView 2>&1 | tail -10`
Expected: PASS (5 tests)

- [ ] **Step 5: Wire into Dashboard.js**

In `frontend/src/components/Dashboard.js`:

1. Remove `FileSpreadsheet,` from the lucide-react import block (line ~15 — it's only used by the old reports view).
2. Replace line 45-46:
   ```js
   import PrintReportModal from "./PrintReportModal";
   import UpdateGoogleSheetModal from "./UpdateGoogleSheetModal";
   ```
   with:
   ```js
   import PrintReportModal from "./PrintReportModal";
   import ReportsView from "./ReportsView";
   ```
3. Delete the state line (~line 68): `const [showGoogleSheetsModal, setShowGoogleSheetsModal] = useState(false);`
4. Replace the entire `{selectedView === "reports" && ( ... )}` block (lines ~714-748) with:
   ```jsx
   {selectedView === "reports" && (
     <ReportsView
       user={user}
       collections={collections}
       expenses={expenses}
       lastUpdated={lastUpdated}
       formatCurrency={formatCurrency}
     />
   )}
   ```
5. Delete the modal render line (~line 755): `<UpdateGoogleSheetModal isOpen={showGoogleSheetsModal} onClose={() => setShowGoogleSheetsModal(false)} user={user} />`

Then delete the superseded modal:

```bash
git rm frontend/src/components/UpdateGoogleSheetModal.js
```

- [ ] **Step 6: Verify the whole frontend test suite and build pass**

```bash
CI=true npm test -- --watchAll=false 2>&1 | tail -5
npm run build 2>&1 | tail -5
```

Expected: all suites pass; build succeeds with no `no-unused-vars` warnings about FileSpreadsheet/showGoogleSheetsModal.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/ReportsView.js frontend/src/components/ReportsView.test.js frontend/src/components/Dashboard.js
git commit -m "feat: add ReportsView with Google Sheets sync card; remove superseded modal"
```

---
### Task 11: Setup documentation + credentials gitignore

**Files:**
- Create: `docs/GOOGLE_SHEETS_REPORT_SETUP.md`
- Modify: `.gitignore` (repo root — add credentials entry; create the entry if no matching section exists)

- [ ] **Step 1: Protect credentials from being committed**

Check and append to `.gitignore`:

```bash
grep -q "google-credentials.json" .gitignore || printf "\n# Google service account credentials (never commit)\nbackend/config/google-credentials.json\n" >> .gitignore
```

- [ ] **Step 2: Write the setup guide**

```markdown
<!-- docs/GOOGLE_SHEETS_REPORT_SETUP.md -->
# Google Sheets Report — One-Time Setup

The Reports tab updates one church-owned Google Spreadsheet in place. The server
authenticates with a Google **service account**. Setup takes ~15 minutes and is
done once.

## 1. Create a service account

1. Go to https://console.cloud.google.com/ and create (or pick) a project,
   e.g. `sbcc-financial-system`.
2. **APIs & Services → Library** → search "Google Sheets API" → **Enable**.
3. **IAM & Admin → Service Accounts** → **Create service account**.
   - Name: `sbcc-reports`
   - No roles needed (spreadsheet access comes from sharing, not IAM).
4. Open the new service account → **Keys → Add key → Create new key → JSON**.
   A `.json` key file downloads.

## 2. Give the server the credentials

**Local development** — save the key file as:

    backend/config/google-credentials.json

(It is gitignored. Never commit it.)

**Production (Railway/host)** — set an environment variable instead:

    GOOGLE_SERVICE_ACCOUNT_JSON = <entire contents of the JSON key file, as one line>

The env var takes priority over the file.

## 3. Create and share the spreadsheet

1. In the church Google account, create a spreadsheet named e.g.
   **"SBCC Financial Reports"**.
2. Click **Share** → add the service account email (looks like
   `sbcc-reports@<project>.iam.gserviceaccount.com`, also shown in the
   Reports tab) → role **Editor**.

## 4. Connect it in the app

1. Log in as an admin → **Reports** tab.
2. Paste the spreadsheet URL into the setup box → **Save**.
3. Pick a year → **Update Report**.

Five tabs are written per year: `<year> Summary`, `<year> Collections`,
`<year> Expenses`, `<year> Collections Detail`, `<year> Expenses Detail`.
Each sync fully rewrites those tabs from the database — manual edits to them
are overwritten. When a new year starts, its tabs are created automatically on
first sync; previous years stay untouched.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Google denied access… share the spreadsheet" | Share the sheet (Editor) with the service account email |
| "Spreadsheet not found" | Re-check the URL saved in Reports → Change spreadsheet |
| "credentials are not configured" | Set `GOOGLE_SERVICE_ACCOUNT_JSON` (prod) or add the key file (dev), then restart the server |
```

- [ ] **Step 3: Commit**

```bash
git add docs/GOOGLE_SHEETS_REPORT_SETUP.md .gitignore
git commit -m "docs: add Google Sheets report setup guide; gitignore credentials"
```

---

### Task 12: Full verification + manual E2E

**Files:** none (verification only)

- [ ] **Step 1: Full backend suite**

Run (from `backend/`): `npx jest 2>&1 | tail -8`
Expected: all suites pass (dbAsync, reportService, googleSheetsService, reports route, collections.dupe, plus any pre-existing).

- [ ] **Step 2: Full frontend suite + production build**

Run (from `frontend/`):
```bash
CI=true npm test -- --watchAll=false 2>&1 | tail -8
npm run build 2>&1 | tail -8
```
Expected: all suites pass; build succeeds (Vercel CI runs this — warnings that are errors in CI must be fixed now).

- [ ] **Step 3: Boot both servers and smoke-test the UI**

```bash
cd backend && npm run dev   # port 3001
cd frontend && npm start    # port 3000
```

Log in as admin (admin@sbcc.church / admin123) → Reports tab. Verify:
- Summary cards render
- Google Sheets Report card shows the setup state (no spreadsheet configured yet)
- Without server credentials, the amber "Server credentials missing" warning appears after configuring a sheet URL

- [ ] **Step 4: Manual E2E with a real spreadsheet (requires user)**

This needs the one-time Google Cloud setup from `docs/GOOGLE_SHEETS_REPORT_SETUP.md` (user action). Then:

1. Paste the spreadsheet URL in the Reports tab → Save
2. Click **Update Report** for 2025
3. In the spreadsheet verify: 5 tabs created; Summary shows monthly overview + fund allocation + fund position; Collections matrix matches the app's records; Expenses shows Monthly Budget/Annual Budget/Variance; Detail tabs list every record; headers frozen and bold; amounts formatted ₱#,##0.00
4. Click **Update Report** again → no duplicate tabs, data refreshed, new sync stamp
5. Add a collection record in the app → Update Report → the new record appears
6. Check `report_syncs` has success rows: `sqlite3 database/church_financial.db "SELECT * FROM report_syncs;"`

- [ ] **Step 5: Final commit if anything was fixed during verification**

```bash
git status
# commit any fixes with descriptive messages
```

---

## Out of scope (per spec)

- Importing historical data from the old workbook
- Excel (.xlsx) download export
- Scheduled/automatic syncs
- Two-way sync (spreadsheet → app)

