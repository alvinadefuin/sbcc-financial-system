# GCash Supplement Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Sunday volunteers add a GCash collection record from the Recent list without manually re-entering the date, by tapping "+ Add GCash" on an already-submitted Cash collection card.

**Architecture:** Four targeted changes — backend duplicate query gains a `payment_method` constraint so same-date/different-method records are never blocked; `MobileRecentList` grows a context-aware supplement button on collection cards; `MobileLayout` holds a `prefill` state that is set by the supplement button and cleared once consumed; `MobileSubmitForm` reads a `prefill` prop at mount, pre-fills date and payment method, and shows a dismissible info banner.

**Tech Stack:** React 18, Express 4, SQLite/better-sqlite3, Jest, React Testing Library, supertest (added in Task 1)

---

## File Map

| File | Change |
|---|---|
| `backend/routes/collections.js` | Add `AND payment_method = ?` to dupe check query |
| `backend/routes/collections.dupe.test.js` | New — tests dupe query includes payment_method |
| `frontend/src/components/mobile/MobileSubmitForm.js` | Add `prefill` + `onPrefillConsumed` props, banner |
| `frontend/src/components/mobile/MobileSubmitForm.test.js` | Add 3 prefill tests |
| `frontend/src/components/mobile/MobileLayout.js` | Add `prefill` state + `onAddSupplement` handler |
| `frontend/src/components/mobile/MobileRecentList.js` | Add `onAddSupplement` prop + supplement button |
| `frontend/src/components/mobile/MobileRecentList.test.js` | Add 3 supplement button tests |

---

## Task 1: Backend — fix duplicate detection to include payment_method

**Files:**
- Modify: `backend/routes/collections.js:113-115`
- Create: `backend/routes/collections.dupe.test.js`

- [ ] **Step 1: Install supertest**

```bash
cd backend && npm install --save-dev supertest
```

- [ ] **Step 2: Write the failing tests**

Create `backend/routes/collections.dupe.test.js`:

```javascript
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key-change-this';
const AUTH = 'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church' }, JWT_SECRET);

function makeApp() {
  jest.resetModules();
  const collectionsRouter = require('./collections');
  const queryCalls = [];
  const db = {
    get: jest.fn((sql, params, cb) => {
      queryCalls.push({ sql, params });
      cb(null, null);
    }),
    run: jest.fn((sql, params, cb) => {
      if (typeof cb === 'function') cb.call({ lastID: 99 }, null);
    }),
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = db; next(); });
  app.use('/', collectionsRouter);
  return { app, queryCalls };
}

describe('POST /collections — duplicate detection', () => {
  test('dupe check query includes AND payment_method = ?', async () => {
    const { app, queryCalls } = makeApp();

    await request(app)
      .post('/')
      .set('Authorization', AUTH)
      .send({
        date: '2026-01-05',
        control_number: 'TEST-001',
        general_tithes_offering: 5000,
        payment_method: 'GCash',
      });

    const dupeCall = queryCalls.find(c => c.sql.includes('total_amount'));
    expect(dupeCall).toBeDefined();
    expect(dupeCall.sql).toContain('AND payment_method = ?');
    expect(dupeCall.params).toContain('GCash');
  });

  test('when a Cash record exists, a GCash submission for same date+total is NOT blocked', async () => {
    jest.resetModules();
    const collectionsRouter = require('./collections');
    const db = {
      get: jest.fn((sql, params, cb) => {
        if (sql.includes('total_amount')) {
          // params[2] is payment_method — return a row only when payment_method matches Cash
          cb(null, params[2] === 'Cash' ? { id: 1, created_by: 'other', date: '2026-01-05' } : null);
        } else {
          cb(null, null);
        }
      }),
      run: jest.fn((sql, params, cb) => {
        if (typeof cb === 'function') cb.call({ lastID: 99 }, null);
      }),
    };
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.db = db; next(); });
    app.use('/', collectionsRouter);

    const res = await request(app)
      .post('/')
      .set('Authorization', AUTH)
      .send({
        date: '2026-01-05',
        control_number: 'TEST-002',
        general_tithes_offering: 5000,
        payment_method: 'GCash',
      });

    expect(res.status).not.toBe(409);
  });
});
```

- [ ] **Step 3: Run the tests — expect FAIL**

```bash
cd backend && npx jest routes/collections.dupe.test.js --no-coverage
```

