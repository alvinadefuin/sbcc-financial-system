# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SBCC Financial System (branded **StewardBox** in the UI) is a church financial
management application: collections, expenses, budgets, Google Sheets reporting,
and an audited change history. Collectors submit from a mobile PWA; treasurers
and admins work from a desktop dashboard.

- **Production API**: Vercel serverless functions in `api/`
- **Local dev API**: Express server in `backend/`
- **Frontend**: React 19 + Tailwind CSS in `frontend/`
- **Database**: PostgreSQL (Neon) in production; SQLite fallback for the local
  Express server only

## The one rule that matters most: `api/` and `backend/` are mirrors

The API exists **twice**:

| Path | Runtime | Used by |
|---|---|---|
| `api/*.js` | Vercel serverless | **Production** |
| `backend/routes/*.js` | Express | Local development |

Both implement the same endpoints. **A change to an endpoint's behaviour,
authorization, or validation must be made in both places**, or local development
will silently disagree with production. Existing tests assume this parity
(`api/*.test.js` and `backend/routes/*.test.js` frequently cover the same rule).

Exceptions that live only in `api/`: `google-sheets.js` (legacy export path, not
used by the current UI) and `health.js` (the Express server defines `/api/health`
inline in `server.js`).

Shared serverless helpers live in `api/_lib/` — Vercel ignores paths starting
with an underscore, which is why they are not deployed as functions:

| Module | Purpose |
|---|---|
| `auth.js`, `expressAuth.js` | `verifyToken`, `checkRole`, CORS |
| `database.js` | `pg` pool, `?` → `$n` placeholder conversion, shared `notDeleted` fragment |
| `softDelete.js` | The single SQL fragment every read must use |
| `activityLog.js` | Append-only audit writes |
| `tokenVersion.js` | Session revocation |

## Development Commands

### Frontend
```bash
cd frontend
npm start          # http://localhost:3000
npm run build      # Production build
npm test           # React Testing Library (CRA runs in watch mode)
```

### Backend (Express, local only)
```bash
cd backend
npm run dev        # nodemon, http://localhost:3001
npm start          # plain node
npm test           # Jest
```

### Serverless handlers, as production runs them
```bash
npx vercel dev     # serves frontend/ and api/ together; requires DATABASE_URL
```

### Tests

`cd backend && npm test` is the whole server-side suite — 42 files across
`backend/` and `api/`. `backend/jest.config.js` roots at **both** directories, so
one command covers both implementations. There is no separate test command for
`api/`.

Completion bar for any change: relevant tests pass **and** `cd frontend && npm run build`
succeeds. Manual verification in a running app is not available here.

**Known local-only failure:** `backend/services/googleSheetsService.test.js`
asserts `isReady()` is `false` because "the repo has no
`backend/config/google-credentials.json`". That file is gitignored, so the test
passes on a clean checkout — but it fails on any machine where Google Sheets
credentials have actually been set up locally. If you see exactly that one
failure, it is environmental, not a regression.

**Known flakiness — re-run before believing a backend failure.** Roughly one run
in twenty reports an extra failure or two in a supertest-based file
(`api/activity.test.js`, `api/collections.activity.test.js`,
`api/auth.password.test.js`, `backend/routes/customFields.auth.test.js` have all
been seen). It always presents as a transport-level fault — `Exceeded timeout of
5000 ms` or `Parse Error: Expected HTTP/, RTSP/ or ICE/` — never as a real
assertion failure, and it passes on re-run. Root cause is unconfirmed;
`scratch/backend-test-flakiness.md` records what has been ruled out and what to
try next. **A genuine assertion failure is never this bug** — only re-run when
the error is one of those two transport faults.

## Architecture Notes

### Authorization

Three roles: `user`, `admin`, `super_admin`.

- `GET` on collections/expenses: any authenticated user
- `POST`/`PUT`/`DELETE` on collections/expenses: `checkRole(['admin', 'super_admin'])`
- User management: `admin` and `super_admin`, with super-admin-only guards for
  granting `admin`, resetting passwords, and deleting users
- `GET /api/activity`: `super_admin` only
- The last active `super_admin` cannot be demoted, deactivated, or deleted
  (enforced with `SELECT ... FOR UPDATE` inside a transaction)

**Open discrepancy — do not "fix" casually.** Mobile submission posts to
`POST /api/collections`, which `canMutate` restricts to `admin`/`super_admin`, so
a `user` account gets `403` from the PWA. The in-app guide
(`content/guideContent.js`, `desktop-roles`) still says `user` is the right role
for collectors. Loosening the gate is a security decision — the options are
written up in `NEXT_STEPS_CONTEXT.md`; raise it rather than deciding it inline.

### Soft delete — every read must filter

