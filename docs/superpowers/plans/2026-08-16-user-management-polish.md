# User Management Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop asking for a full name when adding a user, fix the User Management table's centred cells and runaway first column, and make the table sortable.

**Architecture:** A new pure module `frontend/src/utils/userDisplay.js` owns the naming and ordering rules, and the three places that label a user (desktop table, desktop shell, mobile header) all go through it. The only server change is relaxing one validation check in `POST /api/auth/users` — which, per this repo's mirror rule, must land identically in `api/auth.js` **and** `backend/routes/auth.js`.

**Tech Stack:** React 19, Tailwind CSS, React Testing Library (CRA/Jest) on the frontend; Express + Jest + supertest on the server.

**Spec:** `docs/superpowers/specs/2026-08-16-user-management-polish-design.md`

---

## Context an engineer new to this repo needs

1. **`api/` and `backend/routes/` are mirrors.** `api/auth.js` runs on Vercel in production; `backend/routes/auth.js` runs in local Express dev. Any behaviour change goes in both, or the two silently disagree. Task 6 is the only task that touches the server, and it edits both.

2. **Run the server suite from `backend/`.** `cd backend && npm test` roots at both `backend/` and `api/` — there is no separate command for `api/`. A single file: `cd backend && npx jest ../api/auth.roles.test.js`.

3. **Known flakiness.** Roughly one server run in twenty reports a transport-level fault — `Exceeded timeout of 5000 ms` or `Parse Error: Expected HTTP/, RTSP/ or ICE/` — in a supertest file. Re-run before believing it. **Only those two error shapes.** A real assertion failure is never this bug.

4. **Known local-only failure.** `backend/services/googleSheetsService.test.js` fails on any machine that has real Google credentials in `backend/config/`. Environmental, not a regression.

5. **CRA sets `resetMocks: true`.** Mock return values must be assigned in `beforeEach`, never in the `jest.mock()` factory — the factory's implementations are stripped before each test. This applies to every frontend test in this plan.

6. **`.App { text-align: center }`** in `App.css` is Create React App boilerplate that every desktop view inherits. This plan opts the users table out of it per cell. It does **not** delete the rule — that is out of scope in the spec.

7. **Frontend tests run in watch mode by default.** Use `CI=true npm test -- <path>` for a single non-interactive run.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/utils/userDisplay.js` | **New.** The only place that decides what a user is called and how users are ordered |
| `frontend/src/utils/userDisplay.test.js` | **New.** Unit tests for that module |
| `frontend/src/components/UserManagement.js` | Modify. Form, table markup, sort state |
| `frontend/src/components/UserManagement.test.js` | **New.** No test file exists for this component today |
| `frontend/src/components/Dashboard.js` | Modify lines 467, 470, 507 |
| `frontend/src/components/Dashboard.name.test.js` | **New.** Proves the shell survives a nameless user |
| `frontend/src/components/mobile/MobileLayout.js` | Modify line 94 |
| `frontend/src/components/mobile/MobileLayout.test.js` | Modify. One added test |
| `api/auth.js` | Modify `POST /api/auth/users` validation and insert |
| `api/auth.roles.test.js` | Modify. Two added tests |
| `backend/routes/auth.js` | The same change, mirrored |
| `backend/routes/auth.roles.test.js` | Modify. Two added tests |

---

### Task 1: `displayName` and `initialOf`

**Files:**
- Create: `frontend/src/utils/userDisplay.js`
- Test: `frontend/src/utils/userDisplay.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/utils/userDisplay.test.js`:

```js
import { displayName, initialOf } from './userDisplay';

describe('displayName', () => {
  test('uses the stored name when there is one', () => {
    expect(displayName({ name: 'Nerio Brazil', email: 'nerioybrazil@gmail.com' })).toBe('Nerio Brazil');
  });

  test("falls back to the email's local part for an account that never signed in", () => {
    expect(displayName({ name: '', email: 'policarpiomasocorro@gmail.com' })).toBe('policarpiomasocorro');
  });

  // The column is TEXT NOT NULL today, so a nameless account stores ''. Testing
  // truthiness rather than `!== null` keeps this correct if it is ever relaxed.
  test('treats null the same as empty', () => {
    expect(displayName({ name: null, email: 'luzalipio8@gmail.com' })).toBe('luzalipio8');
  });

  test('treats a whitespace-only name as no name', () => {
    expect(displayName({ name: '   ', email: 'rudycambel11@gmail.com' })).toBe('rudycambel11');
  });

  test('trims a stored name', () => {
    expect(displayName({ name: '  Luz Alipio  ', email: 'l@x.com' })).toBe('Luz Alipio');
  });

  test('falls back to the whole string when the email has no @', () => {
    expect(displayName({ name: '', email: 'admin' })).toBe('admin');
  });

  test('never returns an empty label', () => {
    expect(displayName({ name: '', email: '' })).toBe('Unknown');
    expect(displayName(undefined)).toBe('Unknown');
  });
});