Expected output: `FAIL` — first test fails because SQL does not yet contain `AND payment_method = ?`.

- [ ] **Step 4: Fix the duplicate query in collections.js**

In `backend/routes/collections.js`, find the block starting at line ~112:

```javascript
    // Duplicate detection
    if (!req.body.force) {
      const dup = await new Promise((resolve, reject) => {
        req.db.get(
          'SELECT id, created_by, date FROM collections WHERE date = ? AND total_amount = ?',
          [date, calculatedTotal],
          (err, row) => (err ? reject(err) : resolve(row))
        );
      });
```

Replace with:

```javascript
    // Duplicate detection
    if (!req.body.force) {
      const dup = await new Promise((resolve, reject) => {
        req.db.get(
          'SELECT id, created_by, date FROM collections WHERE date = ? AND total_amount = ? AND payment_method = ?',
          [date, calculatedTotal, payment_method || 'Cash'],
          (err, row) => (err ? reject(err) : resolve(row))
        );
      });
```

- [ ] **Step 5: Run the tests — expect PASS**

```bash
cd backend && npx jest routes/collections.dupe.test.js --no-coverage
```

Expected output: `PASS` — both tests green.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/collections.js backend/routes/collections.dupe.test.js backend/package.json backend/package-lock.json
git commit -m "fix: include payment_method in collections duplicate detection query"
```

---

## Task 2: MobileSubmitForm — prefill prop + banner

**Files:**
- Modify: `frontend/src/components/mobile/MobileSubmitForm.js`
- Modify: `frontend/src/components/mobile/MobileSubmitForm.test.js`

- [ ] **Step 1: Write the failing tests**

Add these three tests to the bottom of `frontend/src/components/mobile/MobileSubmitForm.test.js`:

```javascript
test('pre-fills date when prefill prop is provided', async () => {
  const prefill = { date: '2026-05-25', payment_method: 'GCash' };
  render(
    <MobileSubmitForm
      user={user}
      onSubmitted={jest.fn()}
      prefill={prefill}
      onPrefillConsumed={jest.fn()}
    />
  );
  await waitFor(() => expect(screen.getByLabelText(/Date/i)).toBeInTheDocument());
  expect(screen.getByLabelText(/Date/i)).toHaveValue('2026-05-25');
});

test('pre-fills payment method when prefill prop is provided', async () => {
  const prefill = { date: '2026-05-25', payment_method: 'GCash' };
  render(
    <MobileSubmitForm
      user={user}
      onSubmitted={jest.fn()}
      prefill={prefill}
      onPrefillConsumed={jest.fn()}
    />
  );
  await waitFor(() => expect(screen.getByLabelText(/Payment/i)).toBeInTheDocument());
  expect(screen.getByLabelText(/Payment/i)).toHaveValue('GCash');
});

