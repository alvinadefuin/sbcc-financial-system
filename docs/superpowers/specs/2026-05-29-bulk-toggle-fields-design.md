# Bulk Toggle Fields Button — Design Spec

**Date:** 2026-05-29  
**Component:** `CustomFieldsManager`  
**Scope:** Single frontend change, no backend work required

---

## Feature

Add a single "Enable All / Disable All" button to the `CustomFieldsManager` header, next to the existing "+ Add Field" button.

## Behavior

| State | Button label | On click |
|-------|-------------|----------|
| All fields active | "Disable All" | Sets `is_active = 0` on every field |
| Any field inactive | "Enable All" | Sets `is_active = 1` on every field |
| No fields exist | Button hidden | — |

The label always describes what will happen after the click — never the current state.

## Implementation

- **Location:** `frontend/src/components/CustomFieldsManager.js`, header row
- **Styling:** Secondary/outline button to visually distinguish it from the primary "+ Add Field" CTA
- **State:** `bulkToggling` boolean — disables the button while in-flight to prevent double-clicks
- **Optimistic update:** Apply new `is_active` values to local `fields` state immediately, then fire `apiService.updateCustomField` for each field that needs to change in parallel (`Promise.all`). On any error, revert to pre-click state and surface the existing error banner.
- **No-op guard:** Only include fields that actually need to change (don't re-send fields already in the target state)

## Out of Scope

- No new backend endpoint (individual `updateCustomField` calls in parallel are sufficient)
- No per-table bulk toggle (the existing component already scopes to one table at a time)
