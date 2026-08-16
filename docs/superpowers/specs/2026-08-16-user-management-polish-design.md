# User Management: Drop the Name Input, Fix the Table, Add Sorting

**Date:** 2026-08-16
**Branch:** main (bundled with the unpushed records-sorting work)
**Status:** Approved

## Problem

Three complaints about the desktop User Management view. None of them change who
may do what, and none touch collections or expenses.

1. **The Add User form asks for a full name that the system immediately
   discards.** Google sign-in overwrites `users.name` from the OAuth payload on
   every login (`api/auth.js:199-205`), so a name typed at creation survives only
   until that person first signs in. Typing it is busywork.

2. **The table's cells are centred and the User column swallows the slack.**
   `App.css` carries the Create React App boilerplate `.App { text-align: center }`.
   The `<th>`s opt out with an explicit `text-left`; the `<td>`s do not, so every
   cell inherits centring — which is why a name sits centred over the email
   beneath it and the date columns drift. Separately, `<table class="w-full">`
   with no column sizing hands all leftover width to the first column.

3. **The table cannot be sorted.** It renders `GET /api/auth/users` in whatever
   order the server returns (`ORDER BY created_at DESC`). There is no way to
   find dormant accounts by last login or group the admins together.

## Decisions

| Question | Decision |
|---|---|
| Name at creation | Not collected. The server stores `''`; Google fills the real name on first sign-in |
| Why `''` and not `NULL` | `users.name` is `TEXT NOT NULL` in both schema files and in the live Neon table. `NULL` would need a hand-run `ALTER TABLE`; `''` needs none and behaves identically |
| Name on the Edit form | Also removed. The modal is shared, and a field that the next sign-in overwrites is not worth an inconsistent form |
| Display when name is blank | The email's local part — `policarpiomasocorro@gmail.com` renders as `policarpiomasocorro` |
| Alignment fix | Scoped to this table. The `.App` boilerplate rule stays |
| Column widths | `table-fixed` plus an explicit `<colgroup>` |
| Sorting | Client-side, on User / Role / Last Login / Created |
| Filtering | None added. The existing search box already filters on name and email |

### The trade-off this accepts

A user who only ever signs in with a password — a super admin sets one through
`PUT /api/auth/users/:id/password` and they never use Google — has no path to a
real name, and will display as their email's local part indefinitely. Accepted:
every current account signs in with Google, and the fallback is legible.

## Solution Overview

Sorting and display are client-side; the only server change is relaxing one
validation check. A single shared module holds the naming and comparison rules
so the desktop table, the desktop shell, and the mobile header cannot drift.

The server change is a two-line edit that must land in **both** `api/auth.js` and
`backend/routes/auth.js` — the mirror rule.

## Scope

| File | Change |
|---|---|
| `frontend/src/utils/userDisplay.js` | **New.** `displayName`, `initialOf`, `sortUsers` |
| `frontend/src/utils/userDisplay.test.js` | **New.** Unit tests for the three helpers |
| `frontend/src/components/UserManagement.js` | Name input removed; cells left-aligned; `colgroup`; sortable headers |
| `frontend/src/components/UserManagement.test.js` | **New.** There is no test file for this component today |
| `frontend/src/components/Dashboard.js` | Lines 467, 470, 507 go through the helpers |
| `frontend/src/components/mobile/MobileLayout.js` | Line 94 goes through `displayName` |
| `api/auth.js` | `POST /api/auth/users` requires `email` only; inserts a trimmed name or `''` |
| `backend/routes/auth.js` | The same change, mirrored |
| `api/auth.roles.test.js` | A case for name-less creation |
| `backend/routes/auth.roles.test.js` | The same case, mirrored |

**Not changed:** `frontend/src/utils/api.js` (`createUser` posts whatever the form
holds), the schema files, `PUT /api/auth/users/:id` (it still accepts `name`, so
Google sign-in keeps working).

---

## Detailed Design

### 1. `utils/userDisplay.js`

```js
displayName(user)                      // "Nerio Brazil", or "nerioybrazil" for a blank name
initialOf(user)                        // "N"
sortUsers(users, { key, direction })   // key: 'name' | 'role' | 'last_login' | 'created'
```

**`displayName`** returns `user.name` trimmed when it holds anything, otherwise
the email's local part, otherwise `"Unknown"`. It tests truthiness rather than
`!== null`, so `''` and `null` behave the same — the fallback stays correct if
the column is ever relaxed to nullable.

**`initialOf`** uppercases the first character of `displayName`, so the avatar
letter and the label can never disagree.

**`sortUsers`** is pure and returns a new array.

- `key: 'name'` compares `displayName` with `localeCompare`, case-insensitively.
- `key: 'role'` compares **rank**, not spelling: `super_admin` > `admin` >
  `user`. Alphabetical order would interleave `admin` and `super_admin` around
  `user`, which is not what "sort by role" means to anyone reading it.
- `key: 'last_login'` and `key: 'created'` compare parsed timestamps.
- Rows with no `last_login` sort **last in both directions**. A never-signed-in
  account should not lead the list just because the arrow flipped — the same
  rule `sortRecords` already uses for missing references.
- Ties break on `displayName` ascending, always, in every direction, so the
  order is total and re-sorting never reshuffles equal rows.

The shape deliberately mirrors `utils/records.js`. Two sort utilities that
disagree about direction handling or tie-breaks would be worse than one.

### 2. `UserManagement.js` — the form

