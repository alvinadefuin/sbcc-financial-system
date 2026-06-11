# Google Sheets Financial Reports — Design

**Date:** 2026-06-11
**Branch:** `feature/google-sheets-reports`
**Status:** Approved

## Problem

The church currently maintains finances in a single messy workbook
(`Fund-Allocation-SBCC-NERIO-FILES.xlsx`): 11 mixed-purpose sheets — three
budget variants, monthly/weekly collection matrices, fund-share tables, an
expense summary, and raw per-month transaction sheets. It is hand-maintained,
error-prone, and disconnected from the SBCC Financial System database, which
already holds all the same data in structured form.

The app's existing "Export to Sheets" feature (`UpdateGoogleSheetModal` +
`POST /api/google-sheets/export`) was never functional (no credentials
configured), requires pasting a spreadsheet ID on every export, and dumps raw
records rather than producing a report.

## Goal

One church-owned Google Spreadsheet that serves as the official, always-current
financial report. One button in the app updates it in place — never creating
new files. The database remains the single source of truth; the spreadsheet is
a rendered snapshot of it.

## Decisions (made with user)

| Question | Decision |
|---|---|
| Report home | Google Sheets, updated in place via service account |
| File layout | One spreadsheet, multiple tabs (not separate files) |
| Depth | Summary matrices + transaction detail ledgers |
| Years | Per-year tab sets (`2025 Summary`, `2026 Summary`, …); old years stay frozen |
| Budget | Expenses tab includes Budget / Actual / Variance from `budget_categories` |
| Architecture | Server-computed snapshot; full idempotent overwrite of tab contents per sync |

## Architecture

```
backend/
  services/reportService.js        NEW — pure aggregation: rows → matrices
  services/googleSheetsService.js  EXTENDED — env-var credentials, tab ensure/clear/write helpers
  routes/reports.js                NEW — sync + status + config endpoints
frontend/src/
  components/ReportsView.js        NEW — extracted reports view (from Dashboard.js)
  utils/api.js                     EXTENDED — 3 new methods
```

Deleted: `frontend/src/components/UpdateGoogleSheetModal.js` and
`backend/routes/googleSheets.js` entirely — its `/export`, `/status`, `/test`
endpoints are consumed only by that modal. `routes/reports.js` supersedes them.

### New tables (SQLite `database.js` + PostgreSQL `database-pg.js`)

```sql
app_settings (
  key TEXT PRIMARY KEY,          -- 'report_spreadsheet_id'
  value TEXT,
  updated_by TEXT,
  updated_at DATETIME
)

report_syncs (
  id INTEGER PRIMARY KEY,
  year INTEGER NOT NULL,
  spreadsheet_id TEXT NOT NULL,
  status TEXT NOT NULL,          -- 'success' | 'failed'
  error TEXT,
  synced_by TEXT,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### API

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/reports/sync-sheet` `{year}` | admin | Run the sync for a year |
| `GET /api/reports/sheet-status` | any user | Spreadsheet configured? last sync info, sheet URL, service-account email |
| `PUT /api/reports/sheet-config` `{spreadsheetId}` | admin | Save spreadsheet ID (accepts full URL or bare ID) |

### Sync flow (`POST /api/reports/sync-sheet`)

1. Read `report_spreadsheet_id` from `app_settings` → friendly 400 if unset.
2. Fetch year data with dialect-safe SQL only (`WHERE date >= ? AND date <= ?`
   — the PG adapter does not translate `strftime`, so none is used).
   Sources: `collections`, `expenses`, `budget_plan` + `budget_categories`.
3. Aggregate in JS (`reportService`): category × month matrices, 10/10/80 fund
   shares, budget vs actual, running balance, fund position.
4. Ensure the five `"{year} …"` tabs exist; create missing ones (this is how a
   new year bootstraps — no new files, ever).
5. Clear each tab and rewrite: values, header formatting, ₱ `#,##0.00` number
   formats, `=SUM()` formulas for total rows/columns.
6. Stamp each tab with "Last synced from SBCC Financial System on {timestamp}";
   insert a `report_syncs` row.

Full overwrite per sync = idempotent. Manual edits to generated tabs are
intentionally not preserved.

### Credentials

`googleSheetsService.initialize()` order:
1. `GOOGLE_SERVICE_ACCOUNT_JSON` env var (JSON string) — required for prod
   (Railway has no persistent file system)
2. `backend/config/google-credentials.json` file — dev fallback (gitignored)

Scope: `https://www.googleapis.com/auth/spreadsheets`. The church creates the
spreadsheet manually once and shares it (Editor) with the service-account
email. A setup doc (`docs/GOOGLE_SHEETS_REPORT_SETUP.md`) walks through this.

