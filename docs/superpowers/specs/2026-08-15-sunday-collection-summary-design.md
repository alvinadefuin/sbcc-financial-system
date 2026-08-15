# Sunday Collection Summary — Design Spec

**Date:** 2026-08-15
**Replaces:** the Print Report modal (`frontend/src/components/PrintReportModal.js`)

## Problem

After counting the Sunday offering, the treasurer posts a collection summary to the
church Messenger group chat. Today that message is retyped by hand from the records.
The app's "Print Report" feature does not help: it opens a browser print dialog for a
date-range financial report, which is the wrong shape, the wrong medium, and cannot be
pasted into a chat.

The wanted output is a short block of text:

```
SBCC SUNDAY COLLECTION
Date : AUGUST 02, 2026

Tithes & Offering - Php 18,100.00

Sunday School - Php 166.00

Sisterhood San Juan - Php 350.00

Pledge for Anniversary - Php 5,000.00

Gcash - Php 2,000.00

Total Collection: Php 25,616.00

Papuri po sa Panginoon sa inyong pakikiisa sa pagdalo at pagtatapat sa pagkakaloob!
```

Attendance is not stored by the system and is not generated. The treasurer types it in
by hand when they want it, which the editable preview allows.

## Solution Overview

Pick a date from a calendar that only enables dates with collection records; the app
aggregates every collection record for that date into one message and copies it to the
clipboard as plain text.

The summary is built entirely on the frontend from data already served by
`GET /api/collections` and `GET /api/custom-fields/collections`. No new endpoints. The
aggregation and formatting live in one pure module shared by the desktop modal and the
mobile tab.

The feature also settles how GCash is recorded. GCash is offered for general tithes and
offering and nothing else, so a GCash entry is tithes money that the report labels
separately. The mobile form is tightened to allow only that, and the redundant `gcash`
amount field — a second, conflicting way to record the same money — is retired.

## Domain rule: GCash

**GCash is only ever general tithes & offering.** The congregation is given GCash for
that sole purpose. A GCash entry is therefore a normal collection record with
`payment_method = 'GCash'` and its amount in `general_tithes_offering`, created either
directly or through the `+ Add GCash` supplement flow (spec 2026-05-29).

On the report it still gets its own `Gcash` line rather than being folded into
Tithes & Offering, because the group chat wants to see the channel split.

The `gcash` decimal custom field is a second path to the same money and the source of
the ambiguity this spec resolves. It is retired.

## Decisions

| Decision | Choice |
|---|---|
| Relationship to Print Report | Replaces it. `PrintReportModal.js` is deleted. |
| Platforms | Desktop (sidebar entry) and mobile (new tab). |
| Copy format | Plain text to the clipboard. No image export. |
| Labels | From `custom_fields.field_label`; message editable before copy. |
| Date picker | Month calendar grid; only dates with records are clickable. |
| Gcash line | Sourced from `payment_method = 'GCash'` records only. |
| `gcash` custom field | Retired (deactivated), and ignored by the report regardless. |
| Mobile form | Choosing GCash leaves only General Tithes & Offering enabled. |

## Scope

**New**
1. `frontend/src/utils/sundaySummary.js` — pure aggregation + formatting
2. `frontend/src/utils/sundaySummary.test.js`
3. `frontend/src/components/SundayCollectionModal.js` — desktop shell
4. `frontend/src/components/CollectionDateCalendar.js` — shared month grid
5. `frontend/src/components/mobile/MobileSummary.js` — mobile shell
6. Component tests for each of the three above

**Changed**
7. `frontend/src/components/mobile/MobileSubmitForm.js` — GCash field restriction
8. `frontend/src/components/Dashboard.js` — sidebar entry and modal wiring
9. `frontend/src/components/mobile/MobileLayout.js` — third tab
10. `frontend/src/content/guideContent.js` + `HelpGuide.test.js` — guide copy
11. `frontend/src/components/mobile/MobileHelp.js` — matching mobile guide entry

**Config, not code**
12. Deactivate the `gcash` custom field in the Custom Fields manager

**Deleted**
13. `frontend/src/components/PrintReportModal.js`

**Severable hardening** (§7 — cut it and nothing else in this spec breaks)
14. `backend/routes/collections.js`, `api/collections.js`, and both copies of
    `customFieldsHelper.js` — persist flat custom-field amounts

**Not touched:** `ReportsView.js` and the Google Sheets sync, which remain the
record-keeping and archival path.

---

## Detailed Design

### 1. Reading a value

