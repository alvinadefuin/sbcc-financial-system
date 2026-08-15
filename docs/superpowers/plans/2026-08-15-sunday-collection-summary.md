# Sunday Collection Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Print Report modal with a date-picked, copy-to-clipboard Sunday collection summary that the treasurer pastes into the church Messenger group chat.

**Architecture:** All aggregation and text formatting live in one pure module (`sundaySummary.js`) with no React or network dependency, so it can be tested directly. A custom hook (`useSundaySummary`) owns fetching, date selection, and clipboard access, and is shared by two thin shells — a desktop modal and a mobile tab — which differ only in chrome. No new API endpoints: the existing `GET /api/collections` and `GET /api/custom-fields/collections` supply everything.

**Tech Stack:** React 19, Create React App (`react-scripts` 5, Jest with `resetMocks` enabled), Testing Library, lucide-react icons, Tailwind on desktop and inline styles on mobile. Backend is Express (`backend/`) mirrored by Vercel functions (`api/`), both tested with Jest + supertest.

**Spec:** `docs/superpowers/specs/2026-08-15-sunday-collection-summary-design.md`

---

## Background an implementer needs

**One Sunday can have several records.** The treasurer submits cash in the morning and may add a GCash entry in the afternoon via the `+ Add GCash` button. All records for a date are aggregated into one message.

**GCash is only ever general tithes & offering.** It arrives as a record with `payment_method = 'GCash'`. On the report it gets its own `Gcash` line instead of being folded into Tithes & Offering. This is presentation only — the amount still lives in the `general_tithes_offering` column and is still counted in the Dashboard, the Google Sheets report, and the 10/10/80 fund allocation.

**Amount fields are configuration, not hardcoded.** `GET /api/custom-fields/collections` returns definitions like `{ field_name: 'sunday_school', field_label: 'Sunday School', field_type: 'decimal', display_order: 7, is_active: 1 }`. Labels and ordering in the message come from there. Nine of the ten definitions mirror real columns on the `collections` table; only `gcash` does not, and it is being retired.

**Values can live in two places.** A record from `GET /api/collections` looks like:

```js
{ id: 9, date: '2025-10-08', payment_method: 'Cash', total_amount: 5000,
  general_tithes_offering: 3000,            // real column
  custom_fields: { general_tithes_offering: 0, gcash: 2000 } }
```

Records created on desktop write the column but no `custom_field_values` row, so the nested copy reads `0` while the column holds the truth. Always prefer the column when the field name exists on the record.

**Timezones will bite you.** `new Date('2026-08-02')` parses as UTC midnight and renders as **August 1** in Manila. Never construct a `Date` from an ISO date string in this feature — slice the string instead.

**Jest `resetMocks` is on** (CRA default). Mock return values must be set in `beforeEach`, never only in the `jest.mock` factory, or they are wiped before each test runs.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `frontend/src/utils/sundaySummary.js` | Pure aggregation + text formatting. No React, no network. |
| `frontend/src/utils/sundaySummary.test.js` | Unit tests for the above. |
| `frontend/src/hooks/useSundaySummary.js` | Fetch, month paging, date selection, clipboard. Shared by both shells. |
| `frontend/src/components/CollectionDateCalendar.js` | Month grid; only dates with records are clickable. Used by both shells. |
| `frontend/src/components/CollectionDateCalendar.test.js` | Unit tests for the calendar. |
| `frontend/src/components/SundayCollectionModal.js` | Desktop shell. |
| `frontend/src/components/SundayCollectionModal.test.js` | Desktop shell tests. |
| `frontend/src/components/mobile/MobileSummary.js` | Mobile shell. |
| `frontend/src/components/mobile/MobileSummary.test.js` | Mobile shell tests. |

**Modify**

| File | Change |
|---|---|
| `frontend/src/components/Dashboard.js` | Sidebar entry + modal wiring |
| `frontend/src/components/mobile/MobileLayout.js` | Third tab |
| `frontend/src/components/mobile/MobileSubmitForm.js` | GCash field restriction |
| `frontend/src/components/mobile/MobileSubmitForm.test.js` | Restriction tests |
| `frontend/src/content/guideContent.js` | Guide copy, desktop + mobile |
| `frontend/src/components/HelpGuide.test.js` | Follows the copy change |

**Delete**

| File | Reason |
|---|---|
| `frontend/src/components/PrintReportModal.js` | Replaced |

**Task 16 only (severable)**

| File | Change |
|---|---|
| `backend/utils/customFieldsHelper.js`, `api/_lib/customFieldsHelper.js` | Add `collectCustomFieldInput`, `listActiveCustomFields` |
| `backend/routes/collections.js`, `api/collections.js` | Persist flat custom-field amounts |
| `backend/utils/customFieldsHelper.test.js`, `backend/routes/collections.customFields.test.js` | Tests |

---

## Task 1: Date helpers

**Files:**
- Create: `frontend/src/utils/sundaySummary.js`
- Test: `frontend/src/utils/sundaySummary.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/utils/sundaySummary.test.js`:

```js
import { toDateKey, formatDateHeading } from './sundaySummary';

describe('toDateKey', () => {
  test('takes the date part of an ISO string', () => {
    expect(toDateKey('2026-08-02')).toBe('2026-08-02');
    expect(toDateKey('2026-08-02T00:00:00.000Z')).toBe('2026-08-02');
  });

  test('reads a Date in local time, not UTC', () => {
    expect(toDateKey(new Date(2026, 7, 2))).toBe('2026-08-02');
  });

  test('returns an empty string for missing values', () => {
    expect(toDateKey(null)).toBe('');
    expect(toDateKey(undefined)).toBe('');
  });
});

describe('formatDateHeading', () => {
  test('renders the message heading format', () => {
    expect(formatDateHeading('2026-08-02')).toBe('AUGUST 02, 2026');
  });

  test('does not shift the day backwards in a UTC+8 timezone', () => {
    // new Date('2026-01-01') would render as December 31 in Manila.
    expect(formatDateHeading('2026-01-01')).toBe('JANUARY 01, 2026');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: FAIL — `Cannot find module './sundaySummary'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/utils/sundaySummary.js`:

```js
// Pure helpers for the Sunday collection summary message.
// No React, no network, no Date construction from ISO strings — see toDateKey.

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

/**
 * Normalise a record's date to a 'YYYY-MM-DD' key.
 *
 * Deliberately string-sliced rather than parsed: `new Date('2026-08-02')` is
 * UTC midnight, which renders as August 1 in Manila and would put the wrong
 * date on every message.
 */
export function toDateKey(value) {
  if (!value) return '';
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
}

