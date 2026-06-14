# SBCC Financial System — StewardBox Character Guide

**StewardBox** is the official mascot and brand character of the SBCC Financial System.

> Wooden offering box, green "StewardBox" visor, coin slot on top, cross on the front.
> Dependable, cheerful, always on duty.

---

## Character Variations by Feature

### 1. Collection Submission (Mobile)
The primary reason the app exists — collectors submitting tithes and offerings from their phone.

- Pose: coin slot glowing, one arm extended forward in a "drop it in" gesture
- Emotion: **ready and welcoming**
- Detail: a Cash bill and GCash card hovering near the slot

---

### 2. Logging Expenses
The other half of the core loop — recording what the church spends, categorized by department.

- Pose: one arm holding a tiny receipt, the other arm reaching out handing it over, slightly serious expression
- Emotion: **accountable and responsible** — this money went somewhere, here's the record
- Detail: expense category labels floating nearby — "Workers' Share", "Utilities", "Supplies" (the three most common ones)

---

### 3. Denomination Calculator (Counting Cash)
A built-in cash counter — collectors input quantities of each bill/coin denomination and it auto-totals.

- Pose: visor tilted forward (shade lowered, serious mode), both arms out in a counting gesture
- Emotion: **diligent counter**
- Detail: stack of coins on one arm, bills on the other

---

### 4. Offline → Back Online (Sync States)
Submissions queue locally when there's no internet and auto-sync on reconnect. Two emotional beats.

**Offline / Waiting**
- Pose: arms crossed, glancing sideways at a tiny floating clock
- Emotion: **on standby** — not worried, just waiting
- Detail: amber "pending" badge on the visor

**Back Online / Syncing**
- Pose: visor flying up (hat-pop of excitement), both arms raised, coins flying out of slot
- Emotion: **celebrating the reconnect**

---

### 5. Dashboard & Analytics (Desktop Admin)
The admin-facing side — charts, summaries, month-over-month comparisons.

- Pose: standing tall and proud, one arm gesturing toward a floating bar graph
- Emotion: **presenting results** — the accountant briefing the board

**Bar graph** (floating beside StewardBox, being gestured at):
- X-axis: month labels — Jan, Feb, Mar, Apr...
- Two bars per month: one gold (Collections), one red (Expenses)
- Represents the core monthly income vs. spending view on the dashboard

**Pie chart** (on the box's front face, replacing the cross in this variant):
- 3 slices representing the collection fund breakdown:
  - Tithes (largest slice)
  - Offerings (medium slice)
  - Operating Funds (smaller slice)
- Slice colors should stay warm — gold, amber, light brown to match the wooden character

### 6. User Management (Admin)
The admin's control panel for managing collector accounts — creating new users, assigning roles, resetting credentials.

- Pose: one arm holding a tiny ID card/badge, other arm pointing toward a small user list (three name rows with profile icons)
- Emotion: **in charge and organized** — the head steward overseeing the team
- Detail: a small checkmark badge appears on the top-right of the ID card (role confirmed); a subtle padlock icon near one row (account locked/reset state)

**Two micro-states:**
- **Creating a user** — ID card is blank and StewardBox is mid-stamp, pressing a seal onto it
- **Removing / locking access** — padlock snaps shut, StewardBox gives a firm but neutral nod (no drama, just procedure)

---

### 7. Mobile Form Fields (Collection Entry)
The moment a collector fills in a submission — date picker, amount fields, fund categories, and a submit button. The most used screen on mobile.

- Pose: leaning slightly over a large floating phone screen, one arm tapping a field with a stylus/finger, coin slot on top glowing softly in anticipation
- Emotion: **attentive and guiding** — showing the user where to tap next
- Detail: the phone shows a real form layout:
  - Date field at the top (calendar icon)
  - Three labeled amount rows: **Tithes**, **Offerings**, **Operating Fund**
  - A green **Submit** button at the bottom
  - A ₱ peso sign next to each input

**Field focus state** — the currently active field glows amber (matches `#d4a843`), StewardBox's visor tilts toward it
**Filled / ready to submit** — all fields filled, StewardBox stands straight with both thumbs up, submit button pulses

---

### 8. Google Sheets Export
Push financial records directly into a Google Spreadsheet — the church treasurer's source of truth. Auto-creates tabs per month/year.

- Pose: coin slot acting as a "paper slot" — a green spreadsheet sheet sliding out, StewardBox smiling and giving a thumbs up with the other arm
- Emotion: **delivery complete** — job done, records are safe
- Detail: the sheet has visible column headers matching real data — Date, Particular, Tithes, Offerings, Operating Fund — and a small Google Sheets logo in the corner

---

## Quick Emotion Reference

| Emotion | StewardBox cues |
|---|---|
| Happy / Default | big smile, open hand wave, visor straight |
| Excited | visor pop, arms raised, coins flying |
| Focused | visor lowered, arms out counting |
| Waiting | arms crossed, sideways glance at clock, amber badge on visor |
| Proud | tall stance, one arm gesturing to results |
| In charge | ID card + pointing gesture, upright posture |
| Attentive / guiding | leaning in, stylus tap, visor tilted toward active element |

---

## Design Notes

- **The visor** is the personality anchor — straight = default, tilted down = working, popped up = celebrating, badge on it = status indicator
- **The coin slot** is the action anchor — glowing = receiving, paper out = reporting/exporting
- **The cross** on the front should stay visible in most states — it's the brand anchor
- Warm wood + gold tones are consistent with the app's `#d4a843` accent
- Philippine context: ₱ symbol, GCash green, and cash bills/coins are natural props