Records reach the frontend from `GET /api/collections` with custom field values nested
under `custom_fields`. Column-backed fields appear in both places and can disagree: a
record created on desktop writes the column but no `custom_field_values` row, so
`custom_fields.general_tithes_offering` reads back as `0` while the column holds `3000`.

Precedence rule, used everywhere:

```js
value(record, fieldName) =
  fieldName in record && record[fieldName] != null
    ? Number(record[fieldName]) || 0
    : Number(record.custom_fields?.[fieldName]) || 0
```

Every field this report reads is column-backed, so in practice the column always wins.
The fallback keeps the rule correct if an admin adds a new non-column field later.

### 2. Aggregation rules

Records for the selected date are partitioned by payment method:

```
isGcashRecord(r) = String(r.payment_method || '').trim().toLowerCase() === 'gcash'

categoryLines = for each active decimal field def except `gcash`, in display_order:
                  sum of value(r, field) over NON-GCash records
                  (line omitted when the sum is 0)

gcashAmount   = sum over GCash records of (sum of value(r, field) for every field except `gcash`)
```

The `Gcash` line is always appended last, after the category lines, and is omitted when
`gcashAmount` is 0. Its label is a module constant, `"Gcash"`.

Summing every field on a GCash record — not just `general_tithes_offering` — means
legacy GCash records that predate the form restriction still report their full amount on
the Gcash line instead of losing money to a category that is never rendered.

**Fallback:** if a GCash record's per-field sum is 0 but its `total_amount` is greater
than 0, its `total_amount` is used, so an unbroken-down GCash record never silently
disappears.

**The `gcash` field is excluded from category lines by name**, not merely by being
deactivated. Deactivation is a config action an admin could undo or forget; the explicit
exclusion guarantees GCash money can never be reported twice regardless of config state.

### 3. `sundaySummary.js`

Pure functions. No React, no network, no `Date.now()` dependence in the formatting path.

```js
toDateKey(value)                            // "2026-08-02" from a string or a Date
collectionDatesInMonth(records)             // Set of date keys that have records
buildSummary(records, fieldDefs, dateKey)   // -> { dateKey, lines, total, unattributed }
formatSummaryText(summary)                  // -> the message string
```

`fieldDefs` is filtered to `is_active` decimal definitions and sorted by
`display_order`, matching what `MobileSubmitForm` already does.

**Total** is the sum of the rendered lines, not the sum of the records'
`total_amount`. This guarantees the printed lines always add up to the printed total.

**`unattributed`** is `sum(total_amount) - total`, exposed for the UI warning in §5. It
is never part of the copied text, and the warning fires only when it is greater than
zero. This is a live case, not a hypothetical: legacy records 7, 9 and 10 carry stored
`gcash` values on Cash records, and record 7's `total_amount` of ₱5,000 includes ₱2,000
of it. Once the field is retired that ₱2,000 has no line to appear on, and the warning
is what makes the gap visible instead of silent.

`toDateKey` takes the first 10 characters of the value's string form rather than
constructing a `Date`. `new Date("2026-08-02")` parses as UTC midnight and renders as
**August 1** in Manila, which would put the wrong date on every message.

**Text format**, produced by `formatSummaryText`:

- Line 1: `SBCC SUNDAY COLLECTION`
- Line 2: `Date : ` + uppercase month, zero-padded day, `, ` + year
- One blank line between every entry
- Items: `{label} - Php {amount}`
- Total: `Total Collection: Php {amount}`
- Closing: a module constant, `Papuri po sa Panginoon sa inyong pakikiisa sa pagdalo at
  pagtatapat sa pagkakaloob!`

Amounts are formatted with thousands separators and exactly two decimals
(`toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`).

Because labels come from the field definitions, renaming `Special Purpose / Pledge` to
`Pledge for Anniversary` in the Custom Fields manager changes the message with no code
change. Seasonal wording can also just be typed over in the editable preview.

### 4. `CollectionDateCalendar.js`

A self-contained month grid, no new dependency.

- Header: `‹  AUGUST 2026  ›`, arrows page the month and raise `onMonthChange`
- Seven columns, `Su`–`Sa`, leading blanks for the first-of-month offset
- Dates present in the `availableDates` set render as gold clickable pills; every other
  date is greyed and `disabled`
- The selected date gets a filled pill
- Buttons carry `aria-label` with the full date, and disabled days are not focusable

Paging a month triggers a refetch for that month in the parent.

### 5. The two shells

Both shells hold the same three pieces — calendar, editable preview, Copy button — and
differ only in chrome and styling.

**State and data flow** (identical in both):

1. On open, fetch `getCustomFields('collections')` and
   `getCollections({ month, year })` for the current month.
