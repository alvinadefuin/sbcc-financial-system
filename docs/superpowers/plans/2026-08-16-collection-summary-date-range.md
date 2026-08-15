# Collection Summary Date Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the treasurer pick one date or a range of dates in the Sunday Collection summary, and fix four interface faults in the shipped modal.

**Architecture:** All new logic is pure and lives in `sundaySummary.js` — the date filter widens to a range, and a `nextSelection` helper owns the click sequencing so it can be unit tested without React. The hook holds one `selection` object instead of one date string, the calendar renders four cell states from it, and the two shells stay thin. No API change: ranges cannot leave the displayed month, so the existing one-month fetch still covers them.

**Tech Stack:** React 19, Create React App (`react-scripts` 5, Jest with `resetMocks` enabled), Testing Library 16, lucide-react icons, Tailwind 3.4 on desktop and inline styles on mobile.

**Spec:** `docs/superpowers/specs/2026-08-16-collection-summary-date-range-design.md`

---

## Background an implementer needs

**This modifies a feature that shipped yesterday.** Read
`docs/superpowers/specs/2026-08-15-sunday-collection-summary-design.md` for the GCash
rule and the value-reading rules. None of that changes here.

**Never construct a `Date` from an ISO date string.** `new Date('2026-08-02')` is UTC
midnight and renders as August 1 in Manila. Range filtering compares the strings
directly, which is correct because `YYYY-MM-DD` is zero-padded and big-endian:
`'2026-08-02' <= '2026-08-23'` is true for exactly the right reason.

**Jest `resetMocks` is on** (CRA default). Mock return values must be set in
`beforeEach`, never only in the `jest.mock` factory, or they are wiped before each test.

**Labels in the calendar change with state.** Once a range is complete, its endpoints
are named `August 2, 2026, range start` and `August 9, 2026, range end`. While a
selection is still pending (`end === null`) every label is the plain
`August 2, 2026`. Tests that click a date must use the label as it reads *at the moment
of the click*.

**Baseline before starting:** `cd frontend && CI=true npm test` → 23 suites, 190 tests,
all passing.

---

## File Structure

**Modify**

| File | Change |
|---|---|
| `frontend/src/utils/sundaySummary.js` | Range filter, range heading, `nextSelection` |
| `frontend/src/utils/sundaySummary.test.js` | Tests for the above |
| `frontend/src/components/CollectionDateCalendar.js` | `selection` prop, four cell states, gold desktop palette, hint line |
| `frontend/src/components/CollectionDateCalendar.test.js` | Tests for the above |
| `frontend/src/hooks/useSundaySummary.js` | `selection` + `selectDate` replace `selectedDate` + `setSelectedDate` |
| `frontend/src/components/SundayCollectionModal.js` | Rewire to `selection`; layout, textarea, spellcheck, gold |
| `frontend/src/components/SundayCollectionModal.test.js` | Range and UI-fix tests |
| `frontend/src/components/mobile/MobileSummary.js` | Rewire to `selection`; textarea, spellcheck |
| `frontend/src/components/mobile/MobileSummary.test.js` | Range and spellcheck tests |

**Created:** nothing. **Deleted:** nothing.

---

## Task 1: The range heading

**Files:**
- Modify: `frontend/src/utils/sundaySummary.js:27-31`
- Test: `frontend/src/utils/sundaySummary.test.js`

- [ ] **Step 1: Write the failing test**

In `frontend/src/utils/sundaySummary.test.js`, add these three tests inside the
existing `describe('formatDateHeading', ...)` block, after the
`does not shift the day backwards in a UTC+8 timezone` test:

```js
  test('renders a range across two dates', () => {
    expect(formatDateHeading('2026-08-02', '2026-08-23')).toBe('AUGUST 02 - AUGUST 23, 2026');
  });

  test('an end key equal to the start renders as a single date', () => {
    expect(formatDateHeading('2026-08-02', '2026-08-02')).toBe('AUGUST 02, 2026');
  });

  test('a missing end key renders as a single date', () => {
    expect(formatDateHeading('2026-08-02', null)).toBe('AUGUST 02, 2026');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: FAIL, 1 test — `renders a range across two dates` gets `AUGUST 02, 2026`
because the second argument is ignored. The two single-date tests already pass.

- [ ] **Step 3: Write the implementation**

In `frontend/src/utils/sundaySummary.js`, replace the whole `formatDateHeading`
function (lines 27–31) with:

```js
/** Month and day only: '2026-08-02' -> 'AUGUST 02'. */
function monthAndDay(dateKey) {
  const [, month, day] = String(dateKey).split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${day}`;
}

/**
 * '2026-08-02'                -> 'AUGUST 02, 2026'
 * '2026-08-02', '2026-08-23'  -> 'AUGUST 02 - AUGUST 23, 2026'
 *
 * Ranges cannot leave the month, so both ends share a year and it is written once.
 */
export function formatDateHeading(startKey, endKey) {
  const year = String(startKey).split('-')[0];
  if (!endKey || endKey === startKey) return `${monthAndDay(startKey)}, ${year}`;
  return `${monthAndDay(startKey)} - ${monthAndDay(endKey)}, ${year}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: PASS, 33 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sundaySummary.js frontend/src/utils/sundaySummary.test.js
git commit -m "feat: render a date range in the summary heading"
```

---

## Task 2: Aggregate a range

**Files:**
- Modify: `frontend/src/utils/sundaySummary.js:82-110,124-131`
- Test: `frontend/src/utils/sundaySummary.test.js`

This task changes the shape `buildSummary` returns, so it also updates
`formatSummaryText` — the module would not work if they were split across commits.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/utils/sundaySummary.test.js`. The `cash` and `gcash` helpers
and `FIELD_DEFS` already exist in the file:

```js
describe('buildSummary — date ranges', () => {
  const spread = [
    cash({ date: '2026-08-02', general_tithes_offering: 18100, total_amount: 18100 }),
    cash({ date: '2026-08-09', general_tithes_offering: 500, sunday_school: 166, total_amount: 666 }),
    cash({ date: '2026-08-16', general_tithes_offering: 300, total_amount: 300 }),
    cash({ date: '2026-08-23', general_tithes_offering: 999, total_amount: 999 }),
  ];

  test('sums a field across every date in the range', () => {
    expect(buildSummary(spread, FIELD_DEFS, '2026-08-02', '2026-08-16').lines)
      .toEqual([
        { label: 'Tithes & Offering', amount: 18900 },
        { label: 'Sunday School', amount: 166 },
      ]);
  });

  test('excludes dates past the end of the range', () => {
    const total = buildSummary(spread, FIELD_DEFS, '2026-08-02', '2026-08-16').total;
    expect(total).toBe(19066);
  });

  test('includes records on both endpoints', () => {
    expect(buildSummary(spread, FIELD_DEFS, '2026-08-02', '2026-08-02').total).toBe(18100);
    expect(buildSummary(spread, FIELD_DEFS, '2026-08-23', '2026-08-23').total).toBe(999);
  });

  test('omitting the end key reports the single start date', () => {
    expect(buildSummary(spread, FIELD_DEFS, '2026-08-09').lines)
      .toEqual([
        { label: 'Tithes & Offering', amount: 500 },
        { label: 'Sunday School', amount: 166 },
      ]);
  });

  test('reports the range it was asked for', () => {
    const summary = buildSummary(spread, FIELD_DEFS, '2026-08-02', '2026-08-16');
    expect(summary.startKey).toBe('2026-08-02');
    expect(summary.endKey).toBe('2026-08-16');
  });

  test('a single date reports the same key at both ends', () => {
    const summary = buildSummary(spread, FIELD_DEFS, '2026-08-09');
    expect(summary.startKey).toBe('2026-08-09');
    expect(summary.endKey).toBe('2026-08-09');
  });

  test('GCash records across the range sum into one line', () => {
    const records = [
      gcash({ date: '2026-08-02', general_tithes_offering: 2000, total_amount: 2000 }),
      gcash({ date: '2026-08-09', general_tithes_offering: 500, total_amount: 500 }),
      gcash({ date: '2026-08-23', general_tithes_offering: 99, total_amount: 99 }),
    ];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02', '2026-08-16').lines)
      .toEqual([{ label: 'Gcash', amount: 2500 }]);
  });

  test('a range with no records is empty, not an error', () => {
    const summary = buildSummary([], FIELD_DEFS, '2026-08-02', '2026-08-16');
    expect(summary).toEqual({
      startKey: '2026-08-02', endKey: '2026-08-16',
      lines: [], total: 0, unattributed: 0,
    });
  });

  test('the message heading shows the range', () => {
    const text = formatSummaryText(buildSummary(spread, FIELD_DEFS, '2026-08-02', '2026-08-16'));
    expect(text).toContain('Date : AUGUST 02 - AUGUST 16, 2026');
    expect(text).toContain('Total Collection: Php 19,066.00');
  });
});
```

Then update the one existing test that asserts the old return shape. In
`describe('buildSummary — total and unattributed', ...)`, replace:

```js
    expect(summary).toEqual({ dateKey: '2026-08-02', lines: [], total: 0, unattributed: 0 });
```

with:

```js
    expect(summary).toEqual({
      startKey: '2026-08-02', endKey: '2026-08-02',
      lines: [], total: 0, unattributed: 0,
    });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: FAIL — range calls return only the start date's records, and `startKey` is
`undefined` because the summary still carries `dateKey`.

- [ ] **Step 3: Write the implementation**

In `frontend/src/utils/sundaySummary.js`, replace the `buildSummary` doc comment and
the two lines that open the function (lines 82–84):

```js
/** Aggregate every record for one date into { dateKey, lines, total, unattributed }. */
export function buildSummary(records, fieldDefs, dateKey) {
  const forDate = (records || []).filter((record) => toDateKey(record.date) === dateKey);
```

with:

```js
/**
 * Aggregate every record in the inclusive range [startKey, endKey] into
 * { startKey, endKey, lines, total, unattributed }.
 *
 * Omit endKey for a single date.
 */
export function buildSummary(records, fieldDefs, startKey, endKey) {
  // Compared as strings, never as Dates: 'YYYY-MM-DD' is zero-padded and
  // big-endian, so lexical order is date order — and no UTC parsing can shift
  // the day backwards in Manila. See toDateKey.
  const end = endKey || startKey;
  const forDate = (records || []).filter((record) => {
    const key = toDateKey(record.date);
    return key >= startKey && key <= end;
  });
```

Then replace the return statement at the end of the same function (line 110):

```js
  return { dateKey, lines, total, unattributed: recorded - total };
```

with:

```js
  return { startKey, endKey: end, lines, total, unattributed: recorded - total };
```

Finally, in `formatSummaryText`, replace this line:

```js
    `SBCC SUNDAY COLLECTION\nDate : ${formatDateHeading(summary.dateKey)}`,
```

with:

```js
    `SBCC SUNDAY COLLECTION\nDate : ${formatDateHeading(summary.startKey, summary.endKey)}`,
```

Leave everything between untouched — the field loop, the GCash line, the total and the
unattributed calculation all work unchanged on the widened record set.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: PASS, 42 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sundaySummary.js frontend/src/utils/sundaySummary.test.js
git commit -m "feat: aggregate collection records across a date range"
```

---

## Task 3: The click sequence

**Files:**
- Modify: `frontend/src/utils/sundaySummary.js`
- Test: `frontend/src/utils/sundaySummary.test.js`

The sequencing lives here, as a pure function, rather than inside the hook or the
calendar — that way it is tested directly instead of through five simulated clicks.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/utils/sundaySummary.test.js`, adding `nextSelection` to the
top-level import:

```js
describe('nextSelection', () => {
  test('the first click starts a pending selection', () => {
    expect(nextSelection(null, '2026-08-02')).toEqual({ start: '2026-08-02', end: null });
  });

  test('a later second click closes the range', () => {
    expect(nextSelection({ start: '2026-08-02', end: null }, '2026-08-23'))
      .toEqual({ start: '2026-08-02', end: '2026-08-23' });
  });

  test('an earlier second click restarts from that date', () => {
    expect(nextSelection({ start: '2026-08-23', end: null }, '2026-08-02'))
      .toEqual({ start: '2026-08-02', end: null });
  });

  test('clicking the pending start again keeps it one date', () => {
    expect(nextSelection({ start: '2026-08-02', end: null }, '2026-08-02'))
      .toEqual({ start: '2026-08-02', end: '2026-08-02' });
  });

  test('clicking after a finished range starts over', () => {
    expect(nextSelection({ start: '2026-08-02', end: '2026-08-23' }, '2026-08-09'))
      .toEqual({ start: '2026-08-09', end: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: FAIL — `nextSelection is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `frontend/src/utils/sundaySummary.js`:

```js
/**
 * The selection produced by clicking `key`.
 *
 * Standard range-picker sequencing: one click starts a pending selection that
 * already renders as a single date, a later second click closes the range, an
 * earlier one restarts from there, and clicking a finished range starts over.
 *
 * @param {{start: string, end: string|null}|null} selection
 * @returns {{start: string, end: string|null}}
 */
export function nextSelection(selection, key) {
  if (!selection || selection.end) return { start: key, end: null };
  if (key >= selection.start) return { start: selection.start, end: key };
  return { start: key, end: null };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: PASS, 47 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sundaySummary.js frontend/src/utils/sundaySummary.test.js
git commit -m "feat: add range-picker click sequencing"
```

---

## Task 4: The calendar renders a range

**Files:**
- Modify: `frontend/src/components/CollectionDateCalendar.js:12-15,17-20,68-90`
- Test: `frontend/src/components/CollectionDateCalendar.test.js`

This task also retunes the desktop palette from slate/blue to the app's gold and adds
the hint line, so the file is touched once.

Both shells still pass the old `selectedDate` prop until Task 5. Step 6 below bridges
them with a one-line change each so no commit leaves the highlight broken.

- [ ] **Step 1: Write the failing test**

In `frontend/src/components/CollectionDateCalendar.test.js`, replace this line in
`baseProps`:

```js
  selectedDate: '2026-08-02',
```

with:

```js
  selection: { start: '2026-08-02', end: null },
```

Then append these five tests to the end of the file:

```js
const rangeProps = {
  ...baseProps,
  availableDates: new Set(['2026-08-02', '2026-08-09', '2026-08-16']),
  selection: { start: '2026-08-02', end: '2026-08-16' },
};

test('names both endpoints of a range', () => {
  render(<CollectionDateCalendar {...rangeProps} />);
  expect(screen.getByRole('button', { name: 'August 2, 2026, range start' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'August 16, 2026, range end' })).toBeInTheDocument();
});

test('marks days between the endpoints as part of the range', () => {
  render(<CollectionDateCalendar {...rangeProps} />);
  expect(screen.getByRole('button', { name: 'August 9, 2026' }))
    .toHaveAttribute('aria-pressed', 'true');
});

test('a day inside the range with no records is still not clickable', () => {
  const onSelect = jest.fn();
  render(<CollectionDateCalendar {...rangeProps} onSelect={onSelect} />);
  const day10 = screen.getByRole('button', { name: 'August 10, 2026' });
  expect(day10).toBeDisabled();
  fireEvent.click(day10);
  expect(onSelect).not.toHaveBeenCalled();
});

test('a day outside the range is not marked', () => {
  render(<CollectionDateCalendar {...rangeProps} />);
  expect(screen.getByRole('button', { name: 'August 23, 2026' }))
    .toHaveAttribute('aria-pressed', 'false');
});

test('explains that two picks make a range', () => {
  render(<CollectionDateCalendar {...baseProps} />);
  expect(screen.getByText(/pick two for a range/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=CollectionDateCalendar
```

Expected: FAIL, 4 tests — `names both endpoints of a range`,
`marks days between the endpoints as part of the range`,
`explains that two picks make a range`, and the pre-existing `marks the selected date`,
which now fails because the component still reads `selectedDate`.

The other two new tests pass already: a day with no records is disabled today, and an
unmarked day already reports `aria-pressed="false"`. They are guards against the change
breaking behaviour that is currently correct.

- [ ] **Step 3: Swap the palettes**

In `frontend/src/components/CollectionDateCalendar.js`, replace the whole `PALETTES`
constant (lines 12–15) with:

```js
// One warm palette per surface: the desktop modal sits on white, the mobile tab on
// the cream card. Both are the app's gold — Dashboard.js uses #c49030 and #3d2a08
// throughout and no blue anywhere.
const PALETTES = {
  desktop: {
    accent: '#c49030', accentText: '#fff8e6', available: '#8a6028',
    availableBg: '#fdf6e3', inRangeBg: '#faedd0', muted: '#cbd5e1',
    hint: '#b89048', heading: '#3d2a08', border: '#e8d090',
  },
  mobile: {
    accent: '#c49030', accentText: '#fff8e6', available: '#8a6028',
    availableBg: 'rgba(196,144,48,0.10)', inRangeBg: 'rgba(196,144,48,0.20)',
    muted: '#d8c9a4', hint: '#b89048', heading: '#3d2a08', border: '#f0e4b0',
  },
};
```

- [ ] **Step 4: Read the selection**

Replace the component signature (lines 17–20):

```js
export default function CollectionDateCalendar({
  year, month, availableDates, selectedDate, onSelect, onMonthChange, variant = 'desktop',
}) {
  const palette = PALETTES[variant] || PALETTES.desktop;
```

with:

```js
export default function CollectionDateCalendar({
  year, month, availableDates, selection, onSelect, onMonthChange, variant = 'desktop',
}) {
  const palette = PALETTES[variant] || PALETTES.desktop;
  const start = selection?.start || null;
  const end = selection?.end || null;
  const isRange = Boolean(end && end !== start);
```

- [ ] **Step 5: Render the four cell states**

Replace the whole day-cell block — from `const key = keyFor(day);` down to the closing
`);` of the returned `<button>` — with:

```js
          const key = keyFor(day);
          const hasRecords = availableDates.has(key);
          const isStart = key === start;
          const isEnd = key === end;
          const isEndpoint = isStart || isEnd;
          // Strictly between the two ends: tinted as part of the band, but still
          // only clickable if it has records of its own.
          const inRange = Boolean(start && end && key > start && key < end);

          const label = `${MONTH_TITLES[month - 1]} ${day}, ${year}`;
          const rangeLabel = isRange && isStart ? `${label}, range start`
            : isRange && isEnd ? `${label}, range end`
            : label;

          const background = isEndpoint ? palette.accent
            : inRange ? palette.inRangeBg
            : hasRecords ? palette.availableBg
            : 'transparent';

          const color = isEndpoint ? palette.accentText
            : (inRange || hasRecords) ? palette.available
            : palette.muted;

          return (
            <button
              key={key}
              type="button"
              disabled={!hasRecords}
              aria-pressed={isEndpoint || inRange}
              aria-label={rangeLabel}
              onClick={() => onSelect(key)}
              style={{
                height: 32, borderRadius: 8, fontSize: 12, padding: 0,
                fontWeight: hasRecords ? 600 : 400,
                fontFamily: 'inherit',
                cursor: hasRecords ? 'pointer' : 'default',
                color,
                background,
                border: `1px solid ${hasRecords && !isEndpoint ? palette.border : 'transparent'}`,
              }}
            >
              {day}
            </button>
          );
```

Then add the hint line immediately after the closing `</div>` of the day grid, before
the component's final `</div>`:

```jsx
      <p style={{ margin: '10px 0 0', fontSize: 11, color: palette.hint, textAlign: 'center' }}>
        Pick a date, or pick two for a range.
      </p>
```

- [ ] **Step 6: Bridge the two shells**

Both shells still hold a single date string. Give the calendar the shape it now expects
so no commit leaves the highlight broken — Task 5 replaces both of these lines.

In `frontend/src/components/SundayCollectionModal.js`, replace:

```jsx
            selectedDate={selectedDate}
```

with:

```jsx
            selection={selectedDate ? { start: selectedDate, end: null } : null}
```

In `frontend/src/components/mobile/MobileSummary.js`, replace:

```jsx
            selectedDate={selectedDate}
```

with:

```jsx
            selection={selectedDate ? { start: selectedDate, end: null } : null}
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd frontend && CI=true npm test -- --testPathPattern="CollectionDateCalendar|SundayCollectionModal|MobileSummary"
```

Expected: PASS — 12 calendar tests, plus the existing 10 modal and 4 mobile tests
unchanged.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/CollectionDateCalendar.js \
        frontend/src/components/CollectionDateCalendar.test.js \
        frontend/src/components/SundayCollectionModal.js \
        frontend/src/components/mobile/MobileSummary.js
git commit -m "feat: render a selected date range on the collection calendar"
```

---

## Task 5: The hook owns the selection

**Files:**
- Modify: `frontend/src/hooks/useSundaySummary.js:36,63,74-83,100-107`
- Modify: `frontend/src/components/SundayCollectionModal.js:9,42-43,51,57,92`
- Modify: `frontend/src/components/mobile/MobileSummary.js:16,40-41,50,56,92,96,99`
- Test: `frontend/src/components/SundayCollectionModal.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/SundayCollectionModal.test.js`:

```js
test('clicking a second date builds a range summary', async () => {
  await openModal();
  const box = await screen.findByRole('textbox', { name: /collection message/i });

  // Labels carry no range suffix while the selection is still pending, so both
  // clicks use the plain name.
  fireEvent.click(screen.getByRole('button', { name: 'August 2, 2026' }));
  fireEvent.click(screen.getByRole('button', { name: 'August 9, 2026' }));

  expect(box.value).toContain('Date : AUGUST 02 - AUGUST 09, 2026');
  expect(box.value).toContain('Tithes & Offering - Php 18,600.00');
  expect(box.value).toContain('Sunday School - Php 166.00');
  expect(box.value).toContain('Gcash - Php 2,000.00');
  expect(box.value).toContain('Total Collection: Php 20,766.00');
});

test('a third click starts a new single-date selection', async () => {
  await openModal();
  const box = await screen.findByRole('textbox', { name: /collection message/i });

  fireEvent.click(screen.getByRole('button', { name: 'August 2, 2026' }));
  fireEvent.click(screen.getByRole('button', { name: 'August 9, 2026' }));
  fireEvent.click(screen.getByRole('button', { name: 'August 2, 2026, range start' }));

  expect(box.value).toContain('Date : AUGUST 02, 2026');
  expect(box.value).toContain('Total Collection: Php 20,266.00');
});

test('paging to another month drops a pending range', async () => {
  await openModal();
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  fireEvent.click(screen.getByRole('button', { name: 'August 2, 2026' }));
  expect(box.value).toContain('Date : AUGUST 02, 2026');

  fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
  await waitFor(() => expect(apiService.getCollections)
    .toHaveBeenCalledWith({ month: '07', year: '2026' }));

  // The pending start is gone: the refetch preselects the latest date again, so the
  // next click starts a fresh range instead of closing the abandoned one.
  await waitFor(() => expect(box.value).toContain('Date : AUGUST 09, 2026'));
  expect(box.value).not.toContain(' - AUGUST');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=SundayCollectionModal
```

Expected: FAIL, 2 tests — a second click replaces the date instead of closing a range,
so the heading reads `Date : AUGUST 09, 2026` and no `range start` button exists.

- [ ] **Step 3: Hold a selection in the hook**

In `frontend/src/hooks/useSundaySummary.js`, extend the import on line 3:

```js
import { buildSummary, collectionDatesInMonth, formatSummaryText } from '../utils/sundaySummary';
```

to:

```js
import {
  buildSummary, collectionDatesInMonth, formatSummaryText, nextSelection,
} from '../utils/sundaySummary';
```

Replace the state declaration on line 36:

```js
  const [selectedDate, setSelectedDate] = useState(null);
```

with:

```js
  const [selection, setSelection] = useState(null);
```

Replace the preselect line inside the fetch effect (line 63):

```js
        setSelectedDate([...dates].sort().pop() || null);
```

with:

```js
        // Latest date in the month — normally the Sunday just recorded. Setting it
        // here is also what discards a half-made range when the month changes.
        const latest = [...dates].sort().pop() || null;
        setSelection(latest ? { start: latest, end: null } : null);
```

Replace the summary effect (lines 74–83):

```js
  useEffect(() => {
    if (!selectedDate) {
      setSummary(null);
      setText('');
      return;
    }
    const next = buildSummary(records, fieldDefs, selectedDate);
    setSummary(next);
    setText(formatSummaryText(next));
  }, [selectedDate, records, fieldDefs]);
```

with:

```js
  useEffect(() => {
    if (!selection) {
      setSummary(null);
      setText('');
      return;
    }
    const next = buildSummary(records, fieldDefs, selection.start, selection.end);
    setSummary(next);
    setText(formatSummaryText(next));
  }, [selection, records, fieldDefs]);

  const selectDate = useCallback((key) => {
    setSelection((prev) => nextSelection(prev, key));
  }, []);
```

Replace the returned line (line 104):

```js
    availableDates, selectedDate, setSelectedDate,
```

with:

```js
    availableDates, selection, selectDate,
```

- [ ] **Step 4: Rewire the desktop shell**

In `frontend/src/components/SundayCollectionModal.js`, replace the destructuring on
line 9:

```js
    year, month, changeMonth, availableDates, selectedDate, setSelectedDate,
```

with:

```js
    year, month, changeMonth, availableDates, selection, selectDate,
```

Replace the two calendar props added in Task 4:

```jsx
            selection={selectedDate ? { start: selectedDate, end: null } : null}
            onSelect={setSelectedDate}
```

with:

```jsx
            selection={selection}
            onSelect={selectDate}
```

Then replace the three remaining `selectedDate` references — the empty-state guard,
the message guard, and the Copy button:

```jsx
          {!loading && !error && !selectedDate && (
```

with:

```jsx
          {!loading && !error && !selection && (
```

```jsx
          {selectedDate && (
```

with:

```jsx
          {selection && (
```

```jsx
            disabled={!selectedDate}
```

with:

```jsx
            disabled={!selection}
```

- [ ] **Step 5: Rewire the mobile shell**

In `frontend/src/components/mobile/MobileSummary.js`, make the same five replacements.
The destructuring on line 16:

```js
    year, month, changeMonth, availableDates, selectedDate, setSelectedDate,
```

with:

```js
    year, month, changeMonth, availableDates, selection, selectDate,
```

The calendar props:

```jsx
            selection={selectedDate ? { start: selectedDate, end: null } : null}
            onSelect={setSelectedDate}
```

with:

```jsx
            selection={selection}
            onSelect={selectDate}
```

The empty-state guard and the message guard:

```jsx
        {!loading && !error && !selectedDate && (
```

with:

```jsx
        {!loading && !error && !selection && (
```

```jsx
        {selectedDate && (
```

with:

```jsx
        {selection && (
```

And the Copy button's three references:

```jsx
          disabled={!selectedDate}
```

with:

```jsx
          disabled={!selection}
```

```js
            background: selectedDate ? '#c49030' : '#e8d090',
```

with:

```js
            background: selection ? '#c49030' : '#e8d090',
```

```js
            cursor: selectedDate ? 'pointer' : 'default',
```

with:

```js
            cursor: selection ? 'pointer' : 'default',
```

- [ ] **Step 6: Confirm no reference is left behind**

```bash
cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system && grep -rn "selectedDate\|setSelectedDate" frontend/src
```

Expected: no output.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd frontend && CI=true npm test -- --testPathPattern="SundayCollectionModal|MobileSummary|CollectionDateCalendar"
```

Expected: PASS — 13 modal tests, 4 mobile tests, 12 calendar tests.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hooks/useSundaySummary.js \
        frontend/src/components/SundayCollectionModal.js \
        frontend/src/components/SundayCollectionModal.test.js \
        frontend/src/components/mobile/MobileSummary.js
git commit -m "feat: select a date range in the collection summary"
```

---

## Task 6: Desktop interface fixes

**Files:**
- Modify: `frontend/src/components/SundayCollectionModal.js:29-30,36,74,76,88,93-95`
- Test: `frontend/src/components/SundayCollectionModal.test.js`

Four faults, all visible in the shipped modal: the footer scrolls out of reach, a fixed
sixteen-row textarea creates the dead space that pushes it there, the palette is the
only blue on a gold screen, and spellcheck underlines every Tagalog word in the closing
line.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/SundayCollectionModal.test.js`:

```js
test('keeps the footer out of the scrolling area', async () => {
  await openModal();
  await screen.findByRole('textbox', { name: /collection message/i });
  // The bug: the whole card scrolled, so Close and Copy slid off the bottom.
  // Asserted on Copy alone — two buttons are named "Close" (the header's X carries
  // aria-label="Close"), so that name is ambiguous to getByRole.
  expect(screen.getByRole('button', { name: /^copy/i }).closest('.overflow-y-auto')).toBeNull();
});

test('sizes the message box to the message', async () => {
  await openModal();
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  // The single-date message is 8 lines; the old box was a fixed 16 rows.
  const rows = Number(box.getAttribute('rows'));
  expect(rows).toBeGreaterThanOrEqual(6);
  expect(rows).toBeLessThan(16);
});

test('does not spellcheck the message', async () => {
  await openModal();
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  expect(box).toHaveAttribute('spellcheck', 'false');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=SundayCollectionModal
```

Expected: FAIL, 3 tests — the footer buttons are inside `.overflow-y-auto`, `rows` is
`16`, and there is no `spellcheck` attribute.

- [ ] **Step 3: Pin the footer**

In `frontend/src/components/SundayCollectionModal.js`, replace the card wrapper
(line 29):

```jsx
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
```

with:

```jsx
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
```

Replace the header row (line 30):

```jsx
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
```

with:

```jsx
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
```

Replace the body wrapper (line 36):

```jsx
        <div className="px-6 py-5 space-y-4">
```

with:

```jsx
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-4">
```

Replace the footer row (line 88):

```jsx
        <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
```

with:

```jsx
        <div className="flex gap-3 px-6 py-4 border-t border-slate-200 shrink-0">
```

- [ ] **Step 4: Size the textarea and turn off spellcheck**

Immediately above the `return (` statement, add:

```js
  // Grow with the message rather than reserving a fixed block: a single date is
  // about 8 lines, a long range about 20. The floor keeps a short message from
  // looking cramped, the ceiling keeps the footer on screen.
  const rows = Math.min(18, Math.max(6, text.split('\n').length + 1));
```

Then replace the textarea's `rows` line (line 74):

```jsx
                rows={16}
```

with:

```jsx
                rows={rows}
                spellCheck={false}
```

- [ ] **Step 5: Swap the blue for the app's gold**

Replace the textarea's `className` (line 76):

```jsx
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
```

with:

```jsx
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
```

Replace the Copy button's `className` (line 93):

```jsx
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
```

with:

```jsx
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-[#c49030] hover:bg-[#b07d24] text-[#fff8e6] rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
```

Tailwind 3.4 is configured for this project, so the arbitrary hex values compile.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd frontend && CI=true npm test -- --testPathPattern=SundayCollectionModal
```

Expected: PASS, 16 tests.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/SundayCollectionModal.js \
        frontend/src/components/SundayCollectionModal.test.js
git commit -m "fix: pin the summary footer and match the app palette"
```

---

## Task 7: Mobile interface fixes

**Files:**
- Modify: `frontend/src/components/mobile/MobileSummary.js:74`
- Test: `frontend/src/components/mobile/MobileSummary.test.js`

The mobile footer is already pinned with `flexShrink: 0` and the palette is already
gold, so only the textarea changes. A range test goes in alongside.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/mobile/MobileSummary.test.js`:

```js
test('two picks build a range summary', async () => {
  apiService.getCollections.mockResolvedValue([
    ...RECORDS,
    { id: 3, date: '2026-08-09', payment_method: 'Cash', total_amount: 500, general_tithes_offering: 500, custom_fields: {} },
  ]);
  render(<MobileSummary />);
  const box = await screen.findByRole('textbox', { name: /collection message/i });

  fireEvent.click(screen.getByRole('button', { name: 'August 2, 2026' }));
  fireEvent.click(screen.getByRole('button', { name: 'August 9, 2026' }));

  expect(box.value).toContain('Date : AUGUST 02 - AUGUST 09, 2026');
  expect(box.value).toContain('Tithes & Offering - Php 18,600.00');
  expect(box.value).toContain('Gcash - Php 2,000.00');
});

test('does not spellcheck the message', async () => {
  render(<MobileSummary />);
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  expect(box).toHaveAttribute('spellcheck', 'false');
});

test('sizes the message box to the message', async () => {
  render(<MobileSummary />);
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  const rows = Number(box.getAttribute('rows'));
  expect(rows).toBeGreaterThanOrEqual(6);
  expect(rows).toBeLessThan(16);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=MobileSummary
```

Expected: FAIL, 2 tests — no `spellcheck` attribute and `rows` is `16`. The range test
already passes, because Task 5 rewired this shell.

- [ ] **Step 3: Write the implementation**

In `frontend/src/components/mobile/MobileSummary.js`, add this immediately above the
`return (` statement:

```js
  // Same rule as the desktop shell: grow with the message, floor at 6, cap at 18.
  const rows = Math.min(18, Math.max(6, text.split('\n').length + 1));
```

Then replace the textarea's `rows` line (line 74):

```jsx
              rows={16}
```

with:

```jsx
              rows={rows}
              spellCheck={false}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && CI=true npm test -- --testPathPattern=MobileSummary
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/mobile/MobileSummary.js \
        frontend/src/components/mobile/MobileSummary.test.js
git commit -m "fix: size the mobile summary box to its message"
```

---

## Final verification

- [ ] **Full frontend suite**

```bash
cd frontend && CI=true npm test
```

Expected: PASS, 23 suites. Test count rises from 190 to 221 — 47 in
`sundaySummary`, 12 in `CollectionDateCalendar`, 16 in `SundayCollectionModal`,
7 in `MobileSummary`, and the other 139 unchanged.

- [ ] **No stale references**

```bash
cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system && grep -rn "selectedDate\|summary.dateKey" frontend/src
```

Expected: no output.

- [ ] **Production build with warnings treated as errors**

```bash
cd frontend && CI=true npm run build
```

Expected: `Compiled successfully.`

- [ ] **Manual check on desktop**

Start the app (`cd backend && npm run dev`, then `cd frontend && npm start`), open
**Sunday Collection** and confirm:

1. Close and Copy are visible without scrolling, on a short message and a long one.
2. The message box hugs its content instead of leaving a tall empty block.
3. The selected date and the Copy button are gold, not blue.
4. No red spellcheck underlines beneath the Tagalog closing line.
5. Clicking one date gives a single-date message; clicking a second later date fills
   the band between them and the heading becomes `AUGUST 02 - AUGUST 23, 2026`.
6. Days inside the band that have no records stay grey and unclickable.
7. Paging to another month clears the range and preselects that month's latest date.

- [ ] **Manual check on mobile**

Open the **Summary** tab and confirm the same range behaviour, that the message box
sizes to its content, and that the Copy button stays reachable above the tab bar.
