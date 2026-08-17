# Expense Write Path and Budget Seed

**Date:** 2026-08-17
**Branch:** feat/expense-write-path
**Status:** Approved
**Follows:** `2026-08-16-excel-allocation-parity-design.md` (Phase 1, shipped)

## Problem

Phase 1 brought the workbook's allocation detail into the report. What it deferred
to "Phase 2" — a cascading category picker, a `fund_source` fix, budget rows for
the seven ministries — turns out to rest on a write path that does not work.
Reading the two API copies against the live database, rather than reading the
report output, turns up five defects. Every one of them predates Phase 1 and none
was visible from the report.

### 1. `PUT /api/expenses/:id` cannot execute

`POST` and `PUT` write two different, incompatible column sets.

| Path | Columns written |
|---|---|
| `POST` (`api/expenses.js:123`, `backend/routes/expenses.js:138`) | `category`, `subcategory`, `fund_source` + the 17 canonical amount columns |
| `PUT` (`api/expenses.js:229`, `backend/routes/expenses.js:275`) | 15 columns — `workers_share`, `fellowship_expense`, `benevolence_donations`, `gasoline_transport`, `pbcm_share`, `mission_evangelism`, `admin_expense`, `worship_music`, `discipleship`, `pastoral_care` and five that also exist canonically — and **no** `category`, `subcategory`, or `fund_source` |

Ten of the `PUT` columns exist in neither `backend/config/database.js` nor
`database-pg.js`, and — confirmed against the live Neon database on 2026-08-17 —
not in production either. The statement cannot run. Both copies agree with each
other, so the mirror rule held; **create and update diverged instead**, which no
test caught because the existing `PUT` tests stub the database layer.

The desktop form compounds it. `FinancialRecordsManager.js:508-517` submits
`pbcm_share_pdot`, `pastoral_team`, and `operational_fund_1` /
`operational_fund_1_amount` pairs. No API version reads any of those keys. Expense
editing is therefore broken twice over — wire format and SQL.

**Nobody has hit it because `expenses` holds 0 rows and always has.** No data is
stranded, no migration is owed, and the fix is free to choose its shape. The same
query confirms `collections` is clean: every column its `PUT` writes exists, 3
live rows, none ever edited.

### 2. The budget tables do not exist in production

Production has eight tables: `users`, `collections`, `expenses`, `custom_fields`,
`custom_field_values`, `app_settings`, `report_syncs`, `activity_log`.
`budget_plan` and `budget_categories` are absent, though `database-pg.js:177`
and `:189` define them — the schema file has never been run against production,
consistent with the repo's no-migration-runner convention.

The report sync survives this: the budget lookup at `api/reports.js:147` is
wrapped in a `catch` that logs and continues with `budgetRows = []`. That is
exactly why Phase 1's OFFERING TARGET block renders nothing rather than failing —
`buildOfferingTarget` returns `null` with no budget rows. Phase 1's second
headline feature is invisible in production, and will stay invisible until the
tables exist.

`GET /api/budget/plan/:year` would return 500 rather than 404, but no UI consumes
it — the `apiService` budget methods have no callers and there is no Budget nav
item.

### 3. Pastoral spend has nowhere to go

Nothing writes `fund_source='pastoral_team'`, so the Expenses tab's "Pastoral
Team (10%)" row is structurally ₱0.00 — `aggregateExpenses:189` is the only
reader. The desktop form's "Pastoral Team" input is dropped on the floor along
with the rest of its payload.

### 4. The audit trail for expenses tracks the wrong columns

`EXPENSE_FIELDS` (`api/_lib/activityLog.js:39`) is that same legacy list. The
diff on an expense edit therefore compares ten columns that do not exist and
ignores twelve that do — `pbcm_share_expense`, `pastoral_worker_support`,
`cap_assistance`, `conference_seminar`, `fellowship_events`,
`anniversary_christmas`, `lto_registration`, `transportation_gas`,
`abccop_national`, `cbcc_share`, `kabalikat_share`, `abccop_community` — along
with `category`, `subcategory`, and `fund_source`. Only five of its fifteen
amount columns are real. `activityLog.js` is a single shared module that
`backend/routes/expenses.js:5` also requires, so this is one fix, not a mirrored
pair.

