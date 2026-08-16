# Record Sorting, Recent-List Date Format, and Supplement Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sort both record lists by submission time, print a readable date on the mobile Recent list, and make that list read-only by removing the GCash/Cash supplement shortcut.

**Architecture:** Sorting and date formatting are pure functions in one new module, `frontend/src/utils/records.js`, consumed by both lists so they cannot drift. Sorting is client-side — neither list paginates, both already hold every row, and `SELECT *` already returns `created_at`. **No `api/` or `backend/` change, therefore no mirror-parity work.**

**Tech Stack:** React 19, Create React App + Jest, React Testing Library. Frontend only.

**Spec:** `docs/superpowers/specs/2026-08-16-records-sorting-and-recent-cleanup-design.md`

**Before you start:** `git stash list` should show `stash@{0}` holding unrelated offline-sync work. **Do not pop it.** Task 4 deliberately avoids `SectionHeader` so that stash still applies cleanly later.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/src/utils/records.js` | **New.** Pure functions: which field is a record's reference, how two records order, how a submitted timestamp reads |
| `frontend/src/utils/records.test.js` | **New.** Unit tests for the above, including a pinned-timezone test |
| `frontend/src/components/FinancialRecordsManager.js` | Desktop table: sortable `Date` / `Reference` headers |
| `frontend/src/components/mobile/MobileRecentList.js` | Mobile feed: readable date, Newest/Oldest toggle, supplement button removed |
| `frontend/src/components/mobile/MobileLayout.js` | Drop `prefill` state and `handleAddSupplement` |
| `frontend/src/components/mobile/MobileSubmitForm.js` | Drop the now-unreachable `prefill` props and banner |

Tasks 1–4 each leave the app working. Task 5 spans three files because removing a prop chain is not safe to do halfway.

---

### Task 1: The shared records module

**Files:**
- Create: `frontend/src/utils/records.js`
- Test: `frontend/src/utils/records.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/records.test.js`:

```js
import { referenceOf, sortRecords, formatSubmittedAt } from './records';

const MANILA = { timeZone: 'Asia/Manila' };

const rec = (over = {}) => ({
  entryType: 'collection',
  control_number: '2026-001',
  created_at: '2026-08-16T04:41:33.270Z',
  date: '2026-08-16',
  ...over,
});

describe('referenceOf', () => {
  test('a collection uses control_number', () => {
    expect(referenceOf(rec())).toBe('2026-001');
  });

  test('an expense uses forms_number even when a control_number is present', () => {
    const e = rec({ entryType: 'expense', forms_number: 'F-01' });
    expect(referenceOf(e)).toBe('F-01');
  });

  test('an explicit type argument wins, for callers that track type separately', () => {
    // The desktop table knows the type from its active tab, not from the row.
    expect(referenceOf({ forms_number: 'F-02' }, 'expense')).toBe('F-02');
  });

  test('a record with no reference gives an empty string, never undefined', () => {
    expect(referenceOf({ entryType: 'collection' })).toBe('');
  });
});