2. `collectionDatesInMonth` feeds the calendar's enabled dates.
3. Preselect the latest date with records in the fetched month — normally the Sunday
   just recorded. If the month has no records, nothing is selected and the empty state
   shows. Paging to another month selects that month's latest date with records.
4. On date select, `buildSummary` then `formatSummaryText`, and the result is written
   into local `text` state.
5. The textarea edits `text` freely. Changing the date regenerates and **overwrites**
   edits — acceptable, and the alternative (preserving stale edits across dates) is
   worse.
6. Copy writes the textarea's current contents.

**Copy** uses `navigator.clipboard.writeText`, falling back to a hidden textarea plus
`document.execCommand('copy')` where the async clipboard API is unavailable (older
mobile browsers, non-secure contexts). Success flips the button to `Copied!` for two
seconds; failure shows `Press and hold to copy` with the text selected.

**Warning line** (UI only, never copied): when `summary.unattributed` is greater than
zero, a muted strip reads `Some records for this date have no category breakdown
(Php X) — check the records.`

**Empty states:** a month with no records shows `No collections recorded in this
month`; the calendar still pages.

**Desktop** — `SundayCollectionModal.js`, same modal frame, header, and footer
conventions as the modal it replaces. `Dashboard.js` keeps the sidebar entry in its
existing slot, relabelled `Sunday Collection`, with `ClipboardCopy` replacing the
`Printer` icon. State renames from `showPrintModal` to `showSummaryModal`.

**Mobile** — `MobileSummary.js`, a third tab in `MobileLayout.js` beside Submit and
Recent, labelled `Summary` with the `ClipboardCopy` icon, using the existing
`tabStyle` / `tabLabel` helpers, the `#fff8e6` / `#c49030` gold palette, and the
`CardSection` visual language of the submit form.

### 6. Mobile form — GCash restriction

`MobileSubmitForm.js` offers `Cash`, `Check`, `Bank Transfer`, `GCash`. When and only
when `payment_method === 'GCash'` and the entry type is a collection:

- `general_tithes_offering` stays enabled and is the only editable amount
- every other decimal field renders `disabled`, greyed, and has its value **cleared** on
  the switch, so no stale amount can be submitted under a GCash record
- the denomination calculator button is hidden on disabled fields — it counts physical
  bills and coins, which is meaningless for a GCash transfer
- a one-line hint under the payment selector reads `GCash entries are recorded as Tithes
  & Offering.`

Switching back to `Cash` (or Check / Bank Transfer) re-enables every field. Cleared
values stay cleared; they are not restored.

This composes with the existing `+ Add GCash` supplement prefill, which sets
`payment_method = 'GCash'` on mount — the restriction applies immediately, and that flow
becomes a single-field form.

**No server-side enforcement.** The restriction is a client-side guardrail, not a
constraint: legacy GCash records with amounts in other categories must stay editable,
and §2 reports them correctly anyway.

The desktop `FinancialRecordsManager` is unaffected — it hardcodes
`payment_method: "Cash"` and has no selector.

### 7. Severable hardening: flat custom fields are discarded

**This section is independent of everything above.** With `gcash` retired, no active
custom field lacks a backing column, so nothing in this feature depends on it. It is
specified here because the feature investigation uncovered it, and it silently loses
money.

`MobileSubmitForm` renders one input per active decimal custom field and posts them as
top-level keys:

```json
{ "date": "2026-08-02", "payment_method": "Cash", "general_tithes_offering": "18100" }
```

`POST /api/collections` only persists `req.body.custom_fields` (a nested object), so a
custom field with no backing column is dropped, and `calculatedTotal` — which sums only
the known columns — omits it. The moment an admin adds a genuinely new decimal field
through the Custom Fields manager, mobile submissions of that field vanish without
error. That is exactly what happened to `gcash`.

**Fix**, applied identically to POST and PUT in **both** `backend/routes/collections.js`
and `api/collections.js`:

1. Load the active custom field definitions for `collections`.
2. Merge the payload:

   ```js
   collectCustomFieldInput(body, fieldDefs)
   // -> { ...flat top-level keys matching a field_name, ...body.custom_fields }
   // nested custom_fields wins on conflict
   ```

3. Add to `calculatedTotal` only those merged decimal fields whose `field_name` is not a
   real column, so `general_tithes_offering` — which exists as both a column and a field
   definition — is never counted twice:

   ```js
   const COLLECTION_AMOUNT_COLUMNS = [
     'general_tithes_offering', 'bank_interest', 'sisterhood_san_juan',
     'sisterhood_labuin', 'brotherhood', 'youth', 'couples',
     'sunday_school', 'special_purpose_pledge',
   ];
   ```