### 5. An active custom field silently discards money

Production has 18 active decimal expense custom fields: the 17 canonical columns
plus **`kabisig_fund`**, added by an admin through the fields page and sitting at
`display_order = 0` — the first amount input on the mobile form. `expenses` has
no such column, `POST` does not destructure it, and `POST` never writes
`custom_field_values` (only the custom-fields routes touch that table). Anything
typed there is discarded without an error.

## What the workbook says an expense record is

`Jan25` is the church's only real expense ledger; `Feb25` and `Mar25` are
unfilled templates (Feb is all zeros, Mar carries ₱8,659 PBCM and ₱78 pastoral).
Its shape is one row per **voucher line**: date, Petty Cash Voucher #, Check
Voucher #, Particulars, Check #, Invoice/Receipt # — then one column per
category, of which each row fills exactly one.

Measured across its 66 line rows: 20 carry money, **19 have exactly one category
amount**, and the 20th's second non-zero value is the special-project column
(`AI`), not a category. Not one row spreads an amount across two categories.

One voucher becoming several rows is normal there. Row 11 — `Electric Expense`,
cheque 276296 — is followed by three unnumbered detail rows (New Bldg 12,287.80,
Old Bldg 128.55, Ptrl house 188.00), each its own Utilities line sharing the
parent's cheque.

The seven pastoral ministries are not a separate structure: they are seven more
columns in the same grid (`Jan25` I5:Q5). Ministry actuals need no new storage —
only a category value.

## Decisions

| Question | Decision |
|---|---|
| Record model | One row per line item: one `category`, one `subcategory`, one `total_amount` |
| Amount columns | Kept and populated — exactly one per row. The column names the subcategory and the subcategory names the column; the taxonomy maps both ways |
| `fund_source` | Derived on the server from the row's own category; never taken from the client |
| Pastoral rows | Carry `total_amount` and `fund_source='pastoral_team'` with no amount column |
| `reportService` | **Unchanged.** Column reads keep working; the pastoral row lights up via `fund_source` |
| Taxonomy home | One shared module, `api/_lib/expenseTaxonomy.js`, deriving its labels from `reportService` |
| Legacy input | Normalized, not rejected — mobile's column-key `category` values resolve to canonical labels |
| Multi-amount payload | Fanned out server-side into one row per non-zero amount, in one transaction |
| Amount with no budget line (`kabisig_fund`) | `400`, never a silent drop |
| Audit fields | `EXPENSE_FIELDS` replaced with the real columns plus the three classifying fields |
| Budget tables | Created in production, plus a uniqueness constraint so the seed is re-runnable |
| Seed year | 2026 |
| Desktop expense form | Out of scope — it needs the cascade, which is its own phase |
| Schema change to `expenses` | None. No `ALTER TABLE` |

### Why keep the amount columns

Storing only `category` / `subcategory` / `total_amount` is the cleaner data
model, and it was considered. It was rejected for this phase because
`aggregateExpenses` reads the 17 columns, so dropping them means rewriting the
aggregation Phase 1 just stabilised, re-deriving the Expenses tab, and widening
the test surface — for no gain the derived column does not already provide. With
one column populated per row, the column *is* the subcategory, so both readings
agree. If the columns are ever retired, the taxonomy module is the single place
that knows the mapping.

### Why the column wins over the picked category

`MobileSubmitForm.js:5` offers eleven `category` values that are column keys
rather than subcategory labels, and one of them (`workers_share`) matches no
column at all. Meanwhile the same form posts real amounts keyed by the actual
column names, because those come from the seeded custom fields. So the payload
already carries the trustworthy classification — in the amount keys — next to an
untrustworthy one in `category`. Deriving from the amount key makes the drifted
field irrelevant instead of requiring it to be fixed first, which is what lets
this phase leave both forms alone.

`category` still gets normalized rather than rejected, because it is the only
classification on a payload that carries just a `total_amount`: `workers_share`
resolves to `Pastoral & Worker Support`, the other ten by their column key. That
path is also the one a future cascade client will use.

### Why the taxonomy derives from `reportService`