describe('sortRecords by submitted time', () => {
  const early = rec({ control_number: '2026-001', created_at: '2026-08-16T04:41:00.000Z' });
  const mid = rec({ control_number: '2026-002', created_at: '2026-08-16T04:47:00.000Z' });
  const late = rec({ control_number: '2026-003', created_at: '2026-08-16T04:50:00.000Z' });

  test('defaults to newest first', () => {
    const out = sortRecords([early, late, mid], {});
    expect(out.map((r) => r.control_number)).toEqual(['2026-003', '2026-002', '2026-001']);
  });

  test('ascending reverses it', () => {
    const out = sortRecords([late, early, mid], { key: 'submitted', direction: 'asc' });
    expect(out.map((r) => r.control_number)).toEqual(['2026-001', '2026-002', '2026-003']);
  });

  test('does not mutate the input array', () => {
    const input = [late, early];
    sortRecords(input, {});
    expect(input[0]).toBe(late);
  });

  test('identical timestamps break the tie on reference, ascending', () => {
    const a = rec({ control_number: '2026-009', created_at: '2026-08-16T04:41:00.000Z' });
    const b = rec({ control_number: '2026-004', created_at: '2026-08-16T04:41:00.000Z' });
    expect(sortRecords([a, b], {}).map((r) => r.control_number)).toEqual(['2026-004', '2026-009']);
  });

  test('the tie-break stays ascending when the direction flips, so equal rows never reshuffle', () => {
    const a = rec({ control_number: '2026-009', created_at: '2026-08-16T04:41:00.000Z' });
    const b = rec({ control_number: '2026-004', created_at: '2026-08-16T04:41:00.000Z' });
    const asc = sortRecords([a, b], { direction: 'asc' }).map((r) => r.control_number);
    const desc = sortRecords([a, b], { direction: 'desc' }).map((r) => r.control_number);
    expect(asc).toEqual(desc);
  });

  test('a legacy row with no created_at falls back to its collection date', () => {
    const legacy = rec({ control_number: '2026-000', created_at: undefined, date: '2020-01-01' });
    const out = sortRecords([legacy, early], { direction: 'desc' });
    expect(out.map((r) => r.control_number)).toEqual(['2026-001', '2026-000']);
  });

  test('a row with neither timestamp sorts last in both directions', () => {
    const orphan = rec({ control_number: '2026-999', created_at: undefined, date: undefined });
    expect(sortRecords([orphan, early], { direction: 'desc' })[1]).toBe(orphan);
    expect(sortRecords([orphan, early], { direction: 'asc' })[1]).toBe(orphan);
  });
});

describe('sortRecords by reference', () => {
  test('zero padding makes a plain string compare correct past ten', () => {
    const two = rec({ control_number: '2026-002' });
    const ten = rec({ control_number: '2026-010' });
    const out = sortRecords([ten, two], { key: 'reference', direction: 'asc' });
    expect(out.map((r) => r.control_number)).toEqual(['2026-002', '2026-010']);
  });

  test('descending reverses it', () => {
    const two = rec({ control_number: '2026-002' });
    const ten = rec({ control_number: '2026-010' });
    const out = sortRecords([two, ten], { key: 'reference', direction: 'desc' });
    expect(out.map((r) => r.control_number)).toEqual(['2026-010', '2026-002']);
  });

  test('a missing reference sorts last in both directions', () => {
    const none = rec({ control_number: undefined, created_at: '2026-08-16T09:00:00.000Z' });
    const some = rec({ control_number: '2026-001' });
    expect(sortRecords([none, some], { key: 'reference', direction: 'asc' })[1]).toBe(none);
    expect(sortRecords([none, some], { key: 'reference', direction: 'desc' })[1]).toBe(none);
  });

  test('an explicit type sorts expenses on forms_number', () => {
    const a = { forms_number: 'F-02', created_at: '2026-08-16T04:00:00.000Z' };
    const b = { forms_number: 'F-01', created_at: '2026-08-16T05:00:00.000Z' };
    const out = sortRecords([a, b], { key: 'reference', direction: 'asc', type: 'expense' });
    expect(out.map((r) => r.forms_number)).toEqual(['F-01', 'F-02']);
  });
});

