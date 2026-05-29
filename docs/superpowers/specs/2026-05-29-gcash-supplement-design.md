# GCash Supplement Flow — Design Spec
**Date:** 2026-05-29

## Problem

On Sundays, the team counts and submits cash collections in the morning. In the afternoon they discover GCash receipts (tithes, offering, etc.) for the same date. There is no smooth way to add those GCash amounts — a second submission for the same date may be blocked by duplicate detection, and the Recent list offers no shortcut to pre-fill the Submit form.

## Solution Overview

**Option A — "Add GCash" shortcut from the Recent list.**
Collection cards in the Recent list get a context-aware supplement button. Tapping it pre-fills the Submit tab with the matching date and the complementary payment method, so the afternoon entry takes seconds. The backend duplicate check is tightened to include `payment_method`, so same-date/different-method records are never flagged as duplicates.

## Scope

Three touch points, no schema changes:

1. `MobileRecentList.js` — supplement button on synced collection cards
2. `MobileLayout.js` — `prefill` state + `onAddSupplement` callback wiring
3. `MobileSubmitForm.js` — `prefill` prop initialises the form
4. `backend/routes/collections.js` — add `AND payment_method = ?` to the dupe query

---

## Detailed Design

### 1. Recent List — Supplement Button

**Where:** Synced collection cards only (not queued/pending). Shown below the date/amount row as a secondary action.

**Label logic:**
- `payment_method === 'Cash'` → show `+ Add GCash`
- `payment_method === 'GCash'` → show `+ Add Cash`
- Any other method (Check, Bank Transfer) → button not rendered

**Interaction:** Calls `onAddSupplement(entry)` with the full entry object. The parent (`MobileLayout`) handles navigation.

**Visual:** Small secondary button, gold-tinted border, consistent with the existing `ActionBtn` style in the Recent list.

### 2. MobileLayout — Prefill State

New state: `const [prefill, setPrefill] = useState(null)`.

`onAddSupplement(entry)` handler:
1. Sets `prefill` to `{ date: entry.date, payment_method: otherMethod }` where `otherMethod` is `'GCash'` if entry is Cash, `'Cash'` if GCash.
2. Switches `tab` to `'submit'`.

`MobileSubmitForm` receives `prefill={prefill}` and `onPrefillConsumed={() => setPrefill(null)}`.

The prefill is cleared once the form has consumed it (`onPrefillConsumed` is called on mount when `prefill` is non-null). This ensures a manual tab switch later starts with a clean form.

### 3. MobileSubmitForm — Prefill Prop

New props: `prefill` (object | null), `onPrefillConsumed` (function).

**On mount / when `prefill` changes:**
- If `prefill` is non-null, initialise form with `prefill.date` and `prefill.payment_method` overriding defaults.
- Call `onPrefillConsumed()` immediately so Layout clears it.

**Banner:** A dismissible info strip at the top of the form (above the type toggle) reads:
> `Adding GCash for [date]` (or "Adding Cash for [date]")
Shown only when the form was opened via prefill. A small `✕` dismisses it. The banner does not block submission — it is informational only.

**Editability:** Both the date and payment method fields remain editable after pre-fill. The user can correct if needed.

### 4. Backend — Duplicate Detection Fix

**File:** `backend/routes/collections.js`

**Current query:**
```sql
SELECT id, created_by, date FROM collections
WHERE date = ? AND total_amount = ?
```

**Updated query:**
```sql
SELECT id, created_by, date FROM collections
WHERE date = ? AND total_amount = ? AND payment_method = ?
```

Pass `payment_method || 'Cash'` as the third parameter. Records with the same date and total but a different payment method are legitimate separate entries and must not be blocked.

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| GCash already submitted for that date | Dupe check catches it (same date + same total + same payment_method = GCash). User sees the conflict dialog as normal. |
| User taps `+ Add GCash` but switches tab manually before submitting | Prefill is already cleared on mount; form starts fresh. |
| User changes date after pre-fill | Fine — date is editable. No constraint imposed. |
| Offline at time of GCash supplement | Same offline queue path as any other submission. |

---

## Out of Scope

- Editing already-submitted records (separate feature)
- Per-field payment method split within a single record
- Linking Cash and GCash records to each other in the DB
