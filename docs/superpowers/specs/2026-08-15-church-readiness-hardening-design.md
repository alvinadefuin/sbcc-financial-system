# Church Readiness Hardening: Authorization, Audit Trail, and Account Security

**Date:** 2026-08-15
**Branch:** feat/church-readiness-hardening
**Status:** Approved

## Context

Before SBCC begins relying on this system for real financial records, a review of the running application surfaced gaps that matter for a system holding church money. The application itself is sound — money columns are `numeric(10,2)` with no floating-point error, core data routes correctly reject unauthenticated requests, and no secrets are committed — but several controls expected of a financial system are missing.

Findings that motivate this work:

1. **Any authenticated user can edit or permanently delete any financial record.** `api/collections.js` and `api/expenses.js` guard POST/PUT/DELETE with `verifyToken` only, with no role check. Production contains a `role = 'user'` account.
2. **Deletes are permanent and changes are untracked.** `DELETE FROM collections` physically removes the row and its `fund_allocation` children. Tables carry `created_at`/`created_by` but no update or delete tracking, so "who changed this figure, and when?" is unanswerable.
3. **`/api/forms/*` accepts unauthenticated writes.** The ingestion endpoints have no auth middleware; the only gate is a `submitter_email` matching an active `role = 'user'` account. Email addresses are not secrets. Two debug endpoints in the same router are also publicly readable.
4. **No login rate limiting.** Password guessing is unthrottled.
5. **No password change or reset exists anywhere in the application.** Passwords can only be changed by direct SQL against the database.
6. **No session revocation.** PWA tokens last 30 days with no way to invalidate them; a lost phone stays signed in for a month.

Production currently holds 7 records (6 collections, 1 expense) from a single creator — pilot data. Schema changes are therefore low-risk now and become progressively riskier once the church begins entering real data.

## Decision

Eight workstreams, delivered together, on a branch cut from the current HEAD (which already contains the default-credential removal).

Deletes become soft. Financial mutations are restricted to `admin` and `super_admin`. An append-only activity log records who did what. The retired Google Forms ingestion path and other dead code are removed rather than secured. Password login gains a lockout, a change-password flow, and token revocation. The system runs with two super administrators, with guards preventing the last one from being removed.

## Non-Goals

- Rewriting the reporting or dashboard features.
- Changing the mobile PWA entry flow.
- Touching the n8n webhook routes (`/api/webhooks/*`), which are called by external automation and are already authenticated apart from `/health`.
- Introducing a general-purpose migration framework. Schema changes are applied as explicit, idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements.

---

## Changes

### 1. Shared Authorization Helper and Role Gates

`checkRole` currently lives inside `api/auth.js` and is unavailable to other route files.

- Move `checkRole` into `api/_lib/auth.js`, alongside `verifyToken` and `cors`, and re-export it from `api/auth.js` so existing usage is unaffected.
- Apply `checkRole(['admin', 'super_admin'])` to:
  - `POST`, `PUT`, `DELETE` on `/api/collections`
  - `POST`, `PUT`, `DELETE` on `/api/expenses`
- `GET` routes remain available to any authenticated user so members retain read access.
- Mirror the same gates in `backend/routes/collections.js` and `backend/routes/expenses.js` so the local Express server matches production behaviour.

A `role = 'user'` account receives `403` on any attempt to create, edit, or delete a financial record.

### 2. Soft Delete and Per-Record Audit Columns

Add to both `collections` and `expenses`:

| Column | Type | Purpose |
|---|---|---|
| `updated_at` | `timestamptz` | When the record was last edited |
| `updated_by` | `text` | Email of the last editor |
| `deleted_at` | `timestamptz` | Non-null means deleted |
| `deleted_by` | `text` | Email of the deleter |

Behaviour changes:

- `DELETE /api/collections/:id` and `/api/expenses/:id` become an `UPDATE` setting `deleted_at = now()` and `deleted_by = <actor email>`. The row and its `fund_allocation` children are preserved.
- `PUT` handlers set `updated_at` and `updated_by`.
- **Every** read of `collections` or `expenses` filters `deleted_at IS NULL`.

There are 46 read sites across 12 files; roughly a third disappear with the forms removal in change 4. To avoid a missed site silently leaking deleted records into financial reports, reads go through a single shared SQL fragment exported from `api/_lib/database.js` rather than 30 hand-written clauses. Each read surface gets a regression test: record list, reports, budget comparison, webhook financial summary, and Google Sheets export.

Soft-deleted records are not exposed through any API response. Recovery is a manual `UPDATE ... SET deleted_at = NULL` by an administrator; no restore UI is in scope.

### 3. Activity Log

Per-record columns record only the most recent change. A record edited three times shows one editor and one timestamp, losing the history. An append-only log preserves it.

New table `activity_log`:

| Column | Type | Notes |
|---|---|---|
| `id` | `serial primary key` | |
| `occurred_at` | `timestamptz not null default now()` | |
| `actor_email` | `text` | Null for failed logins with an unknown email |
| `actor_role` | `text` | Role at time of action |
| `action` | `text not null` | See list below |
| `entity_type` | `text` | `collection`, `expense`, `user`, or null |
| `entity_id` | `integer` | |
| `summary` | `text` | Human-readable one-line description |
| `changes` | `jsonb` | Field-level before/after diff for updates |

Actions logged: `record.create`, `record.update`, `record.delete`, `user.create`, `user.update`, `auth.login_success`, `auth.login_failed`, `auth.password_change`.

Design rules:

- All writes go through a single `logActivity()` helper in `api/_lib/activityLog.js`, giving one call site per mutation.
- The log entry is written **in the same database transaction as the mutation** so the log can never disagree with what happened. Where a handler does not currently use a transaction, one is introduced.
- The table is append-only in practice: no application code issues `UPDATE` or `DELETE` against it.
- Password hashes, JWTs, and raw password values are never written to `changes` or `summary`.
- `changes` records only fields that actually differ.

Read access:

- `GET /api/activity` — `super_admin` only, paginated (default 50), filterable by `entity_type`, `entity_id`, `actor_email`, and date range.
- A read-only Activity page in the frontend, visible only to `super_admin`, listing timestamp, actor, action, and summary with an expandable diff.

The per-record columns from change 2 are retained alongside the log: they make "last edited by" cheap to display in the records list without a join, while the log holds the history.

### 4. Remove Retired Google Forms Path and Dead Code

The Google Forms ingestion path is retired in favour of the mobile PWA, so it is removed rather than secured. This also eliminates the two publicly readable debug endpoints, which live in the same router.

Delete:

- `api/forms.js` and `backend/routes/forms.js`, their mounts in `backend/server.js`, and the `/api/forms/:path*` rewrite in `vercel.json`.
- `google-forms-integration/` — Apps Script for the retired forms.
- `frontend/src/components/Login.js` — the only unreferenced component in the codebase.
- `backend/seedJanuary2023.js` and `backend/test-postgres.js` — one-off dev scripts referenced nowhere.
- `backend/updateDatabaseSchema.js` — referenced nowhere, SQLite-only, and performs `DROP TABLE expenses`. Removing it eliminates a live footgun.

Rename `frontend/src/components/LoginNew.js` to `Login.js` now that the name is free, updating its import in `App.js` and its test file.

Verified before removal: no frontend code calls `/api/forms`, and the n8n webhook routes are untouched.

### 5. Database-Backed Login Lockout

Vercel serverless cannot share in-memory counters between invocations, so lockout state lives in Postgres.

Add to `users`:

| Column | Type | Default |
|---|---|---|
| `failed_login_attempts` | `integer` | `0` |
| `locked_until` | `timestamptz` | `null` |

Behaviour:

- Five consecutive failed password attempts set `locked_until = now() + 15 minutes`.
- While locked, login returns `423 Locked` with the remaining duration, without revealing whether the password was correct.
- The lock expires on its own. There is no admin unlock step, so no account can become permanently locked out and no administrator becomes a bottleneck.
- A successful login resets `failed_login_attempts` to `0` and clears `locked_until`.
- Applies to password login only. Google OAuth is unaffected.
- Both outcomes are recorded via `auth.login_success` / `auth.login_failed` activity entries.

### 6. Password Management and Token Revocation

Add to `users`: `token_version integer not null default 0`.

The JWT payload gains a `tv` claim carrying the user's current `token_version`. `verifyToken` rejects any token whose `tv` does not match the stored value.

New endpoints:

- `POST /api/auth/change-password` — any authenticated user. Requires `current_password` and `new_password`; verifies the current password with bcrypt, rejects a new password shorter than 8 characters, updates the hash, and increments `token_version`.
- `PUT /api/auth/users/:id/password` — `super_admin` only. Sets another user's password and increments their `token_version`.

Because a password change bumps `token_version`, it invalidates every existing session for that user. This is the revocation mechanism the system currently lacks: a lost phone is cut off by changing the password.

Frontend: a "Change password" form in the user menu, with current/new/confirm fields and inline validation.

PWA token lifetime is reduced from 30 days to 7. Web sessions remain at 24 hours.

### 7. Two Super Administrators and Role Safety

SBCC runs with **two** super administrators rather than one:

| Account | Role |
|---|---|
| `admin@sbcc.church` | `super_admin` — the seeded institutional account |
| `adefuinalvin1@gmail.com` | `super_admin` — the named personal account |

The second account was promoted from `admin` on 2026-08-15. It had to be done with direct SQL, because the API refuses to grant the role. That refusal is worth keeping in spirit but the current implementation has three problems, all of which matter more with two super administrators than with one.

**Problem 1 — silent failure.** `PUT /api/auth/users/:id` guards the role update with `if (role !== undefined && role !== 'super_admin')`. Setting a role to `super_admin` is therefore *silently dropped*: the request returns `200` and the caller believes it succeeded, but nothing changed. This should be an explicit `403`, not a no-op.