The subcategory labels must stay byte-identical to the report's row labels — they
double as the `budget_categories.subcategory` lookup key, which is how the Expenses
tab finds each row's budget. A shared import enforces that structurally, so
`api/_lib/expenseTaxonomy.js` takes `OPERATIONAL_EXPENSE_CATEGORIES` and
`PASTORAL_MINISTRIES` from `./reportService` instead of restating them.

That points the write path at a report module, which is the wrong direction on
paper. The alternatives are worse: restating the lists reintroduces the drift this
module exists to remove, and moving them into a new mirrored pair would mean a
second file to keep in sync — the cost the Phase 1 spec explicitly declined when
it rejected splitting `reportService` into modules. Note that
`backend/services/reportService.js` and `api/_lib/reportService.js` must keep
requiring nothing new, or `reportService.parity.test.js` fails on the differing
relative paths; the dependency runs one way only, from the taxonomy to the report.

## Design

### 1. `api/_lib/expenseTaxonomy.js` (new, single copy)

One file, not a mirrored pair — the same arrangement as `softDelete.js` and
`activityLog.js`, which `backend/routes/*.js` requires across the directory
boundary (`backend/routes/expenses.js:4-5`). The single source for what an expense
may be filed against. Three funds:

| `category` | `fund_source` | Subcategories |
|---|---|---|
| `PBCM Share/PDOT` | `pbcm_share` | `PBCM Share` → column `pbcm_share_expense` |
| `Pastoral Team` | `pastoral_team` | the 7 ministries — no columns |
| `Operational Fund` | `operational` | the 16 operational lines → their columns |

The operational list is exactly `OPERATIONAL_EXPENSE_CATEGORIES` as Phase 1
defines it (`reportService.js:31`), labels unchanged — they double as the
`budget_categories.subcategory` lookup key and must stay byte-identical. The
seven ministries are exactly `PASTORAL_MINISTRIES` (`reportService.js:55`): CE,
Worship/Prayer/Music, Mission/Evangelism, Discipleship/Fellowship, Admin &
Finance, Benevolence, Pastoral Care.

Exports:

- `FUNDS` — the three categories with their `fund_source` and subcategory lists
- `resolveExpenseTarget(category, subcategory)` → `{ category, subcategory, fundSource, column }` or `null`. `column` is `null` for pastoral rows.
- `resolveAmountKey(key)` → the same shape for an amount column key, which is how a mobile payload's `utilities: 500` becomes an Operational Fund / Utilities line
- `normalizeSubcategory(value)` → canonical label from either a canonical label or a legacy column key (`workers_share` → `Pastoral & Worker Support`)
- `AMOUNT_COLUMNS` — the 17 real columns, so the route files and the audit field list stop restating them

No label appears in two funds, so a subcategory alone identifies its fund. The
tests assert that invariant rather than trusting it.

### 2. Both API copies derive on write

**The populated amount column is authoritative, not the `category` the client
picked.** Mobile renders one amount input per active decimal expense custom field
and posts the whole form flat (`MobileSubmitForm.js:241` → `POST /api/expenses`),
so a single submission can carry several non-zero amounts alongside one `category`
string. Under a line-item model the column already names the subcategory, which
makes the picked `category` redundant — and it is the field that has drifted
(`workers_share` matches no column at all). Deriving from the column instead
retires that whole class of mismatch.

`POST` resolves as follows:

1. Collect every amount key in the body that resolves through the taxonomy and is non-zero
2. **One resolved amount** → one row, exactly as today
3. **Several resolved amounts** → one row per amount, written in a single transaction, all sharing `date`, `particular`, `forms_number`, and `cheque_number`. This is how `Jan25` records a voucher covering several lines; the response returns `{ ids: [...] }` alongside the existing `id` of the first row so no caller breaks
4. **No resolved amount** → fall back to `total_amount` with `normalizeSubcategory(subcategory || category)`, which is the path a future cascade client and the legacy mobile `category` value both take
5. **An amount key that resolves to nothing** — `kabisig_fund` today — → `400` naming the field, so money is never accepted and dropped
6. Each row gets `category`, `subcategory`, and `fund_source` derived from its own column; any client-supplied `fund_source` is ignored

`PUT` takes the same resolution but never fans out — an edit addresses one
existing row. It writes the canonical column list plus `category`, `subcategory`,
and `fund_source`. That is the defect fix.

