# StewardBox Mobile Tab Polish — Design Spec

**Date:** 2026-06-14
**Scope:** Visual polish to the mobile UI — replace character images in the tab bar with SVG icons, and add a character banner strip at the top of each tab's content area.

---

## Problem

The mobile tab bar (MobileLayout.js) currently uses `sb-collection.png` and `sb-expenses.png` as 24×24 tab icons. These are mascot illustrations, which look out of place as small functional icons and conflict with the icon language used elsewhere (lucide-react SVGs). The mascot images have no presence inside the tab pages themselves.

---

## Solution

Two changes:

### 1. Tab bar icons → SVG (MobileLayout.js)

Replace the `<img>` elements in both tab buttons with lucide-react icons:

- **Submit tab** → `Send` icon
- **Recent tab** → `List` icon

Size: 22×22. Active color: `#c49030`. Inactive: `#b89048` at 55% opacity. No other changes to tab bar layout, badge, or active state styling.

### 2. Character banner at top of each tab (MobileSubmitForm.js, MobileRecentList.js)

A compact warm-gradient strip rendered as the first item inside each tab's scrollable content area (scrolls with the content, not fixed).

**Visual spec:**
- Layout: character image (40×40, `object-fit: contain`) on the left; label + message text on the right
- Background: `linear-gradient(135deg, #fff8e0, #fef3d0)`
- Border: `1.5px solid #e8d090`, border-radius: 14px
- Padding: `10px 12px`
- Label: `"STEWARDBOX SAYS"` — 10px, weight 700, `#c49030`, `letter-spacing: 0.04em`
- Message: 11px, color `#3d2a08`, line-height 1.4

**Per tab:**

| Tab | Image | Message |
|-----|-------|---------|
| Submit | `sb-collection.png` | "Log today's collection — choose Cash or GCash, then fill in the amounts below." |
| Recent | `sb-expenses.png` | "Here are your recent entries. Tap any record to view details or add a supplement." |

The banner is static and purely presentational — no props, no state, no dynamic content.

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/components/mobile/MobileLayout.js` | Replace `<img>` tab icons with `Send` and `List` from lucide-react |
| `frontend/src/components/mobile/MobileSubmitForm.js` | Add character banner at top of scroll content |
| `frontend/src/components/mobile/MobileRecentList.js` | Add character banner at top of scroll content |

---

## Out of Scope

- No changes to tab logic, routing, or state
- No dynamic/data-driven banner content
- No changes to the desktop Dashboard sidebar
- No changes to DenominationCalculator, ConnectionBanner, or LoginNew