describe('formatSubmittedAt', () => {
  // created_at is `timestamp without time zone`. The pg driver parses it in the
  // Node process's zone (UTC on Vercel), so the client gets a UTC instant. If
  // that ever changes, Manila renders eight hours out and this test catches it.
  test('a UTC instant reads as Manila local time', () => {
    expect(formatSubmittedAt(rec(), MANILA)).toBe('Aug 16, 2026 · 12:41 PM');
  });

  test('falls back to the collection date, with no time, when created_at is absent', () => {
    expect(formatSubmittedAt(rec({ created_at: undefined }), MANILA)).toBe('Aug 16, 2026');
  });

  test('an unparseable value gives a dash rather than "Invalid Date"', () => {
    expect(formatSubmittedAt({ created_at: 'not-a-date', date: undefined }, MANILA)).toBe('—');
  });

  test('a null entry gives a dash', () => {
    expect(formatSubmittedAt(null, MANILA)).toBe('—');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern "utils/records"
```

Expected: FAIL — `Cannot find module './records'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/utils/records.js`:

```js
// Shared presentation rules for record lists. The desktop table and the mobile
// Recent feed both order and label the same rows, so the rules live in one
// place rather than being written twice and drifting.

/**
 * A record's human-facing reference. Collections carry `control_number`,
 * expenses carry `forms_number`.
 *
 * `type` exists because the desktop table knows the kind from its active tab
 * rather than from the row, and rows fetched there have no `entryType`.
 */
export function referenceOf(entry, type) {
  if (!entry) return '';
  const kind = type || entry.entryType;
  const field = kind === 'expense' ? 'forms_number' : 'control_number';
  return entry[field] || '';
}

// Milliseconds a record was submitted, or null when nothing usable is stored.
// Rows predating created_at fall back to the collection date so they still
// order sensibly instead of collapsing to the bottom.
function submittedAt(entry) {
  const raw = entry?.created_at || entry?.date;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Order records for display. Pure — returns a new array.
 *
 * `key` is 'submitted' (default) or 'reference'; `direction` is 'desc'
 * (default) or 'asc'. Direction applies to the primary key only: the
 * tie-break is always ascending, so flipping direction never reshuffles rows
 * that compare equal. Rows missing the primary key sort last either way — a
 * record with no reference should not lead the list just because the arrow
 * flipped.
 */
export function sortRecords(rows, { key = 'submitted', direction = 'desc', type } = {}) {
  const dir = direction === 'asc' ? 1 : -1;
  const ref = (r) => referenceOf(r, type);

  return [...(rows || [])].sort((a, b) => {
    if (key === 'reference') {
      const ra = ref(a);
      const rb = ref(b);
      if (ra && rb) {
        const cmp = ra.localeCompare(rb);
        if (cmp !== 0) return cmp * dir;
      } else if (ra || rb) {
        return ra ? -1 : 1;
      }
      const sa = submittedAt(a);
      const sb = submittedAt(b);
      if (sa === null || sb === null) return 0;
      return sa - sb;
    }

    const sa = submittedAt(a);
    const sb = submittedAt(b);
    if (sa !== null && sb !== null) {
      if (sa !== sb) return (sa - sb) * dir;
    } else if (sa !== null || sb !== null) {
      return sa !== null ? -1 : 1;
    }
    return ref(a).localeCompare(ref(b));
  });
}

/**
 * "Aug 16, 2026 · 12:41 PM" — the moment a record was submitted, in the
 * reader's own timezone.
 *
 * `timeZone` is for tests, which need a fixed zone to assert against.
 * Production passes nothing and gets the device's, which is what a collector
 * in Manila should see.
 */
export function formatSubmittedAt(entry, { timeZone } = {}) {
  const dateOpts = { month: 'short', day: 'numeric', year: 'numeric', timeZone };

  const stamp = entry?.created_at;
  if (stamp) {
    const d = new Date(stamp);
    if (!Number.isNaN(d.getTime())) {
      const day = d.toLocaleDateString('en-US', dateOpts);
      const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone });
      return `${day} · ${time}`;
    }
  }

  const fallback = entry?.date;
  if (fallback) {
    const d = new Date(fallback);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-US', dateOpts);
  }

  return '—';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern "utils/records"
```

Expected: PASS, 17 tests.

If the Manila test fails by exactly eight hours, do not "fix" it by changing the expected string — that means the timestamp lost its UTC marker somewhere, which is the bug the test exists to catch.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/records.js frontend/src/utils/records.test.js
git commit -m "feat: add shared record sorting and date formatting helpers"
```

---

### Task 2: Sortable headers on the desktop table

**Files:**
- Modify: `frontend/src/components/FinancialRecordsManager.js` (imports; `filteredData` at :557; `<thead>` at :994-1002)
- Test: `frontend/src/components/FinancialRecordsManager.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `frontend/src/components/FinancialRecordsManager.test.js`. That file already mocks `../utils/api` and sets `apiService.getCollections` in a `beforeEach`, so this reuses that harness rather than starting a second one:

```js
describe('sorting', () => {
  // Points the already-mocked API at a fixture and renders. `beforeEach` in
  // this file has stubbed getExpenses/getCustomFields already.
  const renderWithRows = (rows) => {
    apiService.getCollections.mockResolvedValue(rows);
    return render(<FinancialRecordsManager />);
  };

  const sortRows = [
    { id: 1, date: '2026-08-16', control_number: '2026-001', particular: 'First',  total_amount: 100, created_at: '2026-08-16T04:41:00.000Z' },
    { id: 2, date: '2026-08-16', control_number: '2026-002', particular: 'Second', total_amount: 200, created_at: '2026-08-16T04:47:00.000Z' },
    { id: 3, date: '2026-08-16', control_number: '2026-003', particular: 'Third',  total_amount: 300, created_at: '2026-08-16T04:50:00.000Z' },
  ];

  // Reads the Particular cell of each body row, which is unique per fixture.
  const rowOrder = () =>
    screen.getAllByRole('row').slice(1).map((r) => r.cells[2].textContent);

  test('defaults to newest submission first, not reference order', async () => {
    // All three share a collection date, so only created_at can order them.
    renderWithRows(sortRows);
    await waitFor(() => expect(screen.getByText('Third')).toBeInTheDocument());
    expect(rowOrder()).toEqual(['Third', 'Second', 'First']);
  });

  test('clicking Date flips to oldest first', async () => {
    renderWithRows(sortRows);
    await waitFor(() => expect(screen.getByText('Third')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /sort by date/i }));
    expect(rowOrder()).toEqual(['First', 'Second', 'Third']);
  });

  test('clicking Reference sorts by control number ascending', async () => {
    renderWithRows(sortRows);
    await waitFor(() => expect(screen.getByText('Third')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /sort by reference/i }));
    expect(rowOrder()).toEqual(['First', 'Second', 'Third']);
  });

  test('clicking Reference twice reverses it', async () => {
    renderWithRows(sortRows);
    await waitFor(() => expect(screen.getByText('Third')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /sort by reference/i }));
    fireEvent.click(screen.getByRole('button', { name: /sort by reference/i }));
    expect(rowOrder()).toEqual(['Third', 'Second', 'First']);
  });
});
```

`renderWithRows(rows)` is a helper you add next to the existing harness: it points the mocked `apiService.getCollections` at `rows` and renders the component the same way the existing tests do.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern "FinancialRecordsManager"
```

Expected: FAIL — `Unable to find an accessible element with the role "button" and name /sort by date/i`.

- [ ] **Step 3: Add sort state and apply it**

Add the import at the top of `FinancialRecordsManager.js`:

```js
import { sortRecords } from "../utils/records";
```

Add state beside the other `useState` calls:

```js
const [sort, setSort] = useState({ key: "submitted", direction: "desc" });

const handleSort = (key) => {
  setSort((prev) =>
    prev.key === key
      ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
      : // Each key's most useful first press: newest submissions, lowest references.
        { key, direction: key === "reference" ? "asc" : "desc" }
  );
};
```

Replace the `filteredData` definition at line 557:

```js
const recordType = activeTab === "collections" ? "collection" : "expense";

// Filter first, then sort, so the two compose.
const filteredData = sortRecords(
  (activeTab === "collections" ? collections : expenses).filter(
    (record) =>
      record.particular?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.id?.toString().includes(searchTerm)
  ),
  { ...sort, type: recordType }
);
```

- [ ] **Step 4: Make the two headers clickable**

Add this helper next to `handleSort` — a plain function, **not** a nested component, which would remount the header on every render and lose focus:

```js
const sortableHeader = (label, key) => (
  <th className="px-4 py-3 text-left text-xs font-semibold text-[#b89048] uppercase tracking-wider">
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

Replace the first two `<th>` elements at lines 996-997 with:

```jsx
{sortableHeader("Date", "submitted")}
{sortableHeader("Reference", "reference")}
```

Leave `Particular`, `Amount`, and `Actions` exactly as they are. Leave the `Date` **cell** as it is too — it keeps showing the collection date; only the ordering changed.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern "FinancialRecordsManager"
```

Expected: PASS, including every test that already existed in this file.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/FinancialRecordsManager.js frontend/src/components/FinancialRecordsManager.test.js
git commit -m "feat: sort desktop records by submission time and reference"
```

---

### Task 3: Readable date on the mobile Recent list

**Files:**
- Modify: `frontend/src/components/mobile/MobileRecentList.js` (:229-231)
- Test: `frontend/src/components/mobile/MobileRecentList.test.js`

- [ ] **Step 1: Write the failing test**

Add to `frontend/src/components/mobile/MobileRecentList.test.js`:

```js
test('a synced card shows a readable date and submission time', async () => {
  apiService.getRecentEntries.mockResolvedValue([
    {
      id: 1, date: '2026-08-16', total_amount: 5000, created_by: 'nerio@sbcc.church',
      entryType: 'collection', payment_method: 'Cash',
      created_at: '2026-08-16T04:41:33.270Z',
    },
  ]);
  render(<MobileRecentList onQueueChange={jest.fn()} />);

  await waitFor(() => expect(screen.getByText(/₱5,000/)).toBeInTheDocument());
  // Asserted loosely on the time so the suite does not depend on the runner's zone.
  expect(screen.getByText(/Aug 16, 2026 ·/)).toBeInTheDocument();
  expect(screen.queryByText(/2026-08-16T/)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern "MobileRecentList"
```

Expected: FAIL — no element matches `/Aug 16, 2026 ·/`; the card still renders the raw ISO string.

- [ ] **Step 3: Use the formatter**

Add to the imports at the top of `MobileRecentList.js`:

```js
import { formatSubmittedAt, sortRecords } from '../../utils/records';
```

(`sortRecords` is unused until Task 4 — if your linter fails the build on that, import it in Task 4 instead.)

Replace the meta line at :229-231:

```jsx
<p style={{ margin: '2px 0 0', fontSize: 12, color: '#8a6028' }}>
  {formatSubmittedAt(entry)} · {entry.created_by}
</p>
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern "MobileRecentList"
```

Expected: PASS. The existing fixtures in this file have no `created_at`, so they fall back to a formatted collection date — check that no existing assertion depended on the raw string, and update it if one did.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/mobile/MobileRecentList.js frontend/src/components/mobile/MobileRecentList.test.js
git commit -m "feat: show a readable submission date on the mobile recent list"
```

---

### Task 4: Newest/Oldest toggle on the mobile Recent list

**Files:**
- Modify: `frontend/src/components/mobile/MobileRecentList.js` (:212-214)
- Test: `frontend/src/components/mobile/MobileRecentList.test.js`

**Do not touch `SectionHeader`.** The stashed offline-sync work widens it with an `action` slot; editing the same lines guarantees a conflict when that stash is restored.

- [ ] **Step 1: Write the failing test**

```js
test('the Newest/Oldest toggle reverses the synced list', async () => {
  apiService.getRecentEntries.mockResolvedValue([
    { id: 1, date: '2026-08-16', total_amount: 111, created_by: 'a@b.c', entryType: 'collection', created_at: '2026-08-16T04:41:00.000Z' },
    { id: 2, date: '2026-08-16', total_amount: 222, created_by: 'a@b.c', entryType: 'collection', created_at: '2026-08-16T04:50:00.000Z' },
  ]);
  render(<MobileRecentList onQueueChange={jest.fn()} />);

  await waitFor(() => expect(screen.getByText(/₱222/)).toBeInTheDocument());

  const amountsInOrder = () =>
    screen.getAllByText(/₱\d/).map((n) => n.textContent);

  expect(amountsInOrder()[0]).toMatch(/222/);

  fireEvent.click(screen.getByRole('button', { name: /sort by date/i }));

  expect(screen.getByRole('button', { name: /sort by date/i })).toHaveTextContent('Oldest');
  expect(amountsInOrder()[0]).toMatch(/111/);
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern "MobileRecentList"
```

Expected: FAIL — no button named `/sort by date/i`.

- [ ] **Step 3: Add the direction state and sort the entries**

Add beside the other `useState` calls in `MobileRecentList`:

```js
const [direction, setDirection] = useState('desc');
```

Directly above the `entries.map(...)` call, derive the ordered list:

```js
const sortedEntries = sortRecords(entries, { key: 'submitted', direction });
```

Change `entries.map(entry => {` to `sortedEntries.map(entry => {`. Leave the `queued` section alone — queued items have no `created_at` and already sort by `queuedAt`.

- [ ] **Step 4: Add the toggle row**

Immediately inside `{entries.length > 0 && (<div>`, before the `SectionHeader` line at :213:

```jsx
<div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 0 8px' }}>
  <button
    type="button"
    onClick={() => setDirection((d) => (d === 'desc' ? 'asc' : 'desc'))}
    aria-label="Sort by date"
    style={{
      padding: '5px 12px', borderRadius: 8,
      fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
      border: '1px solid #e8c870',
      background: 'rgba(196,144,48,0.08)',
      color: '#c49030',
    }}
  >
    {direction === 'desc' ? 'Newest' : 'Oldest'}
  </button>
</div>
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern "MobileRecentList"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/mobile/MobileRecentList.js frontend/src/components/mobile/MobileRecentList.test.js
git commit -m "feat: add a newest/oldest toggle to the mobile recent list"
```

---

### Task 5: Remove the supplement shortcut and its prefill chain

**Files:**
- Modify: `frontend/src/components/mobile/MobileRecentList.js` (:90, :216-219, :239-256)
- Modify: `frontend/src/components/mobile/MobileLayout.js` (:14, :32-37, :184, :191)
- Modify: `frontend/src/components/mobile/MobileSubmitForm.js` (:142, :145, :155, :158-161, :186-194, :224-235, :319-327)
- Test: all three matching `.test.js` files

**Keep, deliberately:** the `AND payment_method = ?` clause in the duplicate check in `api/collections.js` and `backend/routes/collections.js`. That is what allows a same-date, different-method record to exist at all. Removing the shortcut must not remove the capability. **Also keep** the rule in `MobileSubmitForm` that switching to GCash clears the other amount fields — it predates prefill.

- [ ] **Step 1: Replace the three supplement tests with one absence test**

In `MobileRecentList.test.js`, delete these three tests outright:

- `shows "+ Add GCash" button on a Cash collection card` (:57)
- the test at :66 asserting no button on non-Cash/GCash methods
- `calls onAddSupplement with the entry when supplement button is clicked` (:71)

Add in their place:

```js
test('history is read-only — no supplement button on a Cash collection card', async () => {
  apiService.getRecentEntries.mockResolvedValue([
    { id: 1, date: '2026-08-16', total_amount: 5000, created_by: 'a@b.c', entryType: 'collection', payment_method: 'Cash', created_at: '2026-08-16T04:41:00.000Z' },
  ]);
  render(<MobileRecentList onQueueChange={jest.fn()} />);

  await waitFor(() => expect(screen.getByText(/₱5,000/)).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /Add GCash/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Add Cash/i })).not.toBeInTheDocument();
});
```

In `MobileSubmitForm.test.js`, delete the three prefill tests at :71, :86, and :100.

- [ ] **Step 2: Run the tests to verify the new one fails**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern "MobileRecentList"
```

Expected: FAIL — the button is still rendered.

- [ ] **Step 3: Strip the button from the recent list**

In `MobileRecentList.js`:

1. Change the signature at :90 from `({ onQueueChange, onAddSupplement })` to `({ onQueueChange })`.
2. Delete the `supplementLabel` block at :216-219.
3. Delete the whole `{supplementLabel && onAddSupplement && ( ... )}` block at :239-256.

- [ ] **Step 4: Strip the prefill state from the layout**

In `MobileLayout.js`:

1. Delete `const [prefill, setPrefill] = useState(null);` (:14).
2. Delete the `handleAddSupplement` callback (:32-37).
3. Remove `prefill={prefill}` and the sibling `onPrefillConsumed` prop from `<MobileSubmitForm>` (:184).
4. Remove `onAddSupplement={handleAddSupplement}` from `<MobileRecentList>` (:191).

If `useCallback` or `useState` is now unused in this file, drop it from the React import — CRA treats unused-variable lint as a build warning, and a clean build matters here.

- [ ] **Step 5: Strip the prefill props from the submit form**

In `MobileSubmitForm.js`:

1. Signature at :142 becomes `({ user, onSubmitted })`.
2. Delete `prefillRef` (:145) and `prefillBanner` state (:155).
3. Delete the effect at :158-161 that stashes an incoming prefill.
4. In the field-loading effect at :186-194, delete the branch that reads `prefillRef.current` and applies it — keep the rest of the effect intact.
5. Delete the mid-session prefill effect at :224-235 entirely.
6. Delete the banner JSX at :319-327.
7. Remove `setPrefillBanner(null)` calls from `handleTypeToggle` and `doSubmit`.

- [ ] **Step 6: Run the whole frontend suite**

```bash
cd frontend && CI=true npx react-scripts test
```

Expected: PASS, all suites. A failure naming `prefill` means a reference survived step 5.

- [ ] **Step 7: Verify the build is clean**

```bash
cd frontend && npm run build
```

Expected: `Compiled successfully.` Warnings about unused imports mean a leftover — go back and remove it.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/mobile/MobileRecentList.js frontend/src/components/mobile/MobileRecentList.test.js frontend/src/components/mobile/MobileLayout.js frontend/src/components/mobile/MobileLayout.test.js frontend/src/components/mobile/MobileSubmitForm.js frontend/src/components/mobile/MobileSubmitForm.test.js
git commit -m "refactor: make the mobile recent list read-only"
```

---

### Task 6: Full verification

- [ ] **Step 1: Frontend suite**

```bash
cd frontend && CI=true npx react-scripts test
```

Expected: all suites pass.

- [ ] **Step 2: Server suite, to prove nothing server-side moved**

```bash
cd backend && npm test
```

Expected: one failure only — `googleSheetsService › not ready when no env var and no credentials file`. That one is environmental and documented in `CLAUDE.md`. Any other failure is a real regression.

- [ ] **Step 3: Production build**

```bash
cd frontend && npm run build
```

Expected: `Compiled successfully.`

- [ ] **Step 4: Confirm the stash still applies**

```bash
git stash list
```

`stash@{0}` must still be listed and unpopped. Restoring it is the user's call, separately from this work.

---

## Notes for the implementer

- **Do not add server-side sorting.** The lists hold every row already; a query parameter would mean changing `api/` and `backend/` in lockstep for no gain.
- **Do not change what the desktop `Date` column displays.** It shows the collection date. Only the ordering moved to submission time. Changing the display was considered and explicitly left out of scope.
- **The date-only fallback in `formatSubmittedAt` is timezone-naive by design.** A bare `2026-08-16` parses as UTC midnight, which renders as the previous day in zones behind UTC. Users are in Manila (UTC+8), so it reads correctly there. Accepted, not overlooked.