- The Name `<input>`, its label, and its `errors.name` line are removed.
- `formData` drops `name`; `resetForm` and `handleEditUser` follow.
- `validateForm` keeps only the email checks.
- `handleSubmit`'s update branch stops sending `name`; it sends `role` and
  `is_active` only.
- `handleDeleteUser`'s confirm text uses `displayName(userToDelete)`.

The Email input keeps its existing `disabled={editingUser}` — email is still the
identity and still cannot be edited. With Name gone, the Edit modal offers Role
and Status; the Add modal offers Email and Role.

### 3. `UserManagement.js` — the table

**Alignment.** `text-left` goes on each of the five content `<td>`s explicitly,
not on the `<table>`. `text-left` and `text-right` are both single-class
selectors, so putting `text-left` on the table and relying on the Actions
column's `text-right` to win would depend on Tailwind's emission order. Explicit
per-cell classes have no such dependency.

**Widths.** The table gains `table-fixed` and a `<colgroup>`:

| Column | Width |
|---|---|
| User | 34% |
| Role | 14% |
| Status | 12% |
| Last Login | 14% |
| Created | 14% |
| Actions | 12% |

`table-fixed` makes those widths authoritative instead of advisory. The table
also gains `min-w-[900px]` so a narrow viewport scrolls inside the existing
`overflow-x-auto` wrapper rather than crushing the columns. The email line gets
`truncate`, and its containing `<div>` gets `min-w-0` — a flex child will not
shrink below its content width without it, and the truncation would never fire.

### 4. `UserManagement.js` — sorting

State: `const [sort, setSort] = useState({ key: 'created', direction: 'desc' })`.
That matches the server's existing `ORDER BY created_at DESC`, so nothing
visibly moves on first load.

A `sortableHeader(label, key)` helper renders a `<th>` containing a `<button>`
with `aria-label={`Sort by ${label}`}` and a `▲`/`▼` on the active key — the
same shape as `FinancialRecordsManager.js:572`, including the reason it is a
plain function rather than a nested component: a component defined inside the
render body remounts the header every render and loses focus.

- Clicking an inactive header sorts by it. First press is ascending for `name`
  and `role`, descending for the two dates — each key's most useful direction.
- Clicking the active header flips direction.
- Status and Actions stay plain `<th>`s. Status has two values, and the search
  box plus the Role sort already cover finding things.
- Search filters first, then sort, so the two compose.

### 5. `Dashboard.js` and `MobileLayout.js`

`Dashboard.js:467` calls `user.name.charAt(0)` and would throw on a blank name.
It becomes `initialOf(user)`. Lines 470 and 507, and `MobileLayout.js:94`,
become `displayName(user)`.

This is not defensive tidying — it is required by the change. Once a user can be
created without a name, that user can be given a password by a super admin and
sign in, and the desktop shell would crash on render.

### 6. `POST /api/auth/users`, both implementations

```js
const { email, name, role = 'user' } = req.body;
if (!email) {
  return res.status(400).json({ error: 'Email is required' });
}
```

and the insert passes `(name || '').trim()`. The role guards, the super-admin
rejection, the duplicate-email handling, and — in `api/auth.js` — the
`logActivity` call inside the transaction are all unchanged.

The error string changes from `"Email and name are required"` to
`"Email is required"` in both files.

## Edge Cases

| Case | Behaviour |
|---|---|
| User created, never signed in | Displays as the email's local part; avatar shows that string's first letter |
| Name is `''` vs `null` | Identical — `displayName` tests truthiness |
| Email with no `@` (should not exist; the form validates) | `displayName` falls back to the whole string, then to `"Unknown"` |
| Two users, same `created_at` | Tie-break on display name, ascending |
| Never-logged-in row under a Last Login sort | Sorts last in both directions |
| Search filter active | Filter first, then sort |
| Empty list | Headers still render — they are the column labels, and the empty-state row keeps `colSpan={6}` |
| Existing users with real names | Unaffected. `displayName` returns the stored name |

## Testing

`utils/userDisplay.test.js` — the helpers in isolation: blank, `null`, and
whitespace-only names all fall back to the email local part; `initialOf` agrees
with `displayName`; role sorts by rank rather than alphabetically; missing
`last_login` sorts last in both directions; the tie-break is stable across a
direction flip.

`components/UserManagement.test.js` (new file) — the modal renders **no** Name
input in either mode; submitting with only an email calls `createUser` without a
`name`; a user whose `name` is `''` renders the email local part and the right
avatar letter; clicking a sortable header reorders the rows and flips on a
second click; the content cells carry `text-left`.

Structural assertions for alignment, not computed style — jsdom resolves the
cascade but not inheritance, the same constraint `HelpGuide.test.js:74-108`
documents.

`api/auth.roles.test.js` and `backend/routes/auth.roles.test.js` — `POST` with
`{ email, role }` and no `name` returns 200; `POST` with no `email` still
returns 400.

Per `CRA jest resetMocks`, mocked API return values go in `beforeEach`, not in
the `jest.mock` factory.

Completion bar: `cd backend && npm test`, `cd frontend && npm test`, and
`cd frontend && npm run build`.

## Out of Scope

- Removing `.App { text-align: center }` from `App.css`. It is the root cause,
  but deleting it shifts every view that is currently centred by inheritance,
  and there is no manual verification available to catch the fallout. Worth its
  own change.
- Role and status filter chips. Reconsider past ~50 users.
- Server-side sorting or pagination.
- Sorting the Status column.
- Backfilling a name for password-only accounts.
- The `canMutate` discrepancy in `NEXT_STEPS_CONTEXT.md`. Unrelated, and still a
  security decision to be raised rather than settled inline.
