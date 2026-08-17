# Excel Allocation Parity in the Google Sheets Report

**Date:** 2026-08-16
**Branch:** feat/excel-allocation-parity
**Status:** Approved

## Problem

The church's original workbook (`scratch/Fund-Allocation-SBCC-NERIO-FILES.xlsx`,
11 sheets) carries allocation detail that the generated Google Sheets report
never reproduces. The 2026-06-11 report design deliberately mirrored three of the
old sheets — Monthly Collections, Monthly Shares, Expense Monthly Sum — and left
the rest. Reading the workbook in full (values *and* formulas, since the
allocation logic lives in the formulas) turns up four gaps:

1. **The Pastoral Team 10% share is never broken down.** The workbook splits it
   seven ways — `BD Per Revised` B5:B12, echoed by `Expense Monthly Sum` B4:B13
   and by a column per ministry in every monthly ledger. The report emits a
   single "Pastoral Team (10%)" row.

2. **No offering target.** `BD Per Revised` E1 computes what the church must
   collect to fund its budget: operational requirement ÷ 0.80 = ₱109,916.67/mo.
   F13 shows the gap against actual. The report has no equivalent.

3. **Pass-through money is not visually separated.** The workbook heads
   Sisterhood/Brotherhood/Youth/Couples/Sunday School/Special Pledge under
   `Pass Thru Accounts:` — money the 10/10/80 does not touch. The Collections
   tab lists all nine categories flat under one Total, so the Total reads as if
   it were the allocatable base. The Summary's arithmetic is unaffected (it
   reads the stored share columns), but the tab misleads.

4. **No weekly grain.** `Weekly Collection` and `Weekly Shares` report every
   Sunday across the year. The report is monthly only, though the database holds
   per-record dates.

### What reading the code changed about the plan

Two findings reshaped the scope, and both are worth recording because they are
not obvious from the report output.

**The Pastoral Team fund is not tracked at all, and never has been.** Nothing in
the codebase writes `fund_source='pastoral_team'`. `FinancialRecordsManager.js`
hardcodes `fund_source: "operational"` (lines 146 and 291); `MobileSubmitForm.js`
omits the field entirely, so the API default applies. Both report copies only
ever *read* it — `backend/services/reportService.js:104` and
`api/_lib/reportService.js:100`. The "Pastoral Team (10%)" row on the Expenses
tab is therefore structurally always ₱0.00. Worse, the desktop form's "Pastoral
Team" input maps to `pastoral_worker_support` (`FinancialRecordsManager.js:373`),
which is an *Operational Fund* budget line — pastoral money is currently filed
as operational spending.

**The workbook barely uses its own ministry columns.** Across Jan/Feb/Mar 2025
the ministry actuals total ₱78 (Mar25, CE); every other ministry cell is zero.
The seven-ministry structure there is budget *intent*, recorded in
`BD Per Revised` and the `Alloted Budget:` header rows — not a used data-entry
workflow.

Taken together: building a ministry-tagging workflow to capture ₱78 a quarter is
over-building, while the *allocation* side — telling each ministry its monthly
budget — is pure derivation, needs no data entry, and is the information the
workbook actually carries.

## Decisions

| Question | Decision |
|---|---|
| Scope | Phase 1 only: report layer. Ministry allocation, offering target, pass-thru grouping, weekly tab |
| Ministry percentages | `BD Per Revised` — confirmed in force by `Expense Monthly Sum` B4:B13, which matches it and not the two older variants |
| Worship/Prayer/Music | One combined line at 25%, as in `BD Per Revised`, `Feb25`, and `Mar25`. Only the older `Jan25` splits it three ways |
| Ministry allocation basis | Actual `pastoral_team_share` collected × pct — not the workbook's hardcoded ₱9,500 sample |
| Offering target basis | Derived: Σ(operational budget lines) ÷ 0.80, as `BD Per Revised` E1. Self-correcting when a budget line changes |
| Weekly layout | One `{year} Weekly` tab. `Weekly Shares` is pure multiplication of the collections row; it was a separate sheet only because `Monthly Shares` consumed it by formula |
| Week bucketing | Sunday on or before the record date; pre-first-Sunday records clamp to column 1 |
| Ministry *actuals* | Deferred to Phase 2 (see below) |
| Code organisation | Extend both `reportService` copies in place — not a module split |
| Schema | No change. No `ALTER TABLE`, no new columns, no new tables |