Duplicate detection keys on `(date, total_amount)` and so continues to work
per row rather than per submission — two lines of the same voucher differ in
amount, and two genuinely identical lines are exactly the case it should flag.
The activity log records one create per row, matching its append-only,
one-entity-per-entry shape.

`EXPENSE_FIELDS` in the shared `api/_lib/activityLog.js` is replaced with the 17
real amount columns plus `category`, `subcategory`, and `fund_source`, so an edit
to any of them is audited. Both route files pick that up from the one module.

Behaviour deliberately preserved: the `total_amount`-or-individual-amounts
validation, the soft-delete filter, and both role gates (`canCreate` admits
`user`; `canMutate` does not) stay exactly as they are.

### 3. The report needs no edit

A pastoral line item stores `fund_source='pastoral_team'` and `total_amount`.
`aggregateExpenses:189` already adds exactly those rows to the Pastoral Team
section. So the tab's permanently-₱0 row starts reporting real money with **no
change to either `reportService` copy** — which the tests verify by feeding the
aggregator a pastoral row and asserting a non-zero Pastoral Team total.

Operational and PBCM line items land in their columns, which the aggregation
already sums. The Expenses Detail tab's `Category` column starts showing real
labels instead of mobile's column keys.

### 4. Budget tables in production

Applied by hand, recorded in the implementation plan, per the repo's
no-migration-runner convention:

1. `CREATE TABLE IF NOT EXISTS budget_plan (...)` and `budget_categories (...)` — the definitions already in `database-pg.js:177-199`
2. `CREATE UNIQUE INDEX IF NOT EXISTS budget_categories_plan_cat_subcat ON budget_categories (budget_plan_id, category, subcategory)` — there is no unique constraint today, so `ON CONFLICT DO NOTHING` has nothing to target and the seed would duplicate on a second run
3. One `budget_plan` row for **2026** (`UNIQUE(year)` makes it idempotent on its own)
4. The 18 category rows already in `backend/config/database.js:267`
5. Seven new `Pastoral Team` children

Both schema files gain the unique index so a fresh database matches production.

The ministry children are the ₱9,500 parent split by the Phase 1 percentages:

| Subcategory | % | Monthly |
|---|---|---|
| CE | 10 | 950.00 |
| Worship/Prayer/Music | 25 | 2,375.00 |
| Mission/Evangelism | 15 | 1,425.00 |
| Discipleship/Fellowship | 10 | 950.00 |
| Admin & Finance | 10 | 950.00 |
| Benevolence | 25 | 2,375.00 |
| Pastoral Care | 5 | 475.00 |

They sum to 9,500.00 exactly.

**The parent `Pastoral Team` / `Pastoral Team` row stays.** The Expenses tab looks
up that exact key (`makeRow("pastoral_team", "Pastoral Team", "Pastoral Team")`),
and `buildOfferingTarget` sums only the Operational Fund section, so the children
cannot skew the offering target. None of the seven ministry labels collides with
an operational subcategory, so `budgetBySubcat` stays unambiguous.

Landing these rows is also what finally makes Phase 1's OFFERING TARGET block and
the Expenses tab's Budget and Variance columns render.

### 5. What this phase does not fix

The desktop expense form still submits `operational_fund_N` pairs and still will
not round-trip. Nothing regresses — it is broken today against zero rows — but a
treasurer cannot edit an expense from the desktop until the cascading
category → subcategory picker ships. That work spans two form surfaces, cannot be
verified without a running app, and is its own spec.

Mobile's eleven-item `category` list also stays as it is. It stops mattering for
any submission that carries amounts, because the amount keys classify the row; it
still resolves correctly on the `total_amount`-only path. The list gets replaced
by the cascade, not here.

## Testing

TDD. New file `api/_lib/expenseTaxonomy.test.js`, beside the module and alongside
the other `api/_lib` unit suites, plus cases added to the existing expense route
suites in both directories. `backend/jest.config.js` already roots at both, so
`cd backend && npm test` picks it up.

**Taxonomy**