/** '2026-08-02' -> 'AUGUST 02, 2026' */
export function formatDateHeading(dateKey) {
  const [year, month, day] = String(dateKey).split('-');
  return `${MONTH_NAMES[Number(month) - 1]} ${day}, ${year}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sundaySummary.js frontend/src/utils/sundaySummary.test.js
git commit -m "feat: add timezone-safe date helpers for the collection summary"
```

---

## Task 2: Dates that have records

**Files:**
- Modify: `frontend/src/utils/sundaySummary.js`
- Test: `frontend/src/utils/sundaySummary.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/utils/sundaySummary.test.js`, and add `collectionDatesInMonth` to the existing import at the top of the file:

```js
describe('collectionDatesInMonth', () => {
  test('collects one key per distinct date', () => {
    const records = [
      { date: '2026-08-02' },
      { date: '2026-08-02T00:00:00.000Z' },
      { date: '2026-08-09' },
    ];
    expect([...collectionDatesInMonth(records)].sort()).toEqual(['2026-08-02', '2026-08-09']);
  });

  test('returns an empty set for no records', () => {
    expect(collectionDatesInMonth([]).size).toBe(0);
    expect(collectionDatesInMonth(undefined).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: FAIL — `collectionDatesInMonth is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `frontend/src/utils/sundaySummary.js`:

```js
/** Set of 'YYYY-MM-DD' keys that have at least one record. */
export function collectionDatesInMonth(records) {
  const dates = new Set();
  (records || []).forEach((record) => {
    const key = toDateKey(record.date);
    if (key) dates.add(key);
  });
  return dates;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sundaySummary.js frontend/src/utils/sundaySummary.test.js
git commit -m "feat: collect the dates that have collection records"
```

---

## Task 3: Category lines

**Files:**
- Modify: `frontend/src/utils/sundaySummary.js`
- Test: `frontend/src/utils/sundaySummary.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/utils/sundaySummary.test.js`, adding `buildSummary` to the top-level import. Define the shared fixtures once, above the new `describe`, because Tasks 4 and 5 reuse them:

```js
const FIELD_DEFS = [
  { field_name: 'general_tithes_offering', field_label: 'Tithes & Offering', field_type: 'decimal', display_order: 0, is_active: 1 },
  { field_name: 'sunday_school', field_label: 'Sunday School', field_type: 'decimal', display_order: 7, is_active: 1 },
  { field_name: 'sisterhood_san_juan', field_label: 'Sisterhood San Juan', field_type: 'decimal', display_order: 2, is_active: 1 },
  { field_name: 'payment_reference', field_label: 'Payment Reference', field_type: 'text', display_order: 10, is_active: 1 },
];

const cash = (over = {}) => ({
  date: '2026-08-02', payment_method: 'Cash', total_amount: 0,
  general_tithes_offering: 0, sunday_school: 0, sisterhood_san_juan: 0,
  custom_fields: {}, ...over,
});

describe('buildSummary — category lines', () => {
  test('sums a field across every record for the date', () => {
    const records = [
      cash({ general_tithes_offering: 18000, total_amount: 18000 }),
      cash({ general_tithes_offering: 100, total_amount: 100 }),
    ];
    const summary = buildSummary(records, FIELD_DEFS, '2026-08-02');
    expect(summary.lines).toEqual([{ label: 'Tithes & Offering', amount: 18100 }]);
  });

  test('ignores records from other dates', () => {
    const records = [
      cash({ general_tithes_offering: 18100, total_amount: 18100 }),
      cash({ date: '2026-08-09', general_tithes_offering: 999, total_amount: 999 }),
    ];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines)
      .toEqual([{ label: 'Tithes & Offering', amount: 18100 }]);
  });

  test('omits fields that sum to zero', () => {
    const records = [cash({ general_tithes_offering: 18100, total_amount: 18100 })];
    const labels = buildSummary(records, FIELD_DEFS, '2026-08-02').lines.map((l) => l.label);
    expect(labels).not.toContain('Sunday School');
  });

  test('orders lines by display_order, not definition order', () => {
    const records = [cash({
      general_tithes_offering: 18100, sisterhood_san_juan: 350, sunday_school: 166,
      total_amount: 18616,
    })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines.map((l) => l.label))
      .toEqual(['Tithes & Offering', 'Sisterhood San Juan', 'Sunday School']);
  });

  test('prefers the column over the nested custom field value', () => {
    // Desktop-created records write the column but no custom_field_values row.
    const records = [cash({
      general_tithes_offering: 3000, total_amount: 3000,
      custom_fields: { general_tithes_offering: 0 },
    })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines)
      .toEqual([{ label: 'Tithes & Offering', amount: 3000 }]);
  });

  test('falls back to the nested value when there is no column', () => {
    const defs = [...FIELD_DEFS, {
      field_name: 'building_fund', field_label: 'Building Fund',
      field_type: 'decimal', display_order: 9, is_active: 1,
    }];
    const records = [cash({ total_amount: 500, custom_fields: { building_fund: 500 } })];
    expect(buildSummary(records, defs, '2026-08-02').lines)
      .toEqual([{ label: 'Building Fund', amount: 500 }]);
  });

  test('ignores non-decimal field definitions', () => {
    const records = [cash({
      general_tithes_offering: 100, total_amount: 100,
      custom_fields: { payment_reference: 'REF-123' },
    })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines)
      .toEqual([{ label: 'Tithes & Offering', amount: 100 }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: FAIL — `buildSummary is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `frontend/src/utils/sundaySummary.js`:

```js
/** The one custom field with no backing column. Retired; never a category line. */
export const GCASH_FIELD = 'gcash';

/**
 * Read an amount off a record.
 *
 * The column wins when it exists: records created on desktop write columns but
 * no custom_field_values row, so the nested copy reads 0 while the column holds
 * the real amount.
 */
function readValue(record, fieldName) {
  const direct = record[fieldName];
  if (direct !== undefined && direct !== null) return Number(direct) || 0;
  return Number(record.custom_fields?.[fieldName]) || 0;
}

/**
 * Active decimal definitions in display order, excluding `gcash`.
 *
 * `gcash` is excluded by name rather than by relying on it being deactivated:
 * deactivation is a config action an admin could undo, and the exclusion is
 * what guarantees GCash money is never reported twice.
 */
export function amountFields(fieldDefs) {
  return (fieldDefs || [])
    .filter((field) => field.field_type === 'decimal')
    .filter((field) => field.is_active !== 0 && field.is_active !== false)
    .filter((field) => field.field_name !== GCASH_FIELD)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
}

/** Aggregate every record for one date into { dateKey, lines, total, unattributed }. */
export function buildSummary(records, fieldDefs, dateKey) {
  const forDate = (records || []).filter((record) => toDateKey(record.date) === dateKey);
  const fields = amountFields(fieldDefs);

  const lines = [];
  fields.forEach((field) => {
    const amount = forDate.reduce((sum, record) => sum + readValue(record, field.field_name), 0);
    if (amount > 0) lines.push({ label: field.field_label, amount });
  });

  return { dateKey, lines, total: 0, unattributed: 0 };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sundaySummary.js frontend/src/utils/sundaySummary.test.js
git commit -m "feat: aggregate collection category lines for a date"
```

---

## Task 4: The GCash line

**Files:**
- Modify: `frontend/src/utils/sundaySummary.js`
- Test: `frontend/src/utils/sundaySummary.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/utils/sundaySummary.test.js`. Add a `gcash` helper next to the existing `cash` helper:

```js
const gcash = (over = {}) => cash({ payment_method: 'GCash', ...over });

describe('buildSummary — the Gcash line', () => {
  test('a GCash record reports on the Gcash line, not its category', () => {
    const records = [
      cash({ general_tithes_offering: 18100, total_amount: 18100 }),
      gcash({ general_tithes_offering: 2000, total_amount: 2000 }),
    ];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines).toEqual([
      { label: 'Tithes & Offering', amount: 18100 },
      { label: 'Gcash', amount: 2000 },
    ]);
  });

  test('the Gcash line is last, after every category', () => {
    const records = [
      cash({ general_tithes_offering: 18100, sunday_school: 166, total_amount: 18266 }),
      gcash({ general_tithes_offering: 2000, total_amount: 2000 }),
    ];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines.map((l) => l.label))
      .toEqual(['Tithes & Offering', 'Sunday School', 'Gcash']);
  });

  test('several GCash records sum into one line', () => {
    const records = [
      gcash({ general_tithes_offering: 2000, total_amount: 2000 }),
      gcash({ general_tithes_offering: 500, total_amount: 500 }),
    ];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines)
      .toEqual([{ label: 'Gcash', amount: 2500 }]);
  });

  test('a legacy GCash record with mixed categories reports its whole amount', () => {
    const records = [gcash({
      general_tithes_offering: 2000, sunday_school: 100, total_amount: 2100,
    })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines)
      .toEqual([{ label: 'Gcash', amount: 2100 }]);
  });

  test('a GCash record with no breakdown falls back to total_amount', () => {
    const records = [gcash({ total_amount: 1500 })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines)
      .toEqual([{ label: 'Gcash', amount: 1500 }]);
  });

  test('matches the payment method case-insensitively', () => {
    const records = [gcash({ payment_method: ' gcash ', general_tithes_offering: 2000, total_amount: 2000 })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines)
      .toEqual([{ label: 'Gcash', amount: 2000 }]);
  });

  test('omits the Gcash line when no GCash money came in', () => {
    const records = [cash({ general_tithes_offering: 18100, total_amount: 18100 })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').lines.map((l) => l.label))
      .not.toContain('Gcash');
  });

  test('a stored gcash field value is ignored, even if the field is still active', () => {
    // Legacy Cash records carry gcash values; the field is retired, so the
    // money must not appear as a category line or a second Gcash line.
    const defs = [...FIELD_DEFS, {
      field_name: 'gcash', field_label: 'GCash',
      field_type: 'decimal', display_order: 9, is_active: 1,
    }];
    const records = [cash({
      general_tithes_offering: 3000, total_amount: 5000,
      custom_fields: { gcash: 2000 },
    })];
    expect(buildSummary(records, defs, '2026-08-02').lines)
      .toEqual([{ label: 'Tithes & Offering', amount: 3000 }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: FAIL — GCash amounts appear under `Tithes & Offering` and no `Gcash` line is produced.

- [ ] **Step 3: Write the implementation**

In `frontend/src/utils/sundaySummary.js`, add the label constant and the predicate next to `GCASH_FIELD`:

```js
/** Label for the Gcash line. Not taken from field defs — the field is retired. */
export const GCASH_LABEL = 'Gcash';

/** GCash money is any record whose payment method is GCash. */
export function isGcashRecord(record) {
  return String(record.payment_method || '').trim().toLowerCase() === 'gcash';
}
```

Then replace the whole `buildSummary` function with:

```js
export function buildSummary(records, fieldDefs, dateKey) {
  const forDate = (records || []).filter((record) => toDateKey(record.date) === dateKey);
  const fields = amountFields(fieldDefs);
  const gcashRecords = forDate.filter(isGcashRecord);
  const otherRecords = forDate.filter((record) => !isGcashRecord(record));

  const lines = [];
  fields.forEach((field) => {
    const amount = otherRecords.reduce((sum, record) => sum + readValue(record, field.field_name), 0);
    if (amount > 0) lines.push({ label: field.field_label, amount });
  });

  // Sum every field on a GCash record, not just tithes: records that predate
  // the mobile form restriction may carry amounts in other categories, and
  // those categories are never rendered for GCash records.
  const gcashAmount = gcashRecords.reduce((sum, record) => {
    const breakdown = fields.reduce((inner, field) => inner + readValue(record, field.field_name), 0);
    return sum + (breakdown > 0 ? breakdown : Number(record.total_amount) || 0);
  }, 0);
  if (gcashAmount > 0) lines.push({ label: GCASH_LABEL, amount: gcashAmount });

  return { dateKey, lines, total: 0, unattributed: 0 };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: PASS, 22 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sundaySummary.js frontend/src/utils/sundaySummary.test.js
git commit -m "feat: report GCash records on their own summary line"
```

---

## Task 5: Total and unattributed

**Files:**
- Modify: `frontend/src/utils/sundaySummary.js`
- Test: `frontend/src/utils/sundaySummary.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/utils/sundaySummary.test.js`:

```js
describe('buildSummary — total and unattributed', () => {
  test('total is the sum of the rendered lines', () => {
    const records = [
      cash({ general_tithes_offering: 18100, sunday_school: 166, total_amount: 18266 }),
      gcash({ general_tithes_offering: 2000, total_amount: 2000 }),
    ];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').total).toBe(20266);
  });

  test('total ignores a stale stored total_amount', () => {
    const records = [cash({ general_tithes_offering: 3000, total_amount: 5000 })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').total).toBe(3000);
  });

  test('unattributed reports money the lines do not account for', () => {
    // Legacy record 7: total 5000 includes 2000 of retired gcash.
    const records = [cash({ general_tithes_offering: 3000, total_amount: 5000 })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').unattributed).toBe(2000);
  });

  test('unattributed is negative when the stored total understates the lines', () => {
    const records = [cash({ general_tithes_offering: 3000, total_amount: 0 })];
    expect(buildSummary(records, FIELD_DEFS, '2026-08-02').unattributed).toBe(-3000);
  });

  test('a date with no records is empty, not an error', () => {
    const summary = buildSummary([], FIELD_DEFS, '2026-08-02');
    expect(summary).toEqual({ dateKey: '2026-08-02', lines: [], total: 0, unattributed: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: FAIL — `total` is hardcoded to `0`.

- [ ] **Step 3: Write the implementation**

In `frontend/src/utils/sundaySummary.js`, replace the `return` statement at the end of `buildSummary` with:

```js
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const recorded = forDate.reduce((sum, record) => sum + (Number(record.total_amount) || 0), 0);

  // Can be negative: records saved before the gcash field was retired have a
  // total_amount that already omits the amount. Only a positive gap is a
  // warning worth showing — see the shells.
  return { dateKey, lines, total, unattributed: recorded - total };
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: PASS, 27 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sundaySummary.js frontend/src/utils/sundaySummary.test.js
git commit -m "feat: total the summary lines and flag unattributed money"
```

---

## Task 6: The message text

**Files:**
- Modify: `frontend/src/utils/sundaySummary.js`
- Test: `frontend/src/utils/sundaySummary.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/utils/sundaySummary.test.js`, adding `formatSummaryText` and `formatPeso` to the top-level import:

```js
describe('formatPeso', () => {
  test('groups thousands and always shows two decimals', () => {
    expect(formatPeso(18100)).toBe('18,100.00');
    expect(formatPeso(166)).toBe('166.00');
    expect(formatPeso(0)).toBe('0.00');
    expect(formatPeso(1234.5)).toBe('1,234.50');
  });
});

describe('formatSummaryText', () => {
  test('renders the exact message the treasurer pastes', () => {
    const records = [
      cash({
        general_tithes_offering: 18100, sisterhood_san_juan: 350, sunday_school: 166,
        total_amount: 18616,
      }),
      gcash({ general_tithes_offering: 2000, total_amount: 2000 }),
    ];
    const summary = buildSummary(records, FIELD_DEFS, '2026-08-02');

    expect(formatSummaryText(summary)).toBe(
      'SBCC SUNDAY COLLECTION\n' +
      'Date : AUGUST 02, 2026\n' +
      '\n' +
      'Tithes & Offering - Php 18,100.00\n' +
      '\n' +
      'Sisterhood San Juan - Php 350.00\n' +
      '\n' +
      'Sunday School - Php 166.00\n' +
      '\n' +
      'Gcash - Php 2,000.00\n' +
      '\n' +
      'Total Collection: Php 20,616.00\n' +
      '\n' +
      'Papuri po sa Panginoon sa inyong pakikiisa sa pagdalo at pagtatapat sa pagkakaloob!'
    );
  });

  test('still renders heading, total and closing when there are no lines', () => {
    const text = formatSummaryText(buildSummary([], FIELD_DEFS, '2026-08-02'));
    expect(text).toContain('SBCC SUNDAY COLLECTION');
    expect(text).toContain('Total Collection: Php 0.00');
    expect(text).toContain('Papuri po sa Panginoon');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: FAIL — `formatSummaryText is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `frontend/src/utils/sundaySummary.js`:

```js
export const CLOSING_LINE =
  'Papuri po sa Panginoon sa inyong pakikiisa sa pagdalo at pagtatapat sa pagkakaloob!';

/** 18100 -> '18,100.00' */
export function formatPeso(amount) {
  return Number(amount || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Render the message, one blank line between every block. */
export function formatSummaryText(summary) {
  const blocks = [
    `SBCC SUNDAY COLLECTION\nDate : ${formatDateHeading(summary.dateKey)}`,
    ...summary.lines.map((line) => `${line.label} - Php ${formatPeso(line.amount)}`),
    `Total Collection: Php ${formatPeso(summary.total)}`,
    CLOSING_LINE,
  ];
  return blocks.join('\n\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: PASS, 30 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/sundaySummary.js frontend/src/utils/sundaySummary.test.js
git commit -m "feat: format the Sunday collection message text"
```

---

## Task 7: The calendar

**Files:**
- Create: `frontend/src/components/CollectionDateCalendar.js`
- Test: `frontend/src/components/CollectionDateCalendar.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/CollectionDateCalendar.test.js`:

```js
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CollectionDateCalendar from './CollectionDateCalendar';

const baseProps = {
  year: 2026,
  month: 8,
  availableDates: new Set(['2026-08-02', '2026-08-09']),
  selectedDate: '2026-08-02',
  onSelect: jest.fn(),
  onMonthChange: jest.fn(),
};

test('shows the month and year', () => {
  render(<CollectionDateCalendar {...baseProps} />);
  expect(screen.getByText('AUGUST 2026')).toBeInTheDocument();
});

test('dates with records are clickable', () => {
  const onSelect = jest.fn();
  render(<CollectionDateCalendar {...baseProps} onSelect={onSelect} />);
  fireEvent.click(screen.getByRole('button', { name: 'August 9, 2026' }));
  expect(onSelect).toHaveBeenCalledWith('2026-08-09');
});

test('dates without records are disabled and do not fire onSelect', () => {
  const onSelect = jest.fn();
  render(<CollectionDateCalendar {...baseProps} onSelect={onSelect} />);
  const day3 = screen.getByRole('button', { name: 'August 3, 2026' });
  expect(day3).toBeDisabled();
  fireEvent.click(day3);
  expect(onSelect).not.toHaveBeenCalled();
});

test('marks the selected date', () => {
  render(<CollectionDateCalendar {...baseProps} />);
  expect(screen.getByRole('button', { name: 'August 2, 2026' }))
    .toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'August 9, 2026' }))
    .toHaveAttribute('aria-pressed', 'false');
});

test('paging back goes to the previous month', () => {
  const onMonthChange = jest.fn();
  render(<CollectionDateCalendar {...baseProps} onMonthChange={onMonthChange} />);
  fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
  expect(onMonthChange).toHaveBeenCalledWith(2026, 7);
});

test('paging forward past December rolls into January', () => {
  const onMonthChange = jest.fn();
  render(<CollectionDateCalendar {...baseProps} year={2026} month={12} onMonthChange={onMonthChange} />);
  fireEvent.click(screen.getByRole('button', { name: /next month/i }));
  expect(onMonthChange).toHaveBeenCalledWith(2027, 1);
});

test('renders every day of the month', () => {
  render(<CollectionDateCalendar {...baseProps} year={2026} month={2} />);
  expect(screen.getByRole('button', { name: 'February 28, 2026' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'February 29, 2026' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=CollectionDateCalendar
```

Expected: FAIL — `Cannot find module './CollectionDateCalendar'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/CollectionDateCalendar.js`:

```js
import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTH_TITLES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Two palettes rather than two components: the desktop modal is slate/blue,
// the mobile tab is the gold theme used across the phone UI.
const PALETTES = {
  desktop: { accent: '#2563eb', accentText: '#ffffff', available: '#1e293b', availableBg: '#eff6ff', muted: '#cbd5e1', heading: '#0f172a', border: '#e2e8f0' },
  mobile: { accent: '#c49030', accentText: '#fff8e6', available: '#8a6028', availableBg: 'rgba(196,144,48,0.10)', muted: '#d8c9a4', heading: '#3d2a08', border: '#f0e4b0' },
};

export default function CollectionDateCalendar({
  year, month, availableDates, selectedDate, onSelect, onMonthChange, variant = 'desktop',
}) {
  const palette = PALETTES[variant] || PALETTES.desktop;

  // Built from numbers, never from an ISO string — see toDateKey in sundaySummary.
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  const keyFor = (day) =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const step = (delta) => {
    const next = new Date(year, month - 1 + delta, 1);
    onMonthChange(next.getFullYear(), next.getMonth() + 1);
  };

  const arrowStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 28, height: 28, borderRadius: 8,
    background: 'transparent', border: `1px solid ${palette.border}`,
    color: palette.heading, cursor: 'pointer', padding: 0,
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button type="button" aria-label="Previous month" onClick={() => step(-1)} style={arrowStyle}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: palette.heading }}>
          {MONTH_TITLES[month - 1].toUpperCase()} {year}
        </span>
        <button type="button" aria-label="Next month" onClick={() => step(1)} style={arrowStyle}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {DAY_LABELS.map((label) => (
          <span key={label} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600, color: palette.muted, paddingBottom: 4 }}>
            {label}
          </span>
        ))}

        {cells.map((day, index) => {
          if (day === null) return <span key={`blank-${index}`} />;

          const key = keyFor(day);
          const hasRecords = availableDates.has(key);
          const isSelected = key === selectedDate;

          return (
            <button
              key={key}
              type="button"
              disabled={!hasRecords}
              aria-pressed={isSelected}
              aria-label={`${MONTH_TITLES[month - 1]} ${day}, ${year}`}
              onClick={() => onSelect(key)}
              style={{
                height: 32, borderRadius: 8, fontSize: 12, padding: 0,
                fontWeight: hasRecords ? 600 : 400,
                fontFamily: 'inherit',
                cursor: hasRecords ? 'pointer' : 'default',
                color: isSelected ? palette.accentText : (hasRecords ? palette.available : palette.muted),
                background: isSelected ? palette.accent : (hasRecords ? palette.availableBg : 'transparent'),
                border: `1px solid ${hasRecords && !isSelected ? palette.border : 'transparent'}`,
              }}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npm test -- --testPathPattern=CollectionDateCalendar
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CollectionDateCalendar.js frontend/src/components/CollectionDateCalendar.test.js
git commit -m "feat: add a calendar that only enables dates with records"
```

---

## Task 8: The shared hook

**Files:**
- Create: `frontend/src/hooks/useSundaySummary.js`

No dedicated test file — the hook is covered end-to-end by the two shell test suites in Tasks 9 and 11, which exercise it through real user interactions.

- [ ] **Step 1: Write the implementation**

Create `frontend/src/hooks/useSundaySummary.js`:

```js
import { useState, useEffect, useCallback } from 'react';
import apiService from '../utils/api';
import { buildSummary, collectionDatesInMonth, formatSummaryText } from '../utils/sundaySummary';

/** Clipboard fallback for browsers without the async clipboard API. */
function legacyCopy(text) {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch (err) {
    return false;
  }
}

/**
 * Owns everything the two summary shells share: the month fetch, the set of
 * selectable dates, the generated message, and clipboard access.
 *
 * @param {boolean} isActive - false while the modal is closed or the tab is
 *   hidden, so nothing is fetched until it is on screen.
 */
export default function useSundaySummary(isActive) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [records, setRecords] = useState([]);
  const [fieldDefs, setFieldDefs] = useState([]);
  const [availableDates, setAvailableDates] = useState(() => new Set());
  const [selectedDate, setSelectedDate] = useState(null);
  const [summary, setSummary] = useState(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isActive) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [defs, rows] = await Promise.all([
          apiService.getCustomFields('collections'),
          apiService.getCollections({
            month: String(month).padStart(2, '0'),
            year: String(year),
          }),
        ]);
        if (cancelled) return;
        setFieldDefs(defs || []);
        setRecords(rows || []);
        const dates = collectionDatesInMonth(rows);
        setAvailableDates(dates);
        // Latest date in the month — normally the Sunday just recorded.
        setSelectedDate([...dates].sort().pop() || null);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load collections');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isActive, year, month]);

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

  const changeMonth = useCallback((nextYear, nextMonth) => {
    setYear(nextYear);
    setMonth(nextMonth);
  }, []);

  const copy = useCallback(async () => {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        // Permission denied or insecure context — fall through.
      }
    }
    return legacyCopy(text);
  }, [text]);

  return {
    year, month, changeMonth,
    availableDates, selectedDate, setSelectedDate,
    summary, text, setText,
    loading, error, copy,
  };
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && CI=true npm test -- --testPathPattern=sundaySummary
```

Expected: PASS, 30 tests (the existing suite still runs; the new file has no test of its own yet and must not break the build).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useSundaySummary.js
git commit -m "feat: add the shared Sunday summary hook"
```

---

## Task 9: Desktop modal

**Files:**
- Create: `frontend/src/components/SundayCollectionModal.js`
- Test: `frontend/src/components/SundayCollectionModal.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/SundayCollectionModal.test.js`:

```js
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SundayCollectionModal from './SundayCollectionModal';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  __esModule: true,
  default: { getCollections: jest.fn(), getCustomFields: jest.fn() },
}));

const FIELD_DEFS = [
  { field_name: 'general_tithes_offering', field_label: 'Tithes & Offering', field_type: 'decimal', display_order: 0, is_active: 1 },
  { field_name: 'sunday_school', field_label: 'Sunday School', field_type: 'decimal', display_order: 7, is_active: 1 },
];

const RECORDS = [
  { id: 1, date: '2026-08-02', payment_method: 'Cash', total_amount: 18266, general_tithes_offering: 18100, sunday_school: 166, custom_fields: {} },
  { id: 2, date: '2026-08-02', payment_method: 'GCash', total_amount: 2000, general_tithes_offering: 2000, sunday_school: 0, custom_fields: {} },
  { id: 3, date: '2026-08-09', payment_method: 'Cash', total_amount: 500, general_tithes_offering: 500, sunday_school: 0, custom_fields: {} },
];

let writeText;

beforeEach(() => {
  // resetMocks is on: return values must be set here, not in the factory.
  apiService.getCustomFields.mockResolvedValue(FIELD_DEFS);
  apiService.getCollections.mockResolvedValue(RECORDS);
  jest.useFakeTimers().setSystemTime(new Date(2026, 7, 10));
  writeText = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

afterEach(() => {
  jest.useRealTimers();
});

const openModal = async () => {
  render(<SundayCollectionModal isOpen onClose={jest.fn()} />);
  await waitFor(() => expect(apiService.getCollections).toHaveBeenCalled());
};

test('renders nothing when closed', () => {
  const { container } = render(<SundayCollectionModal isOpen={false} onClose={jest.fn()} />);
  expect(container).toBeEmptyDOMElement();
  expect(apiService.getCollections).not.toHaveBeenCalled();
});

test('fetches the current month', async () => {
  await openModal();
  expect(apiService.getCollections).toHaveBeenCalledWith({ month: '08', year: '2026' });
});

test('preselects the latest date with records and renders its message', async () => {
  await openModal();
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  expect(box.value).toContain('Date : AUGUST 09, 2026');
  expect(box.value).toContain('Tithes & Offering - Php 500.00');
});

test('selecting a date rebuilds the message', async () => {
  await openModal();
  fireEvent.click(await screen.findByRole('button', { name: 'August 2, 2026' }));
  const box = screen.getByRole('textbox', { name: /collection message/i });
  expect(box.value).toContain('Tithes & Offering - Php 18,100.00');
  expect(box.value).toContain('Sunday School - Php 166.00');
  expect(box.value).toContain('Gcash - Php 2,000.00');
  expect(box.value).toContain('Total Collection: Php 20,266.00');
});

test('copies the current contents of the box, including manual edits', async () => {
  await openModal();
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  fireEvent.change(box, { target: { value: 'Edited by hand\n\nAttendance: Adult- 128' } });
  fireEvent.click(screen.getByRole('button', { name: /^copy/i }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('Edited by hand\n\nAttendance: Adult- 128'));
});

test('confirms the copy', async () => {
  await openModal();
  await screen.findByRole('textbox', { name: /collection message/i });
  fireEvent.click(screen.getByRole('button', { name: /^copy/i }));
  expect(await screen.findByRole('button', { name: /copied/i })).toBeInTheDocument();
});

test('warns when records hold money the lines do not account for', async () => {
  apiService.getCollections.mockResolvedValue([
    { id: 4, date: '2026-08-02', payment_method: 'Cash', total_amount: 5000, general_tithes_offering: 3000, sunday_school: 0, custom_fields: { gcash: 2000 } },
  ]);
  await openModal();
  expect(await screen.findByText(/no category breakdown \(Php 2,000.00\)/i)).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: /collection message/i }).value)
    .not.toContain('no category breakdown');
});

test('shows an empty state for a month with no records', async () => {
  apiService.getCollections.mockResolvedValue([]);
  await openModal();
  expect(await screen.findByText(/No collections recorded in this month/i)).toBeInTheDocument();
});

test('tells the user to copy by hand when both clipboard paths fail', async () => {
  Object.assign(navigator, { clipboard: undefined });
  document.execCommand = jest.fn().mockReturnValue(false);
  await openModal();
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  box.select = jest.fn();
  fireEvent.click(screen.getByRole('button', { name: /^copy/i }));
  expect(await screen.findByText(/press and hold to copy/i)).toBeInTheDocument();
  expect(box.select).toHaveBeenCalled();
});

test('surfaces a fetch failure', async () => {
  apiService.getCollections.mockRejectedValue(new Error('Failed to fetch collections'));
  await openModal();
  expect(await screen.findByText(/Failed to fetch collections/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=SundayCollectionModal
```

Expected: FAIL — `Cannot find module './SundayCollectionModal'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/SundayCollectionModal.js`:

```js
import React, { useState, useRef } from 'react';
import { X, ClipboardCopy, Check, AlertTriangle } from 'lucide-react';
import useSundaySummary from '../hooks/useSundaySummary';
import { formatPeso } from '../utils/sundaySummary';
import CollectionDateCalendar from './CollectionDateCalendar';

const SundayCollectionModal = ({ isOpen, onClose }) => {
  const {
    year, month, changeMonth, availableDates, selectedDate, setSelectedDate,
    summary, text, setText, loading, error, copy,
  } = useSundaySummary(isOpen);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const textRef = useRef(null);

  if (!isOpen) return null;

  const handleCopy = async () => {
    const ok = await copy();
    setCopied(ok);
    setCopyFailed(!ok);
    // Both clipboard paths refused — select the text so the user can copy by hand.
    if (ok) setTimeout(() => setCopied(false), 2000);
    else textRef.current?.select();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">Sunday Collection</h2>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <CollectionDateCalendar
            year={year}
            month={month}
            availableDates={availableDates}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
            onMonthChange={changeMonth}
            variant="desktop"
          />

          {loading && <p className="text-xs text-slate-400">Loading collections…</p>}
          {error && <p className="text-xs text-red-600">{error}</p>}

          {!loading && !error && !selectedDate && (
            <div className="flex items-center justify-center h-24 text-slate-400 border border-dashed border-slate-200 rounded-lg">
              <p className="text-xs">No collections recorded in this month</p>
            </div>
          )}

          {selectedDate && (
            <>
              {summary?.unattributed > 0 && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    Some records for this date have no category breakdown
                    (Php {formatPeso(summary.unattributed)}) — check the records.
                  </span>
                </p>
              )}

              <textarea
                ref={textRef}
                aria-label="Collection message"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={16}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              <p className="text-xs text-slate-400">
                {copyFailed
                  ? 'Press and hold to copy.'
                  : 'Edit anything you like before copying — add the attendance line here.'}
              </p>
            </>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-200">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition">
            Close
          </button>
          <button
            onClick={handleCopy}
            disabled={!selectedDate}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {copied ? <Check className="w-4 h-4" /> : <ClipboardCopy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SundayCollectionModal;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npm test -- --testPathPattern=SundayCollectionModal
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SundayCollectionModal.js frontend/src/components/SundayCollectionModal.test.js
git commit -m "feat: add the desktop Sunday collection summary modal"
```

---

## Task 10: Wire the desktop sidebar, delete the print modal

**Files:**
- Modify: `frontend/src/components/Dashboard.js:10,46,74,164,346,864`
- Delete: `frontend/src/components/PrintReportModal.js`

- [ ] **Step 1: Swap the icon import**

In `frontend/src/components/Dashboard.js`, line 10, replace:

```js
  Printer,
```

with:

```js
  ClipboardCopy,
```

- [ ] **Step 2: Swap the component import**

Line 46, replace:

```js
import PrintReportModal from "./PrintReportModal";
```

with:

```js
import SundayCollectionModal from "./SundayCollectionModal";
```

- [ ] **Step 3: Rename the state**

Line 74, replace:

```js
  const [showPrintModal, setShowPrintModal] = useState(false);
```

with:

```js
  const [showSummaryModal, setShowSummaryModal] = useState(false);
```

- [ ] **Step 4: Rename the handler**

Line 164, replace:

```js
  const handlePrint = () => { setShowPrintModal(true); };
```

with:

```js
  const handleShowSummary = () => { setShowSummaryModal(true); };
```

- [ ] **Step 5: Update the sidebar entry**

Line 346, replace:

```js
        { id: "print", label: "Print Report", icon: Printer, onClick: handlePrint, active: false },
```

with:

```js
        { id: "summary", label: "Sunday Collection", icon: ClipboardCopy, onClick: handleShowSummary, active: false },
```

- [ ] **Step 6: Update the render**

Line 864, replace:

```js
      <PrintReportModal isOpen={showPrintModal} onClose={() => setShowPrintModal(false)} user={user} />
```

with:

```js
      <SundayCollectionModal isOpen={showSummaryModal} onClose={() => setShowSummaryModal(false)} />
```

- [ ] **Step 7: Delete the print modal**

```bash
git rm frontend/src/components/PrintReportModal.js
```

- [ ] **Step 8: Verify nothing still references it**

```bash
cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system && grep -rn "PrintReportModal\|showPrintModal\|handlePrint" frontend/src
```

Expected: no output.

- [ ] **Step 9: Run the full frontend suite**

```bash
cd frontend && CI=true npm test
```

Expected: PASS. `HelpGuide.test.js` still passes at this point — its copy changes in Task 14.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/Dashboard.js
git commit -m "feat: replace Print Report with Sunday Collection in the sidebar"
```

---

## Task 11: Mobile summary tab

**Files:**
- Create: `frontend/src/components/mobile/MobileSummary.js`
- Test: `frontend/src/components/mobile/MobileSummary.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/mobile/MobileSummary.test.js`:

```js
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MobileSummary from './MobileSummary';
import apiService from '../../utils/api';

jest.mock('../../utils/api', () => ({
  __esModule: true,
  default: { getCollections: jest.fn(), getCustomFields: jest.fn() },
}));

const FIELD_DEFS = [
  { field_name: 'general_tithes_offering', field_label: 'Tithes & Offering', field_type: 'decimal', display_order: 0, is_active: 1 },
];

const RECORDS = [
  { id: 1, date: '2026-08-02', payment_method: 'Cash', total_amount: 18100, general_tithes_offering: 18100, custom_fields: {} },
  { id: 2, date: '2026-08-02', payment_method: 'GCash', total_amount: 2000, general_tithes_offering: 2000, custom_fields: {} },
];

let writeText;

beforeEach(() => {
  apiService.getCustomFields.mockResolvedValue(FIELD_DEFS);
  apiService.getCollections.mockResolvedValue(RECORDS);
  jest.useFakeTimers().setSystemTime(new Date(2026, 7, 10));
  writeText = jest.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

afterEach(() => {
  jest.useRealTimers();
});

test('renders the message for the latest date with records', async () => {
  render(<MobileSummary />);
  const box = await screen.findByRole('textbox', { name: /collection message/i });
  await waitFor(() => expect(box.value).toContain('Date : AUGUST 02, 2026'));
  expect(box.value).toContain('Tithes & Offering - Php 18,100.00');
  expect(box.value).toContain('Gcash - Php 2,000.00');
});

test('copies the message', async () => {
  render(<MobileSummary />);
  await screen.findByRole('textbox', { name: /collection message/i });
  fireEvent.click(screen.getByRole('button', { name: /^copy/i }));
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  expect(writeText.mock.calls[0][0]).toContain('SBCC SUNDAY COLLECTION');
});

test('falls back to execCommand when the clipboard API is unavailable', async () => {
  Object.assign(navigator, { clipboard: undefined });
  document.execCommand = jest.fn().mockReturnValue(true);
  render(<MobileSummary />);
  await screen.findByRole('textbox', { name: /collection message/i });
  fireEvent.click(screen.getByRole('button', { name: /^copy/i }));
  await waitFor(() => expect(document.execCommand).toHaveBeenCalledWith('copy'));
});

test('shows the empty state for a month with no records', async () => {
  apiService.getCollections.mockResolvedValue([]);
  render(<MobileSummary />);
  expect(await screen.findByText(/No collections recorded in this month/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=MobileSummary
```

Expected: FAIL — `Cannot find module './MobileSummary'`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/components/mobile/MobileSummary.js`:

```js
import React, { useState, useRef } from 'react';
import { ClipboardCopy, Check, AlertTriangle } from 'lucide-react';
import useSundaySummary from '../../hooks/useSundaySummary';
import { formatPeso } from '../../utils/sundaySummary';
import CollectionDateCalendar from '../CollectionDateCalendar';

const CARD = {
  background: '#fff8e6',
  border: '1px solid #f0e4b0',
  borderRadius: 14,
  padding: 14,
};

export default function MobileSummary() {
  const {
    year, month, changeMonth, availableDates, selectedDate, setSelectedDate,
    summary, text, setText, loading, error, copy,
  } = useSundaySummary(true);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const textRef = useRef(null);

  const handleCopy = async () => {
    const ok = await copy();
    setCopied(ok);
    setCopyFailed(!ok);
    // Both clipboard paths refused — select the text so the user can copy by hand.
    if (ok) setTimeout(() => setCopied(false), 2000);
    else textRef.current?.select();
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 13 }}>
        <div style={CARD}>
          <CollectionDateCalendar
            year={year}
            month={month}
            availableDates={availableDates}
            selectedDate={selectedDate}
            onSelect={setSelectedDate}
            onMonthChange={changeMonth}
            variant="mobile"
          />
        </div>

        {loading && <p style={{ margin: 0, fontSize: 13, color: '#b89048', textAlign: 'center' }}>Loading collections…</p>}
        {error && <p style={{ margin: 0, fontSize: 13, color: '#b4471f' }}>{error}</p>}

        {!loading && !error && !selectedDate && (
          <p style={{ margin: 0, fontSize: 13, color: '#b89048', textAlign: 'center' }}>
            No collections recorded in this month
          </p>
        )}

        {selectedDate && (
          <>
            {summary?.unattributed > 0 && (
              <p style={{ margin: 0, display: 'flex', gap: 6, fontSize: 12, color: '#8a6028', lineHeight: 1.5 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Some records for this date have no category breakdown
                  (Php {formatPeso(summary.unattributed)}) — check the records.
                </span>
              </p>
            )}

            <textarea
              ref={textRef}
              className="mobile-input"
              aria-label="Collection message"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={16}
              style={{ resize: 'none', lineHeight: 1.6, fontSize: 13 }}
            />
            <p style={{ margin: 0, fontSize: 11, color: '#b89048' }}>
              {copyFailed
                ? 'Press and hold to copy.'
                : 'Edit before copying — add the attendance line here.'}
            </p>
          </>
        )}
      </div>

      <div
        className="mobile-footer-safe"
        style={{ flexShrink: 0, background: '#fef3d0', borderTop: '1.5px solid #e8d090', padding: '14px 16px' }}
      >
        <button
          onClick={handleCopy}
          disabled={!selectedDate}
          style={{
            width: '100%', height: 48, borderRadius: 13,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: selectedDate ? '#c49030' : '#e8d090',
            border: 'none', color: '#fff8e6',
            fontSize: 15, fontWeight: 600, fontFamily: 'inherit',
            cursor: selectedDate ? 'pointer' : 'default',
          }}
        >
          {copied ? <Check size={18} /> : <ClipboardCopy size={18} />}
          {copied ? 'Copied!' : 'Copy message'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npm test -- --testPathPattern=MobileSummary
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/mobile/MobileSummary.js frontend/src/components/mobile/MobileSummary.test.js
git commit -m "feat: add the mobile Sunday collection summary tab"
```

---

## Task 12: Third mobile tab

**Files:**
- Modify: `frontend/src/components/mobile/MobileLayout.js:2,3-6,148-168,174-183`
- Test: `frontend/src/components/mobile/MobileLayout.test.js`

- [ ] **Step 1: Add `getCollections` to the existing mock**

The Summary tab calls `getCollections` on mount and the file's mock does not have it yet. In `frontend/src/components/mobile/MobileLayout.test.js`, replace lines 7–11:

```js
jest.mock('../../utils/api', () => ({
  getCustomFields: jest.fn(),
  submitForMobile: jest.fn(),
  getRecentEntries: jest.fn(),
}));
```

with:

```js
jest.mock('../../utils/api', () => ({
  getCustomFields: jest.fn(),
  submitForMobile: jest.fn(),
  getRecentEntries: jest.fn(),
  getCollections: jest.fn(),
}));
```

and in the existing `beforeEach`, after `apiService.getRecentEntries.mockResolvedValue([]);`, add:

```js
  apiService.getCollections.mockResolvedValue([
    { id: 1, date: '2026-08-02', payment_method: 'Cash', total_amount: 18100, general_tithes_offering: 18100, custom_fields: {} },
  ]);
```

- [ ] **Step 2: Write the failing test**

Append to `frontend/src/components/mobile/MobileLayout.test.js`:

```js
test('switches to the Summary tab', async () => {
  render(<MobileLayout user={user} onLogout={jest.fn()} />);
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());

  fireEvent.click(screen.getByText('Summary'));

  // Asserts on the Copy button, not the message: the calendar opens on the
  // real current month, so which dates are selectable depends on the clock.
  // Message rendering is covered properly in MobileSummary.test.js.
  expect(await screen.findByRole('button', { name: /copy message/i })).toBeInTheDocument();
  expect(screen.queryByLabelText(/General Tithes/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=MobileLayout
```

Expected: FAIL — `Unable to find an element with the text: Summary`.

- [ ] **Step 4: Add the import**

In `frontend/src/components/mobile/MobileLayout.js`, line 2, replace:

```js
import { PlusCircle, Clock, HelpCircle } from 'lucide-react';
```

with:

```js
import { PlusCircle, Clock, ClipboardCopy, HelpCircle } from 'lucide-react';
```

And after line 5 (`import MobileRecentList from './MobileRecentList';`) add:

```js
import MobileSummary from './MobileSummary';
```

- [ ] **Step 5: Add the tab button**

In the `data-testid="mobile-tab-bar"` div, after the Recent button's closing `</button>`, add:

```jsx
          <button style={tabStyle(tab === 'summary')} onClick={() => setTab('summary')}>
            <ClipboardCopy size={22} style={{ color: tab === 'summary' ? '#c49030' : '#b89048', opacity: tab === 'summary' ? 1 : 0.55 }} />
            <span style={tabLabel(tab === 'summary')}>Summary</span>
          </button>
```

- [ ] **Step 6: Render the tab**

Replace the content block (the `{tab === 'submit' ? ... : ...}` ternary) with:

```jsx
        {tab === 'submit' && (
          <MobileSubmitForm
            user={user}
            onSubmitted={handleSubmitted}
            prefill={prefill}
            onPrefillConsumed={() => setPrefill(null)}
          />
        )}
        {tab === 'recent' && (
          <MobileRecentList
            onQueueChange={handleQueueChange}
            onAddSupplement={handleAddSupplement}
          />
        )}
        {tab === 'summary' && <MobileSummary />}
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd frontend && CI=true npm test -- --testPathPattern=MobileLayout
```

Expected: PASS, all tests in the file.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/mobile/MobileLayout.js frontend/src/components/mobile/MobileLayout.test.js
git commit -m "feat: add the Summary tab to the mobile layout"
```

---

## Task 13: GCash restricts the mobile form

**Files:**
- Modify: `frontend/src/components/mobile/MobileSubmitForm.js:80-120,365-377,415-432`
- Test: `frontend/src/components/mobile/MobileSubmitForm.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/mobile/MobileSubmitForm.test.js`. Note the file's existing `beforeEach` returns only one field definition — these tests need more, so set a richer list inside them:

```js
const MULTI_FIELDS = [
  { field_name: 'general_tithes_offering', field_label: 'General Tithes & Offering', field_type: 'decimal', display_order: 0, is_active: 1 },
  { field_name: 'sunday_school', field_label: 'Sunday School', field_type: 'decimal', display_order: 7, is_active: 1 },
];

const renderWithFields = async (props = {}) => {
  apiService.getCustomFields.mockResolvedValue(MULTI_FIELDS);
  render(<MobileSubmitForm user={user} onSubmitted={jest.fn()} {...props} />);
  await waitFor(() => expect(screen.getByLabelText(/General Tithes/i)).toBeInTheDocument());
};

const selectGcash = () =>
  fireEvent.change(screen.getByLabelText(/Payment/i), { target: { value: 'GCash' } });

test('GCash leaves only General Tithes & Offering enabled', async () => {
  await renderWithFields();
  selectGcash();
  expect(screen.getByLabelText(/General Tithes/i)).toBeEnabled();
  expect(screen.getByLabelText(/Sunday School/i)).toBeDisabled();
});

test('GCash clears amounts already typed into other fields', async () => {
  await renderWithFields();
  fireEvent.change(screen.getByLabelText(/Sunday School/i), { target: { value: '166' } });
  selectGcash();
  expect(screen.getByLabelText(/Sunday School/i)).toHaveValue('');
});

test('the submitted payload carries no stale amounts after switching to GCash', async () => {
  apiService.submitForMobile.mockResolvedValue({ status: 'success', data: { id: 1 } });
  await renderWithFields();
  fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: '2026-08-02' } });
  fireEvent.change(screen.getByLabelText(/Sunday School/i), { target: { value: '166' } });
  selectGcash();
  fireEvent.change(screen.getByLabelText(/General Tithes/i), { target: { value: '2000' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit/i }));

  await waitFor(() => expect(apiService.submitForMobile).toHaveBeenCalled());
  const payload = apiService.submitForMobile.mock.calls[0][1];
  expect(payload.sunday_school).toBe('');
  expect(payload.general_tithes_offering).toBe('2000');
  expect(payload.payment_method).toBe('GCash');
});

test('switching back to Cash re-enables every field', async () => {
  await renderWithFields();
  selectGcash();
  fireEvent.change(screen.getByLabelText(/Payment/i), { target: { value: 'Cash' } });
  expect(screen.getByLabelText(/Sunday School/i)).toBeEnabled();
});

test('Check and Bank Transfer leave every field enabled', async () => {
  await renderWithFields();
  fireEvent.change(screen.getByLabelText(/Payment/i), { target: { value: 'Check' } });
  expect(screen.getByLabelText(/Sunday School/i)).toBeEnabled();
  fireEvent.change(screen.getByLabelText(/Payment/i), { target: { value: 'Bank Transfer' } });
  expect(screen.getByLabelText(/Sunday School/i)).toBeEnabled();
});

test('the denomination calculator is hidden on disabled fields', async () => {
  await renderWithFields();
  expect(screen.getAllByTitle(/denomination calculator/i)).toHaveLength(2);
  selectGcash();
  expect(screen.getAllByTitle(/denomination calculator/i)).toHaveLength(1);
});

test('explains why the fields are locked', async () => {
  await renderWithFields();
  selectGcash();
  expect(screen.getByText(/GCash entries are recorded as Tithes & Offering/i)).toBeInTheDocument();
});

test('the Add GCash prefill arrives already restricted', async () => {
  await renderWithFields({ prefill: { date: '2026-08-02', payment_method: 'GCash' }, onPrefillConsumed: jest.fn() });
  await waitFor(() => expect(screen.getByLabelText(/Sunday School/i)).toBeDisabled());
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=MobileSubmitForm
```

Expected: FAIL — `Sunday School` is enabled after selecting GCash.

- [ ] **Step 3: Teach `BreakdownField` to be disabled**

In `frontend/src/components/mobile/MobileSubmitForm.js`, replace the whole `BreakdownField` function with:

```js
function BreakdownField({ field, value, onChange, onOpenCalc, disabled }) {
  const hasValue = !disabled && value !== '' && value !== undefined && value !== null && Number(value) > 0;
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 11, fontWeight: 500,
        color: disabled ? '#c4a870' : '#8a6028', marginBottom: 5,
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {field.field_label}
        </span>
        {/* No calculator on a disabled field: it counts bills and coins, which
            is meaningless for a GCash transfer. */}
        {!disabled && (
          <button
            type="button"
            onClick={onOpenCalc}
            title="Open denomination calculator"
            style={{
              marginLeft: 5, flexShrink: 0,
              width: 22, height: 22, borderRadius: 6,
              background: 'rgba(196,144,48,0.10)',
              border: '1px solid #e8c870',
              color: '#c49030',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: 0,
              transition: 'all 0.15s',
            }}
          >
            <CalcIcon />
          </button>
        )}
      </span>
      <input
        className="mobile-input mono"
        name={field.field_name}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={disabled ? '—' : '0.00'}
        style={hasValue ? { borderColor: '#c49030', color: '#c49030' } : {}}
      />
    </label>
  );
}
```

- [ ] **Step 4: Add the restriction rule and clear-on-switch**

Add this constant just below the `EXPENSE_CATEGORIES` array near the top of the file:

```js
// GCash is offered for general tithes & offering and nothing else, so a GCash
// entry can only carry that one amount. Client-side guardrail only — legacy
// GCash records with other amounts must stay editable elsewhere.
const GCASH_ONLY_FIELD = 'general_tithes_offering';
```

Inside the component, immediately after `const handleChange = (e) => ...`, replace that one-line handler with:

```js
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      // Switching to GCash clears every other amount so no stale value is submitted.
      if (name === 'payment_method' && value === 'GCash') {
        collectionFields.forEach((field) => {
          if (field.field_name !== GCASH_ONLY_FIELD) next[field.field_name] = '';
        });
      }
      return next;
    });
  };

```

Then add the `gcashOnly` flag. It reads `isCollection`, which is declared on the line `const isCollection = type === 'collection';` above the `total` memo — so put this line immediately after that declaration, not next to `handleChange`:

```js
  const gcashOnly = isCollection && form.payment_method === 'GCash';
```

- [ ] **Step 5: Pass `disabled` to the fields**

In the Breakdown `CardSection`, replace the `<BreakdownField ... />` call with:

```jsx
                <BreakdownField
                  key={field.field_name}
                  field={field}
                  value={form[field.field_name] ?? ''}
                  onChange={handleChange}
                  onOpenCalc={() => setCalcField(field.field_name)}
                  disabled={gcashOnly && field.field_name !== GCASH_ONLY_FIELD}
                />
```

- [ ] **Step 6: Add the hint under the payment selector**

In the collection branch, replace the `<Field label="Payment">` block with:

```jsx
                <Field label="Payment">
                  <select className="mobile-input" name="payment_method" value={form.payment_method} onChange={handleChange}>
                    <option>Cash</option>
                    <option>Check</option>
                    <option>Bank Transfer</option>
                    <option>GCash</option>
                  </select>
                </Field>
```

and immediately after the closing `</div>` of the grid that contains it, add:

```jsx
              {gcashOnly && (
                <p style={{ margin: '-4px 0 0', fontSize: 11, color: '#b89048', lineHeight: 1.5 }}>
                  GCash entries are recorded as Tithes &amp; Offering.
                </p>
              )}
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd frontend && CI=true npm test -- --testPathPattern=MobileSubmitForm
```

Expected: PASS, all tests in the file including the 8 new ones.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/mobile/MobileSubmitForm.js frontend/src/components/mobile/MobileSubmitForm.test.js
git commit -m "feat: restrict GCash entries to tithes and offering"
```

---

## Task 14: Guide copy

**Files:**
- Modify: `frontend/src/content/guideContent.js:14,240-253`
- Modify: `frontend/src/components/HelpGuide.test.js:61-65`

- [ ] **Step 1: Update the failing assertion**

In `frontend/src/components/HelpGuide.test.js`, replace lines 61–64:

```js
  fireEvent.click(screen.getByRole('button', { name: /Printing a report/i }));

  expect(screen.getByText(/Open the app in your web browser/i)).toBeInTheDocument();
  expect(screen.getByText(/Set the month and year you want printed first/i)).toBeInTheDocument();
```

with:

```js
  fireEvent.click(screen.getByRole('button', { name: /Sending the collection to the group chat/i }));

  expect(screen.getByText(/Open the app in your web browser/i)).toBeInTheDocument();
  expect(screen.getByText(/Click Sunday Collection in the left menu/i)).toBeInTheDocument();
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npm test -- --testPathPattern=HelpGuide
```

Expected: FAIL — no button named `Sending the collection to the group chat`.

- [ ] **Step 3: Replace the desktop topic**

In `frontend/src/content/guideContent.js`, replace the whole `desktop-print-report` topic object (lines 239–253) with:

```js
  {
    id: 'desktop-sunday-collection',
    platform: 'desktop',
    group: 'Reports',
    minRole: 'user',
    icon: ClipboardCopy,
    title: 'Sending the collection to the group chat',
    summary: 'Copying the Sunday total to post in Messenger.',
    steps: [
      'Click Sunday Collection in the left menu.',
      'Pick the Sunday on the calendar. Only dates that already have collection records can be clicked.',
      'Check the message that appears — it lists each fund and the total.',
      'Type in the attendance line yourself if you want it, or edit any wording.',
      'Click Copy, then paste it into the group chat.',
    ],
    hint: 'Ang GCash ay may sariling linya kahit tithes din ito — ganoon lang ipinapakita sa mensahe.',
  },
```

- [ ] **Step 4: Swap the icon import**

Line 14, replace:

```js
  Printer,
```

with:

```js
  ClipboardCopy,
```

Then confirm `Printer` is not referenced anywhere else in the file:

```bash
cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system && grep -n "Printer" frontend/src/content/guideContent.js
```

Expected: no output. If a line appears, that topic keeps using `Printer` — restore the import alongside `ClipboardCopy`.

- [ ] **Step 5: Add the mobile topic**

In the same file, immediately after the `mobile-count-cash` topic object, add:

```js
  {
    id: 'mobile-sunday-collection',
    platform: 'mobile',
    group: 'Sending collections',
    minRole: 'user',
    icon: ClipboardCopy,
    title: 'Send the collection to the group chat',
    summary: 'Copying the Sunday total to post in Messenger.',
    steps: [
      'Tap the Summary tab.',
      'Tap the Sunday on the calendar. Only dates that already have records can be tapped.',
      'Read the message — it lists each fund and the total.',
      'Type in the attendance line yourself if you want it.',
      'Tap Copy message, open Messenger, and paste.',
    ],
    hint: 'Kung wala pang naka-record na collection sa araw na iyon, hindi ito matatap sa calendar.',
  },
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
cd frontend && CI=true npm test -- --testPathPattern="HelpGuide|MobileHelp"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/content/guideContent.js frontend/src/components/HelpGuide.test.js
git commit -m "docs: point the in-app guide at the Sunday collection summary"
```

---

## Task 15: Retire the `gcash` custom field

This is a configuration change, not code. It must be done in **every** environment that has the field — local SQLite and the deployed Postgres database.

- [ ] **Step 1: Confirm the field is still active locally**

```bash
cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system && sqlite3 -header database/church_financial.db \
  "select id, field_name, field_label, is_active from custom_fields where table_name='collections' and field_name='gcash';"
```

Expected: one row, `is_active` = `1`.

- [ ] **Step 2: Deactivate it through the app**

Sign in as an admin, open **Custom Fields** in the sidebar, find **GCash** under collections, and toggle it inactive. Use the UI rather than raw SQL so the change goes through the same path in every environment.

- [ ] **Step 3: Verify it is gone from the API response**

```bash
cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system && sqlite3 -header database/church_financial.db \
  "select field_name, is_active from custom_fields where table_name='collections' order by display_order;"
```

Expected: `gcash` shows `is_active` = `0`; the nine column-backed fields remain active.

- [ ] **Step 4: Verify the mobile form no longer offers it**

Start the app (`cd backend && npm run dev`, then `cd frontend && npm start`), open the mobile view, and confirm the Submit tab's Financial Breakdown no longer shows a GCash amount box.

- [ ] **Step 5: Verify a legacy record still reports correctly**

In the Sunday Collection view, page back to **October 2025** and select **October 7**. Record 7 stores `general_tithes_offering` 3,000 with a `total_amount` of 5,000 that includes 2,000 of retired `gcash`.

Expected: the message shows `Tithes & Offering - Php 3,000.00` and `Total Collection: Php 3,000.00`, and the warning strip reads `Some records for this date have no category breakdown (Php 2,000.00) — check the records.` This is correct behaviour — the gap is surfaced, not hidden.

- [ ] **Step 6: Repeat steps 2–3 against production**

Sign in to the deployed app as an admin and deactivate the same field there. The report excludes `gcash` by name regardless, so a missed environment degrades to a harmless duplicate input box on the mobile form rather than wrong numbers.

---

## Task 16 (severable): Persist flat custom-field amounts

**Nothing above depends on this task.** With `gcash` retired, every active custom field has a backing column, so no data is currently lost. Implement it to stop the next admin-created field from silently vanishing — or skip it and close the plan after Task 15.

**Files:**
- Modify: `backend/utils/customFieldsHelper.js`, `api/_lib/customFieldsHelper.js`
- Modify: `backend/routes/collections.js:57-215`, `api/collections.js:62-190`
- Test: `backend/utils/customFieldsHelper.test.js`, `backend/routes/collections.customFields.test.js`

- [ ] **Step 1: Write the failing helper test**

Create `backend/utils/customFieldsHelper.test.js`:

```js
const { collectCustomFieldInput } = require('./customFieldsHelper');

const FIELD_DEFS = [
  { field_name: 'general_tithes_offering', field_type: 'decimal' },
  { field_name: 'building_fund', field_type: 'decimal' },
  { field_name: 'payment_reference', field_type: 'text' },
];

describe('collectCustomFieldInput', () => {
  test('picks up flat top-level keys that match a field definition', () => {
    const body = { date: '2026-08-02', building_fund: '500', irrelevant: 'x' };
    expect(collectCustomFieldInput(body, FIELD_DEFS)).toEqual({ building_fund: '500' });
  });

  test('a nested custom_fields object still works', () => {
    const body = { date: '2026-08-02', custom_fields: { building_fund: '500' } };
    expect(collectCustomFieldInput(body, FIELD_DEFS)).toEqual({ building_fund: '500' });
  });

  test('nested wins over a conflicting flat key', () => {
    const body = { building_fund: '100', custom_fields: { building_fund: '500' } };
    expect(collectCustomFieldInput(body, FIELD_DEFS)).toEqual({ building_fund: '500' });
  });

  test('ignores keys that match no definition', () => {
    expect(collectCustomFieldInput({ nonsense: '1' }, FIELD_DEFS)).toEqual({});
  });

  test('handles a missing body or definition list', () => {
    expect(collectCustomFieldInput(undefined, FIELD_DEFS)).toEqual({});
    expect(collectCustomFieldInput({ building_fund: '1' }, undefined)).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx jest utils/customFieldsHelper.test.js
```

Expected: FAIL — `collectCustomFieldInput is not a function`.

- [ ] **Step 3: Add the helpers to both copies**

Append to `backend/utils/customFieldsHelper.js`, before `module.exports`:

```js
/**
 * Merge the custom-field amounts out of a request body.
 *
 * The mobile form posts amount fields as top-level keys; the desktop form posts
 * a nested custom_fields object. Both must persist, or a field with no backing
 * column is silently dropped.
 */
function collectCustomFieldInput(body, fieldDefs) {
  const merged = {};
  if (!body || !fieldDefs) return merged;

  fieldDefs.forEach((field) => {
    const flat = body[field.field_name];
    if (flat !== undefined) merged[field.field_name] = flat;
  });

  const nested = body.custom_fields;
  if (nested && typeof nested === 'object') {
    Object.keys(nested).forEach((name) => {
      if (fieldDefs.some((field) => field.field_name === name)) merged[name] = nested[name];
    });
  }

  return merged;
}

/** Active field definitions for a table. */
function listActiveCustomFields(db, tableName) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT field_name, field_type FROM custom_fields
       WHERE table_name = ? AND is_active = true`,
      [tableName],
      (err, rows) => (err ? reject(err) : resolve(rows || []))
    );
  });
}
```

and extend its `module.exports` to include `collectCustomFieldInput` and `listActiveCustomFields`.

Add the identical `collectCustomFieldInput` to `api/_lib/customFieldsHelper.js`, plus this variant of the lister — the api copy owns its own db handle and uses numbered placeholders:

```js
async function listActiveCustomFields(tableName) {
  const rows = await db.all(
    `SELECT field_name, field_type FROM custom_fields
     WHERE table_name = $1 AND is_active = true`,
    [tableName]
  );
  return rows || [];
}
```

and add both to that file's `module.exports`.

- [ ] **Step 4: Run the helper test to verify it passes**

```bash
cd backend && npx jest utils/customFieldsHelper.test.js
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit the helper**

```bash
git add backend/utils/customFieldsHelper.js backend/utils/customFieldsHelper.test.js api/_lib/customFieldsHelper.js
git commit -m "feat: merge flat and nested custom field input"
```

- [ ] **Step 6: Write the failing route test**

Create `backend/routes/collections.customFields.test.js`:

```js
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your-secret-key-change-this';
const AUTH = 'Bearer ' + jwt.sign({ id: 1, email: 'tester@sbcc.church', role: 'admin' }, JWT_SECRET);

const FIELD_DEFS = [
  { field_name: 'general_tithes_offering', field_type: 'decimal' },
  { field_name: 'building_fund', field_type: 'decimal' },
];

function makeApp() {
  jest.resetModules();
  const saved = [];
  jest.doMock('../utils/customFieldsHelper', () => {
    const actual = jest.requireActual('../utils/customFieldsHelper');
    return {
      ...actual,
      listActiveCustomFields: jest.fn().mockResolvedValue(FIELD_DEFS),
      saveCustomFieldValues: jest.fn((db, table, id, values) => {
        saved.push({ table, id, values });
        return Promise.resolve();
      }),
      enrichRecordsWithCustomFields: jest.fn(async (db, table, rows) => rows),
    };
  });

  const collectionsRouter = require('./collections');
  const inserts = [];
  const db = {
    get: jest.fn((sql, params, cb) => {
      if (/token_version/i.test(sql)) return cb(null, { token_version: 0 });
      cb(null, null);
    }),
    all: jest.fn((sql, params, cb) => cb(null, [])),
    run: jest.fn((sql, params, cb) => { if (typeof cb === 'function') cb.call({ lastID: 99 }, null); }),
    withTransaction: async (fn) => fn({
      run: async (sql, params) => { inserts.push({ sql, params }); return { changes: 1, lastID: 99 }; },
      get: async () => null,
      all: async () => [],
    }),
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.db = db; next(); });
  app.use('/', collectionsRouter);
  return { app, saved, inserts };
}

describe('POST /collections — custom field amounts', () => {
  test('a flat custom field amount is persisted', async () => {
    const { app, saved } = makeApp();
    await request(app).post('/').set('Authorization', AUTH)
      .send({ date: '2026-08-02', general_tithes_offering: 1000, building_fund: 500 })
      .expect(200);
    expect(saved[0].values).toEqual({ general_tithes_offering: 1000, building_fund: 500 });
  });

  test('a nested custom_fields object still works', async () => {
    const { app, saved } = makeApp();
    await request(app).post('/').set('Authorization', AUTH)
      .send({ date: '2026-08-02', general_tithes_offering: 1000, custom_fields: { building_fund: 500 } })
      .expect(200);
    expect(saved[0].values.building_fund).toBe(500);
  });

  test('the total includes a custom field with no backing column', async () => {
    const { app, inserts } = makeApp();
    await request(app).post('/').set('Authorization', AUTH)
      .send({ date: '2026-08-02', general_tithes_offering: 1000, building_fund: 500 })
      .expect(200);
    // params[4] is total_amount in the INSERT parameter list.
    expect(inserts[0].params[4]).toBe(1500);
  });

  test('the total does not double-count a column-backed field', async () => {
    const { app, inserts } = makeApp();
    await request(app).post('/').set('Authorization', AUTH)
      .send({ date: '2026-08-02', general_tithes_offering: 1000 })
      .expect(200);
    expect(inserts[0].params[4]).toBe(1000);
  });

  test('a custom-field-only entry is accepted instead of 400', async () => {
    const { app } = makeApp();
    await request(app).post('/').set('Authorization', AUTH)
      .send({ date: '2026-08-02', building_fund: 500 })
      .expect(200);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

```bash
cd backend && npx jest routes/collections.customFields.test.js
```

Expected: FAIL — `building_fund` is absent from the saved values, the total is 1000 not 1500, and the custom-field-only entry returns 400.

- [ ] **Step 8: Apply the fix in `backend/routes/collections.js`**

Extend the import at the top of the file:

```js
const {
  enrichRecordsWithCustomFields,
  saveCustomFieldValues,
  getCustomFieldValues,
  collectCustomFieldInput,
  listActiveCustomFields
} = require('../utils/customFieldsHelper');
```

Add this constant just below the `canMutate` declaration:

```js
// Amount fields that are real columns on `collections`. Custom fields whose
// name is in this list are already counted in calculatedTotal — adding them
// again would double-count.
const COLLECTION_AMOUNT_COLUMNS = [
  'general_tithes_offering', 'bank_interest', 'sisterhood_san_juan',
  'sisterhood_labuin', 'brotherhood', 'youth', 'couples',
  'sunday_school', 'special_purpose_pledge',
];
```

In the POST handler, immediately after the `if (!date)` guard, add:

```js
    const fieldDefs = await listActiveCustomFields(req.db, 'collections');
    const customFieldInput = collectCustomFieldInput(req.body, fieldDefs);
    const extraFieldTotal = Object.keys(customFieldInput)
      .filter((name) => !COLLECTION_AMOUNT_COLUMNS.includes(name))
      .reduce((sum, name) => sum + (parseFloat(customFieldInput[name]) || 0), 0);
```

Then add `extraFieldTotal` to the computed total by replacing the closing line of the `calculatedTotal` expression:

```js
                       (parseFloat(special_purpose_pledge) || 0);
```

with:

```js
                       (parseFloat(special_purpose_pledge) || 0) +
                       extraFieldTotal;
```

Finally replace the save block near the end of the handler:

```js
    if (custom_fields) {
      await saveCustomFieldValues(req.db, 'collections', collectionId, custom_fields);
    }
```

with:

```js
    if (Object.keys(customFieldInput).length > 0) {
      await saveCustomFieldValues(req.db, 'collections', collectionId, customFieldInput);
    }
```

- [ ] **Step 9: Run the test to verify it passes**

```bash
cd backend && npx jest routes/collections.customFields.test.js
```

Expected: PASS, 5 tests.

- [ ] **Step 10: Apply the same fix to the PUT handler**

Repeat Step 8 inside `router.put("/:id", ...)`: the same three added lines after its `if (!date)` guard, the same `+ extraFieldTotal` on its `calculatedTotal`, and the same replacement of its `if (custom_fields)` save block (which passes `id` rather than `collectionId`). The PUT handler is not `async` at its declaration — add `async` to it if it is missing, since `listActiveCustomFields` is awaited.

- [ ] **Step 11: Run the whole backend suite**

```bash
cd backend && npx jest
```

Expected: PASS, including the pre-existing `collections.dupe.test.js` and `collections.activity.test.js`.

- [ ] **Step 12: Commit**

```bash
git add backend/routes/collections.js backend/routes/collections.customFields.test.js
git commit -m "fix: persist flat custom field amounts on collections"
```

- [ ] **Step 13: Mirror the fix into the Vercel copy**

`api/collections.js` is the implementation that actually runs in production. Its helper functions take no `db` argument — the module owns its own handle.

Extend the import at the top of the file:

```js
const {
  enrichRecordsWithCustomFields,
  getCustomFieldValues,
  saveCustomFieldValues,
  collectCustomFieldInput,
  listActiveCustomFields,
} = require('./_lib/customFieldsHelper');
```

Add the same column constant below the imports:

```js
const COLLECTION_AMOUNT_COLUMNS = [
  'general_tithes_offering', 'bank_interest', 'sisterhood_san_juan',
  'sisterhood_labuin', 'brotherhood', 'youth', 'couples',
  'sunday_school', 'special_purpose_pledge',
];
```

In the POST handler, immediately after the `if (!date)` guard, add:

```js
  const fieldDefs = await listActiveCustomFields('collections');
  const customFieldInput = collectCustomFieldInput(req.body, fieldDefs);
  const extraFieldTotal = Object.keys(customFieldInput)
    .filter((name) => !COLLECTION_AMOUNT_COLUMNS.includes(name))
    .reduce((sum, name) => sum + (parseFloat(customFieldInput[name]) || 0), 0);
```

Replace the last line of its `calculatedTotal` expression:

```js
      (parseFloat(special_purpose_pledge) || 0);
```

with:

```js
      (parseFloat(special_purpose_pledge) || 0) +
      extraFieldTotal;
```

Keep the existing try/catch wrapper around the save — it returns a partial-success response and that behaviour does not change. Only swap its condition and the value passed:

```js
    if (Object.keys(customFieldInput).length > 0) {
      try {
        await saveCustomFieldValues('collections', collectionId, customFieldInput);
      } catch (customFieldErr) {
        console.error('Error saving custom fields:', customFieldErr);
        return res.json({
          id: collectionId,
          message: 'Collection added successfully, but custom fields may not have been saved',
          customFieldError: customFieldErr.message,
        });
      }
    }
```

Then repeat all four edits in the PUT handler, which passes `id` instead of `collectionId` to `saveCustomFieldValues`.

- [ ] **Step 14: Verify both copies agree**

```bash
cd backend && npx jest
```

Expected: PASS across `backend/` and `api/` suites.

- [ ] **Step 15: Commit**

```bash
git add api/collections.js api/_lib/customFieldsHelper.js
git commit -m "fix: persist flat custom field amounts in the serverless routes"
```

---

## Final verification

- [ ] **Full frontend suite**

```bash
cd frontend && CI=true npm test
```

Expected: PASS, no `PrintReportModal` references remain.

- [ ] **Full backend suite**

```bash
cd backend && npx jest
```

Expected: PASS.

- [ ] **Production build**

```bash
cd frontend && npm run build
```

Expected: build succeeds with no unresolved imports.

- [ ] **Manual check on both shells**

Start the app (`cd backend && npm run dev`, then `cd frontend && npm start`). On desktop, open **Sunday Collection**, pick a date, confirm the message reads exactly like the spec's example, and paste it somewhere to confirm the line breaks survive. On mobile, do the same from the **Summary** tab, and confirm that selecting GCash on the Submit tab leaves only General Tithes & Offering editable.
