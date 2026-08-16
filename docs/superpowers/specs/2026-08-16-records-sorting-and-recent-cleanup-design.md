# Record Sorting, Recent-List Date Format, and Supplement Removal

**Date:** 2026-08-16
**Branch:** feat/records-sorting-and-recent-cleanup
**Status:** Approved

## Problem

Three complaints, all in how existing records are presented. None of them touch
how records are created or stored.

1. **Desktop Manage Records looks like it sorts by reference.** It does not sort
   at all — it renders whatever `GET /api/collections` returns, which is
   `ORDER BY date DESC`. Every current record shares the collection date
   `2026-08-16`, so the tie falls through to insertion order, which tracks the
   control number. The order people actually want is the order things were
   submitted.

2. **The mobile Recent list prints a raw timestamp.** `entry.date` renders
   straight from the API as `2026-08-16T00:00:00.000Z`.

3. **The Recent list is not read-only.** Collection cards carry a
   `+ Add GCash` / `+ Add Cash` button. History should be something you read,
   not something you act from.

## Decisions

| Question | Decision |
|---|---|
| Which date does "sort by date" mean? | `created_at` — when it was submitted, not the collection date |
| Default order | Newest submission first, ties broken by reference |
| Mobile date format | `Aug 16, 2026 · 12:41 PM · nerio@…` |
| Mobile sort options | Date only — the feed mixes collections and expenses, whose references are different namespaces |
| Supplement buttons | Removed, along with the prefill machinery behind them |

## Solution Overview

Sorting is client-side. Neither list paginates, both already hold every row they
display, and the sort key is already in the payload — `SELECT *` returns
`created_at`. **No `api/` or `backend/` change, so no mirror-parity work.**

A single shared module holds the comparison and formatting rules so the two
lists cannot drift apart.

## Scope

| File | Change |
|---|---|
| `frontend/src/utils/records.js` | **New.** `referenceOf`, `sortRecords`, `formatSubmittedAt` |
| `frontend/src/components/FinancialRecordsManager.js` | Sortable `Date` / `Reference` headers |
| `frontend/src/components/mobile/MobileRecentList.js` | Date sort toggle, new date format, supplement button removed |
| `frontend/src/components/mobile/MobileLayout.js` | Drop `prefill` state and `handleAddSupplement` |
| `frontend/src/components/mobile/MobileSubmitForm.js` | Drop the now-unreachable `prefill` / `onPrefillConsumed` props and banner |

---

## Detailed Design

### 1. `utils/records.js`

```js
referenceOf(entry)          // control_number for a collection, forms_number for an expense
sortRecords(rows, { key, direction })   // key: 'submitted' | 'reference'
formatSubmittedAt(entry, { timeZone })  // "Aug 16, 2026 · 12:41 PM"
```

**`referenceOf`** picks the column by entry type rather than by which field
happens to be present, so an expense that somehow carries a `control_number`
still sorts on `forms_number`.

**`sortRecords`** is a pure function returning a new array.

- `key: 'submitted'` compares `created_at`, falling back to `date` when a legacy
  row has no `created_at`. Ties break on reference, ascending, always — so the
  order is total and a re-sort never reshuffles equal rows.
- `key: 'reference'` compares references as strings with `localeCompare`, which
  orders `2026-002` before `2026-010` correctly given the zero padding. Ties
  break on `created_at`.
- `direction` (`'asc' | 'desc'`) applies to the primary key only. The tie-break
  stays ascending in both directions.
- Rows missing the primary key sort last regardless of direction. A record with
  no reference should not lead the list just because the direction flipped.

**`formatSubmittedAt`** renders `created_at` as
`{Mon D, YYYY} · {h:MM AM/PM}`. It takes an optional `timeZone` so tests are
deterministic; production passes nothing and gets the device's zone, which is
what a collector in Manila should see.

`created_at` is `timestamp without time zone`. The `pg` driver parses it in the
Node process's zone — UTC on Vercel — so the client receives a correct UTC
instant and renders local. **This is the one place a silent 8-hour error could
appear**, so it gets an explicit test rather than trust.

### 2. Desktop — `FinancialRecordsManager.js`