describe('initialOf', () => {
  test('uppercases the first letter of the display name', () => {
    expect(initialOf({ name: 'nerio brazil', email: 'n@x.com' })).toBe('N');
  });

  test('agrees with displayName when the name is missing', () => {
    const user = { name: '', email: 'policarpiomasocorro@gmail.com' };
    expect(initialOf(user)).toBe(displayName(user).charAt(0).toUpperCase());
    expect(initialOf(user)).toBe('P');
  });

  test('does not throw on a user with neither name nor email', () => {
    expect(initialOf({})).toBe('U');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && CI=true npm test -- src/utils/userDisplay.test.js`
Expected: FAIL — `Cannot find module './userDisplay'`

- [ ] **Step 3: Write the minimal implementation**

Create `frontend/src/utils/userDisplay.js`:

```js
// Naming and ordering rules for user rows. The desktop table, the desktop
// shell, and the mobile header all label the same person, so the rules live in
// one place rather than being written three times and drifting.

// The part of an email before the @, or the whole string when there is no @.
function localPart(email) {
  if (typeof email !== 'string') return '';
  const at = email.indexOf('@');
  return (at === -1 ? email : email.slice(0, at)).trim();
}

/**
 * What to call a user.
 *
 * `name` is filled by Google on first sign-in, so an account that was created
 * but never signed into has none. Falsiness is the test rather than
 * `!== null`: the column is `TEXT NOT NULL`, so a nameless account stores an
 * empty string, and testing truthiness keeps this correct if the column is
 * ever relaxed to nullable.
 */
export function displayName(user) {
  const name = typeof user?.name === 'string' ? user.name.trim() : '';
  if (name) return name;
  return localPart(user?.email) || 'Unknown';
}

/** The avatar letter. Derived from displayName so the two can never disagree. */
export function initialOf(user) {
  return displayName(user).charAt(0).toUpperCase();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && CI=true npm test -- src/utils/userDisplay.test.js`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/userDisplay.js frontend/src/utils/userDisplay.test.js
git commit -m "feat: add shared user display-name helpers"
```

---

### Task 2: `sortUsers`

**Files:**
- Modify: `frontend/src/utils/userDisplay.js`
- Test: `frontend/src/utils/userDisplay.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/utils/userDisplay.test.js` (and add `sortUsers` to the existing import at the top so it reads `import { displayName, initialOf, sortUsers } from './userDisplay';`):

```js
describe('sortUsers', () => {
  const USERS = [
    { id: 1, name: 'Alvin Adefuin', email: 'adefuin29@gmail.com', role: 'user',
      last_login: '2026-08-16T01:00:00Z', created_at: '2026-08-16T00:00:00Z' },
    { id: 2, name: 'Church Super Administrator', email: 'admin@sbcc.church', role: 'super_admin',
      last_login: '2026-08-16T02:00:00Z', created_at: '2025-12-14T00:00:00Z' },
    { id: 3, name: 'Test Member', email: 'member@sbcc.church', role: 'user',
      last_login: null, created_at: '2025-12-14T01:00:00Z' },
    { id: 4, name: 'Luz Alipio', email: 'luzalipio8@gmail.com', role: 'admin',
      last_login: '2026-08-16T03:00:00Z', created_at: '2026-08-16T01:00:00Z' },
  ];

  const ids = (rows) => rows.map((r) => r.id);

  test('defaults to newest created first, matching the server order', () => {
    expect(ids(sortUsers(USERS))).toEqual([4, 1, 3, 2]);
  });

  test('created ascending is the exact reverse', () => {
    expect(ids(sortUsers(USERS, { key: 'created', direction: 'asc' }))).toEqual([2, 3, 1, 4]);
  });

  test('sorts by display name', () => {
    expect(ids(sortUsers(USERS, { key: 'name', direction: 'asc' }))).toEqual([1, 2, 4, 3]);
    expect(ids(sortUsers(USERS, { key: 'name', direction: 'desc' }))).toEqual([3, 4, 2, 1]);
  });

  test('a nameless account sorts under its email fallback, not last', () => {
    const rows = [
      { id: 1, name: 'Zeny Cruz', email: 'z@x.com', role: 'user' },
      { id: 2, name: '', email: 'bello@x.com', role: 'user' },
    ];
    expect(ids(sortUsers(rows, { key: 'name', direction: 'asc' }))).toEqual([2, 1]);
  });

  // Alphabetical order would interleave admin and super_admin around user,
  // which is not what "sort by role" means to anyone reading the table.
  test('sorts roles by rank, not alphabetically', () => {
    const roles = sortUsers(USERS, { key: 'role', direction: 'desc' }).map((r) => r.role);
    expect(roles).toEqual(['super_admin', 'admin', 'user', 'user']);
  });

  test('ties within a role break on display name, ascending, in both directions', () => {
    expect(ids(sortUsers(USERS, { key: 'role', direction: 'desc' }))).toEqual([2, 4, 1, 3]);
    expect(ids(sortUsers(USERS, { key: 'role', direction: 'asc' }))).toEqual([1, 3, 4, 2]);
  });

  test('a never-signed-in account sorts last in both directions', () => {
    expect(ids(sortUsers(USERS, { key: 'last_login', direction: 'desc' }))).toEqual([4, 2, 1, 3]);
    expect(ids(sortUsers(USERS, { key: 'last_login', direction: 'asc' }))).toEqual([1, 2, 4, 3]);
  });

  test('is pure — the input array is untouched', () => {
    const input = [...USERS];
    sortUsers(input, { key: 'name', direction: 'asc' });
    expect(ids(input)).toEqual([1, 2, 3, 4]);
  });

  test('tolerates no input', () => {
    expect(sortUsers(undefined)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && CI=true npm test -- src/utils/userDisplay.test.js`
Expected: FAIL — `sortUsers is not a function`

- [ ] **Step 3: Write the minimal implementation**

Append to `frontend/src/utils/userDisplay.js`:

```js
// Rank, not spelling. Sorting roles alphabetically would put `admin` and
// `super_admin` on either side of `user`, which reads as noise.
const ROLE_RANK = { super_admin: 3, admin: 2, user: 1 };

// Milliseconds, or null when nothing usable is stored.
function timeOf(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Order users for display. Pure — returns a new array.
 *
 * `key` is 'created' (default), 'name', 'role', or 'last_login'; `direction`
 * is 'desc' (default) or 'asc'. Direction applies to the primary key only: the
 * tie-break is always display name ascending, so flipping direction never
 * reshuffles rows that compare equal. Rows with no last login sort last either
 * way — a never-signed-in account should not lead the list just because the
 * arrow flipped. This mirrors `utils/records.js`; two sort helpers that
 * disagreed about direction or tie-breaks would be worse than one.
 */
export function sortUsers(users, { key = 'created', direction = 'desc' } = {}) {
  const dir = direction === 'asc' ? 1 : -1;
  const byName = (a, b) =>
    displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' });

  return [...(users || [])].sort((a, b) => {
    if (key === 'name') {
      return byName(a, b) * dir;
    }

    if (key === 'role') {
      const ra = ROLE_RANK[a?.role] || 0;
      const rb = ROLE_RANK[b?.role] || 0;
      if (ra !== rb) return (ra - rb) * dir;
      return byName(a, b);
    }

    const field = key === 'last_login' ? 'last_login' : 'created_at';
    const ta = timeOf(a?.[field]);
    const tb = timeOf(b?.[field]);
    if (ta !== null && tb !== null) {
      if (ta !== tb) return (ta - tb) * dir;
    } else if (ta !== null || tb !== null) {
      return ta !== null ? -1 : 1;
    }
    return byName(a, b);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && CI=true npm test -- src/utils/userDisplay.test.js`
Expected: PASS, 19 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/userDisplay.js frontend/src/utils/userDisplay.test.js
git commit -m "feat: add user sorting by name, role rank, and dates"
```

---

### Task 3: The users table labels people through the helpers

**Files:**
- Modify: `frontend/src/components/UserManagement.js:363-377`, `:131`
- Test: `frontend/src/components/UserManagement.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/UserManagement.test.js`:

```js
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import UserManagement from './UserManagement';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  getUsers: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
}));

const SUPER = { id: 9, email: 'boss@sbcc.church', name: 'Boss', role: 'super_admin' };

const USERS = [
  { id: 1, name: 'Alvin Adefuin', email: 'adefuin29@gmail.com', role: 'user', is_active: true,
    last_login: '2026-08-16T01:00:00Z', created_at: '2026-08-16T00:00:00Z' },
  { id: 2, name: 'Church Super Administrator', email: 'admin@sbcc.church', role: 'super_admin', is_active: true,
    last_login: '2026-08-16T02:00:00Z', created_at: '2025-12-14T00:00:00Z' },
  { id: 3, name: '', email: 'policarpiomasocorro@gmail.com', role: 'user', is_active: true,
    last_login: null, created_at: '2025-12-14T01:00:00Z' },
  { id: 4, name: 'Luz Alipio', email: 'luzalipio8@gmail.com', role: 'admin', is_active: true,
    last_login: '2026-08-16T03:00:00Z', created_at: '2026-08-16T01:00:00Z' },
];

// CRA sets resetMocks: true, which strips implementations declared in the
// jest.mock factory above — so the return values belong here.
beforeEach(() => {
  jest.clearAllMocks();
  apiService.getUsers.mockResolvedValue(USERS);
  apiService.createUser.mockResolvedValue({ id: 5 });
  apiService.updateUser.mockResolvedValue({});
  apiService.deleteUser.mockResolvedValue({});
});

// `findByText` rather than `getByText`: the list arrives from an async
// getUsers(), so every test has to wait for the first paint. Exported shape is
// used by every later describe block in this file.
const rowFor = async (label) => (await screen.findByText(label)).closest('tr');

test('an account that has never signed in is labelled by its email', async () => {
  render(<UserManagement user={SUPER} />);

  const row = await rowFor('policarpiomasocorro');
  expect(within(row).getByText('policarpiomasocorro@gmail.com')).toBeInTheDocument();
});

test('the avatar letter comes from the same fallback as the label', async () => {
  render(<UserManagement user={SUPER} />);

  const row = await rowFor('policarpiomasocorro');
  expect(within(row).getByText('P')).toBeInTheDocument();
});

test('accounts with a stored name still show it', async () => {
  render(<UserManagement user={SUPER} />);

  expect(await screen.findByText('Luz Alipio')).toBeInTheDocument();
});

test('the delete confirmation names the account the same way the row does', async () => {
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<UserManagement user={SUPER} />);

  const row = await rowFor('policarpiomasocorro');
  fireEvent.click(within(row).getByTitle('Delete user'));

  expect(confirm).toHaveBeenCalledWith(expect.stringContaining('policarpiomasocorro'));
  confirm.mockRestore();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && CI=true npm test -- src/components/UserManagement.test.js`
Expected: FAIL — `Unable to find an element with the text: policarpiomasocorro`. The nameless row renders a blank label and a blank avatar, because `UserManagement.js:375` prints `u.name` verbatim and `:371` calls `''.charAt(0)`, which is `''` rather than an error.

- [ ] **Step 3: Write the minimal implementation**

In `frontend/src/components/UserManagement.js`, add to the imports after line 16:

```js
import { displayName, initialOf } from "../utils/userDisplay";
```

Replace the avatar and label block (lines 363-377):

```jsx
                          {u.profile_picture ? (
                            <img
                              className="w-7 h-7 rounded-full flex-shrink-0"
                              src={u.profile_picture}
                              alt={displayName(u)}
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-[rgba(196,144,48,0.15)] flex items-center justify-center text-xs font-bold text-[#c49030] flex-shrink-0">
                              {initialOf(u)}
                            </div>
                          )}
                          <div>
                            <p className="font-medium text-[#3d2a08]">{displayName(u)}</p>
                            <p className="text-xs text-[#b89048]">{u.email}</p>
                          </div>
```

Replace line 131:

```js
    if (!window.confirm(`Are you sure you want to delete ${displayName(userToDelete)}?`)) return;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && CI=true npm test -- src/components/UserManagement.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/UserManagement.js frontend/src/components/UserManagement.test.js
git commit -m "feat: label nameless accounts by their email in user management"
```

---

### Task 4: The desktop shell and mobile header survive a nameless user

This is not defensive tidying. Once an account can exist without a name, a super admin can give it a password (`PUT /api/auth/users/:id/password`) and that person can sign in without Google ever filling one. `Dashboard.js:467` then renders `''.charAt(0)` — a blank avatar circle — and lines 470 and 507 render a nameless sidebar and a bare "Welcome back,". The same account on mobile gets an empty line under the StewardBox title.

The stored value is `''` rather than `NULL`, so this is a blank label rather than a crash. It becomes an outright `Cannot read properties of null` if the column is ever relaxed to nullable — which is exactly why `displayName` tests truthiness instead of `!== null`.

**Files:**
- Modify: `frontend/src/components/Dashboard.js:467`, `:470`, `:507`
- Modify: `frontend/src/components/mobile/MobileLayout.js:94`
- Test: `frontend/src/components/Dashboard.name.test.js` (create)
- Test: `frontend/src/components/mobile/MobileLayout.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/Dashboard.name.test.js`:

```js
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  getCollections: jest.fn(),
  getExpenses: jest.fn(),
  getActivity: jest.fn(),
  healthCheck: jest.fn(),
}));

// CRA's jest config sets resetMocks: true, so return values belong here.
beforeEach(() => {
  apiService.getCollections.mockResolvedValue([]);
  apiService.getExpenses.mockResolvedValue([]);
  apiService.getActivity.mockResolvedValue({ entries: [], total: 0, limit: 50, offset: 0 });
  apiService.healthCheck.mockResolvedValue({ status: 'OK' });
});

// An account created without a name can be given a password by a super admin
// and sign in without Google ever filling one. The shell used to render that
// person as a blank avatar circle and a bare "Welcome back,".
test('a signed-in user with no stored name is labelled by their email', async () => {
  render(
    <Dashboard
      user={{ id: 1, email: 'policarpiomasocorro@gmail.com', name: '', role: 'user' }}
      onLogout={() => {}}
    />
  );

  await waitFor(() => expect(screen.getByText('Reports')).toBeInTheDocument());
  expect(screen.getAllByText('policarpiomasocorro').length).toBeGreaterThan(0);
  expect(screen.getByText('P')).toBeInTheDocument();
});

test('a user with a stored name still shows it', async () => {
  render(
    <Dashboard
      user={{ id: 1, email: 'l@x.com', name: 'Luz Alipio', role: 'admin' }}
      onLogout={() => {}}
    />
  );

  await waitFor(() => expect(screen.getAllByText('Luz Alipio').length).toBeGreaterThan(0));
});
```

Append to `frontend/src/components/mobile/MobileLayout.test.js`:

```js
test('the header falls back to the email when the account has no name', async () => {
  render(<MobileLayout user={{ name: '', email: 'policarpiomasocorro@gmail.com' }} onLogout={() => {}} />);

  expect(await screen.findByText('policarpiomasocorro')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && CI=true npm test -- src/components/Dashboard.name.test.js src/components/mobile/MobileLayout.test.js`
Expected: FAIL — both new tests report `Unable to find an element with the text: policarpiomasocorro`. The second Dashboard test ("still shows it") passes already; that is intended, it is the regression guard.

- [ ] **Step 3: Write the minimal implementation**

In `frontend/src/components/Dashboard.js`, add to the imports:

```js
import { displayName, initialOf } from "../utils/userDisplay";
```

Line 467 becomes:

```jsx
            <span className="text-xs font-bold text-white">{initialOf(user)}</span>
```

Line 470 becomes:

```jsx
            <p className="text-sm font-semibold text-[#3d2a08] truncate leading-tight">{displayName(user)}</p>
```

Line 507 becomes:

```jsx
                  Welcome back, <span className="font-medium text-[#8a6028]">{displayName(user)}</span>
```

In `frontend/src/components/mobile/MobileLayout.js`, add to the imports:

```js
import { displayName } from '../../utils/userDisplay';
```

Line 94 becomes:

```jsx
                {displayName(user)}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && CI=true npm test -- src/components/Dashboard.name.test.js src/components/Dashboard.activity.test.js src/components/mobile/MobileLayout.test.js`
Expected: PASS — the pre-existing `Dashboard.activity.test.js` and `MobileLayout.test.js` tests must still pass alongside the new ones.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard.js frontend/src/components/Dashboard.name.test.js \
        frontend/src/components/mobile/MobileLayout.js frontend/src/components/mobile/MobileLayout.test.js
git commit -m "fix: stop the shell crashing on an account with no stored name"
```

---

### Task 5: Remove the Name input from the user modal

Removing it from Add but not Edit would leave one shared modal behaving two ways. Both go. The consequence — a password-only account can never be given a real name and displays as its email local part forever — is accepted in the spec.

**Files:**
- Modify: `frontend/src/components/UserManagement.js:26-30`, `:57-65`, `:72-81`, `:83-93`, `:102-108`, `:264-278`
- Test: `frontend/src/components/UserManagement.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/UserManagement.test.js`:

```js
describe('the add/edit modal', () => {
  // Two buttons read "Add User" once the modal is open: the header button that
  // opens it, and the modal's submit. The header renders first in DOM order,
  // so the submit is the last match.
  const openAddModal = () => fireEvent.click(screen.getByText('Add User'));
  const submitAddModal = () =>
    fireEvent.click(screen.getAllByRole('button', { name: 'Add User' }).at(-1));

  test('does not ask for a name when adding', async () => {
    render(<UserManagement user={SUPER} />);
    await screen.findByText('Luz Alipio');

    openAddModal();

    expect(screen.getByText('Email *')).toBeInTheDocument();
    expect(screen.queryByText(/^Name/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Full Name')).not.toBeInTheDocument();
  });

  test('does not ask for a name when editing either', async () => {
    render(<UserManagement user={SUPER} />);
    const row = await rowFor('Luz Alipio'); // defined at the top of this file

    fireEvent.click(within(row).getByTitle('Edit user'));

    expect(await screen.findByText('Edit User')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Full Name')).not.toBeInTheDocument();
  });

  // Google overwrites users.name from the OAuth payload on every sign-in, so a
  // name typed here would survive only until the account's first login.
  test('creates a user from an email and a role alone', async () => {
    render(<UserManagement user={SUPER} />);
    await screen.findByText('Luz Alipio');

    openAddModal();
    fireEvent.change(screen.getByPlaceholderText('user@gmail.com'), {
      target: { value: 'new@sbcc.church' },
    });
    submitAddModal();

    await waitFor(() => expect(apiService.createUser).toHaveBeenCalled());
    expect(apiService.createUser).toHaveBeenCalledWith({ email: 'new@sbcc.church', role: 'user' });
  });

  test('still refuses an empty email', async () => {
    render(<UserManagement user={SUPER} />);
    await screen.findByText('Luz Alipio');

    openAddModal();
    submitAddModal();

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(apiService.createUser).not.toHaveBeenCalled();
  });

  test('an edit sends role and status, and no name', async () => {
    render(<UserManagement user={SUPER} />);
    const row = await rowFor('Luz Alipio');

    fireEvent.click(within(row).getByTitle('Edit user'));
    await screen.findByText('Edit User');
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(apiService.updateUser).toHaveBeenCalled());
    expect(apiService.updateUser).toHaveBeenCalledWith(4, { role: 'admin', is_active: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && CI=true npm test -- src/components/UserManagement.test.js`
Expected: FAIL — the Name input is still present, and `createUser` is called with a `name` key.

- [ ] **Step 3: Write the minimal implementation**

In `frontend/src/components/UserManagement.js`:

Lines 26-30 — drop `name` from the initial form state:

```js
  const [formData, setFormData] = useState({
    email: "",
    role: "user",
  });
```

Lines 57-65 — `resetForm`:

```js
  const resetForm = () => {
    setFormData({
      email: "",
      role: "user",
    });
    setErrors({});
    setEditingUser(null);
  };
```

Lines 72-81 — `handleEditUser`:

```js
  const handleEditUser = (userToEdit) => {
    setFormData({
      email: userToEdit.email,
      role: userToEdit.role,
      is_active: userToEdit.is_active,
    });
    setEditingUser(userToEdit);
    setShowAddForm(true);
  };
```

Lines 83-93 — `validateForm` keeps the email checks only:

```js
  const validateForm = () => {
    const newErrors = {};

    if (!formData.email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = "Email is invalid";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
```

Lines 102-108 — the update branch stops sending a name:

```js
      if (editingUser) {
        // Update existing user
        await apiService.updateUser(editingUser.id, {
          role: formData.role,
          is_active: formData.is_active,
        });
        showNotification("User updated successfully");
```

Lines 264-278 — delete the entire Name `<div>` block, from the opening `<div>`
before `<label className="block text-xs font-medium text-[#8a6028] mb-1">Name *</label>`
through its closing `</div>` after the `errors.name` paragraph. The Email block
above it and the Role block below it are unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && CI=true npm test -- src/components/UserManagement.test.js`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/UserManagement.js frontend/src/components/UserManagement.test.js
git commit -m "feat: stop asking for a full name when adding or editing a user"
```

---

### Task 6: `POST /api/auth/users` no longer requires a name — both implementations

**This task edits two files that must stay identical in behaviour.** `api/auth.js` is production (Vercel); `backend/routes/auth.js` is local dev (Express). Changing one without the other is the single most common way to break this repo.

**Files:**
- Modify: `api/auth.js:285-305`
- Modify: `backend/routes/auth.js:214-234`
- Test: `api/auth.roles.test.js`
- Test: `backend/routes/auth.roles.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `api/auth.roles.test.js`:

```js
describe('creating a user without a name', () => {
  // Google overwrites users.name from the OAuth payload on first sign-in, so
  // the client no longer collects one. The column is TEXT NOT NULL, so the
  // absent name is stored as '' rather than NULL — which needs no migration.
  test('is allowed, and stores an empty name', async () => {
    getReturns(null);

    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', tokenFor('super_admin'))
      .send({ email: 'new@sbcc.church', role: 'user' });

    expect(res.status).toBe(200);
    const insert = mockTx.run.mock.calls.find(([sql]) => /INSERT INTO users/i.test(sql));
    expect(insert).toBeDefined();
    expect(insert[1]).toEqual(['new@sbcc.church', '', 'user', 'actor@sbcc.church']);
  });

  test('a name that is sent is still stored, trimmed', async () => {
    getReturns(null);

    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', tokenFor('super_admin'))
      .send({ email: 'new@sbcc.church', name: '  Luz Alipio  ', role: 'user' });

    expect(res.status).toBe(200);
    const insert = mockTx.run.mock.calls.find(([sql]) => /INSERT INTO users/i.test(sql));
    expect(insert[1]).toContain('Luz Alipio');
  });

  test('an absent email is still refused', async () => {
    getReturns(null);

    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'user' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });
});
```

Append to `backend/routes/auth.roles.test.js`:

```js
describe('creating a user without a name', () => {
  // Mirrors the same describe block in api/auth.roles.test.js. The two
  // implementations of this endpoint must agree.
  test('is allowed, and stores an empty name', async () => {
    const { app, db } = makeApp(null);

    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', tokenFor('super_admin'))
      .send({ email: 'new@sbcc.church', role: 'user' });

    expect(res.status).toBe(200);
    const insert = db.run.mock.calls.find(([sql]) => /INSERT INTO users/i.test(sql));
    expect(insert).toBeDefined();
    expect(insert[1]).toEqual(['new@sbcc.church', '', 'user', 'actor@sbcc.church']);
  });

  test('a name that is sent is still stored, trimmed', async () => {
    const { app, db } = makeApp(null);

    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', tokenFor('super_admin'))
      .send({ email: 'new@sbcc.church', name: '  Luz Alipio  ', role: 'user' });

    expect(res.status).toBe(200);
    const insert = db.run.mock.calls.find(([sql]) => /INSERT INTO users/i.test(sql));
    expect(insert[1]).toContain('Luz Alipio');
  });

  test('an absent email is still refused', async () => {
    const { app } = makeApp(null);

    const res = await request(app)
      .post('/api/auth/users')
      .set('Authorization', tokenFor('super_admin'))
      .send({ role: 'user' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest ../api/auth.roles.test.js routes/auth.roles.test.js`
Expected: FAIL — the two "is allowed" tests get `400 Email and name are required`, and the two "trimmed" tests get `'  Luz Alipio  '` rather than the trimmed value.

- [ ] **Step 3: Write the minimal implementation**

In `api/auth.js`, lines 285-289 become:

```js
  const { email, name, role = 'user' } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
```

and line 304's parameter array becomes:

```js
        [email, (name || '').trim(), role, req.user.email]
```

In `backend/routes/auth.js`, lines 215-219 become:

```js
  const { email, name, role = "user" } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }
```

and the insert's parameter array becomes:

```js
    [email, (name || "").trim(), role, req.user.email],
```

Nothing else changes in either handler — the admin-role guard, the super_admin
rejection, the duplicate-email branch, and (in `api/auth.js` only) the
`logActivity` call inside the transaction all stay as they are.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest ../api/auth.roles.test.js routes/auth.roles.test.js`
Expected: PASS — 15 tests in `api/auth.roles.test.js` (12 before, 3 added) and 12 in `backend/routes/auth.roles.test.js` (9 before, 3 added).

- [ ] **Step 5: Commit**

```bash
git add api/auth.js api/auth.roles.test.js backend/routes/auth.js backend/routes/auth.roles.test.js
git commit -m "feat: accept a user creation without a name in both API implementations"
```

---

### Task 7: Left-align the cells and fix the column widths

**Files:**
- Modify: `frontend/src/components/UserManagement.js:347-405`
- Test: `frontend/src/components/UserManagement.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/UserManagement.test.js`:

```js
// App.css carries the Create React App boilerplate `.App { text-align: center }`,
// which every desktop view inherits. The <th>s already opt out with an explicit
// text-left; the <td>s did not, which is why a name rendered centred over the
// email beneath it. jsdom resolves the cascade but not inheritance, so this is
// asserted structurally — the same constraint HelpGuide.test.js documents.
describe('table layout', () => {
  test('every content cell opts out of the app-wide centring', async () => {
    render(<UserManagement user={SUPER} />);
    const row = await rowFor('Luz Alipio');

    const cells = within(row).getAllByRole('cell');
    expect(cells).toHaveLength(6);
    cells.slice(0, 5).forEach((cell) => expect(cell).toHaveClass('text-left'));
  });

  test('the actions column stays right-aligned', async () => {
    render(<UserManagement user={SUPER} />);
    const row = await rowFor('Luz Alipio');

    const cells = within(row).getAllByRole('cell');
    expect(cells[5]).toHaveClass('text-right');
    expect(cells[5]).not.toHaveClass('text-left');
  });

  test('column widths are declared rather than left to the browser', async () => {
    const { container } = render(<UserManagement user={SUPER} />);
    await rowFor('Luz Alipio');

    const table = container.querySelector('table');
    expect(table).toHaveClass('table-fixed');
    expect(container.querySelectorAll('colgroup col')).toHaveLength(6);
  });

  // truncate is inert on a flex child without min-w-0 — the child will not
  // shrink below its content width, so the ellipsis never appears.
  test('a long email truncates instead of widening the column', async () => {
    const { container } = render(<UserManagement user={SUPER} />);
    const row = await rowFor('Luz Alipio');

    const email = within(row).getByText('luzalipio8@gmail.com');
    expect(email).toHaveClass('truncate');
    expect(email.parentElement).toHaveClass('min-w-0');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && CI=true npm test -- src/components/UserManagement.test.js`
Expected: FAIL — cells have no `text-left`, there is no `colgroup`, and the table has no `table-fixed`.

- [ ] **Step 3: Write the minimal implementation**

In `frontend/src/components/UserManagement.js`, line 347 becomes:

```jsx
              <table className="w-full text-sm table-fixed min-w-[900px]">
                {/* Explicit widths: without them the browser hands every pixel
                    of slack to the first column, which is why User swallowed
                    the table. */}
                <colgroup>
                  <col className="w-[34%]" />
                  <col className="w-[14%]" />
                  <col className="w-[12%]" />
                  <col className="w-[14%]" />
                  <col className="w-[14%]" />
                  <col className="w-[12%]" />
                </colgroup>
```

`min-w-[900px]` keeps the table from crushing on a narrow viewport; the wrapper
at line 346 already has `overflow-x-auto`, so it scrolls instead.

Add `text-left` to each of the five content `<td>`s and keep `text-right` on the
sixth. Line 361 → `<td className="px-4 py-3 text-left">`; line 380 →
`<td className="px-4 py-3 text-left">`; line 390 → `<td className="px-4 py-3 text-left">`;
line 397 → `<td className="px-4 py-3 text-left text-xs text-[#8a6028]">`;
line 402 → `<td className="px-4 py-3 text-left text-xs text-[#8a6028]">`;
line 405 stays `<td className="px-4 py-3 text-right">`.

Put `text-left` on the cells, **not** on the `<table>`. `text-left` and
`text-right` are both single-class selectors, so a table-level `text-left`
beaten by the Actions column's `text-right` would depend on Tailwind's emission
order rather than on anything stated.

The label block from Task 3 gains truncation:

```jsx
                          <div className="min-w-0">
                            <p className="font-medium text-[#3d2a08] truncate">{displayName(u)}</p>
                            <p className="text-xs text-[#b89048] truncate">{u.email}</p>
                          </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && CI=true npm test -- src/components/UserManagement.test.js`
Expected: PASS, 13 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/UserManagement.js frontend/src/components/UserManagement.test.js
git commit -m "fix: left-align user table cells and pin the column widths"
```

---

### Task 8: Sortable column headers

**Files:**
- Modify: `frontend/src/components/UserManagement.js:171-175`, `:348-357`
- Test: `frontend/src/components/UserManagement.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/UserManagement.test.js`:

```js
describe('sorting', () => {
  const order = () =>
    screen
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0].querySelector('p').textContent);

  test('opens on newest created first, matching the order the server sends', async () => {
    render(<UserManagement user={SUPER} />);
    await rowFor('Luz Alipio');

    expect(order()).toEqual([
      'Luz Alipio',
      'Alvin Adefuin',
      'policarpiomasocorro',
      'Church Super Administrator',
    ]);
  });

  test('clicking a header sorts by it and a second click flips the direction', async () => {
    render(<UserManagement user={SUPER} />);
    await rowFor('Luz Alipio');

    fireEvent.click(screen.getByLabelText('Sort by User'));
    expect(order()).toEqual([
      'Alvin Adefuin',
      'Church Super Administrator',
      'Luz Alipio',
      'policarpiomasocorro',
    ]);

    fireEvent.click(screen.getByLabelText('Sort by User'));
    expect(order()).toEqual([
      'policarpiomasocorro',
      'Luz Alipio',
      'Church Super Administrator',
      'Alvin Adefuin',
    ]);
  });

  // First press on Role is descending — most privileged first, which is what
  // anyone clicking a Role header is looking for.
  test('sorting by role puts super admins on top, not alphabetical order', async () => {
    render(<UserManagement user={SUPER} />);
    await rowFor('Luz Alipio');

    fireEvent.click(screen.getByLabelText('Sort by Role'));
    expect(order()[0]).toBe('Church Super Administrator');
    expect(order()[1]).toBe('Luz Alipio');

    fireEvent.click(screen.getByLabelText('Sort by Role'));
    expect(order().at(-1)).toBe('Church Super Administrator');
  });

  test('an account that never signed in sorts last under Last Login, both ways', async () => {
    render(<UserManagement user={SUPER} />);
    await rowFor('Luz Alipio');

    fireEvent.click(screen.getByLabelText('Sort by Last Login'));
    expect(order().at(-1)).toBe('policarpiomasocorro');

    fireEvent.click(screen.getByLabelText('Sort by Last Login'));
    expect(order().at(-1)).toBe('policarpiomasocorro');
  });

  test('Status and Actions are not sortable', async () => {
    render(<UserManagement user={SUPER} />);
    await rowFor('Luz Alipio');

    expect(screen.queryByLabelText('Sort by Status')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sort by Actions')).not.toBeInTheDocument();
  });

  test('search and sort compose', async () => {
    render(<UserManagement user={SUPER} />);
    await rowFor('Luz Alipio');

    fireEvent.change(screen.getByPlaceholderText('Search users…'), {
      target: { value: 'gmail.com' },
    });
    fireEvent.click(screen.getByLabelText('Sort by User'));

    expect(order()).toEqual(['Alvin Adefuin', 'Luz Alipio', 'policarpiomasocorro']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && CI=true npm test -- src/components/UserManagement.test.js`
Expected: FAIL — `Unable to find a label with the text of: Sort by User`.

- [ ] **Step 3: Write the minimal implementation**

In `frontend/src/components/UserManagement.js`, add `sortUsers` to the existing
userDisplay import so it reads:

```js
import { displayName, initialOf, sortUsers } from "../utils/userDisplay";
```

Add the sort state next to the other `useState` calls (after line 24):

```js
  // 'created' descending is what GET /api/auth/users already returns, so the
  // list does not visibly reorder on first paint.
  const [sort, setSort] = useState({ key: "created", direction: "desc" });
```

Add the handler and header helper immediately before `filteredUsers` (line 171):

```js
  const handleSort = (key) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : // Each key's most useful first press: names A-Z, roles most-privileged
          // first, dates most-recent-first.
          { key, direction: key === "name" ? "asc" : "desc" }
    );
  };

  // A plain function, not a nested component — a component defined here would
  // remount the header on every render and lose focus.
  const sortableHeader = (label, key) => (
    <th className="px-4 py-3 text-left text-xs font-semibold text-[#8a6028] uppercase tracking-wider">
      <button
        type="button"
        onClick={() => handleSort(key)}
        aria-label={`Sort by ${label}`}
        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-[#c49030] transition"
      >
        {label}
        {sort.key === key && (
          <span aria-hidden="true">{sort.direction === "asc" ? "▲" : "▼"}</span>
        )}
      </button>
    </th>
  );
```

Replace `filteredUsers` (lines 171-175) so the filter runs first and the sort
composes on top of it:

```js
  // Filter first, then sort, so the two compose.
  const filteredUsers = sortUsers(
    users.filter(
      (u) =>
        displayName(u).toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    sort
  );
```

Replace the four sortable `<th>`s in the header row (lines 350, 351, 353, 354),
leaving Status and Actions as they are:

```jsx
                    {sortableHeader("User", "name")}
                    {sortableHeader("Role", "role")}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-[#8a6028] uppercase tracking-wider">Status</th>
                    {sortableHeader("Last Login", "last_login")}
                    {sortableHeader("Created", "created")}
                    <th className="px-4 py-3 text-right text-xs font-semibold text-[#8a6028] uppercase tracking-wider">Actions</th>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && CI=true npm test -- src/components/UserManagement.test.js`
Expected: PASS, 19 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/UserManagement.js frontend/src/components/UserManagement.test.js
git commit -m "feat: sort the user table by name, role, last login, and created"
```

---

### Task 9: Full verification

Manual verification in a running app is not available in this environment, so the completion bar is the full suites plus a production build.

- [ ] **Step 1: Run the whole server suite**

Run: `cd backend && npm test`
Expected: PASS.

Two failures do not count as regressions:
- `backend/services/googleSheetsService.test.js` fails on any machine with real Google credentials installed locally. Environmental.
- A transport fault (`Exceeded timeout of 5000 ms` or `Parse Error: Expected HTTP/, RTSP/ or ICE/`) in a supertest file is the known flakiness — re-run once. **Any assertion failure is a real failure**, not this bug.

- [ ] **Step 2: Run the whole frontend suite**

Run: `cd frontend && CI=true npm test`
Expected: PASS, no failures.

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: `Compiled successfully.` — and no new ESLint warnings about unused imports (`User` from `lucide-react` is still used by the role badge; `Plus`, `Edit3`, `Trash2`, `Search`, `Shield`, `Crown`, `Eye`, `EyeOff`, `CheckCircle`, `AlertCircle`, `X` all remain in use).

- [ ] **Step 4: Confirm the mirror rule held**

Run: `grep -n "Email is required" api/auth.js backend/routes/auth.js`
Expected: one hit in each file. If only one file matches, Task 6 was half-applied.

- [ ] **Step 5: Commit any fixes and mark the plan complete**

```bash
git add -A
git commit -m "docs: mark the user management polish plan complete"
```

---

## Out of Scope

Named here so nobody adds them mid-implementation:

- Deleting `.App { text-align: center }` from `App.css`. It is the root cause of the alignment bug, but removing it shifts every view centred by inheritance, with no manual verification available to catch the fallout.
- Role or status filter chips.
- Server-side sorting or pagination.
- Sorting the Status column.
- Backfilling names for password-only accounts.
- The `canMutate` discrepancy in `NEXT_STEPS_CONTEXT.md`.