`DELETE` on a collection or expense is an `UPDATE` setting `deleted_at` and
`deleted_by`. Rows are never physically removed; recovery is a manual
`UPDATE ... SET deleted_at = NULL`. (`fund_allocation` appears in the SQLite
schema only — it is absent from `database-pg.js` and from production, and no route
or service reads it.)

**Every read of `collections` or `expenses` must filter `deleted_at IS NULL`**,
using the shared fragment from `api/_lib/softDelete.js` rather than a hand-written
clause. Missing one leaks deleted records into financial reports. Regression tests
cover the record list, reports, budget comparison, webhook summary, and the
Google Sheets export.

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

### Activity log

`activity_log` is append-only — no application code updates or deletes from it.
Mutations record actor email, actor role, action, entity type, entity id, a
human-readable summary, and a JSON diff.

### Schema changes

There is **no migration runner**. Schema changes are applied as explicit,
idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements run against the
database by hand, with the statements recorded in the relevant plan under
`docs/superpowers/plans/`.

Consequence to be aware of: `backend/config/database.js` and
`database-pg.js` do **not** contain the August 2026 hardening columns
(`updated_at`, `updated_by`, `deleted_at`, `deleted_by`, `failed_login_attempts`,
`locked_until`, `token_version`) or the `activity_log` table. A database created
from those files alone will be missing them.

### Database layer

`backend/config/database.js` dispatches to `database-pg.js` when
`USE_POSTGRESQL=true` or `DATABASE_URL` starts with `postgres`; otherwise it uses
SQLite at `database/church_financial.db`. `api/_lib/database.js` is
PostgreSQL-only and throws without `DATABASE_URL`. Both expose the same
`get` / `all` / `run` trio, and both accept SQLite-style `?` placeholders — the
PostgreSQL layer rewrites them to `$1, $2, ...`.

### Frontend

- `frontend/src/App.js` routes `/mobile` to `components/mobile/MobileLayout`;
  everything else renders the desktop `Dashboard`
- Desktop navigation is built in `Dashboard.js` as `navSections`, gated by role
- `utils/api.js` is the single axios layer with auth interceptors
- `utils/syncQueue.js` / `syncManager.js` back the offline PWA queue (IndexedDB
  via `idb`); `public/sw.js` caches the shell
- `utils/sundaySummary.js` + `hooks/useSundaySummary.js` build the Sunday
  collection message, shared by desktop (`SundayCollectionModal`) and mobile
  (`MobileSummary`)
- `content/guideContent.js` holds the in-app user guide copy, split by
  mobile/desktop and filtered by role

### Retired: Google Forms ingestion

`/api/forms/*`, `backend/routes/forms.js`, and `google-forms-integration/` were
removed in August 2026. **Do not reintroduce them** —
`api/forms.removed.test.js` asserts they stay gone, including that `vercel.json`
does not route `/api/forms` and `server.js` does not mount a forms router.
Collections come in through the mobile PWA. `scratch/google-forms-decommission.md`
covers switching off any Google Form still pointed at the old endpoints.

`n8n/workflows/1-google-forms-to-api.json` still targets `/api/forms/*` and is
therefore dead. The other two n8n workflows use `/api/webhooks/*`, which is live.

## File Locations for Common Tasks

| Task | Files |
|---|---|
| Change an API endpoint | `api/<name>.js` **and** `backend/routes/<name>.js` |
| Shared serverless logic | `api/_lib/` |
| Add a React component | `frontend/src/components/` (desktop) or `components/mobile/` |
| API client methods | `frontend/src/utils/api.js` |
| Schema | `backend/config/database.js`, `database-pg.js` — plus a hand-run `ALTER TABLE` |
| In-app help text | `frontend/src/content/guideContent.js` |
| Routing / function config | `vercel.json`, `.vercelignore` |
| Styling | Tailwind classes; palette and theme in `frontend/src/utils/theme.js` |

## Deployment

Vercel builds `frontend/` to static files and deploys `api/*.js` as functions
(256 MB, 10 s). `.vercelignore` excludes `*.test.js`, `backend/`, `docs/`, and
`scratch/` — without the test exclusion the build exceeds the Hobby plan's
12-function limit. `railway.toml` and `nixpacks.toml` are leftovers from the
earlier Railway deployment and are not part of the current production path.

## Conventions

- Design specs and implementation plans are dated and kept in
  `docs/superpowers/specs/` and `docs/superpowers/plans/`. Check there for the
  reasoning behind a feature before changing it.
- Commit messages use conventional prefixes (`feat:`, `fix:`, `docs:`, `test:`).
- No credentials in the repo. The first admin is seeded from `ADMIN_EMAIL` /
  `ADMIN_PASSWORD`; with no `ADMIN_PASSWORD` set, a random one is generated
  (`backend/config/adminSeed.js`).