### Why not split reportService into modules

An earlier draft proposed `report/aggregate.js`, `report/grids.js`, and
`report/calendar.js`. That was written without noticing that
`api/_lib/reportService.js` is a byte-for-byte copy of
`backend/services/reportService.js` with comments stripped (384 and 390 lines).
A three-module split becomes six files to keep mirrored, against a repo
convention that already accepts this duplication. With the form work deferred,
Phase 1's additions are small enough that both files stay readable.

## Scope

**Files changed:** `backend/services/reportService.js` and
`api/_lib/reportService.js`, kept mirrored, plus their tests.

**Not touched:** schema, API routes, desktop frontend, mobile frontend,
`googleSheetsService`. Phase 1 has **no mobile impact whatsoever** — it is
report-layer only.

Tabs per year go from 5 to 6.

## Design

### 1. Ministry taxonomy

```js
const PASTORAL_MINISTRIES = [
  { key: "ce",                      label: "CE",                      pct: 0.10 },
  { key: "worship_prayer_music",    label: "Worship/Prayer/Music",    pct: 0.25 },
  { key: "mission_evangelism",      label: "Mission/Evangelism",      pct: 0.15 },
  { key: "discipleship_fellowship", label: "Discipleship/Fellowship", pct: 0.10 },
  { key: "admin_finance",           label: "Admin & Finance",         pct: 0.10 },
  { key: "benevolence",             label: "Benevolence",             pct: 0.25 },
  { key: "pastoral_care",           label: "Pastoral Care",           pct: 0.05 },
];
```

Percentages sum to exactly 1.00.

### 2. Summary tab — ministry rows under FUND ALLOCATION

Seven indented rows below Pastoral Team, each month computed as
`shares.pastoral[m] × pct` — the direct analogue of the workbook's `=$G$3*B5`,
but driven by collected share rather than a sample figure.

```
FUND ALLOCATION (from General Tithes & Offering)
Fund                       Share    Jan        Feb      ...   Total
PBCM/PDOT Share             10%   8,881.70   6,570.50
Pastoral Team               10%   8,881.70   6,570.50
   CE                       10%     888.17     657.05
   Worship/Prayer/Music     25%   2,220.43   1,642.63
   Mission/Evangelism       15%   1,332.26     985.58
   Discipleship/Fellowship  10%     888.17     657.05
   Admin & Finance          10%     888.17     657.05
   Benevolence              25%   2,220.43   1,642.63
   Pastoral Care             5%     444.09     328.53
Operational Fund            80%  71,053.60  52,564.00
```

Labels are indented with three leading spaces so the hierarchy reads without
needing cell-level formatting.

**Rounding:** ministry months are emitted at full precision, *not* through
`round2`. Because the percentages sum to 1.00, the seven values then sum exactly
to the Pastoral Team row, and the ₱`#,##0.00` number format handles display. The
familiar consequence stands — seven displayed figures may appear to sum a
centavo off the displayed total — but the underlying arithmetic is exact, which
is the property that matters for a report people reconcile against.

Each ministry's Total column is `=SUM()` over its own months, consistent with
every other row on the tab.

### 3. Summary tab — OFFERING TARGET block

```
OFFERING TARGET
Operational budget (monthly)     87,933.33
Operational share                      80%
Required monthly offering       109,916.67
Required weekly offering         25,365.38

                     Jan       Feb     ...   Total
Actual offering    88,817    65,705
Surplus/(Shortfall)
```

- **Operational budget (monthly)** = Σ `budget_amount` over the 16 `Operational
  Fund` rows in `budget_categories` for the year.
- **Required monthly offering** = that ÷ 0.80, matching `BD Per Revised` E1
  (`=(E13/4)*5`).
- **Required weekly offering** = required monthly × 12 ÷ `sundaysIn(year)`.
  For 2025: 109,916.67 × 12 ÷ 52 = 25,365.38.
- **Actual offering** = `general_tithes_offering` per month — the allocatable
  base, *not* the grand total, which would include pass-through money.
- **Surplus/(Shortfall)** = actual offering − required monthly offering, as a
  per-month cell formula so the sheet stays live if someone edits a figure.

The entire block is omitted when the year has no `budget_categories` rows,
consistent with how Budget and Variance columns already blank out.