**Problem 2 — no way to manage super admins without SQL.** Granting the role requires database access. With a deliberate two-administrator model this will recur, so an existing `super_admin` may grant or revoke `super_admin` through `PUT /api/auth/users/:id`. Non-super-admins remain unable to, and `POST /api/auth/users` continues to refuse creating one outright — the role is granted by promotion, never at creation.

**Problem 3 — the last super admin can be removed.** `DELETE` already refuses to remove a `super_admin`, but the role can be demoted to `user` and the account can be deactivated via `is_active`. Either path can leave the system with zero super administrators and no way back except SQL.

Add a **last-super-admin guard** enforced in one place:

- A request that would leave fewer than one *active* `super_admin` is rejected with `409 Conflict` and a clear message.
- The guard covers demotion (`role` change away from `super_admin`), deactivation (`is_active = false`), and deletion.
- The count is evaluated inside the same transaction as the change, so two concurrent demotions cannot race past it.

Consequences elsewhere in this spec: the `super_admin`-only surfaces — `GET /api/activity` and `PUT /api/auth/users/:id/password` — are now available to both accounts, which is intended. It also means each super administrator can reset the other's password, giving a recovery path that does not require database access.

### 8. Minor Fixes

- Guard the duplicate `google.accounts.id.initialize()` call in the login component, which currently logs a GSI warning on every load.
- Replace the invalid `width: "100%"` passed to `google.accounts.id.renderButton` with a pixel value, resolving the second GSI warning.

---

## Migration Plan

Schema changes are additive and idempotent. No existing column or row is modified.

```sql
ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz,
  ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS activity_log (
  id            serial PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_email   text,
  actor_role    text,
  action        text NOT NULL,
  entity_type   text,
  entity_id     integer,
  summary       text,
  changes       jsonb
);

CREATE INDEX IF NOT EXISTS activity_log_occurred_at_idx ON activity_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_entity_idx ON activity_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS collections_not_deleted_idx ON collections (deleted_at);
CREATE INDEX IF NOT EXISTS expenses_not_deleted_idx ON expenses (deleted_at);
```

Order of application:

1. Run `scripts/backup-database.sh` against production.
2. Apply to the Neon `development` branch (`br-super-resonance-a4koenk7`); run the full test suite against it.
3. Apply to the Neon `production` branch (`br-wild-mode-a4o3z1nc`).
4. Deploy application code.

The schema is additive, so step 3 is safe to run before step 4: existing code ignores the new columns.

## Error Handling

- Role failures return `403` with a clear message, not `401`, so the UI can distinguish "not signed in" from "not permitted".
- The frontend hides edit and delete controls for users lacking permission, and still handles a `403` from the API gracefully in case a role changes mid-session.
- Lockout returns `423` with the remaining time.
- A failure to write an activity log entry aborts the enclosing transaction, so a mutation is never silently unlogged.

## Testing

Test-driven throughout; each behaviour gets a failing test before implementation.

- **Authorization:** a `user` role receives 403 on create/edit/delete for both collections and expenses; `admin` and `super_admin` succeed.
- **Soft delete:** deleting sets `deleted_at` rather than removing the row; deleted records are absent from the record list, reports, budget comparison, webhook summary, and Sheets export — one test per read surface.
- **Audit columns:** editing stamps `updated_at`/`updated_by`.
- **Activity log:** each mutation writes exactly one entry with the correct actor and action; `changes` contains only differing fields; no password material appears in any entry; a failed log write rolls back the mutation.
- **Activity endpoint:** `super_admin` can read; `admin` and `user` receive 403.
- **Lockout:** five failures lock; a sixth attempt returns 423 even with the correct password; the lock expires; success resets the counter.
- **Password change:** wrong current password rejected; short new password rejected; a successful change invalidates previously issued tokens.
- **Role safety:** a `super_admin` can promote another user to `super_admin` and demote one; an `admin` attempting either receives 403; setting a role to `super_admin` as a non-super-admin returns an explicit 403 rather than silently succeeding.
- **Last-super-admin guard:** demoting, deactivating, or deleting the only remaining active `super_admin` returns 409; the same operations succeed while a second active `super_admin` exists.
- **Removal:** `/api/forms/*` routes return 404; no frontend import references removed files; the build compiles.

## Risks

- **A missed read site leaks deleted records into financial reports.** This is the highest-consequence failure mode. Mitigated by routing reads through one shared filter and testing each read surface individually.
- **Transactional logging touches handlers that currently issue standalone queries.** Introducing transactions risks connection handling mistakes under the serverless pool. Mitigated by concentrating transaction handling in a single helper.
- **Locking out the only administrator.** Mitigated by time-expiring locks with no manual unlock step, by the last-super-admin guard, and by running two super administrators who can reset each other's passwords.