The existing `Date` and `Reference` `<th>`s become buttons. State:
`const [sort, setSort] = useState({ key: 'submitted', direction: 'desc' })`.

- Clicking an inactive header sorts by it, descending for `submitted`, ascending
  for `reference` — each key's most useful first press.
- Clicking the active header flips direction.
- The active header shows a caret; inactive ones show nothing.
- Sorting applies *after* the existing search filter, so the two compose.
- Switching tabs (collections ↔ expenses) keeps the chosen sort. The reference
  column resolves per row through `referenceOf`, so nothing special is needed.

The `Date` column continues to *display* the collection date. Only the ordering
changes. Showing submission time in a column labelled `Date` would be a
different, unrequested change.

### 3. Mobile — `MobileRecentList.js`

A two-state toggle — `Newest` / `Oldest` — renders as its own row directly above
the synced list. Tapping flips `direction`; `key` stays `submitted`.

**Deliberately not in `SectionHeader`.** The stashed offline-sync work
(`stash@{0}`) widens `SectionHeader` with an `action` slot for its Sync Now
button. Putting this toggle there too would edit the same lines and guarantee a
conflict when that stash is restored. A separate row keeps the two changes in
different parts of the file. Once both have landed, folding the toggle into the
`action` slot is a tidy-up worth doing — but not while they are in flight
separately.

The card's meta line changes from:

```
{entry.date} · {entry.created_by}
```

to `formatSubmittedAt(entry)` followed by `created_by`. The Pending section is
untouched — queued items have no `created_at` and already sort by `queuedAt`.

### 4. Supplement removal

Remove, in order of dependency:

1. `MobileRecentList` — the `supplementLabel` logic, the button, and the
   `onAddSupplement` prop.
2. `MobileLayout` — `prefill` state, `handleAddSupplement`, and both props
   passed down.
3. `MobileSubmitForm` — `prefill`, `onPrefillConsumed`, `prefillRef`,
   `prefillBanner`, and the two effects that applied a pending prefill.

**Deliberately kept:** the `AND payment_method = ?` clause in the duplicate
check on both servers. That is the load-bearing half of the GCash supplement
work — it is what allows a same-date, different-method record to exist at all.
Removing the shortcut must not remove the capability.

**Also kept:** the rule in `MobileSubmitForm` that switching to GCash clears the
other amount fields. It predates prefill and is unrelated.

## Edge Cases

| Case | Behaviour |
|---|---|
| Legacy row with no `created_at` | Sorts on `date`; sorts last if both missing. `formatSubmittedAt` shows the collection date with no time rather than "Invalid Date" |
| Two records, same `created_at` | Tie-break on reference, ascending |
| Record with no reference | Sorts last under reference sort, in either direction |
| Empty list | Sort controls render and are inert; no crash |
| Search filter active | Filter first, then sort |
| Pending (queued) mobile entries | Unaffected — separate section, sorted by `queuedAt` |

## Testing

`utils/records.test.js` — the comparator in isolation:
newest-first default, direction flip, reference ordering with zero padding,
missing `created_at`, missing reference, stable tie-break, and
`formatSubmittedAt` against a pinned `timeZone` proving `04:41Z` renders as
`12:41 PM` in Manila.

`FinancialRecordsManager.test.js` — default order is newest-submitted-first;
clicking `Date` flips direction; clicking `Reference` sorts by control number on
the collections tab; search and sort compose.

`MobileRecentList.test.js` — the meta line reads `Aug 16, 2026 · 12:41 PM`; the
Newest/Oldest toggle reorders; **no supplement button renders**.

`MobileLayout.test.js` — no `prefill` prop reaches `MobileSubmitForm`.

## Out of Scope

- Server-side sorting or pagination. Neither list is near a size that needs it.
- Sorting by amount, particular, or payment method.
- Reference sorting on mobile — mixed namespaces make it meaningless.
- Any replacement entry point for the GCash supplement flow. The workflow stays
  possible manually; the risk this accepts is a mis-typed date filing a
  supplement under the wrong Sunday, which duplicate detection cannot catch.
- The desktop `Date` column's displayed value.