- every operational subcategory resolves to a column that exists in the `expenses` schema
- the seven ministry subcategories resolve with `column === null` and `fundSource === 'pastoral_team'`
- no subcategory label appears under two funds
- `normalizeSubcategory` resolves all eleven of `MobileSubmitForm`'s legacy values, `workers_share` included
- unknown input returns `null`
- `resolveAmountKey` covers all 17 columns and rejects `kabisig_fund`
- `AMOUNT_COLUMNS` matches the `expenses` amount columns in both schema files — the assertion that would have caught this bug in the first place

**Write path, asserted in both copies**

- `POST` with a single `utilities` amount writes `utilities`, `subcategory='Utilities'`, `fund_source='operational'`
- `POST` with `category: 'Pastoral Team'`, `subcategory: 'Benevolence'` and a `total_amount` writes `total_amount`, `fund_source='pastoral_team'`, and no amount column
- `POST` carrying `utilities` **and** `supplies` creates two rows sharing the voucher's `date`, `particular`, `forms_number`, and `cheque_number`, each classified from its own column
- that fan-out is one transaction: a failure on the second row leaves no first row behind
- `POST` with a `kabisig_fund` amount returns `400` naming the field, and writes nothing
- a client-supplied `fund_source` is ignored in favour of the derived one
- a legacy `category: 'workers_share'` with only `total_amount` resolves to `Pastoral & Worker Support`
- `PUT` persists `category`, `subcategory`, and `fund_source`, and moves the amount when the subcategory changes
- `PUT` no longer references any column absent from the schema — the regression test for the actual defect
- `PUT` does not fan out
- the activity-log diff records a `category` change, and `EXPENSE_FIELDS` contains no column missing from the `expenses` schema

**Report, without editing `reportService`**

- `aggregateExpenses` given a `fund_source='pastoral_team'` row reports a non-zero Pastoral Team section
- the seven ministry budget rows do not change `buildOfferingTarget`'s result

**Parity**

- `reportService.parity.test.js` still passes — neither `reportService` copy gains
  a `require`, so the two stay byte-identical apart from comments
- the two route implementations agree: the same body produces the same rows and the
  same status through `api/expenses.js` and `backend/routes/expenses.js`

**Completion bar:** `cd backend && npm test` green and `cd frontend && npm run build`
succeeding. Manual verification in a running app is not available here.

The known flakiness recorded in `CLAUDE.md` applies: a supertest failure reading
`Exceeded timeout of 5000 ms` or `Parse Error: Expected HTTP/…` is environmental
and passes on re-run. A genuine assertion failure is never that bug.

## Open items for the church, not for the code

- **The seeded figures are the 2025 revised plan carried into 2026.** They are what
  `BD Per Revised` holds and they reproduce the ₱109,916.67 target Phase 1
  verified, but nobody has confirmed them as the church's 2026 budget. Variance
  and Remaining are only as right as these numbers.
- **A voucher covering several categories becomes several rows.** That matches the
  workbook, but the treasurer should know it before the cascade ships, because it
  changes what "one entry" means at the point of data entry. The mobile form does
  not change: the same submission simply lands as the right number of rows.
- **"Kabisig Fund" needs a decision.** It is an active amount field on the mobile
  form with no column, no budget line, and no report row, and it will start
  returning `400` instead of silently swallowing amounts. Either it becomes a real
  `Operational Fund` budget line — which needs a column, a report row, and its own
  small change — or the field should be deactivated on the fields page. Nothing
  has been recorded through it, so no data is at stake.

## Out of scope

- The cascading category → subcategory picker on desktop and mobile.
- Spent and Remaining beside the ministry Allocated figures on the Summary tab.
  It reads what this phase produces and is a pure report change once real
  pastoral rows exist.
- Retiring the 17 amount columns in favour of aggregating by `subcategory`.
- The fields-page hierarchy, already recorded in the Phase 1 spec as likely to
  graduate to its own spec.
- Special-project tracking (`Jan25` columns AI/AJ). Still no project tag on
  `expenses`, and the workbook's project rows carry no budget category.

## Correction to record

`CLAUDE.md`'s soft-delete section states that a deleted collection's
`fund_allocation` children are retained. `fund_allocation` exists only in the
SQLite schema, is absent from `database-pg.js` and from production, and no route
or service references it. The claim should be dropped when this work lands.