### 4. Collections tab — pass-thru grouping

```
Category                       Jan  ...  Total
General Tithes & Offering                          <- the 10/10/80 base
Bank Interest
PASS-THRU ACCOUNTS                                 (bold, no figures)
   Sisterhood San Juan
   Sisterhood Labuin
   Brotherhood
   Youth
   Couples
   Sunday School
   Special/Pledge
   Subtotal — Pass-Thru
Total
```

The current total row is `=SUM(B2:B{lastDataRow})`. Inserting a subtotal row
inside that range would double-count it, so the Total row becomes explicit:
`=B2+B3+B{subtotalRow}`. This is the single most breakable detail in the change
and gets a dedicated test.

Bank Interest sits outside both groupings, exactly as in the workbook — it is
neither allocatable nor pass-through.

### 5. New `{year} Weekly` tab

Two helpers, added to both `reportService` copies rather than a new file:

- `sundaysIn(year)` → every Sunday in the year (52 for 2025, 53 for a year that
  begins on a Sunday, e.g. 2023).
- `weekIndexFor(dateVal, sundays)` → index of the Sunday on or before the date;
  dates before the first Sunday clamp to index 0.

A midweek deposit therefore lands in its own week's column, and a 1–4 January
record folds into the first column. No record is ever dropped — something
hand-entry into the workbook could not guarantee.

```
{year} Weekly
Category                  Jan 5     Jan 12   ...   Total
General Tithes & Offering 32,685    16,560
Sunday School                422       360
...
Total                     36,107    17,560

SHARES
PDOT Share          10%   3,268.50   1,656.00
Pastoral Team       10%   3,268.50   1,656.00
Operational Fund    80%  26,148.00  13,248.00
```

The SHARES block reads the stored `pbcm_share` / `pastoral_team_share` /
`operational_fund_share` columns — the same source as the monthly Summary — so
the two tabs agree by construction rather than by coincidence.

## Testing

TDD, extending the existing `reportService.test.js` (which must keep passing
unchanged — that is the evidence the public API held):

- `sundaysIn` for a 52-Sunday year (2025, first Sunday 5 Jan) and a 53-Sunday
  year (2023, first Sunday 1 Jan); leap-year handling
- `weekIndexFor`: a Wednesday record buckets to its week's Sunday; a 2 January
  2025 record clamps to the 5 January column
- ministry rows sum exactly to the Pastoral Team row at full precision
- ministry percentages sum to 1.00
- offering target: derived value against the workbook's ₱109,916.67; block
  omitted when no budget rows exist
- collections Total equals Gen Tithes + Bank Interest + Pass-Thru subtotal, and
  does not double-count the subtotal
- weekly grid column count matches `sundaysIn(year)`; header dates are Sundays
- a parity assertion that both `reportService` copies export the same surface

**Completion bar:** `cd backend && npm test` green and
`cd frontend && npm run build` succeeding. Manual verification in a running app
is not available here.

Note the known flakiness recorded in CLAUDE.md: a transport-level supertest
failure (`Exceeded timeout of 5000 ms` or `Parse Error: Expected HTTP/…`) is
environmental and passes on re-run. A genuine assertion failure is never that
bug.

## Phase 2 — deferred, direction agreed

Not in this change. Recorded so the reasoning is not lost.

**Entry model: a cascading category → subcategory picker.** Choose a category,
see only that category's subcategories, then enter the amount. This surfaces the
structure the database already has: `budget_categories` is a two-level table and
`expenses` already carries both `category` and `subcategory` columns.
`GET /api/budget/plan/:year` (`backend/routes/budget.js:9`, mirrored at
`api/budget.js:72`) already returns every category+subcategory row ordered by
category — so the cascade needs no new endpoint.

This is a better model than the draft it replaced, which required pastoral spend
to be its own record and blocked mixing fund amounts on one entry. That rule
existed only because a row carries one `fund_source` while the form permits PBCM,
Pastoral, and several Operational amounts on a single record. Under a cascade the
category *is* the fund source, so the ambiguity — and the validation rule
explaining it — disappears.

Phase 2 would also:

- Fix `fund_source` so pastoral spend files as `pastoral_team` instead of landing
  in `pastoral_worker_support`. This is a defect fix that stands on its own merit
  regardless of the ministry split.
- Seed the seven `Pastoral Team` rows into `budget_categories` (a prerequisite of
  the cascade, not of Phase 1).
