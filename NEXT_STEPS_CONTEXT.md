# SBCC Financial System — Status and Open Items

**Last reviewed:** 2026-08-16, against `main` at `cf0106d`.

This file replaces an earlier roadmap that had gone stale — it still described
Google OAuth as unconfigured and the frontend as undeployed, and pointed at four
documents that no longer exist. Everything below was checked against the code.

---

## Where the system is now

| Area | State |
|---|---|
| Production | Live on Vercel — `https://sbcc-financial-system.vercel.app` |
| API | Serverless functions in `api/`; `backend/` Express mirror for local dev |
| Database | PostgreSQL on Neon (previously Supabase — `docs/NEON_DB_MIGRATION.md`) |
| Auth | JWT + Google Sign-In, both working in dev and production |
| Mobile | PWA at `/mobile` with an offline IndexedDB queue |
| Reporting | Google Sheets sync from the Reports tab (`/api/reports/sync-sheet`) |
| Audit | Soft delete + append-only `activity_log`, super-admin readable |
| Account security | 5-attempt/15-minute lockout, password change, token revocation |
| Tests | Jest across `backend/` and `api/`; React Testing Library on the frontend |

Feature history lives in `docs/superpowers/specs/` and `docs/superpowers/plans/`,
dated per feature.

---

## Open items

### 0. A `user` account cannot submit from the mobile PWA — decide which side is wrong

Surfaced while checking the roles table for the README. Two parts of the system
disagree about what the `user` role can do:

- **The code**: mobile submission calls `submitForMobile()` in
  `frontend/src/utils/api.js`, which posts to `/api/collections`. That route is
  `verifyToken, canMutate` with `canMutate = checkRole(['admin', 'super_admin'])`
  (`api/collections.js:20,64`). A `user` account gets `403`. The offline queue in
  `syncManager.js` posts to the same endpoint, so queued submissions fail on sync
  too.
- **The in-app guide** (`frontend/src/content/guideContent.js`, `desktop-roles`)
  tells admins: *"User — sends collections and expenses from the phone. This is
  the right role for most collectors."*

The hardening work (Plan 1, August 2026) deliberately closed record mutation to
`user`, having found that "any authenticated user can edit or permanently delete
any financial record". The intent was clearly to stop `user` **editing and
deleting**; whether it was meant to stop them **creating** from the phone is the
open question, since that is the app's primary purpose.

Two ways out:

1. **Allow `user` to create, not edit or delete.** Split the gate so `POST` on
   collections/expenses accepts `user` while `PUT`/`DELETE` stay restricted. This
   matches the guide and keeps collectors on the least-privileged role.
2. **Keep the gate and correct the guide**, telling admins that collectors need
   the `admin` role. This is the smaller change but grants every collector record
   editing and user management.

Option 1 looks right, but it is a security decision, so it is left here rather
than made. Whichever is chosen, the guide text and the README roles table need to
end up agreeing with the code.

Also worth confirming against production: if collectors are currently submitting
successfully, they hold `admin`, and the deployment is effectively running
option 2 by accident.

### 1. Switch off the Google Forms at the source

The ingestion code (`/api/forms/*`, `backend/routes/forms.js`,
`google-forms-integration/`) was deleted in August 2026, but a Google Form is a
live thing running in Google's cloud — deleting our code does not stop it
submitting. The retirement procedure, including how to tell which variant each
form uses and how to roll back, is in `scratch/google-forms-decommission.md`.

Unknown from the code alone: whether this has been carried out yet.

### 2. n8n is retired — RESOLVED, August 2026

All of n8n was removed: the `n8n/` directory, both API copies of
`/api/webhooks/*`, and the two runbooks. The earlier note here claimed the
backup and weekly-report workflows used `/api/webhooks/*` and were therefore
unaffected. That was wrong — neither ever called the API. `2-database-backup`
ran shell commands and uploaded to Google Drive; `3-weekly-financial-report`
queried PostgreSQL directly. So the webhook endpoints had no caller at all.

**Consequence worth tracking:** the nightly database backup and the Monday
financial-report email were n8n's, and nothing in this codebase replaces them.
Neon's own PITR is the only backup now.

### 3. Schema files do not match the live database

The hardening columns (`updated_at`, `updated_by`, `deleted_at`, `deleted_by`,
`failed_login_attempts`, `locked_until`, `token_version`) and the `activity_log`
table were applied by hand and exist only as SQL inside
`docs/superpowers/plans/2026-08-15-hardening-*.md`. They are absent from
`backend/config/database.js` and `database-pg.js`.

A database bootstrapped from those files alone comes up missing them. Worth
either folding the statements into the bootstrap path or adding a small
migrations directory.

### 4. Leftovers to confirm or remove

- `railway.toml`, `nixpacks.toml` — from the earlier Railway deployment of the
  Express backend; not used by the Vercel production path.
- `api/google-sheets.js` (`/api/google-sheets/*`) — a legacy export path. The UI
  only calls `/api/reports/*`. `GOOGLE_SHEETS_SETUP.md` at the repo root
  documents this older path; `docs/GOOGLE_SHEETS_REPORT_SETUP.md` documents the
  one actually in use.
- `scratch/` is untracked and excluded from the Vercel build, yet holds the
  Google Forms decommissioning procedure. Consider moving that file into `docs/`
  so it is versioned.

### 5. Never implemented, from the original roadmap

Still absent, listed here so they are not rediscovered as surprises rather than
choices: a staging environment, PDF/Excel export, request rate limiting beyond
the login lockout, 2FA, and pagination on the record lists.

---

## Quick commands

```bash
# Local development
cd backend && npm run dev        # Express API on :3001
cd frontend && npm start         # SPA on :3000
npx vercel dev                   # frontend + api/ together, as production runs

# Tests
cd backend && npm test           # covers backend/ and api/
cd frontend && npm test
cd frontend && npm run build

# Production health
curl https://sbcc-financial-system.vercel.app/api/health
```
