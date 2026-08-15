# SBCC Financial System

Church financial management for Sto. Niño Bible Christian Church — collections,
expenses, budgets, and reporting. Collectors submit from a phone; treasurers and
admins manage records, run reports, and audit changes from a desktop dashboard.

The app is branded **StewardBox** in the UI.

- **Production**: https://sbcc-financial-system.vercel.app
- **Local development**: http://localhost:3000

---

## Architecture

There are **two server implementations of the same API**, and this is the single
most important thing to know about the codebase:

| Path | Runtime | Used by |
|---|---|---|
| `api/*.js` | Vercel serverless functions | **Production** |
| `backend/` | Long-running Express server | Local development only |

Both expose the same routes and must stay behaviourally identical. A change to
an endpoint in one place needs the matching change in the other, or production
and local will disagree. See `CLAUDE.md` for the mirroring rules.

```
┌──────────────┐     ┌─────────────────────────────┐     ┌──────────────┐
│  React SPA   │────▶│  api/*.js  (Vercel, prod)   │────▶│  PostgreSQL  │
│  frontend/   │     │  backend/  (Express, local) │     │   (Neon)     │
└──────────────┘     └─────────────────────────────┘     └──────────────┘
        │
        └── /mobile → PWA with offline queue (IndexedDB + service worker)
```