- Light up Spent and Remaining beside the Allocated figures Phase 1 ships.
- Replace `MobileSubmitForm.js`'s hardcoded 11-item category list with the same
  cascade, retiring `workers_share` — which is not a real column and matches no
  budget line.

### Fields-page hierarchy

`CustomFieldsManager` currently renders a flat list with a global Enable All /
Disable All. The proposal is to group the form fields by their budget category so
that enabling a category enables its subcategory fields.

**Agreed shape: auto-enable yes, hard lock no.** Enabling a category enables its
subcategory fields as a helpful default; each remains individually disableable
afterwards. Where a budget line has no active input field, the fields page warns
("Utilities has a budget line but no active input") rather than forcing the field
on.

The rejected version force-enabled subcategories and forbade disabling them. It
was turned down for three reasons:

1. It regresses what the page is for. `GET /api/custom-fields` filters on
   `is_active = true`, so disabling is the only way to shorten the form. Locking
   all 16 operational fields on means `MobileSubmitForm`'s breakdown card always
   renders 16 amount inputs — a long scroll on a phone for a treasurer who
   records two of them.
2. The invariant actually wanted is narrower than the rule. The real risk is a
   budget line with no way to record against it, which shows on the Expenses tab
   as permanently ₱0 actuals and reads as underspending. Surfacing that mismatch
   addresses it; forcing every field on is a blunter instrument than the problem
   needs.
3. A hard lock has no escape hatch. A church that genuinely does not use
   `lto_registration` could not hide it.

**Prerequisite: the hierarchy does not exist yet.** `custom_fields.category` is
plumbed end to end — both API implementations read and write it, and
`CustomFieldsManager.js:405` exposes an input — but the seed
(`database.js:340-358`) never populates it, so all 17 expense fields have
`category = NULL`. It is also free text rather than a constrained set, and
nothing reads it for grouping: `CustomFieldsManager` renders a flat list and
mobile filters only on `field_type === 'decimal'` (`MobileSubmitForm.js:164`).

The cascade must therefore derive its grouping from `budget_categories`, not from
a hand-populated `custom_fields.category` — otherwise the taxonomy lives in a
third place alongside `budget_categories` and `reportService`'s constants.

Note the grouping is uneven: PBCM Share/PDOT has one field, Operational Fund has
16, and **Pastoral Team has none** until Phase 2 gives the seven ministries a
storage shape. One group starts empty.

This is arguably its own feature rather than part of Phase 2 — it has a separate
UI surface and its own prerequisite data step. Recorded here so the decision is
not lost; it may graduate to its own spec.

## Open items for the church, not for the code

- **`database-pg.js` seeds no budget data.** Only the SQLite path seeds
  `budget_categories`; production runs PostgreSQL. If the table is empty for a
  year, the OFFERING TARGET block will not render and Budget/Variance columns
  stay blank — correct behaviour, but it means the feature shows nothing until
  budget rows exist. The implementation plan will carry the idempotent `INSERT`
  statements to run by hand, per the repo's no-migration-runner convention.
- **Mobile's expense `category` list has drifted** from the canonical 16: it
  offers `workers_share` (not a real column) and omits `cap_assistance`,
  `conference_seminar`, `anniversary_christmas`, `lto_registration`, and
  `abccop_community`. This does **not** corrupt any report arithmetic — mobile's
  amount fields come from the seeded expense custom fields, whose names match the
  17 report keys exactly, and the operational aggregation reads those amount
  columns rather than the `category` string. The effect is confined to the label
  shown in the Expenses Detail "Category" column. Phase 2 resolves it.

## Out of scope

- Budget-line derivations. The workbook keeps the arithmetic beside each figure
  (Pastoral & Worker's Support `=20000+8025+1000+((20000+7200)/12)`, ABCCOP
  Community Day `=(2000+1500+1500)/12`); the seeds keep only the result. The
  amounts match exactly, so nothing is wrong — only the provenance is missing.
- Special-purpose project tracking. `Jan25` columns AI/AJ track liquidations
  against named projects (Main Gate Project, Petty Cash Replenishment);
  `expenses` has no project tag.
- Comparing budget variants. The workbook keeps three side by side; the schema
  allows one `budget_plan` per year (`UNIQUE(year)`).
- Importing historical workbook data. The database is the source of truth.