test('shows prefill info banner and dismisses it on close', async () => {
  const prefill = { date: '2026-05-25', payment_method: 'GCash' };
  render(
    <MobileSubmitForm
      user={user}
      onSubmitted={jest.fn()}
      prefill={prefill}
      onPrefillConsumed={jest.fn()}
    />
  );
  await waitFor(() => expect(screen.getByText(/Adding GCash/i)).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
  expect(screen.queryByText(/Adding GCash/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && npx react-scripts test --testPathPattern=MobileSubmitForm --watchAll=false
```

Expected: 3 new tests fail — `prefill` prop not yet supported.

- [ ] **Step 3: Implement prefill support in MobileSubmitForm.js**

At the top of the file, update the import:

```javascript
import React, { useState, useMemo, useEffect, useRef } from 'react';
```

Update the component signature:

```javascript
export default function MobileSubmitForm({ user, onSubmitted, prefill = null, onPrefillConsumed }) {
```

Add two new state variables immediately after the existing state declarations:

```javascript
  const [prefillBanner, setPrefillBanner] = useState(null);
  const mountPrefill = useRef(prefill);
```

Inside the `loadFields` function, in the non-silent branch (`} else {`), replace:

```javascript
        } else {
          setForm(buildInitialForm(filteredCol, true));
        }
```

with:

```javascript
        } else {
          const mp = mountPrefill.current;
          setForm({
            ...buildInitialForm(filteredCol, true),
            ...(mp ? { date: mp.date || '', payment_method: mp.payment_method || 'Cash' } : {}),
          });
          if (mp) {
            setPrefillBanner(`Adding ${mp.payment_method} for ${mp.date}`);
            onPrefillConsumed?.();
            mountPrefill.current = null;
          }
        }
```

In `handleTypeToggle`, add banner dismissal — replace:

```javascript
  const handleTypeToggle = (t) => {
    setType(t);
    setForm(buildInitialForm(t === 'collection' ? collectionFields : expenseFields, t === 'collection'));
    setConflict(null);
    setError(null);
    setQueued(false);
  };
```

with:

```javascript
  const handleTypeToggle = (t) => {
    setType(t);
    setForm(buildInitialForm(t === 'collection' ? collectionFields : expenseFields, t === 'collection'));
    setConflict(null);
    setError(null);
    setQueued(false);
    setPrefillBanner(null);
  };
```

Add the banner JSX at the top of the scrollable div, directly before the type toggle div (find the comment `{/* Type toggle */}`):

```jsx
        {/* Prefill info banner */}
        {prefillBanner && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 12px', borderRadius: 11,
            background: 'rgba(212,168,67,0.08)',
            border: '1px solid rgba(212,168,67,0.18)',
          }}>
            <span style={{ fontSize: 12, color: 'rgba(212,168,67,0.85)', lineHeight: 1.4 }}>
              {prefillBanner} — change if needed
            </span>
            <button
              type="button"
              aria-label="dismiss"
              onClick={() => setPrefillBanner(null)}
              style={{
                marginLeft: 10, flexShrink: 0,
                width: 20, height: 20, borderRadius: 5,
                background: 'transparent', border: 'none',
                color: 'rgba(212,168,67,0.5)', fontSize: 14,
                fontFamily: 'inherit', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Type toggle */}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend && npx react-scripts test --testPathPattern=MobileSubmitForm --watchAll=false
```

Expected: all tests green (3 new + 4 existing).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/mobile/MobileSubmitForm.js frontend/src/components/mobile/MobileSubmitForm.test.js
git commit -m "feat: add prefill prop and info banner to MobileSubmitForm"
```

---

## Task 3: MobileLayout — prefill state + onAddSupplement wiring

**Files:**
- Modify: `frontend/src/components/mobile/MobileLayout.js`

*(No isolated unit test — the wiring is pure prop threading; correctness is verified end-to-end by Tasks 2 and 4.)*

- [ ] **Step 1: Add prefill state and handler to MobileLayout**

In `MobileLayout.js`, add `prefill` state alongside the existing state declarations:

```javascript
  const [prefill, setPrefill] = useState(null);
```

Add the `onAddSupplement` handler after `handleSubmitted`:

```javascript
  const handleAddSupplement = useCallback((entry) => {
    const otherMethod = entry.payment_method === 'Cash' ? 'GCash' : 'Cash';
    setPrefill({ date: entry.date, payment_method: otherMethod });
    setTab('submit');
  }, []);
```

Update the `MobileSubmitForm` render to pass the new props:

```jsx
            ? <MobileSubmitForm
                user={user}
                onSubmitted={handleSubmitted}
                prefill={prefill}
                onPrefillConsumed={() => setPrefill(null)}
              />
```

Update the `MobileRecentList` render to pass the supplement callback:

```jsx
            : <MobileRecentList
                onQueueChange={handleQueueChange}
                onAddSupplement={handleAddSupplement}
              />
```

- [ ] **Step 2: Verify the build compiles**

```bash
cd frontend && npx react-scripts build 2>&1 | tail -5
```

Expected: `Compiled successfully.`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/mobile/MobileLayout.js
git commit -m "feat: wire prefill state and onAddSupplement callback in MobileLayout"
```

---

## Task 4: MobileRecentList — supplement button on collection cards

**Files:**
- Modify: `frontend/src/components/mobile/MobileRecentList.js`
- Modify: `frontend/src/components/mobile/MobileRecentList.test.js`

- [ ] **Step 1: Write the failing tests**

In `MobileRecentList.test.js`, update `mockEntries` to include `payment_method`:

```javascript
const mockEntries = [
  { id: 1, date: '2026-05-26', total_amount: 5000, created_by: 'admin@sbcc.church', entryType: 'collection', payment_method: 'Cash' },
  { id: 2, date: '2026-05-25', total_amount: 1500, created_by: 'admin@sbcc.church', entryType: 'expense' },
];
```

Add these three tests to the bottom of `MobileRecentList.test.js`:

```javascript
test('shows "+ Add GCash" button on a Cash collection card', async () => {
  const onAddSupplement = jest.fn();
  render(<MobileRecentList onQueueChange={jest.fn()} onAddSupplement={onAddSupplement} />);
  await waitFor(() => expect(screen.getByText(/₱5,000/)).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /Add GCash/i })).toBeInTheDocument();
});

test('does NOT show supplement button on an expense card', async () => {
  render(<MobileRecentList onQueueChange={jest.fn()} onAddSupplement={jest.fn()} />);
  await waitFor(() => expect(screen.getByText(/₱1,500/)).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /Add GCash/i })).not.toBeInTheDocument();
});