**Database**: PostgreSQL, hosted on [Neon](https://neon.tech). Production has
also run on Supabase historically; see `docs/NEON_DB_MIGRATION.md`. The local
Express server falls back to SQLite (`database/church_financial.db`) when
`DATABASE_URL` / `USE_POSTGRESQL` are unset. The serverless handlers in `api/`
are PostgreSQL-only and require `DATABASE_URL`.

**Stack**: Node.js 18+, Express, `pg`, React 19, Tailwind CSS, Recharts,
lucide-react, `idb`, JWT + Google OAuth 2.0, Jest / React Testing Library.

---

## Features

### Desktop (admin & treasurer)

- **Dashboard** — collection and expense totals, recent records, period selection
- **Analytics** — charts over collections, expenses, and net surplus
- **Reports** — in-place sync of a church-owned Google Spreadsheet
  (`docs/GOOGLE_SHEETS_REPORT_SETUP.md`)
- **Manage Records** — create, edit, and delete collections and expenses
- **Users** — invite, edit, deactivate; role assignment with super-admin guards
- **Mobile Form Fields** — turn phone-form fields on and off per church
- **Activity Log** — append-only audit trail (super admin only)
- **Sunday Collection** — build a copy-paste summary message for a date or date
  range, ready for the church group chat
- **User Guide** — in-app help, written per role (`frontend/src/content/guideContent.js`)

### Mobile PWA (`/mobile`)

- **Submit** — collection entry sized for one-handed use on a phone
- **Denomination calculator** — counts ₱1000/500/200/100/50/20/10/5/1 into a total
- **Recent** — what this collector has already sent
- **Summary** — the same Sunday collection message, from the phone
- **Offline first** — submissions queue in IndexedDB and sync when the
  connection returns; a banner shows connection state

### Security & audit

- JWT authentication, plus Google Sign-In
- Three roles: `user`, `admin`, `super_admin`
- Financial mutations (`POST`/`PUT`/`DELETE` on collections and expenses) require
  `admin` or `super_admin`; `GET` stays open to any authenticated user
- **Soft delete** — deleting a record stamps `deleted_at` / `deleted_by` and every
  read filters `deleted_at IS NULL`. Nothing is physically removed; recovery is a
  manual `UPDATE ... SET deleted_at = NULL`
- **Activity log** — append-only `activity_log` table recording actor, action,
  entity, and a diff summary
- **Login lockout** — 5 failed password attempts locks the account for 15 minutes
- **Password change** — self-service, plus a super-admin reset
- **Session revocation** — a `token_version` claim invalidates issued tokens
- Token lifetime: 24h for desktop, 7d for PWA logins

### Roles

| Capability | `user` | `admin` | `super_admin` |
|---|:--:|:--:|:--:|
| Read records, dashboard, reports | ✅ | ✅ | ✅ |
| Create / edit / delete records | ❌ | ✅ | ✅ |
| Submit from the mobile PWA | ❌ † | ✅ | ✅ |
| Manage users, custom fields | ❌ | ✅ | ✅ |
| Grant the `admin` role | ❌ | ❌ | ✅ |
| Reset another user's password, delete users | ❌ | ❌ | ✅ |
| Read the Activity Log | ❌ | ❌ | ✅ |

The last active `super_admin` cannot be demoted, deactivated, or deleted.

> **† Known discrepancy.** Mobile submission posts to `POST /api/collections`
> (`frontend/src/utils/api.js` → `submitForMobile`), which is gated to
> `admin`/`super_admin`, so a `user` account gets `403` when submitting from the
> phone. The in-app guide still tells admins that `user` "sends collections and
> expenses from the phone. This is the right role for most collectors."
> One of the two needs to change — see `NEXT_STEPS_CONTEXT.md`.

---

## Quick start

```bash
git clone https://github.com/alvinadefuin/sbcc-financial-system.git
cd sbcc-financial-system
```

### Frontend

```bash
cd frontend
npm install
npm start          # http://localhost:3000
```

`REACT_APP_API_URL` (in `frontend/.env.development`) controls where the SPA sends
requests. Leave it empty to use the same origin — correct under `vercel dev` —
or set `http://localhost:3001` to talk to the standalone Express backend.

### Backend (local Express server)

```bash
cd backend
npm install
cp .env.example .env.development.local   # then fill in real values
npm run dev        # http://localhost:3001
```

### Serverless handlers (matching production)

```bash
npx vercel dev     # serves frontend/ and api/ together, PostgreSQL required
```

### First admin account

On a database with no admin, the backend seeds one super admin. Credentials come
from the environment — **no default password is committed**:

```bash
ADMIN_EMAIL=you@yourchurch.org      # defaults to admin@sbcc.church
ADMIN_PASSWORD=<choose a strong password>
```

If `ADMIN_PASSWORD` is unset, a random password is generated, so a fresh install
can never come up with a publicly known default. Seeding is insert-or-ignore, so
it only applies to a database that has no admin yet.

> **Never commit real credentials.** Rotate any password that has been shared or
> committed, and use a unique password per environment.

---

## Testing

```bash
cd backend && npm test     # Jest: covers backend/ AND api/ (see backend/jest.config.js)
cd frontend && npm test    # React Testing Library
cd frontend && npm run build
```

The backend Jest config deliberately roots at both `backend/` and `../api/`, so
one command exercises both server implementations.

---

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | backend, api | PostgreSQL connection string (required by `api/`) |
| `USE_POSTGRESQL` | backend | `true` forces PostgreSQL instead of the SQLite fallback |
| `DATABASE_PATH` | backend | SQLite file location in production containers |
| `JWT_SECRET` | backend, api | Token signing secret |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | backend | Seeds the first super admin |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | backend, api | Google Sign-In |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | backend, api | Service-account key for Google Sheets reports |
| `WEBHOOK_SECRET` | backend, api | Authenticates the n8n webhook routes |
| `GOOGLE_FORM_SYNC_WEBHOOK_URL` / `GOOGLE_FORM_SYNC_SECRET` | backend, api | Custom-field sync callout |
| `FRONTEND_URL` | backend | Added to the CORS allow-list |
| `REACT_APP_API_URL` | frontend | API origin; empty means same-origin |

Google Sheets credentials may instead live at `backend/config/google-credentials.json`
locally (gitignored). The environment variable takes priority.

---

## API reference

All routes require a bearer token unless noted.

### Auth
| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/login` | Public; rate-limited by lockout |
| `POST` | `/api/auth/google` | Public; Google Sign-In |
| `GET` | `/api/auth/google/config` | Public; client-side OAuth config |
| `GET` | `/api/auth/me` | Current user |
| `POST` | `/api/auth/change-password` | Self-service |
| `GET`/`POST` | `/api/auth/users` | admin, super_admin |
| `PUT` | `/api/auth/users/:id` | admin, super_admin |
| `PUT` | `/api/auth/users/:id/password` | super_admin — reset another user |
| `DELETE` | `/api/auth/users/:id` | super_admin |

### Collections & expenses
| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/collections`, `/api/collections/:id` | Any authenticated user |
| `POST`/`PUT`/`DELETE` | `/api/collections`, `/api/collections/:id` | admin, super_admin; `DELETE` is a soft delete |
| `GET` | `/api/collections/summary/detailed` | Aggregates used by the summary views |
| `GET` | `/api/expenses`, `/api/expenses/:id` | Any authenticated user |
| `POST`/`PUT`/`DELETE` | `/api/expenses`, `/api/expenses/:id` | admin, super_admin; `DELETE` is a soft delete |

### Budget
| Method | Path |
|---|---|
| `POST` | `/api/budget/plan` |
| `GET` | `/api/budget/plan/:year` |
| `GET` | `/api/budget/comparison/:year` |
| `GET` | `/api/budget/available/:year/:category` |

### Reports (Google Sheets)
| Method | Path |
|---|---|
| `GET` | `/api/reports/sheet-status` |
| `PUT` | `/api/reports/sheet-config` |
| `POST` | `/api/reports/sync-sheet` |

### Custom fields
| Method | Path |
|---|---|
| `GET` | `/api/custom-fields/:tableName` |
| `POST` | `/api/custom-fields` — admin, super_admin |
| `PUT`/`DELETE` | `/api/custom-fields/manage/:id` — admin, super_admin |
| `GET`/`POST` | `/api/custom-fields/:tableName/:recordId/values` |
| `POST` | `/api/custom-fields/sync-to-google-form/:tableName` — admin, super_admin |

### Audit & ops
| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/activity` | super_admin only; paginated |
| `GET` | `/api/health` | Public |
| `GET`/`POST` | `/api/webhooks/*` | Called by n8n automation; `WEBHOOK_SECRET` |
| `GET`/`POST` | `/api/google-sheets/*` | Legacy export path; not used by the current UI |

> **Retired:** `/api/forms/*` (the Google Forms ingestion path) was removed in
> August 2026 along with `google-forms-integration/`. `api/forms.removed.test.js`
> asserts it stays gone. Collections now come in through the mobile PWA. See
> `scratch/google-forms-decommission.md` for how to switch off any Google Form
> still pointed at the old endpoints.

---

## Data model

Tables created by `backend/config/database.js` (SQLite) and
`backend/config/database-pg.js` (PostgreSQL):

`users`, `collections`, `expenses`, `fund_allocation`, `budget_categories`,
`budget_plan`, `custom_fields`, `custom_field_values`, `report_syncs`,
`app_settings`.

Money columns are `numeric(10,2)` — no floating-point error.

> **Schema drift, worth knowing:** the August 2026 hardening columns
> (`updated_at`, `updated_by`, `deleted_at`, `deleted_by` on records;
> `failed_login_attempts`, `locked_until`, `token_version` on users) and the
> `activity_log` table were applied to the live database as explicit
> `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements. Those statements live in
> `docs/superpowers/plans/2026-08-15-hardening-*.md`, **not** in the schema files
> above, and there is no migration runner in this repo. A database bootstrapped
> purely from `database.js` / `database-pg.js` will be missing them.

---

## Deployment

**Vercel** builds and hosts everything:

- `frontend/` builds to a static SPA (`vercel.json` → `buildCommand`)
- `api/*.js` deploy as serverless functions, 256 MB / 10 s
- `.vercelignore` excludes `*.test.js`, `backend/`, `docs/`, and `scratch/` —
  test files would otherwise count against the Hobby plan's 12-function limit
- `vercel.json` rewrites route `/api/<name>/*` to the matching handler and send
  everything else to `index.html`

Deploys run automatically from `main`. Environment variables are set in the
Vercel dashboard.

`railway.toml` and `nixpacks.toml` are left over from the earlier Railway
deployment of the Express backend and are not part of the current production
path.

---

## Repository layout

```
sbcc-financial-system/
├── api/                    # Vercel serverless functions (PRODUCTION API)
│   ├── _lib/               # Shared: auth, database, softDelete, activityLog, tokenVersion
│   └── *.test.js           # Jest suites (excluded from the Vercel build)
├── backend/                # Express server for local development
│   ├── routes/  config/  services/  middleware/
├── frontend/               # React SPA + mobile PWA
│   └── src/
│       ├── components/     # Desktop views
│       ├── components/mobile/  # PWA
│       ├── content/        # In-app user guide copy
│       ├── hooks/  utils/
├── database/               # SQLite files + init/seed SQL (local dev)
├── docs/                   # Setup guides, migration notes
│   └── superpowers/        # Design specs and implementation plans, dated
├── n8n/                    # Automation workflows (see note below)
├── scripts/                # backup-database.sh, restore-database.sh
├── CLAUDE.md               # Instructions for Claude Code
└── vercel.json
```

---

## Documentation index

| Document | Covers |
|---|---|
| `CLAUDE.md` | Working rules for this codebase (read before changing the API) |
| `docs/GOOGLE_SHEETS_REPORT_SETUP.md` | Service-account setup for the Reports tab |
| `docs/NEON_DB_MIGRATION.md` | Moving the database to Neon |
| `docs/N8N_SETUP.md`, `docs/N8N_HANDS_ON_TUTORIAL.md` | n8n automation (partly superseded) |
| `docs/IMPLEMENTATION_SUMMARY.md` | Neon + n8n rollout notes |
| `docs/app-character-context.md` | StewardBox brand character guide |
| `docs/superpowers/specs/`, `docs/superpowers/plans/` | Per-feature design and implementation history |
| `GOOGLE_SHEETS_SETUP.md` | Legacy `/api/google-sheets/export` path |
| `NEXT_STEPS_CONTEXT.md` | Current status and known gaps |

**n8n caveat:** `n8n/workflows/1-google-forms-to-api.json` still posts to
`/api/forms/*`, which no longer exists — that workflow is dead. The backup and
weekly-report workflows use `/api/webhooks/*`, which is still live.

---

## License

Private church management system — not for public distribution.

---

**Last updated**: August 2026
