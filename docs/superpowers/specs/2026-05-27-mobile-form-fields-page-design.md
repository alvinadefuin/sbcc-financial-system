# Mobile Form Fields Manager — Page Redesign Spec

**Date:** 2026-05-27
**Branch:** feature/mobile-customizable-fields

---

## Goal

Replace the modal-overlay `CustomFieldsManager` component with a proper inline admin page that clearly reflects the fields visible in `/mobile`, supports drag-to-reorder, and lets admins activate/deactivate fields without deleting them.

---

## Context

`CustomFieldsManager.js` was originally built as a modal (line 166: `fixed inset-0 bg-black bg-opacity-50 z-50`). Task 4 of the previous plan embedded it as an inline sub-view in Dashboard, but the component's own root element is still a full-screen overlay — so it renders as a popup on top of the page instead of flowing within it.

The `/mobile` form's Financial Breakdown section fetches fields via `GET /api/custom-fields/:tableName` and renders only those with `field_type = 'decimal'` and `is_active = 1`. The manager should make this behaviour obvious to the admin.

---

## What Changes

### `frontend/src/components/CustomFieldsManager.js` — full rewrite

The component is rewritten from scratch. The `onClose` prop is removed (no longer a modal). It takes only `tableName: 'collections' | 'expenses'`.

#### Page structure

```
┌─────────────────────────────────────────────────────────┐
│ Collection Fields                        [+ Add Field]   │
│ These fields appear as amount inputs in /mobile          │
├─────────────────────────────────────────────────────────┤
│ [inline Add/Edit form — visible only when open]         │
├─────────────────────────────────────────────────────────┤
│ ⠿  General Tithes & Offering  [decimal] [📱 /mobile]  ● [Edit][Delete] │
│ ⠿  Bank Interest              [decimal] [📱 /mobile]  ● [Edit][Delete] │
│ ⠿  Brotherhood                [decimal] [📱 /mobile]  ○ [Edit][Delete] │  ← inactive, dimmed
│    (empty state if no fields)                           │
└─────────────────────────────────────────────────────────┘
```

#### Field row

Each row contains, left to right:
- **Drag handle** (`⠿`) — HTML5 `draggable`. Cursor changes to `grab` on hover.
- **Field info** — `field_label` in bold; `field_name` in monospace below at smaller size
- **Type badge** — pill showing `field_type` (e.g. "decimal", "text")
- **📱 Shows in /mobile** — additional chip, shown only when `field_type === 'decimal'`; helps admin understand what actually appears in the mobile breakdown
- **Active toggle** — pill toggle (green = active, grey = inactive). Clicking immediately calls `PATCH /api/custom-fields/:id` with `{ is_active: !current }`. Inactive rows render at reduced opacity (0.45) but stay in the list so the admin can re-enable them.
- **Edit button** — opens the inline add/edit form pre-filled
- **Delete button** — calls `DELETE /api/custom-fields/:id` after `window.confirm`

#### Add/Edit inline form

Appears at the top of the list when `+ Add Field` or Edit is clicked. Not a modal — it slides in as a card above the field rows.

Fields in the form:
- **Display Label** (required) — text input, e.g. "GCash Amount"
- **Field Name** (required on add, disabled on edit) — text input, auto-slugified (lowercase, spaces → underscores, non-alphanumeric stripped). e.g. `gcash_amount`
- **Field Type** (required) — select: Decimal (Money), Text, Date, Integer, Yes/No. Defaults to Decimal.
- **Required** — checkbox toggle

Collapsed under an **"Advanced ▾"** disclosure:
- **Category** — select from table-specific options (existing categories)
- **Description** — textarea

Submit: "Add Field" or "Update Field". Cancel: "Cancel" link.

#### Drag-to-reorder

Uses native HTML5 drag API (`draggable`, `onDragStart`, `onDragOver`, `onDrop`). No new dependencies.

On drop:
1. Reorder the local `fields` array immediately (optimistic update)
2. Assign new `display_order` values (0, 1, 2… based on new positions)
3. Call `PATCH /api/custom-fields/:id` for each row whose `display_order` changed, in parallel (`Promise.all`)
4. On error: revert to pre-drag order and show inline error

#### Removed from original component

- `fixed inset-0 bg-black bg-opacity-50 z-50` root wrapper
- "Sync to Google Form" button and all related state (`syncing`, `syncMessage`, `handleSyncToGoogleForm`)
- Bottom "Close" button
- `onClose` prop

### `frontend/src/components/Dashboard.js` — minor cleanup

- Remove `onClose` prop from `<CustomFieldsManager>` render (it no longer exists)
- The tab toggle wrapper (`customFieldsTable` state, Collection/Expense buttons) stays as-is

---

## Backend

No changes required. All operations use existing endpoints:
- `GET /api/custom-fields/:tableName` — load fields
- `POST /api/custom-fields` — create
- `PUT /api/custom-fields/:id` — update label, type, display_order, is_active, etc.
- `DELETE /api/custom-fields/:id` — soft delete (sets is_active = 0)

---

## Styling

Matches the existing dashboard Tailwind aesthetic (white cards, slate borders, indigo accents). Not the dark glass theme of `/mobile` — this is the admin dashboard, which uses light mode.

Active toggle: indigo when active, slate-300 when inactive.
Drag handle: slate-300 colour, grab cursor, darkens on hover.
Inactive rows: `opacity-50` to signal they won't appear in `/mobile`.

---

## Not in scope

- Reordering via explicit up/down arrow buttons (drag handles cover this)
- Bulk activate/deactivate
- Field type changes after creation (field_name + type are identity — changing type could corrupt stored values)
