# Add / Edit Field — Modal Form Spec

**Date:** 2026-05-27
**Branch:** feature/mobile-customizable-fields

---

## Goal

Convert the inline add/edit form in `CustomFieldsManager.js` from a card that expands above the field list into a centered modal overlay. The field list and page layout are unaffected.

---

## Context

The current inline form (`formOpen && <div className="mx-6 mt-4 ...">`) pushes the field list down when open and hides the `+ Add Field` button. A centered modal is a better UX pattern for a focused "fill in and submit" action — it gives the form breathing room, keeps the field list undisturbed, and matches user expectations for admin forms.

---

## What Changes

### `frontend/src/components/CustomFieldsManager.js` — targeted edit

#### Modal wrapper

Replace the inline form div with a fixed modal overlay:

```
fixed inset-0 z-50
  └── backdrop: bg-black/40 (click → closeForm)
      └── centered card: bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4
          ├── header: title ("Add Field" / "Edit Field") + × close button
          ├── form body: same fields as current inline form
          └── action row: submit button + Cancel link
```

The card should be vertically centered (`flex items-center justify-center` on the backdrop).

#### Escape key

Add a `useEffect` that listens for `keydown` `Escape` and calls `closeForm()` while `formOpen` is true. Clean up the listener on unmount / when form closes.

#### `+ Add Field` button

Remove the `{!formOpen && (...)}` conditional — the button is always visible in the header since the modal doesn't push page content.

#### Removed

- The inline form div (`mx-6 mt-4 p-4 bg-slate-50 ...`) and its wrapping conditional

#### Unchanged

- All form fields: Display Label, Field Name (auto-slug on add; disabled on edit), Field Type (disabled on edit), Required checkbox, Advanced section (Category, Description)
- `handleSubmit`, `openAddForm`, `openEditForm`, `closeForm`, `handleLabelChange` — no logic changes
- `editingField` state, form validation, error handling
- The field list, drag-to-reorder, active toggle, delete — completely untouched

---

## Styling

Matches existing dashboard aesthetic: white card, slate borders, indigo accents.

- Backdrop: `bg-black/40`
- Card: `bg-white rounded-2xl shadow-xl` with `p-6` padding
- Header: `text-lg font-semibold text-slate-800` title, `×` close button top-right (`text-slate-400 hover:text-slate-600`)
- Form inputs: unchanged (existing `border-slate-300 rounded-lg focus:ring-indigo-500` classes)
- Submit button: `bg-indigo-600 hover:bg-indigo-700 text-white`
- Cancel: `text-slate-500 hover:text-slate-700` link-style button

---

## Behaviour

| Trigger | Result |
|---------|--------|
| Click `+ Add Field` | Modal opens, form blank, field_type defaults to Decimal |
| Click `Edit` on a row | Modal opens, form pre-filled with that field's data |
| Click backdrop | Modal closes, form resets |
| Press Escape | Modal closes, form resets |
| Click `×` button | Modal closes, form resets |
| Click Cancel | Modal closes, form resets |
| Submit (add) | `createCustomField` called → on success: modal closes, fields reload |
| Submit (edit) | `updateCustomField` called → on success: modal closes, fields reload |
| Submit error | Error shown inside modal, modal stays open |

---

## Tests

The 22 existing tests cover form behaviour and remain valid. The test for "inline form (not a modal)" will need updating: the spec test currently asserts `form.closest('.fixed') === null` — with this change, the form IS inside a `.fixed` element. Update that assertion to instead verify the form is inside a modal (e.g. `form.closest('[role="dialog"]')` is non-null, or check for the backdrop class).

No new test cases needed — all form behaviours (slug, disabled field_name, advanced section, payloads, cancel) are already covered.

---

## Not in Scope

- Animation / transition on modal open/close (can be added later)
- Focus trap inside the modal (accessibility enhancement, not MVP)
- Mobile-specific sheet behaviour