4. Pass the merged object to the existing `saveCustomFieldValues`.

`collectCustomFieldInput` is a pure function added to both copies of
`customFieldsHelper.js` and unit tested directly.

> Also noticed, not fixed: `api/collections.js` line 98 omits `payment_method` from its
> duplicate check, so the fix from the 2026-05-29 GCash supplement spec was never
> mirrored into the deployed serverless copy. Duplicate detection therefore behaves
> differently in production than the Express tests assert.

### 8. Permissions

Read-only. Any authenticated user who can see collections can generate and copy a
summary. No role gate, matching the Print Report entry it replaces.

---

## Testing

TDD order: the pure module, then the form restriction, then the shells, then the
severable hardening if it is kept.

**`sundaySummary.test.js`**

| Case | Expectation |
|---|---|
| Four records on one date | One line per field, amounts summed |
| Desktop record (column `3000`, `custom_fields` `0`) | Reports `3000` |
| GCash-method record | Contributes to the `Gcash` line, not to its categories |
| Legacy GCash record with mixed categories | Whole amount lands on the `Gcash` line |
| GCash record with no breakdown but a `total_amount` | Falls back to `total_amount` |
| `gcash` field left active with a stored value | Ignored; no second line, no double count |
| Zero-value fields | Omitted from output |
| Field order | Follows `display_order`, `Gcash` last |
| Record with a stale `total_amount` | Printed total equals the sum of the lines |
| Same case | `unattributed` reports the difference |
| `unattributed` negative | No warning raised |
| `toDateKey("2026-08-02")` | Renders `AUGUST 02, 2026` — the timezone regression |
| `formatSummaryText` | Matches the expected string exactly, byte for byte |

**`MobileSubmitForm.test.js`** (extending the existing file)

- Selecting GCash disables every amount field except General Tithes & Offering
- Amounts already typed into other fields are cleared on the switch, and the submitted
  payload contains no stale values
- Switching back to Cash re-enables the fields
- The denomination calculator button is absent on disabled fields
- `Check` and `Bank Transfer` leave all fields enabled
- The `+ Add GCash` prefill arrives already restricted

**Components** — `CollectionDateCalendar.test.js`, `SundayCollectionModal.test.js`,
`MobileSummary.test.js`:

- Dates without records render `disabled` and do not fire `onSelect`
- Selecting a date renders the expected message text
- Copy calls the clipboard with the textarea's current contents, including manual edits
- Empty-month state renders
- The unattributed warning appears when records disagree, and is not in the copied text

**Backend** (only if §7 is kept) — `collections.customFields.test.js` in both
`backend/routes/` and `api/`, using supertest with the hand-rolled `db` mock from
`collections.dupe.test.js`:

- A flat custom-field amount in the body reaches `saveCustomFieldValues`
- Nested `custom_fields` still works and wins over a conflicting flat key
- `calculatedTotal` includes a non-column custom field
- `calculatedTotal` does not double-count `general_tithes_offering`
- PUT applies all of the above

This project's CRA setup has `resetMocks` enabled: mock return values go in
`beforeEach`, never in the `jest.mock` factory, or they are wiped before the test runs.

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| Date has records but every amount is 0 | No lines; total `Php 0.00`; warning strip if `total_amount` disagrees |
| Multiple records, mixed Cash and GCash | Cash attributed by category, GCash on the `Gcash` line |
| Two GCash records on one date | Summed into a single `Gcash` line |
| Record soft-deleted | Already excluded by `GET /api/collections` (`notDeleted()`) |
| Legacy Cash record carrying a stored `gcash` value | Value not rendered; surfaces through the unattributed warning |
| `gcash` field is left active by mistake | Excluded by name from category lines; report is unchanged |
| A new decimal custom field is added | The report picks it up automatically, in `display_order`, once it has a non-zero value — but without §7 a value entered on mobile never persists, so it stays at zero and never appears |
| Non-Sunday date with records | Selectable. The rule is "has records", not "is a Sunday" — special services count |
| Offline | The month fetch fails; the shell shows the standard API error. No offline caching |
| Month with no records | `No collections recorded in this month`; paging still works |

## Out of Scope

- Image or PDF export of the summary
- Attendance capture (typed by hand into the editable preview)
- Editing collection records from the summary view
- Backfilling or migrating the three legacy records with stored `gcash` values
- Server-side enforcement of the GCash single-field rule
- Mirroring the `payment_method` duplicate-check fix into `api/collections.js`
- Multi-date or monthly roll-up summaries