test('calls onAddSupplement with the entry when supplement button is clicked', async () => {
  const onAddSupplement = jest.fn();
  render(<MobileRecentList onQueueChange={jest.fn()} onAddSupplement={onAddSupplement} />);
  await waitFor(() => expect(screen.getByRole('button', { name: /Add GCash/i })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /Add GCash/i }));
  expect(onAddSupplement).toHaveBeenCalledWith(
    expect.objectContaining({ id: 1, payment_method: 'Cash' })
  );
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && npx react-scripts test --testPathPattern=MobileRecentList --watchAll=false
```

Expected: 3 new tests fail — supplement button not yet rendered.

- [ ] **Step 3: Add onAddSupplement prop and supplement button to MobileRecentList.js**

Update the component signature to accept `onAddSupplement`:

```javascript
export default function MobileRecentList({ onQueueChange, onAddSupplement }) {
```

Inside the synced entries section, find the `entries.map` block. The card for each entry currently ends with:

```jsx
            <div key={`${entry.entryType}-${entry.id}`} style={GLASS_CARD}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <TypeIcon type={entry.entryType} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#e2e2ec', textTransform: 'capitalize' }}>{entry.entryType}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.28)' }}>
                        {entry.date} · {entry.created_by}
                      </p>
                    </div>
                    <span className="font-mono-num" style={{ fontSize: 15, fontWeight: 600, flexShrink: 0, color: entry.entryType === 'collection' ? '#d4a843' : '#f87171' }}>
                      {formatCurrency(entry.total_amount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
```

Replace the entire `entries.map` block with:

```jsx
          {entries.map(entry => {
            const supplementLabel =
              entry.entryType === 'collection' && entry.payment_method === 'Cash' ? '+ Add GCash' :
              entry.entryType === 'collection' && entry.payment_method === 'GCash' ? '+ Add Cash' :
              null;

            return (
              <div key={`${entry.entryType}-${entry.id}`} style={GLASS_CARD}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <TypeIcon type={entry.entryType} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#e2e2ec', textTransform: 'capitalize' }}>{entry.entryType}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.28)' }}>
                          {entry.date} · {entry.created_by}
                        </p>
                      </div>
                      <span className="font-mono-num" style={{ fontSize: 15, fontWeight: 600, flexShrink: 0, color: entry.entryType === 'collection' ? '#d4a843' : '#f87171' }}>
                        {formatCurrency(entry.total_amount)}
                      </span>
                    </div>
                  </div>
                </div>
                {supplementLabel && onAddSupplement && (
                  <div style={{ ...CARD_DIVIDER, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      aria-label={supplementLabel}
                      onClick={() => onAddSupplement(entry)}
                      style={{
                        padding: '6px 12px', borderRadius: 8,
                        fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
                        border: '1px solid rgba(212,168,67,0.25)',
                        background: 'rgba(212,168,67,0.08)',
                        color: 'rgba(212,168,67,0.75)',
                      }}
                    >
                      {supplementLabel}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend && npx react-scripts test --testPathPattern=MobileRecentList --watchAll=false
```

Expected: all tests green (3 new + 4 existing).

- [ ] **Step 5: Run the full frontend test suite**

```bash
cd frontend && npx react-scripts test --watchAll=false
```

Expected: all tests pass with no regressions.

- [ ] **Step 6: Verify the build compiles**

```bash
cd frontend && npx react-scripts build 2>&1 | tail -5
```

Expected: `Compiled successfully.`

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/mobile/MobileRecentList.js frontend/src/components/mobile/MobileRecentList.test.js
git commit -m "feat: add GCash supplement button to Recent collection cards"
```
