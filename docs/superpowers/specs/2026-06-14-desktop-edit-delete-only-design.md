# Desktop Financial Records: Edit/Delete Only + Auto-Calculated Total

**Date:** 2026-06-14
**Branch:** feat/desktop-edit-delete-only
**Status:** Approved

## Context

The SBCC Financial System uses mobile forms as the single source of input for adding collection and expense records. The desktop Financial Records view (`FinancialRecordsManager.js`) currently duplicates this capability with an "Add" button, which risks inconsistent data entry and breaks the intended single-source-of-input discipline.

Additionally, when editing a record on desktop, the total amount field is currently an editable input — it should instead be a reactive read-only summary that auto-calculates from individual field values.

## Decision

- Mobile is the only channel for adding new records.
- Desktop (`FinancialRecordsManager.js`) is restricted to **edit and delete only**.
- When editing, the total amount is displayed as a non-editable bold summary row that updates live as individual fields are changed.

## Scope

Single file change: `frontend/src/components/FinancialRecordsManager.js`.
No changes to mobile components, backend, or API.

---

## Changes

### 1. Remove Add Capability from Desktop

- Delete the "Add Collection" / "Add Expense" button and its `onClick` handler (`handleAddRecord`).
- Delete the `handleAddRecord` function.
- Remove the add branch from `handleSubmit` (the `else` branch that calls `apiService.addCollection` / `apiService.addExpense`).
- Remove add-specific initial state setup that is no longer reachable.
- The form modal (`showAddForm`) is now only opened by `handleEditRecord`.

### 2. Replace Total Amount Input with Read-Only Summary Row (Edit Form)

- Remove the `total_amount` `<input>` element from the form modal.
- In its place, render a non-interactive summary row at the bottom of the form fields:
  - Left: bold label "Total Amount"
  - Right: formatted currency value (e.g. `₱12,500.00`)
  - Styled to be visually distinct from editable fields (no border, no background, slightly larger or bolder text)
- The existing `calculateTotal()` function and its `useEffect` remain — they continue to compute the total reactively as individual fields change.
- The computed value is displayed in the summary row and passed as `total_amount` in the submit payload.

### 3. Validation (Unchanged)

- The existing guard (`finalTotal > 0`) remains — the form will not submit if all individual fields are empty or zero.
- The summary row shows `₱0.00` when no fields have values, updating live as the user types.

---

## Out of Scope

- Mobile `MobileSubmitForm` — no changes.
- Backend / API — no changes.
- Splitting the form modal into separate add/edit components — deferred.
- Role-based visibility of the Add button — not needed; button is removed entirely.
