# Excel Allocation Parity (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the four allocation details the church's original workbook carries — the Pastoral Team seven-way ministry split, the offering target, pass-through grouping, and weekly grain — into the generated Google Sheets report.

**Architecture:** Report layer only. All logic lives in the pure aggregation/grid-building module that already exists in two mirrored copies: `backend/services/reportService.js` (Express) and `api/_lib/reportService.js` (Vercel). Every task edits **both** copies and a parity test installed in Task 1 makes drift fail the suite. No schema, route, or frontend changes.

**Tech Stack:** Node.js, CommonJS, Jest (`cd backend && npm test` covers both directories via `backend/jest.config.js`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-16-excel-allocation-parity-design.md`

---

## Background an engineer needs before starting

**The two-copy rule.** `api/*.js` is production (Vercel serverless); `backend/` is local development. `api/_lib/reportService.js` is a byte-for-byte copy of `backend/services/reportService.js` with comments stripped. Both are imported by their own route file (`api/reports.js:14`, `backend/routes/reports.js:13`). A change to one without the other means local dev silently disagrees with production. Task 1 installs a test that catches this.

**Why comments are stripped in the api copy.** Convention in this repo, nothing more. When you mirror an edit, drop the `//` comments — the Task 1 parity test normalizes them away, so either style passes, but stay consistent with what is there.

**Existing tests that legitimately change.** The spec claims the existing suite passes unchanged. That is true of the module's *exported surface* but **not** of three tests that assert literal row indices, which necessarily move when rows are inserted:

| Test | File:line | Why it changes |
|---|---|---|
| `returns 5 grids with year-prefixed titles in order` | `reportService.test.js:180` | A sixth tab is added |
| `collections grid: header, SUM formulas, totals row, sync stamp` | `reportService.test.js:190` | Pass-thru header + subtotal rows inserted |
| `summary grid: title, overview formulas, fund position` | `reportService.test.js:225` | Offering-target block + 7 ministry rows inserted |

Each is updated in the task that moves it. Task 8 corrects the spec's claim. **No other existing test may be modified** — if one breaks, that is a real regression.

**Rounding rule that matters.** Ministry allocation months are emitted at **full precision**, deliberately not through `round2`. Because the seven percentages sum to exactly 1.00, unrounded values sum exactly to the Pastoral Team row. Google Sheets' `#,##0.00` format handles display. Do not "fix" this by adding `round2` — it would introduce a centavo residue against the parent row.

**Column letters.** `colLetter(i)` takes a **0-based** column index and returns its sheet letter: `colLetter(0) === "A"`, `colLetter(13) === "N"`, `colLetter(52) === "BA"`.

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `backend/services/reportService.js` | Modify | Pure aggregation + grid building (Express copy) |
| `api/_lib/reportService.js` | Modify | Identical mirror (Vercel copy) |
| `backend/services/reportService.parity.test.js` | Create | Fails if the two copies drift |
| `backend/services/reportService.test.js` | Modify | Existing suite + new cases |

No file is split. Both copies grow from ~390 to roughly ~560 lines. The spec records why a module split was rejected: it would become six mirrored files instead of two.

---

## Task 1: Install the mirror parity guard, then the Sunday calendar helpers

**Files:**
- Create: `backend/services/reportService.parity.test.js`
- Modify: `backend/services/reportService.js` (append helpers before `module.exports`)
- Modify: `api/_lib/reportService.js` (same)
- Test: `backend/services/reportService.test.js`

- [ ] **Step 1: Write the parity test**

Create `backend/services/reportService.parity.test.js`:

```js
const fs = require("fs");
const path = require("path");

// The report service exists twice: backend/services (Express, local dev) and
// api/_lib (Vercel, production). They must stay identical apart from comments.
const BACKEND = path.join(__dirname, "reportService.js");
const API = path.join(__dirname, "../../api/_lib/reportService.js");

const normalize = (src) =>
  src
    .split("\n")
    .map((line) =>
      line
        .replace(/\s+\/\/.*$/, "")
        .replace(/^\s*\/\/.*$/, "")
        .trimEnd()
    )
    .filter((line) => line.trim() !== "")
    .join("\n");

test("both reportService copies are identical apart from comments", () => {
  const backend = normalize(fs.readFileSync(BACKEND, "utf8"));
  const api = normalize(fs.readFileSync(API, "utf8"));
  expect(api).toBe(backend);
});

test("both copies export the same surface", () => {
  const backend = require("./reportService");
  const api = require("../../api/_lib/reportService");
  expect(Object.keys(api).sort()).toEqual(Object.keys(backend).sort());
});
```

- [ ] **Step 2: Run it — it must PASS before any code changes**

Run: `cd backend && npx jest services/reportService.parity.test.js`
Expected: **2 passed.** This is a guard, not a red test. If it fails now, the copies are already out of sync — stop and report that before continuing.

- [ ] **Step 3: Commit the guard**

```bash
git add backend/services/reportService.parity.test.js
git commit -m "test: fail when the two reportService copies drift"
```

- [ ] **Step 4: Write failing tests for the Sunday helpers**

Append to `backend/services/reportService.test.js`:

```js
describe("sundaysIn", () => {
  test("2025 has 52 Sundays starting 5 January", () => {
    const s = sundaysIn(2025);
    expect(s).toHaveLength(52);
    expect(s[0]).toBe("2025-01-05");
    expect(s[51]).toBe("2025-12-28");
  });

  test("a year beginning on a Sunday has 53", () => {
    const s = sundaysIn(2023);
    expect(s).toHaveLength(53);
    expect(s[0]).toBe("2023-01-01");
    expect(s[52]).toBe("2023-12-31");
  });

  test("a leap year is enumerated correctly", () => {
    const s = sundaysIn(2024);
    expect(s[0]).toBe("2024-01-07");
    expect(s.every((d) => d.startsWith("2024-"))).toBe(true);
  });

  test("accepts the year as a string", () => {
    expect(sundaysIn("2025")).toHaveLength(52);
  });
});

describe("weekIndexFor", () => {
  const sundays = sundaysIn(2025);

  test("a Sunday maps to its own column", () => {
    expect(weekIndexFor("2025-01-05", sundays)).toBe(0);
    expect(weekIndexFor("2025-01-12", sundays)).toBe(1);
  });

  test("a midweek date maps to the Sunday on or before it", () => {
    expect(weekIndexFor("2025-01-08", sundays)).toBe(0);
    expect(weekIndexFor("2025-01-11", sundays)).toBe(0);
    expect(weekIndexFor("2025-01-15", sundays)).toBe(1);
  });

  test("a date before the first Sunday clamps to the first column", () => {
    expect(weekIndexFor("2025-01-01", sundays)).toBe(0);
    expect(weekIndexFor("2025-01-04", sundays)).toBe(0);
  });

  test("the last days of the year clamp to the last column", () => {
    expect(weekIndexFor("2025-12-31", sundays)).toBe(51);
  });

  test("accepts a Date object, as PostgreSQL returns for DATE columns", () => {
    expect(weekIndexFor(new Date("2025-01-08T00:00:00Z"), sundays)).toBe(0);
  });
});
```

Add `sundaysIn` and `weekIndexFor` to the `require` destructuring at the top of the file (line 1-6):

```js
const {
  aggregateCollections,
  aggregateExpenses,
  buildSummary,
  buildSheetGrids,
  sundaysIn,
  weekIndexFor,
} = require("./reportService");
```

- [ ] **Step 5: Run to verify failure**

Run: `cd backend && npx jest services/reportService.test.js -t "sundaysIn"`
Expected: FAIL — `TypeError: sundaysIn is not a function`

- [ ] **Step 6: Implement the helpers**

In `backend/services/reportService.js`, insert after the `dateString` function (currently ends line 49):

```js
// Sunday-anchored week columns, mirroring the workbook's Weekly Collection sheet.
// UTC throughout: `new Date("2025-01-08").getDay()` reads local time and can
// shift a day in a negative-offset zone, which would file a Sunday under the
// previous week.
function sundaysIn(year) {
  const y = Number(year);
  const out = [];
  const d = new Date(Date.UTC(y, 0, 1));
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCFullYear() === y) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

// Index of the Sunday on or before the date. Dates before the year's first
// Sunday (1-4 Jan in most years) clamp into the first column rather than being
// dropped — the workbook's hand-entry had nowhere to put them.
function weekIndexFor(dateVal, sundays) {
  if (!sundays || !sundays.length) return null;
  const iso = dateString(dateVal);
  const first = Date.parse(`${sundays[0]}T00:00:00Z`);
  const days = Math.floor((Date.parse(`${iso}T00:00:00Z`) - first) / 86400000);
  const idx = Math.floor(days / 7);
  if (idx < 0) return 0;
  if (idx > sundays.length - 1) return sundays.length - 1;
  return idx;
}
```

Add both to `module.exports`:

```js
module.exports = {
  MONTHS,
  COLLECTION_CATEGORIES,
  OPERATIONAL_EXPENSE_CATEGORIES,
  round2,
  monthIndex,
  dateString,
  sundaysIn,
  weekIndexFor,
  aggregateCollections,
  aggregateExpenses,
  buildSummary,
  buildSheetGrids,
};
```

- [ ] **Step 7: Run to verify pass**

Run: `cd backend && npx jest services/reportService.test.js -t "sundaysIn"` then `-t "weekIndexFor"`
Expected: PASS for both.

- [ ] **Step 8: Mirror into the api copy**

Apply the identical edits to `api/_lib/reportService.js` — the two functions after `dateString`, and the two new `module.exports` entries — with the `//` comments removed.

- [ ] **Step 9: Run the parity guard and the full file**

Run: `cd backend && npx jest services/reportService`
Expected: all PASS, including the two parity tests.

- [ ] **Step 10: Commit**

```bash
git add backend/services/reportService.js api/_lib/reportService.js backend/services/reportService.test.js
git commit -m "feat: add Sunday-anchored week helpers to the report service"
```

---

## Task 2: Refactor buildSummaryGrid to track row indices

Pure refactor, no behaviour change. `buildSummaryGrid` currently hardcodes `boldRows: [0, 3, 9, 10, 15, 16]` and three currency ranges with literal indices. Tasks 3 and 4 insert rows into the middle of this grid, which would make every literal wrong. This task removes the literals first so the later tasks are safe.

**Files:**
- Modify: `backend/services/reportService.js:184-234`
- Modify: `api/_lib/reportService.js` (mirror)

- [ ] **Step 1: Confirm the existing summary test passes (this is the safety net)**

Run: `cd backend && npx jest services/reportService.test.js -t "summary grid"`
Expected: PASS. This test is what proves the refactor changed nothing.

- [ ] **Step 2: Replace buildSummaryGrid**

Replace the whole of `buildSummaryGrid` in `backend/services/reportService.js` with:

```js
function buildSummaryGrid(year, summary, syncedAt) {
  const { monthlyOverview: mo, fundAllocation, fundPosition } = summary;

  // A running balance carries forward through months with no activity, which is
  // correct for a year that has happened but reads as real data in months that
  // have not. Trim it at the current month for the year in progress; a finished
  // year still reports all twelve.
  const now = new Date();
  const lastReportableMonth = Number(year) === now.getFullYear() ? now.getMonth() : 11;
  const runningBalance = mo.runningBalance.map((bal, i) =>
    i <= lastReportableMonth ? bal : ""
  );

  const values = [];
  const boldRows = [];
  const currencyRanges = [];
  // push returns the 0-based index of the row just added; +1 gives its sheet row
  const push = (row) => values.push(row) - 1;
  const pushBold = (row) => {
    const i = push(row);
    boldRows.push(i);
    return i;
  };

  pushBold([`SBCC FINANCIAL REPORT ${year}`]);
  push([syncStamp(syncedAt)]);
  push([]);

  pushBold(["MONTHLY OVERVIEW", ...MONTHS, "Total"]);
  const colIdx = push(["Total Collections", ...mo.collections, ""]);
  const colRow = colIdx + 1;
  values[colIdx][13] = `=SUM(B${colRow}:M${colRow})`;
  const expIdx = push(["Total Expenses", ...mo.expenses, ""]);
  const expRow = expIdx + 1;
  values[expIdx][13] = `=SUM(B${expRow}:M${expRow})`;
  push([
    "Net Surplus/(Deficit)",
    ...MONTHS.map((_, i) => `=${colLetter(i + 1)}${colRow}-${colLetter(i + 1)}${expRow}`),
    `=N${colRow}-N${expRow}`,
  ]);
  push(["Running Balance", ...runningBalance, ""]);
  currencyRanges.push({
    startRowIndex: colIdx,
    endRowIndex: values.length,
    startColumnIndex: 1,
    endColumnIndex: 14,
  });

  push([]);
  pushBold(["FUND ALLOCATION (from General Tithes & Offering)"]);
  pushBold(["Fund", "Share", ...MONTHS, "Total"]);
  const allocStart = values.length;
  fundAllocation.forEach((f) => {
    const i = push([f.label, f.pct, ...f.months, ""]);
    values[i][14] = `=SUM(C${i + 1}:N${i + 1})`;
  });
  currencyRanges.push({
    startRowIndex: allocStart,
    endRowIndex: values.length,
    startColumnIndex: 2,
    endColumnIndex: 15,
  });

  push([]);
  pushBold(["FUND POSITION (Year to Date)"]);
  pushBold(["Fund", "Allocated", "Spent", "Remaining"]);
  const posStart = values.length;
  fundPosition.forEach((f) => {
    const i = push([f.label, f.allocated, f.spent, ""]);
    values[i][3] = `=B${i + 1}-C${i + 1}`;
  });
  currencyRanges.push({
    startRowIndex: posStart,
    endRowIndex: values.length,
    startColumnIndex: 1,
    endColumnIndex: 4,
  });

  return {
    title: `${year} Summary`,
    values,
    fmt: { frozenRowCount: 0, boldRows, currencyRanges },
  };
}
```

- [ ] **Step 3: Verify nothing changed**

Run: `cd backend && npx jest services/reportService.test.js`
Expected: **all PASS, no test edited.** The refactor must reproduce `boldRows: [0, 3, 9, 10, 15, 16]` and the same three currency ranges. If `summary grid` or the running-balance tests fail, the refactor is wrong — fix it rather than editing the test.

- [ ] **Step 4: Assert the formatting arrays explicitly**

Add to `backend/services/reportService.test.js`, inside the existing `describe("buildSheetGrids", ...)` block:

```js
  test("summary grid formatting indices are derived, not hardcoded", () => {
    const grid = makeGrids()[0];
    expect(grid.fmt.boldRows).toEqual([0, 3, 9, 10, 15, 16]);
    expect(grid.fmt.currencyRanges).toEqual([
      { startRowIndex: 4, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 14 },
      { startRowIndex: 11, endRowIndex: 14, startColumnIndex: 2, endColumnIndex: 15 },
      { startRowIndex: 17, endRowIndex: 20, startColumnIndex: 1, endColumnIndex: 4 },
    ]);
  });
```

- [ ] **Step 5: Run it**

Run: `cd backend && npx jest services/reportService.test.js -t "formatting indices"`
Expected: PASS — proving the derived values match the old literals exactly.

- [ ] **Step 6: Mirror and commit**

Apply the same replacement to `api/_lib/reportService.js` (comments stripped), then:

```bash
cd backend && npx jest services/reportService
git add backend/services/reportService.js api/_lib/reportService.js backend/services/reportService.test.js
git commit -m "refactor: derive summary grid formatting indices from row positions"
```

---

## Task 3: Ministry allocation rows under FUND ALLOCATION

**Files:**
- Modify: `backend/services/reportService.js` (new constant; `buildSummary`; `buildSummaryGrid`)
- Modify: `api/_lib/reportService.js` (mirror)
- Test: `backend/services/reportService.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `backend/services/reportService.test.js`:

```js
describe("pastoral ministry allocation", () => {
  const collections = [
    col("2025-01-05", {
      general_tithes_offering: 88817,
      total_amount: 88817,
      pbcm_share: 8881.7,
      pastoral_team_share: 8881.7,
      operational_fund_share: 71053.6,
    }),
  ];

  test("the seven percentages sum to exactly 1", () => {
    const sum = PASTORAL_MINISTRIES.reduce((a, m) => a + m.pct, 0);
    expect(sum).toBe(1);
  });

  test("Pastoral Team carries seven children in workbook order", () => {
    const summary = buildSummary(aggregateCollections(collections), aggregateExpenses([], []));
    const pastoral = summary.fundAllocation.find((f) => f.label === "Pastoral Team");
    expect(pastoral.children.map((c) => c.label)).toEqual([
      "CE",
      "Worship/Prayer/Music",
      "Mission/Evangelism",
      "Discipleship/Fellowship",
      "Admin & Finance",
      "Benevolence",
      "Pastoral Care",
    ]);
    expect(pastoral.children.map((c) => c.pct)).toEqual([
      "10%", "25%", "15%", "10%", "10%", "25%", "5%",
    ]);
  });

  test("children sum exactly to the parent, month by month", () => {
    const summary = buildSummary(aggregateCollections(collections), aggregateExpenses([], []));
    const pastoral = summary.fundAllocation.find((f) => f.label === "Pastoral Team");
    for (let m = 0; m < 12; m++) {
      const kids = pastoral.children.reduce((a, c) => a + c.months[m], 0);
      expect(kids).toBeCloseTo(pastoral.months[m], 10);
    }
  });

  test("January figures match the workbook's =$G$3*B5 derivation", () => {
    const summary = buildSummary(aggregateCollections(collections), aggregateExpenses([], []));
    const kids = summary.fundAllocation.find((f) => f.label === "Pastoral Team").children;
    expect(kids[0].months[0]).toBeCloseTo(888.17, 2);   // CE 10%
    expect(kids[1].months[0]).toBeCloseTo(2220.425, 3); // Worship/Prayer/Music 25%
    expect(kids[6].months[0]).toBeCloseTo(444.085, 3);  // Pastoral Care 5%
  });

  test("the other two funds carry no children", () => {
    const summary = buildSummary(aggregateCollections(collections), aggregateExpenses([], []));
    expect(summary.fundAllocation[0].children).toBeUndefined();
    expect(summary.fundAllocation[2].children).toBeUndefined();
  });

  test("ministry rows render indented under Pastoral Team with SUM totals", () => {
    const colAgg = aggregateCollections(collections);
    const expAgg = aggregateExpenses([], []);
    const summary = buildSummary(colAgg, expAgg);
    const grid = buildSheetGrids(
      2025,
      { colAgg, expAgg, summary, collectionRows: collections, expenseRows: [] },
      "1/1/2026, 9:00:00 AM"
    )[0];
    const parentIdx = grid.values.findIndex((r) => r[0] === "Pastoral Team");
    expect(grid.values[parentIdx + 1][0]).toBe("   CE");
    expect(grid.values[parentIdx + 1][1]).toBe("10%");
    const sheetRow = parentIdx + 2;
    expect(grid.values[parentIdx + 1][14]).toBe(`=SUM(C${sheetRow}:N${sheetRow})`);
    expect(grid.values[parentIdx + 7][0]).toBe("   Pastoral Care");
    expect(grid.values[parentIdx + 8][0]).toBe("Operational Fund");
  });
});
```

Add `PASTORAL_MINISTRIES` to the `require` destructuring at the top of the test file.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npx jest services/reportService.test.js -t "pastoral ministry allocation"`
Expected: FAIL — `PASTORAL_MINISTRIES` is undefined.

- [ ] **Step 3: Add the constant**

In `backend/services/reportService.js`, after `OPERATIONAL_EXPENSE_CATEGORIES` (currently ends line 35):

```js
// The Pastoral Team 10% share, split seven ways. Percentages come from the
// workbook's "BD Per Revised" B5:B12 — the variant actually in force, confirmed
// by "Expense Monthly Sum" B4:B13 matching it rather than the two older plans.
// Worship/Prayer/Music is one line at 25%, as in BD Per Revised, Feb25 and
// Mar25; only the older Jan25 sheet splits it three ways.
const PASTORAL_MINISTRIES = [
  { key: "ce", label: "CE", pct: 0.1 },
  { key: "worship_prayer_music", label: "Worship/Prayer/Music", pct: 0.25 },
  { key: "mission_evangelism", label: "Mission/Evangelism", pct: 0.15 },
  { key: "discipleship_fellowship", label: "Discipleship/Fellowship", pct: 0.1 },
  { key: "admin_finance", label: "Admin & Finance", pct: 0.1 },
  { key: "benevolence", label: "Benevolence", pct: 0.25 },
  { key: "pastoral_care", label: "Pastoral Care", pct: 0.05 },
];
```

- [ ] **Step 4: Attach children in buildSummary**

In `buildSummary`, replace the `fundAllocation` array literal:

```js
  // Deliberately NOT rounded: the seven percentages sum to 1.00, so unrounded
  // ministry months sum exactly to the Pastoral Team row. Rounding each would
  // leave a centavo residue against the parent.
  const ministryChildren = PASTORAL_MINISTRIES.map((m) => ({
    label: m.label,
    pct: `${m.pct * 100}%`,
    months: colAgg.shares.pastoral.map((v) => v * m.pct),
    total: sumArr(colAgg.shares.pastoral) * m.pct,
  }));

  const fundAllocation = [
    { label: "PBCM/PDOT Share", pct: "10%", months: colAgg.shares.pbcm, total: sumArr(colAgg.shares.pbcm) },
    {
      label: "Pastoral Team",
      pct: "10%",
      months: colAgg.shares.pastoral,
      total: sumArr(colAgg.shares.pastoral),
      children: ministryChildren,
    },
    { label: "Operational Fund", pct: "80%", months: colAgg.shares.operational, total: sumArr(colAgg.shares.operational) },
  ];
```

`sumArr` is already defined immediately above this block — do not redeclare it.

- [ ] **Step 5: Render the children in buildSummaryGrid**

In `buildSummaryGrid`, replace the `fundAllocation.forEach` body added in Task 2:

```js
  fundAllocation.forEach((f) => {
    const i = push([f.label, f.pct, ...f.months, ""]);
    values[i][14] = `=SUM(C${i + 1}:N${i + 1})`;
    (f.children || []).forEach((c) => {
      const ci = push([`   ${c.label}`, c.pct, ...c.months, ""]);
      values[ci][14] = `=SUM(C${ci + 1}:N${ci + 1})`;
    });
  });
```

Three leading spaces give the indent without needing cell-level formatting.

- [ ] **Step 6: Export the constant**

Add `PASTORAL_MINISTRIES,` to `module.exports`, after `OPERATIONAL_EXPENSE_CATEGORIES`.

- [ ] **Step 7: Run the new tests**

Run: `cd backend && npx jest services/reportService.test.js -t "pastoral ministry allocation"`
Expected: all PASS.

- [ ] **Step 8: Update the two existing tests whose indices moved**

Seven rows now sit between Pastoral Team and FUND POSITION. In `backend/services/reportService.test.js`:

In `test("summary grid: title, overview formulas, fund position")` (line ~236), change:

```js
    expect(grid.values[16]).toEqual(["Fund", "Allocated", "Spent", "Remaining"]);
    expect(grid.values[17][3]).toBe("=B18-C18");
```

to:

```js
    expect(grid.values[23]).toEqual(["Fund", "Allocated", "Spent", "Remaining"]);
    expect(grid.values[24][3]).toBe("=B25-C25");
```

In `test("summary grid formatting indices are derived, not hardcoded")` from Task 2, change to:

```js
    expect(grid.fmt.boldRows).toEqual([0, 3, 9, 10, 22, 23]);
    expect(grid.fmt.currencyRanges).toEqual([
      { startRowIndex: 4, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 14 },
      { startRowIndex: 11, endRowIndex: 21, startColumnIndex: 2, endColumnIndex: 15 },
      { startRowIndex: 24, endRowIndex: 27, startColumnIndex: 1, endColumnIndex: 4 },
    ]);
```

- [ ] **Step 9: Run the whole file**

Run: `cd backend && npx jest services/reportService.test.js`
Expected: all PASS. If the numbers above disagree with reality, trust the code and correct the expectations — but count the rows by hand first to be sure the grid is right.

- [ ] **Step 10: Mirror and commit**

```bash
cd backend && npx jest services/reportService
git add backend/services/reportService.js api/_lib/reportService.js backend/services/reportService.test.js
git commit -m "feat: break the Pastoral Team share into seven ministry rows"
```

---

## Task 4: OFFERING TARGET block

The block needs the operational budget total and the year. Both are already reachable inside `buildSheetGrids` — the budget is on `expAgg.sections`, populated by `aggregateExpenses` from `budget_categories`. **This is why no route change is needed:** nothing new has to be passed in from `reports.js`.

**Files:**
- Modify: `backend/services/reportService.js` (new `buildOfferingTarget`; `buildSummaryGrid`; `buildSheetGrids`)
- Modify: `api/_lib/reportService.js` (mirror)
- Test: `backend/services/reportService.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `backend/services/reportService.test.js`:

```js
describe("offering target", () => {
  // The workbook's 16 operational lines, summing to 87,933.33 (BD Per Revised E13)
  const OPERATIONAL_BUDGET = [
    ["Pastoral & Worker Support", 31291.67], ["CAP-Churches Assistance Program", 1000],
    ["Honorarium", 7000], ["Conference/Seminar/Retreat/Assembly", 1000],
    ["Fellowship Events", 1275], ["Anniversary/Christmas Events", 14833.33],
    ["Supplies", 3000], ["Utilities", 15000], ["Vehicle Maintenance", 5000],
    ["LTO Registration", 416.67], ["Transportation & Gas", 3500],
    ["Building Maintenance", 3000], ["ABCCOP National", 400],
    ["CBCC Share", 600], ["Kabalikat Share", 200], ["ABCCOP Community Day", 416.67],
  ].map(([subcategory, budget_amount]) => ({
    category: "Operational Fund",
    subcategory,
    budget_amount,
  }));

  const collections = [
    col("2025-01-05", { general_tithes_offering: 88817, total_amount: 88817 }),
  ];

  const gridFor = (budgetRows) => {
    const colAgg = aggregateCollections(collections);
    const expAgg = aggregateExpenses([], budgetRows);
    const summary = buildSummary(colAgg, expAgg);
    return buildSheetGrids(
      2025,
      { colAgg, expAgg, summary, collectionRows: collections, expenseRows: [] },
      "1/1/2026, 9:00:00 AM"
    )[0];
  };

  test("required monthly offering matches the workbook's 109,916.67", () => {
    const target = buildOfferingTarget(
      aggregateCollections(collections),
      aggregateExpenses([], OPERATIONAL_BUDGET),
      2025
    );
    expect(target.operationalBudget).toBeCloseTo(87933.34, 2);
    expect(target.requiredMonthly).toBeCloseTo(109916.67, 2);
  });

  test("required weekly offering divides the annual requirement by the year's Sundays", () => {
    const target = buildOfferingTarget(
      aggregateCollections(collections),
      aggregateExpenses([], OPERATIONAL_BUDGET),
      2025
    );
    expect(target.requiredWeekly).toBeCloseTo((109916.67 * 12) / 52, 1);
  });

  test("actual offering is general tithes only, never the grand total", () => {
    const withPassThru = [
      col("2025-02-02", {
        general_tithes_offering: 100,
        sunday_school: 900,
        total_amount: 1000,
      }),
    ];
    const target = buildOfferingTarget(
      aggregateCollections(withPassThru),
      aggregateExpenses([], OPERATIONAL_BUDGET),
      2025
    );
    expect(target.actualOffering[1]).toBe(100);
  });

  test("returns null when the year has no budget rows", () => {
    expect(
      buildOfferingTarget(aggregateCollections(collections), aggregateExpenses([], []), 2025)
    ).toBeNull();
  });

  test("the block renders between the overview and the fund allocation", () => {
    const grid = gridFor(OPERATIONAL_BUDGET);
    const idx = grid.values.findIndex((r) => r[0] === "OFFERING TARGET");
    expect(idx).toBeGreaterThan(grid.values.findIndex((r) => r[0] === "MONTHLY OVERVIEW"));
    expect(idx).toBeLessThan(
      grid.values.findIndex((r) => r[0] === "FUND ALLOCATION (from General Tithes & Offering)")
    );
    expect(grid.values[idx + 1][0]).toBe("Operational budget (monthly)");
    expect(grid.values[idx + 2]).toEqual(["Operational share", "80%"]);
    expect(grid.values[idx + 3][0]).toBe("Required monthly offering");
    expect(grid.values[idx + 4][0]).toBe("Required weekly offering");
  });

  test("surplus is actual minus the required monthly figure, per month", () => {
    const grid = gridFor(OPERATIONAL_BUDGET);
    const reqIdx = grid.values.findIndex((r) => r[0] === "Required monthly offering");
    const actualIdx = grid.values.findIndex((r) => r[0] === "Actual offering");
    const surplusIdx = grid.values.findIndex((r) => r[0] === "Surplus/(Shortfall)");
    expect(grid.values[surplusIdx][1]).toBe(`=B${actualIdx + 1}-$B$${reqIdx + 1}`);
  });

  test("the block is omitted entirely when there is no budget", () => {
    const grid = gridFor([]);
    expect(grid.values.some((r) => r[0] === "OFFERING TARGET")).toBe(false);
  });
});
```

Add `buildOfferingTarget` to the `require` destructuring.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npx jest services/reportService.test.js -t "offering target"`
Expected: FAIL — `buildOfferingTarget is not a function`.

- [ ] **Step 3: Implement buildOfferingTarget**

In `backend/services/reportService.js`, add after `buildSummary`:

```js
const OPERATIONAL_SHARE = 0.8;

// What the church must collect to fund its operational budget, as the workbook's
// BD Per Revised E1 computes it: =(E13/4)*5, i.e. the operational requirement
// grossed up by the 80% share. Derived rather than stored, so it follows any
// change to a budget line. Returns null when the year has no budget rows — the
// same graceful blank the Budget and Variance columns already use.
function buildOfferingTarget(colAgg, expAgg, year) {
  const opSection = (expAgg.sections || []).find((s) =>
    s.label.startsWith("Operational Fund")
  );
  if (!opSection) return null;
  const operationalBudget = opSection.rows.reduce(
    (sum, r) => sum + (r.monthlyBudget || 0),
    0
  );
  if (!operationalBudget) return null;

  const requiredMonthly = operationalBudget / OPERATIONAL_SHARE;
  const sundayCount = sundaysIn(year).length;
  const tithes = colAgg.categories.find((c) => c.key === "general_tithes_offering");

  return {
    operationalBudget: round2(operationalBudget),
    operationalPct: `${OPERATIONAL_SHARE * 100}%`,
    requiredMonthly: round2(requiredMonthly),
    requiredWeekly: round2((requiredMonthly * 12) / sundayCount),
    // General tithes only — the grand total includes pass-through money that the
    // 10/10/80 split never touches.
    actualOffering: tithes ? tithes.months : zeros12(),
  };
}
```

- [ ] **Step 4: Render the block in buildSummaryGrid**

Change the signature to accept the target:

```js
function buildSummaryGrid(year, summary, syncedAt, offeringTarget) {
```

Then insert, immediately after the MONTHLY OVERVIEW `currencyRanges.push({...})` and before the `push([]); pushBold(["FUND ALLOCATION ...`:

```js
  if (offeringTarget) {
    push([]);
    pushBold(["OFFERING TARGET"]);
    const budgetIdx = push(["Operational budget (monthly)", offeringTarget.operationalBudget]);
    push(["Operational share", offeringTarget.operationalPct]);
    const reqIdx = push(["Required monthly offering", offeringTarget.requiredMonthly]);
    push(["Required weekly offering", offeringTarget.requiredWeekly]);
    push([]);
    pushBold(["", ...MONTHS, "Total"]);
    const actualIdx = push(["Actual offering", ...offeringTarget.actualOffering, ""]);
    const actualRow = actualIdx + 1;
    values[actualIdx][13] = `=SUM(B${actualRow}:M${actualRow})`;
    const surplusIdx = push([
      "Surplus/(Shortfall)",
      ...MONTHS.map((_, i) => `=${colLetter(i + 1)}${actualRow}-$B$${reqIdx + 1}`),
      "",
    ]);
    values[surplusIdx][13] = `=SUM(B${surplusIdx + 1}:M${surplusIdx + 1})`;
    // The "Operational share" row holds "80%", not currency — hence two ranges
    currencyRanges.push({ startRowIndex: budgetIdx, endRowIndex: budgetIdx + 1, startColumnIndex: 1, endColumnIndex: 2 });
    currencyRanges.push({ startRowIndex: reqIdx, endRowIndex: reqIdx + 2, startColumnIndex: 1, endColumnIndex: 2 });
    currencyRanges.push({ startRowIndex: actualIdx, endRowIndex: surplusIdx + 1, startColumnIndex: 1, endColumnIndex: 14 });
  }
```

- [ ] **Step 5: Wire it through buildSheetGrids**

Replace `buildSheetGrids`:

```js
function buildSheetGrids(year, { colAgg, expAgg, summary, collectionRows, expenseRows }, syncedAt) {
  const offeringTarget = buildOfferingTarget(colAgg, expAgg, year);
  return [
    buildSummaryGrid(year, summary, syncedAt, offeringTarget),
    buildCollectionsGrid(year, colAgg, syncedAt),
    buildExpensesGrid(year, expAgg, syncedAt),
    buildCollectionsDetailGrid(year, collectionRows, syncedAt),
    buildExpensesDetailGrid(year, expenseRows, syncedAt),
  ];
}
```

Add `buildOfferingTarget,` to `module.exports`.

- [ ] **Step 6: Run the new tests**

Run: `cd backend && npx jest services/reportService.test.js -t "offering target"`
Expected: all PASS.

- [ ] **Step 7: Update the existing summary test indices again**

The existing `makeGrids()` fixture passes one budget row (`Utilities 15000`), so the offering-target block **does** render there — 9 more rows. In `test("summary grid: title, overview formulas, fund position")`:

```js
    expect(grid.values[20]).toEqual(["Fund", "Share", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Total"]);
    expect(grid.values[21][0]).toBe("PBCM/PDOT Share");
    expect(grid.values[21][14]).toBe("=SUM(C22:N22)");
    expect(grid.values[33]).toEqual(["Fund", "Allocated", "Spent", "Remaining"]);
    expect(grid.values[34][3]).toBe("=B35-C35");
```

Leave the `values[3]`, `values[4]`, `values[6]` overview assertions alone — the block goes after them.

Then delete the `test("summary grid formatting indices are derived, not hardcoded")` case added in Task 2. Its job was to prove the Task 2 refactor was faithful; with two blocks now inserted, restating the literals adds nothing but maintenance. Replace it with a structural assertion:

```js
  test("summary grid formatting covers every rendered block", () => {
    const grid = makeGrids()[0];
    expect(grid.fmt.boldRows[0]).toBe(0);
    expect(grid.fmt.currencyRanges).toHaveLength(6);
    grid.fmt.currencyRanges.forEach((r) => {
      expect(r.endRowIndex).toBeGreaterThan(r.startRowIndex);
      expect(r.endRowIndex).toBeLessThanOrEqual(grid.values.length);
    });
  });
```

- [ ] **Step 8: Run the whole file, then mirror and commit**

Run: `cd backend && npx jest services/reportService.test.js`
Expected: all PASS.

```bash
cd backend && npx jest services/reportService
git add backend/services/reportService.js api/_lib/reportService.js backend/services/reportService.test.js
git commit -m "feat: report the offering target the budget requires"
```

---

## Task 5: Pass-thru grouping on the Collections tab

**Files:**
- Modify: `backend/services/reportService.js` (`buildCollectionsGrid`, currently lines ~236-263)
- Modify: `api/_lib/reportService.js` (mirror)
- Test: `backend/services/reportService.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `backend/services/reportService.test.js`:

```js
describe("collections pass-thru grouping", () => {
  const collections = [
    col("2025-01-05", {
      general_tithes_offering: 1000,
      bank_interest: 50,
      sunday_school: 200,
      sisterhood_san_juan: 100,
      total_amount: 1350,
    }),
  ];

  const grid = () => {
    const colAgg = aggregateCollections(collections);
    const expAgg = aggregateExpenses([], []);
    return buildSheetGrids(
      2025,
      { colAgg, expAgg, summary: buildSummary(colAgg, expAgg), collectionRows: collections, expenseRows: [] },
      "1/1/2026, 9:00:00 AM"
    )[1];
  };

  test("allocatable rows come first, then the pass-thru group", () => {
    const g = grid();
    expect(g.values[1][0]).toBe("General Tithes & Offering");
    expect(g.values[2][0]).toBe("Bank Interest");
    expect(g.values[3]).toEqual(["PASS-THRU ACCOUNTS"]);
    expect(g.values[4][0]).toBe("   Sisterhood San Juan");
    expect(g.values[10][0]).toBe("   Special/Pledge");
  });

  test("the pass-thru subtotal spans only the pass-thru rows", () => {
    const g = grid();
    const idx = g.values.findIndex((r) => r[0] === "   Subtotal — Pass-Thru");
    expect(g.values[idx][1]).toBe("=SUM(B5:B11)");
    expect(g.values[idx][13]).toBe(`=SUM(B${idx + 1}:M${idx + 1})`);
  });

  test("the Total row adds the three group rows and never re-counts the subtotal", () => {
    const g = grid();
    const subtotalRow = g.values.findIndex((r) => r[0] === "   Subtotal — Pass-Thru") + 1;
    const idx = g.values.findIndex((r) => r[0] === "Total");
    expect(g.values[idx][1]).toBe(`=B2+B3+B${subtotalRow}`);
    expect(g.values[idx][13]).toBe(`=SUM(B${idx + 1}:M${idx + 1})`);
  });

  test("the Total equals the sum of every category exactly once", () => {
    // Guards the double-count this layout invites: 1000 + 50 + (100 + 200) = 1350
    const g = grid();
    const idx = g.values.findIndex((r) => r[0] === "Total");
    expect(g.values[idx][1]).toBe("=B2+B3+B12");
    expect(g.values[1][1] + g.values[2][1] + g.values[4][1] + g.values[9][1]).toBe(1350);
  });

  test("all nine categories still appear, none dropped by the regrouping", () => {
    const g = grid();
    const labels = g.values.map((r) => (r[0] || "").trim());
    [
      "General Tithes & Offering", "Bank Interest", "Sisterhood San Juan",
      "Sisterhood Labuin", "Brotherhood", "Youth", "Couples",
      "Sunday School", "Special/Pledge",
    ].forEach((l) => expect(labels).toContain(l));
  });

  test("the header and group rows are bold and the sync stamp is last", () => {
    const g = grid();
    expect(g.fmt.frozenRowCount).toBe(1);
    expect(g.fmt.boldRows).toContain(0);
    expect(g.fmt.boldRows).toContain(3);
    expect(g.values[g.values.length - 1][0]).toContain("StewardBox");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npx jest services/reportService.test.js -t "collections pass-thru"`
Expected: FAIL — row 3 is currently `Sisterhood San Juan`, not the `PASS-THRU ACCOUNTS` header.

- [ ] **Step 3: Add the grouping constant**

In `backend/services/reportService.js`, after `COLLECTION_CATEGORIES`:

```js
// The workbook heads these under "Pass Thru Accounts:" — money the 10/10/80
// split never touches. General Tithes & Offering is the allocation base; Bank
// Interest is neither allocatable nor pass-through, so it sits outside both.
const PASS_THRU_KEYS = [
  "sisterhood_san_juan",
  "sisterhood_labuin",
  "brotherhood",
  "youth",
  "couples",
  "sunday_school",
  "special_purpose_pledge",
];
```

- [ ] **Step 4: Replace buildCollectionsGrid**

```js
function buildCollectionsGrid(year, colAgg, syncedAt) {
  const byKey = {};
  colAgg.categories.forEach((c) => {
    byKey[c.key] = c;
  });

  const values = [];
  const boldRows = [];
  const push = (row) => values.push(row) - 1;
  const pushBold = (row) => {
    const i = push(row);
    boldRows.push(i);
    return i;
  };

  pushBold(["Category", ...MONTHS, "Total"]);
  const firstDataIdx = values.length;

  // returns the 1-based sheet row of the row it just wrote
  const catRow = (label, cat) => {
    const i = push([label, ...cat.months, ""]);
    values[i][13] = `=SUM(B${i + 1}:M${i + 1})`;
    return i + 1;
  };

  const tithesRow = catRow(byKey.general_tithes_offering.label, byKey.general_tithes_offering);
  const interestRow = catRow(byKey.bank_interest.label, byKey.bank_interest);

  pushBold(["PASS-THRU ACCOUNTS"]);
  const passFirstRow = values.length + 1;
  PASS_THRU_KEYS.forEach((k) => catRow(`   ${byKey[k].label}`, byKey[k]));
  const passLastRow = values.length;

  const subIdx = pushBold([
    "   Subtotal — Pass-Thru",
    ...MONTHS.map((_, i) => {
      const L = colLetter(i + 1);
      return `=SUM(${L}${passFirstRow}:${L}${passLastRow})`;
    }),
    "",
  ]);
  const subtotalRow = subIdx + 1;
  values[subIdx][13] = `=SUM(B${subtotalRow}:M${subtotalRow})`;

  // Explicit addition, not SUM over the block: a blanket SUM would swallow the
  // subtotal row and count the pass-thru categories twice.
  const totalIdx = pushBold([
    "Total",
    ...MONTHS.map((_, i) => {
      const L = colLetter(i + 1);
      return `=${L}${tithesRow}+${L}${interestRow}+${L}${subtotalRow}`;
    }),
    "",
  ]);
  values[totalIdx][13] = `=SUM(B${totalIdx + 1}:M${totalIdx + 1})`;

  push([]);
  push([syncStamp(syncedAt)]);

  return {
    title: `${year} Collections`,
    values,
    fmt: {
      frozenRowCount: 1,
      boldRows,
      currencyRanges: [
        { startRowIndex: firstDataIdx, endRowIndex: totalIdx + 1, startColumnIndex: 1, endColumnIndex: 14 },
      ],
    },
  };
}
```

- [ ] **Step 5: Run the new tests**

Run: `cd backend && npx jest services/reportService.test.js -t "collections pass-thru"`
Expected: all PASS.

- [ ] **Step 6: Rewrite the existing collections grid test**

The old test at `reportService.test.js:190` asserts the flat layout. Replace its body:

```js
  test("collections grid: header, SUM formulas, totals row, sync stamp", () => {
    const grid = makeGrids()[1];
    expect(grid.values[0]).toEqual(["Category", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Total"]);
    expect(grid.values[1][0]).toBe("General Tithes & Offering");
    expect(grid.values[1][1]).toBe(1000);
    expect(grid.values[1][13]).toBe("=SUM(B2:M2)");
    const totalIdx = grid.values.findIndex((r) => r[0] === "Total");
    expect(grid.values[totalIdx][1]).toBe("=B2+B3+B12");
    expect(grid.values[totalIdx][13]).toBe(`=SUM(B${totalIdx + 1}:M${totalIdx + 1})`);
    expect(grid.values[grid.values.length - 1][0]).toContain(SYNCED);
    expect(grid.fmt.frozenRowCount).toBe(1);
    expect(grid.fmt.boldRows).toEqual([0, 3, 11, 12]);
  });
```

- [ ] **Step 7: Run the whole file, mirror, commit**

Run: `cd backend && npx jest services/reportService.test.js`
Expected: all PASS.

```bash
cd backend && npx jest services/reportService
git add backend/services/reportService.js api/_lib/reportService.js backend/services/reportService.test.js
git commit -m "feat: group pass-thru accounts on the collections tab"
```

---

## Task 6: The `{year} Weekly` tab

**Tab position:** appended **last**. `googleSheetsService.ensureTabs` creates missing tabs with `addSheet` and no `index` property (`backend/services/googleSheetsService.js:49-68`), so Google appends new sheets at the end of an existing spreadsheet regardless of array order. Putting Weekly third would not move it in any sheet that already exists, and would shift the array index of three passing tests for nothing.

**Files:**
- Modify: `backend/services/reportService.js` (`aggregateWeekly`, `buildWeeklyGrid`, `buildSheetGrids`)
- Modify: `api/_lib/reportService.js` (mirror)
- Test: `backend/services/reportService.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `backend/services/reportService.test.js`:

```js
describe("weekly aggregation", () => {
  const collections = [
    col("2025-01-05", { general_tithes_offering: 32685, total_amount: 32685, pbcm_share: 3268.5, pastoral_team_share: 3268.5, operational_fund_share: 26148 }),
    col("2025-01-08", { sunday_school: 100, total_amount: 100 }),
    col("2025-01-12", { general_tithes_offering: 16560, total_amount: 16560, pbcm_share: 1656, pastoral_team_share: 1656, operational_fund_share: 13248 }),
    col("2025-01-02", { general_tithes_offering: 500, total_amount: 500 }),
  ];

  test("one column per Sunday in the year", () => {
    const agg = aggregateWeekly(collections, 2025);
    expect(agg.sundays).toHaveLength(52);
    expect(agg.categories[0].weeks).toHaveLength(52);
  });

  test("a midweek record lands in its own week's column", () => {
    const agg = aggregateWeekly(collections, 2025);
    const school = agg.categories.find((c) => c.key === "sunday_school");
    expect(school.weeks[0]).toBe(100);
    expect(school.weeks[1]).toBe(0);
  });

  test("a pre-first-Sunday record folds into the first column, never dropped", () => {
    const agg = aggregateWeekly(collections, 2025);
    const tithes = agg.categories.find((c) => c.key === "general_tithes_offering");
    expect(tithes.weeks[0]).toBe(33185); // 32,685 on 5 Jan + 500 on 2 Jan
    expect(tithes.weeks[1]).toBe(16560);
  });

  test("shares come from the stored share columns", () => {
    const agg = aggregateWeekly(collections, 2025);
    expect(agg.shares.pbcm[0]).toBe(3268.5);
    expect(agg.shares.pastoral[0]).toBe(3268.5);
    expect(agg.shares.operational[0]).toBe(26148);
  });

  test("no collections produces a zeroed structure of the right width", () => {
    const agg = aggregateWeekly([], 2025);
    expect(agg.sundays).toHaveLength(52);
    expect(agg.categories.every((c) => c.weeks.every((w) => w === 0))).toBe(true);
  });
});

describe("weekly grid", () => {
  const collections = [
    col("2025-01-05", { general_tithes_offering: 32685, total_amount: 32685, pbcm_share: 3268.5, pastoral_team_share: 3268.5, operational_fund_share: 26148 }),
  ];
  const SYNCED = "1/1/2026, 9:00:00 AM";

  const grids = () => {
    const colAgg = aggregateCollections(collections);
    const expAgg = aggregateExpenses([], []);
    return buildSheetGrids(
      2025,
      { colAgg, expAgg, summary: buildSummary(colAgg, expAgg), collectionRows: collections, expenseRows: [] },
      SYNCED
    );
  };

  test("buildSheetGrids returns six grids, Weekly last", () => {
    expect(grids().map((g) => g.title)).toEqual([
      "2025 Summary",
      "2025 Collections",
      "2025 Expenses",
      "2025 Collections Detail",
      "2025 Expenses Detail",
      "2025 Weekly",
    ]);
  });

  test("header carries a column per Sunday plus a Total", () => {
    const g = grids()[5];
    expect(g.values[0][0]).toBe("Category");
    expect(g.values[0][1]).toBe("2025-01-05");
    expect(g.values[0][52]).toBe("2025-12-28");
    expect(g.values[0][53]).toBe("Total");
  });

  test("category rows total across the last week column BA", () => {
    const g = grids()[5];
    expect(g.values[1][0]).toBe("General Tithes & Offering");
    expect(g.values[1][1]).toBe(32685);
    expect(g.values[1][53]).toBe("=SUM(B2:BA2)");
  });

  test("the shares block keeps its week columns aligned with the categories above", () => {
    const g = grids()[5];
    const idx = g.values.findIndex((r) => r[0] === "SHARES");
    expect(g.values[idx + 1][0]).toBe("PDOT Share (10%)");
    expect(g.values[idx + 1][1]).toBe(3268.5);   // column B in both blocks
    expect(g.values[idx + 2][0]).toBe("Pastoral Team (10%)");
    expect(g.values[idx + 3][0]).toBe("Operational Fund (80%)");
  });

  test("a 53-Sunday year widens to column BB", () => {
    const rows = [col("2023-01-01", { general_tithes_offering: 100, total_amount: 100 })];
    const colAgg = aggregateCollections(rows);
    const expAgg = aggregateExpenses([], []);
    const g = buildSheetGrids(
      2023,
      { colAgg, expAgg, summary: buildSummary(colAgg, expAgg), collectionRows: rows, expenseRows: [] },
      SYNCED
    )[5];
    expect(g.values[0][53]).toBe("2023-12-31");
    expect(g.values[0][54]).toBe("Total");
    expect(g.values[1][54]).toBe("=SUM(B2:BB2)");
  });

  test("the tab is stamped and its header frozen", () => {
    const g = grids()[5];
    expect(g.fmt.frozenRowCount).toBe(1);
    expect(g.values[g.values.length - 1][0]).toContain(SYNCED);
  });
});
```

Add `aggregateWeekly` to the `require` destructuring.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npx jest services/reportService.test.js -t "weekly"`
Expected: FAIL — `aggregateWeekly is not a function`.

- [ ] **Step 3: Implement aggregateWeekly**

In `backend/services/reportService.js`, add after `aggregateCollections`:

```js
// Per-Sunday collections, mirroring the workbook's Weekly Collection sheet. The
// shares read the stored share columns rather than re-deriving 10/10/80, so this
// tab and the monthly Summary agree by construction.
function aggregateWeekly(rows, year) {
  const sundays = sundaysIn(year);
  const zeros = () => Array(sundays.length).fill(0);
  const categories = COLLECTION_CATEGORIES.map((c) => ({ ...c, weeks: zeros() }));
  const shares = { pbcm: zeros(), pastoral: zeros(), operational: zeros() };
  const weekTotals = zeros();

  for (const row of rows) {
    const w = weekIndexFor(row.date, sundays);
    if (w === null) continue;
    for (const cat of categories) {
      const amount = parseFloat(row[cat.key]) || 0;
      if (!amount) continue;
      cat.weeks[w] = round2(cat.weeks[w] + amount);
    }
    weekTotals[w] = round2(weekTotals[w] + (parseFloat(row.total_amount) || 0));
    shares.pbcm[w] = round2(shares.pbcm[w] + (parseFloat(row.pbcm_share) || 0));
    shares.pastoral[w] = round2(shares.pastoral[w] + (parseFloat(row.pastoral_team_share) || 0));
    shares.operational[w] = round2(shares.operational[w] + (parseFloat(row.operational_fund_share) || 0));
  }

  return { sundays, categories, shares, weekTotals };
}
```

- [ ] **Step 4: Implement buildWeeklyGrid**

Add after `buildExpensesDetailGrid`:

```js
function buildWeeklyGrid(year, weekAgg, syncedAt) {
  const { sundays, categories, shares } = weekAgg;
  const n = sundays.length;
  const lastWeekCol = colLetter(n);   // BA for 52 Sundays, BB for 53
  const totalCol = n + 1;            // 0-based index of the Total column

  const values = [];
  const boldRows = [];
  const push = (row) => values.push(row) - 1;
  const pushBold = (row) => {
    const i = push(row);
    boldRows.push(i);
    return i;
  };

  const weekRow = (label, weeks) => {
    const i = push([label, ...weeks, ""]);
    values[i][totalCol] = `=SUM(B${i + 1}:${lastWeekCol}${i + 1})`;
    return i;
  };

  pushBold(["Category", ...sundays, "Total"]);
  const firstDataIdx = values.length;
  categories.forEach((c) => weekRow(c.label, c.weeks));
  const lastDataRow = values.length;

  const totalIdx = pushBold([
    "Total",
    ...sundays.map((_, i) => {
      const L = colLetter(i + 1);
      return `=SUM(${L}${firstDataIdx + 1}:${L}${lastDataRow})`;
    }),
    "",
  ]);
  values[totalIdx][totalCol] = `=SUM(B${totalIdx + 1}:${lastWeekCol}${totalIdx + 1})`;

  push([]);
  pushBold(["SHARES"]);
  const shareStart = values.length;
  // Percentages live in the label, not a separate column: an extra column here
  // would shift every week one place right and break alignment with the block
  // above.
  weekRow("PDOT Share (10%)", shares.pbcm);
  weekRow("Pastoral Team (10%)", shares.pastoral);
  weekRow("Operational Fund (80%)", shares.operational);
  const shareEnd = values.length;

  push([]);
  push([syncStamp(syncedAt)]);

  return {
    title: `${year} Weekly`,
    values,
    fmt: {
      frozenRowCount: 1,
      boldRows,
      currencyRanges: [
        { startRowIndex: firstDataIdx, endRowIndex: totalIdx + 1, startColumnIndex: 1, endColumnIndex: totalCol + 1 },
        { startRowIndex: shareStart, endRowIndex: shareEnd, startColumnIndex: 1, endColumnIndex: totalCol + 1 },
      ],
    },
  };
}
```

- [ ] **Step 5: Wire it in as the sixth grid**

In `buildSheetGrids`, add the weekly aggregation and append the grid:

```js
function buildSheetGrids(year, { colAgg, expAgg, summary, collectionRows, expenseRows }, syncedAt) {
  const offeringTarget = buildOfferingTarget(colAgg, expAgg, year);
  // Appended last: ensureTabs creates missing tabs with addSheet and no index,
  // so Google puts a new tab at the end of an existing spreadsheet regardless.
  return [
    buildSummaryGrid(year, summary, syncedAt, offeringTarget),
    buildCollectionsGrid(year, colAgg, syncedAt),
    buildExpensesGrid(year, expAgg, syncedAt),
    buildCollectionsDetailGrid(year, collectionRows, syncedAt),
    buildExpensesDetailGrid(year, expenseRows, syncedAt),
    buildWeeklyGrid(year, aggregateWeekly(collectionRows, year), syncedAt),
  ];
}
```

Add `aggregateWeekly,` to `module.exports`.

- [ ] **Step 6: Run the new tests**

Run: `cd backend && npx jest services/reportService.test.js -t "weekly"`
Expected: all PASS.

- [ ] **Step 7: Update the grid-count test**

In `test("returns 5 grids with year-prefixed titles in order")` at `reportService.test.js:180`, rename and extend:

```js
  test("returns 6 grids with year-prefixed titles in order", () => {
    expect(makeGrids().map((g) => g.title)).toEqual([
      "2025 Summary",
      "2025 Collections",
      "2025 Expenses",
      "2025 Collections Detail",
      "2025 Expenses Detail",
      "2025 Weekly",
    ]);
  });
```

- [ ] **Step 8: Check the sync-stamp test still covers every tab**

Run: `cd backend && npx jest services/reportService.test.js -t "sync stamp branding"`
Expected: PASS. The test at line 313 asserts every tab names StewardBox; `buildWeeklyGrid` uses the shared `syncStamp`, so it should pass without edits. If it fails, the weekly grid is missing its stamp row — fix the grid, not the test.

- [ ] **Step 9: Run the whole file, mirror, commit**

Run: `cd backend && npx jest services/reportService.test.js`
Expected: all PASS.

```bash
cd backend && npx jest services/reportService
git add backend/services/reportService.js api/_lib/reportService.js backend/services/reportService.test.js
git commit -m "feat: add a per-Sunday weekly tab to the report"
```

---

## Task 7: Full verification

**Files:** none modified — this task only runs and reports.

- [ ] **Step 1: Run the whole server-side suite**

Run: `cd backend && npm test`
Expected: all 34 files pass (33 existing + the new parity file).

Two known non-regressions, both documented in `CLAUDE.md`:
- `backend/services/googleSheetsService.test.js` fails if Google credentials happen to exist locally at `backend/config/google-credentials.json`. Environmental.
- Roughly one run in twenty, a supertest file reports `Exceeded timeout of 5000 ms` or `Parse Error: Expected HTTP/, RTSP/ or ICE/`. Transport-level only — re-run before believing it. **A genuine assertion failure is never this bug.**

- [ ] **Step 2: Confirm the report routes still load both copies**

Run:

```bash
cd backend && node -e "
const b = require('./services/reportService');
const a = require('../api/_lib/reportService');
const need = ['aggregateCollections','aggregateExpenses','buildSummary','buildSheetGrids','aggregateWeekly','buildOfferingTarget','sundaysIn','weekIndexFor','PASTORAL_MINISTRIES'];
need.forEach(k => { if (!(k in b)) throw new Error('backend missing ' + k); if (!(k in a)) throw new Error('api missing ' + k); });
console.log('both copies expose all', need.length, 'members');
"
```

Expected: `both copies expose all 9 members`

- [ ] **Step 3: Build the frontend**

Run: `cd frontend && npm run build`
Expected: `Compiled successfully` (warnings are acceptable; errors are not). Nothing in the frontend changed, so this is a regression check on the completion bar, not on new code.

- [ ] **Step 4: Commit anything outstanding**

```bash
git status
```

Expected: clean. If not, commit the remainder with a message describing it.

---

## Task 8: Correct the spec's testing claim

The spec states the existing `reportService.test.js` must pass unchanged. Three tests assert literal row indices that necessarily moved. Leaving that claim in place would mislead the next reader into treating a correct change as a regression.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-16-excel-allocation-parity-design.md`

- [ ] **Step 1: Replace the claim in the Testing section**

Find:

```markdown
- a parity assertion that both `reportService` copies export the same surface
```

and the sentence above the list that reads `TDD, extending the existing reportService.test.js (which must keep passing unchanged — that is the evidence the public API held):`. Replace that opening sentence with:

```markdown
TDD, extending the existing `reportService.test.js`. The module's **exported
surface** is unchanged — `backend/routes/reports.js` and `api/reports.js` need no
edit, and that is the evidence the public API held. Three existing tests do
change, because they assert literal row indices that necessarily move when rows
are inserted: the grid-count test (5 → 6 tabs), the collections-grid test
(pass-thru header and subtotal inserted), and the summary-grid test
(offering-target block and seven ministry rows inserted). No other existing test
may be modified; if one breaks, that is a real regression.
```

- [ ] **Step 2: Add the parity guard to the same list**

Change the last list item to:

```markdown
- a parity test (`backend/services/reportService.parity.test.js`) that fails when
  the two copies drift, comparing both the normalised source and the exported
  surface
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-08-16-excel-allocation-parity-design.md
git commit -m "docs: correct the allocation parity spec's testing claim"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 Ministry taxonomy | Task 3 Step 3 |
| §2 Ministry rows under FUND ALLOCATION, indented, full precision | Task 3 |
| §3 OFFERING TARGET block, derived, omitted with no budget | Task 4 |
| §4 Collections pass-thru grouping, explicit Total | Task 5 |
| §5 `{year} Weekly` tab, `sundaysIn` / `weekIndexFor` | Tasks 1 and 6 |
| Both copies mirrored | Every task's mirror step + Task 1 parity guard |
| Tabs 5 → 6 | Task 6 Step 5 |
| Testing / completion bar | Task 7 |
| No schema, route, or frontend change | Task 4 Step 5 note; Task 7 Step 2 verifies |

Phase 2 and the "open items for the church" sections are explicitly out of scope and have no tasks, which is correct.

**Placeholder scan:** none. Every code step carries the code; every run step carries the command and expected output.

**Type consistency checked:** `sundaysIn(year)` returns `string[]` of ISO dates and is used that way in `aggregateWeekly` and the weekly header. `weekIndexFor` returns a number or `null`, and `aggregateWeekly` guards `=== null` (not falsy — index 0 is valid). `buildOfferingTarget` returns `null` or an object whose five fields are all read in Task 4 Step 4. `fundAllocation[].children` is optional and every reader guards with `|| []` or `undefined` checks. `aggregateWeekly` returns `{sundays, categories, shares, weekTotals}`; `buildWeeklyGrid` destructures the first three and ignores `weekTotals`, which the Total row derives by formula instead.

**One deliberate carry-forward:** `weekTotals` is computed in `aggregateWeekly` but unused by the grid. It is kept because the sheet's Total row is a `=SUM()` formula, while a future consumer (or a test asserting the numbers rather than the formulas) needs the computed value. If Task 6 review prefers strict YAGNI, drop it and the one test line that would reference it — nothing else depends on it.
