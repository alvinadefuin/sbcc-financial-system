# Collection Summary — Date Range and UI Fixes

**Date:** 2026-08-16
**Status:** Approved
**Supersedes:** the "Multi-date or monthly roll-up summaries" exclusion in
`2026-08-15-sunday-collection-summary-design.md` § Out of Scope

## Problem

The Sunday Collection summary reports one date. The treasurer sometimes needs the
figures for several Sundays at once — catching up after missed weeks, or reporting a
whole month to the board — and today that means copying each Sunday's message
separately and adding the numbers by hand.

A first pass of the shipped modal also surfaced four interface faults, visible in a
screenshot of the live desktop view:

1. **The footer is clipped.** The card is `max-h-[90vh] overflow-y-auto`, so the Close
   and Copy buttons sit inside the scroll area and slide out of view. Reaching the
   primary action requires scrolling.
2. **A fixed `rows={16}` textarea** reserves sixteen lines for a message that is
   usually five. That dead space is what pushes the footer off-screen.
3. **The palette is foreign to the app.** `Dashboard.js` uses `#c49030` gold and
   `#3d2a08` brown over 130 times and no blue at all; the modal's selected date and
   Copy button are the only blue pixels on the screen.
4. **Spellcheck underlines every Tagalog word** in the closing line — `Panginoon`,
   `pakikiisa`, `pagdalo`, `pagtatapat`, `pagkakaloob` — so the message being sent
   looks full of errors.

## Solution Overview

The calendar gains range selection: click one date for a single day, click a second
for a range. The message keeps its existing shape and simply sums every record in the
range, so the only visible difference is the heading.

The four interface faults are fixed in the same pass, because the range band makes the
calendar's legibility matter more and the fixes touch the same two shells.

## Decisions

| Decision | Choice |
|---|---|
| Range message shape | One rolled-up total. Category lines sum across the range; one `Total Collection`. |
| Per-date breakdown | No. Rejected — the group chat wants the figure, not a ledger. |
| Cross-month ranges | No. Both endpoints must be in the month on screen. |
| Single-date behaviour | Unchanged, and still one click. |
| Range endpoints | Must be dates that have records. Empty days inside the range contribute nothing. |
| Desktop palette | Retuned from slate/blue to the app's gold. |

## Selection model

`selectedDate: string | null` becomes `selection: { start, end } | null`, where `end`
is `null` for a single date.

Click sequence — the standard range-picker interaction:

| State when clicked | Click | Result |
|---|---|---|
| No selection | any date | `{ start: key, end: null }` |
| Pending (`end === null`) | date ≥ start | `{ start, end: key }` |
| Pending (`end === null`) | date < start | `{ start: key, end: null }` — restarts |
| Complete (`end !== null`) | any date | `{ start: key, end: null }` — starts over |

Clicking a pending start again yields `{ start, end: start }`, which renders exactly
like the single date it already was.

The first click renders a summary immediately, so the common single-date case is one
click and behaves as it does today. There is no separate "clear" control; a third
click starts over.

After a month loads, the latest date with records is preselected as
`{ start: latest, end: null }` — unchanged from today.

Paging to another month clears the selection and re-preselects from the new month.
This is what confines a range to one month: a half-made selection never survives
paging.

## Message format

Only the heading changes.

Single date — byte-for-byte what ships today:

```
SBCC SUNDAY COLLECTION
Date : AUGUST 16, 2026
```

Range:

```
SBCC SUNDAY COLLECTION
Date : AUGUST 02 - AUGUST 23, 2026
```

Both ends carry their month name. Ranges are confined to one month, so the two names
always match; repeating the name reads more naturally in a chat message than
`AUGUST 02 - 23`.

Category lines, the `Gcash` line, `Total Collection` and the closing line are
unchanged in form. They sum every record whose date falls in `[start, end]`.

The unattributed-money warning sums across the range on the same rule as today: it
shows only when the gap is positive.

## Detailed Design

### 1. `sundaySummary.js`

**`buildSummary(records, fieldDefs, startKey, endKey)`**

The date filter widens from equality to an inclusive range:

```js
const end = endKey || startKey;
const inRange = (records || []).filter((record) => {
  const key = toDateKey(record.date);
  return key >= startKey && key <= end;
});
```

ISO `YYYY-MM-DD` strings compare correctly with `<=` because the format is
zero-padded and big-endian, so no `Date` object is constructed — the same rule the
original spec set to avoid the Manila timezone shift.

Omitting `endKey` means single-date, so every existing caller and all 30 existing
tests keep working untouched.

The returned object carries the range instead of one date:

```js
{ startKey, endKey: end, lines, total, unattributed }
```

`dateKey` is gone. Its only consumers are `formatSummaryText` and the two shells, all
of which change here.

Aggregation itself — column-over-nested precedence, `display_order` sorting, the
`gcash` field exclusion, GCash records reporting on their own line — is unchanged.
Widening the filter is the whole change.

**`formatDateHeading(startKey, endKey)`**

Gains an optional second argument. A missing `endKey`, or one equal to `startKey`,
produces today's output exactly, so the existing heading tests are untouched:

| Call | Output |
|---|---|
| `formatDateHeading('2026-08-02')` | `AUGUST 02, 2026` |
| `formatDateHeading('2026-08-02', '2026-08-02')` | `AUGUST 02, 2026` |
| `formatDateHeading('2026-08-02', '2026-08-23')` | `AUGUST 02 - AUGUST 23, 2026` |

Both halves are composed from the same month/day formatter; the year is emitted once,
at the end.