## Spreadsheet structure (per year, 5 tabs)

### `{year} Summary`
- Title block + last-synced stamp
- **Monthly overview**: Total Collections / Total Expenses / Net
  Surplus(Deficit) / Running Balance × Jan–Dec + Total column
- **Fund allocation** (from `general_tithes_offering`): PBCM/PDOT 10%,
  Pastoral Team 10%, Operational Fund 80% × month + total — mirrors the old
  "Monthly Shares" sheet
- **Fund position YTD**: per fund — Allocated (shares), Spent (expenses by
  `fund_source`), Remaining

### `{year} Collections`
Category rows × Jan–Dec columns + Total row/column (`=SUM()` formulas).
Categories = the DB amount columns: General Tithes & Offering, Bank Interest,
then pass-through group: Sisterhood San Juan, Sisterhood Labuin, Brotherhood,
Youth, Couples, Sunday School, Special/Pledge. Mirrors old "Monthly
Collections" sheet.

### `{year} Expenses`
Rows grouped by fund — PBCM Share/PDOT (10%), Pastoral Team (10%), Operational
Fund (80%) with its 17 expense categories (`pastoral_worker_support` …
`abccop_community`). Columns: **Monthly Budget | Jan–Dec | Actual Total |
Annual Budget | Variance (Annual Budget − Actual)**.
`budget_categories.budget_amount` stores *monthly* figures (verified against
seeded data: Utilities 15,000/mo, LTO 416.67 = 5,000/12), so Annual Budget =
`budget_amount × 12`. Mirrors old "Expense Monthly Sum" + budget columns.

### `{year} Collections Detail`
Ledger, one row per collection, date-sorted: Date, Particular, Control #,
Payment Method, each category amount, Total.

### `{year} Expenses Detail`
Ledger, one row per expense, date-sorted: Date, Particular, Forms #, Cheque #,
Category, Fund Source, Amount.

**Formatting everywhere:** frozen header row, bold tinted headers, currency
formats, bold totals with top border. Printable.

## Frontend — Reports tab

Extract `selectedView === "reports"` JSX from `Dashboard.js` into
`ReportsView.js`. Keep the three existing summary cards. Below them, a
**Google Sheets Report** card with two states:

- **Not configured** (admin): paste spreadsheet URL/ID + shown the
  service-account email to share with → `PUT /api/reports/sheet-config`.
  Non-admins see "ask your admin to set this up."
- **Configured**: year picker (default current year) · **Update Report**
  button (spinner while running) · **Open in Google Sheets ↗** link · status
  line from last `report_syncs` row ("Last updated Jun 11, 3:42 PM by Alvin
  (2025)" or failure reason).

Print Report (existing `PrintReportModal`) is unchanged.

New `api.js` methods: `getReportSheetStatus()`, `syncReportSheet(year)`,
`saveReportSheetConfig(spreadsheetId)`.

## Error handling

| Case | Behavior |
|---|---|
| No spreadsheet configured | 400 + UI shows setup state |
| Credentials missing/invalid | 503 + setup hint |
| Sheet not shared with SA (Google 403) | Error message includes the exact service-account email to share with |
| Bad spreadsheet ID (Google 404) | "Spreadsheet not found — check the URL" |
| Network/quota errors | Readable message; `report_syncs.status='failed'` + error text |
| Year with no records | Tabs written with zeros (legitimate) |
| Year with no `budget_plan` row | Budget/Variance columns left blank; actuals still reported |
| Concurrent sync | In-process lock; second request → 409 |

All failures are logged to `report_syncs` so the UI can show the last error.

## Testing

- **`reportService` unit tests** (TDD, seeded in-memory SQLite): matrix
  aggregation, 10/10/80 split math, budget variance, running balance,
  fund position, empty year.
- **Payload builder tests**: assert the generated Sheets `batchUpdate`/values
  request structure without network.
- **`googleSheetsService` tests**: mocked `googleapis` client — tab
  ensure/create, clear, write sequencing, credential fallback order.
- **Route tests**: JWT required, admin-only enforcement, 400 unconfigured,
  409 concurrent.
- **Manual E2E**: real spreadsheet + dev service account; verify all 5 tabs,
  formatting, and per-year tab creation. Requires one-time user-side Google
  Cloud setup.

## Out of scope

- Importing historical data from the old workbook (DB already has the data)
- Excel (.xlsx) download export — could be added later reusing `reportService`
- Scheduled/automatic syncs (button-triggered only for now)
- Editing report data from the spreadsheet back into the app (one-way sync)