### 2. `useSundaySummary.js`

State `selectedDate` / `setSelectedDate` becomes `selection` / `selectDate`. The click
table above is implemented as a pure `nextSelection(selection, key)` exported from
`sundaySummary.js`; `selectDate` is the one-line `setSelection((prev) =>
nextSelection(prev, key))` that applies it. The hook returns `{ selection, selectDate }`
in place of the old pair.

The summary effect depends on `selection` and passes both ends to `buildSummary`.

The month fetch is unchanged — one month at a time, `getCollections({ month, year })`.
No new endpoint and no wider query, because ranges cannot leave the month.

`changeMonth` needs no reset logic of its own: changing the month re-runs the fetch
effect, which already preselects the new month's latest date and so discards any
half-made range.

### 3. `CollectionDateCalendar.js`

Props `selectedDate` / `onSelect` become `selection` / `onSelect(key)`.

Each day cell resolves to one of four states, checked in this order:

| State | Condition | Appearance |
|---|---|---|
| Endpoint | `key === start` or `key === end` | Solid gold, cream text |
| In range | `start < key < end` | Light gold band, gold text |
| Has records | `availableDates.has(key)` | Gold-tinted fill, gold border |
| Empty | otherwise | Plain grey, no border, disabled |

`aria-pressed` is true for endpoints and in-range days, so the selected band is
legible to a screen reader. Endpoints additionally carry
`aria-label="August 2, 2026, range start"` / `", range end"` to distinguish them.

The desktop palette is retuned from slate/blue to gold over white:

```js
desktop: { accent: '#c49030', accentText: '#fff8e6', available: '#8a6028',
           availableBg: '#fdf6e3', inRangeBg: '#faedd0', muted: '#cbd5e1',
           heading: '#3d2a08', border: '#e8d090' }
```

The mobile palette gains `inRangeBg` and is otherwise unchanged — it is already gold.

A hint line sits under the grid: **"Pick a date, or pick two for a range."** It is the
only discovery affordance for the range feature.

### 4. The two shells

**Layout (desktop only — the fault is desktop-only).** The card becomes a flex column
so the footer cannot scroll away:

```jsx
<div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
  <header className="shrink-0" …>
  <div className="flex-1 overflow-y-auto min-h-0" …>   {/* calendar + message */}
  <footer className="shrink-0" …>                       {/* Close + Copy */}
```

The mobile shell already pins its footer with `flexShrink: 0` and needs no change.

**Textarea (both shells).** `rows={16}` becomes content-sized:

```js
const rows = Math.min(18, Math.max(6, text.split('\n').length + 1));
```

Six rows keeps a short message from looking cramped; eighteen stops a long range
message from pushing the layout around. Beyond that the textarea scrolls.

**Spellcheck (both shells).** `spellCheck={false}` on the textarea.

**Colour (desktop only).** The Copy button moves from `bg-blue-600 hover:bg-blue-700`
to the app's gold, and the focus ring from `focus:ring-blue-500` to a matching amber.

### 5. Empty and error states

Unchanged. `No collections recorded in this month` still shows when a month has no
records, the API error still surfaces, and Copy is still disabled while there is no
selection.

## Testing

**`sundaySummary.test.js`** — a new `buildSummary — date ranges` block:

| Test | Assertion |
|---|---|
| Sums across every date in the range | Two dates' tithes appear as one line |
| Excludes dates outside the range | A record one day past `end` is not counted |
| Inclusive at both ends | Records on `start` and on `end` are both counted |
| Omitting `endKey` is single-date | Same result as the equivalent single-date call |
| `endKey === startKey` is single-date | Same result again |
| A range with no records | Empty lines, zero total, no error |
| GCash across a range | Several dates' GCash records sum into one `Gcash` line |
| Range heading | `formatDateHeading('2026-08-02', '2026-08-23')` → `AUGUST 02 - AUGUST 23, 2026` |
| Single heading unchanged | `formatDateHeading('2026-08-02')` → `AUGUST 02, 2026` |

**`nextSelection`** — the click sequence, unit tested directly rather than through
simulated clicks: first click starts, a later second click completes, an earlier second
click restarts, a click on a finished range starts over.

**`CollectionDateCalendar.test.js`** — rendering only, since the calendar holds no
state: endpoint `aria-label` suffixes, in-range days marked as part of the band while
staying disabled when they have no records, and the hint line.

**`SundayCollectionModal.test.js`** — clicking two dates produces a message whose
heading is the range and whose total covers both dates; `spellCheck` is off.

**`MobileSummary.test.js`** — one equivalent range test.

Existing tests are expected to pass untouched, apart from those that name
`selectedDate` in props or read `summary.dateKey`.

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Range where only one end has records | Endpoints must have records, so this cannot be selected |
| Range spanning dates with no records | Empty days contribute nothing; they tint as part of the band |
| Range of one day (`start === end`) | Renders as a single-date message |
| Second click on an earlier date | Restarts the range from that date |
| Paging months mid-selection | Selection clears; the new month preselects its latest date |
| Range where every amount is 0 | No lines, `Php 0.00`, warning strip if `total_amount` disagrees |
| Long range message | Textarea caps at 18 rows and scrolls; footer stays pinned |

## Out of Scope

- Cross-month and cross-year ranges
- Per-Sunday breakdown sections inside one message
- Presets such as "this month" or "last 4 Sundays"
- Any change to how records are stored, or to the GCash domain rule
- Mobile layout restructuring — its footer is already correct
