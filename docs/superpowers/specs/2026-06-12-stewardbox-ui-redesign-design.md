# StewardBox UI Redesign — Design Spec
**Date:** 2026-06-12  
**Branch:** `ui-redesign`

---

## 1. Overview

Redesign the entire SBCC Financial System UI around its mascot and brand character, **StewardBox** — a wooden offering box with a green visor, coin slot, and cross. The app is renamed **StewardBox** (subtitle "by SBCC" on login only).

The visual system shifts from the current fragmented palette (dark navy mobile + indigo desktop) to a single **Warm Light "Sunshine"** theme across all surfaces, with StewardBox assets appearing **ambientally** — hero on login, tab/nav icons, sync banners, loading states, and insight cards.

---

## 2. Approved Design Decisions

| Decision | Choice |
|---|---|
| App name | **StewardBox** (primary); "by SBCC" subtitle on login only |
| Design direction | **Warm Light "Sunshine"** — consistent across desktop and mobile |
| StewardBox prominence | **Ambient** — hero, nav icons, banners, insight cards |

---

## 3. Design Tokens

All components switch to this token set. No more `#08081a` navy, no more `indigo-600`.

### Colors

| Token | Value | Usage |
|---|---|---|
| `--sb-bg` | `#fef9f0` | Page background |
| `--sb-bg-warm` | `#fff8e6` | Cards, inputs, sidebar |
| `--sb-border` | `#e8d090` | Default border |
| `--sb-border-s` | `#f0e4b0` | Subtle border |
| `--sb-text` | `#3d2a08` | Primary text |
| `--sb-text-s` | `#8a6028` | Secondary text |
| `--sb-text-x` | `#b89048` | Placeholder / tertiary |
| `--sb-gold` | `#c49030` | Primary action (buttons, active states) |
| `--sb-gold-l` | `#d4a843` | Lighter gold (gradients, accents) |
| `--sb-gold-bg` | `rgba(196,144,48,0.10)` | Gold tint backgrounds |
| `--sb-red` | `#c04828` | Expense amounts, destructive |
| `--sb-red-bg` | `rgba(192,72,40,0.08)` | Expense tint backgrounds |
| `--sb-green` | `#4a8030` | Online / success states |

### Gradients

- **Hero gradient** (login, mobile header): `linear-gradient(160deg, #fff8e0, #fde8b0, #f8d880)`
- **Button gradient**: `linear-gradient(135deg, #d4a843, #c49030)`
- **Sidebar gradient**: `linear-gradient(180deg, #fff8e6, #fef3d0)`

### Typography

No font change — keep the system font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`). All dark/light text classes replace their slate-* equivalents with the warm token above.

### Border radius

Cards/modals: `14px`. Inputs/tags: `10px`. Buttons: `11px`. Small badges: `6px`.

---

## 4. StewardBox Asset Map

Each asset is contextually matched to the feature it represents.

| Asset | Appears in |
|---|---|
| `sb-icon.png` | App header (mobile + desktop sidebar logo) |
| `sb-collection.png` | Login hero · Submit tab icon · Collections sidebar nav item |
| `sb-dashboard.png` | Overview sidebar nav item · Dashboard insight card |
| `sb-expenses.png` | Expenses sidebar nav item · Recent tab icon |
| `sb-calculator.png` | DenominationCalculator modal header · calc trigger button in Submit form |
| `sb-offline.png` | ConnectionBanner — offline / queued state |
| `sb-online.png` | ConnectionBanner — back online / syncing state |
| `sb-google-sheet.png` | Reports sidebar nav item · Export prompt |

---

## 5. Component Redesigns

### 5.1 Login (`LoginNew.js`)

**Layout (desktop):** Two-panel layout retained. Left panel switches from dark slate to the warm hero gradient with a large `sb-collection.png` (100px), "StewardBox" in bold `#3d2a08`, and "by SBCC" in `#8a6028` below it. Right panel stays white/warm, contains the sign-in form.

**Layout (mobile):** Single panel. Top section is the hero gradient with `sb-collection.png` (90px), "StewardBox", "by SBCC". Below is the form.

**Form:** Tab switcher (Google / Password) in `#fff8e6` bg with gold active state. Input fields use `--sb-bg-warm` bg, `--sb-border` border, `--sb-text` text. Submit button uses the button gradient with white text and a gold shadow.

**Error state:** Warm rose: `bg-rose-50` border `rose-200` (unchanged — this is already correct).

**Loading state in App.js:** Background changes from `bg-slate-950` to `bg-[#fef9f0]`. Spinner border changes from `indigo-500` to `#d4a843`. Loading text from `text-slate-500` to `text-[#b89048]`.

---

### 5.2 Desktop Dashboard (`Dashboard.js`)

**Sidebar:**
- Background: sidebar gradient (`#fff8e6` → `#fef3d0`)
- Logo: `sb-icon.png` (32px) + "StewardBox" bold `#3d2a08`
- Nav items use contextual `sb-*.png` icons (20px each):
  - Overview → `sb-dashboard.png`
  - Collections → `sb-collection.png`
  - Expenses → `sb-expenses.png`
  - Reports → `sb-google-sheet.png`
  - User Mgmt → no character image, use a person icon (lucide `UserCog`)
  - Settings → no character image, use lucide `Settings`
- Active nav item: `--sb-bg-warm` bg, gold border `#e8c870`, gold text `#c49030`
- Inactive icons: 35% opacity + slight grayscale
- Collapsed sidebar mode: show only the icon (no text), same asset

**Main area:**
- Background: `--sb-bg`
- Stat cards: `--sb-bg-warm` bg, colored border and value (gold for collections, red for expenses, neutral for net)
- Charts: bar colors → gold (`#d4a843`) for collections, red-warm (`#c04828`) for expenses
- All `indigo-*` utility classes replaced with warm equivalents

**StewardBox insight card** (new, below chart on Overview):
- Background: `linear-gradient(135deg, #fff8e0, #fdefc0)`, border `#e8c870`
- `sb-dashboard.png` (38px) on the left
- One-line insight text computed from existing Dashboard state: compare current month's collection total vs. previous month entry in the already-loaded `collections` array. Example: "Great month — collections up 12% from May." Falls back to "View this month's full summary →" if no prior month data exists.
- "Export to Sheets →" button using gold gradient, links to Reports flow

---

### 5.3 Mobile Layout (`MobileLayout.js`)

**Remove entirely:** dark glass CSS (`#08081a` background, `rgba(8,8,26,x)` glass surfaces, gradient blobs, `backdropFilter` blur overlays). The phone background is now `--sb-bg`.

**Header:**
- Background: warm hero gradient
- Left side: `sb-icon.png` (36px) + "StewardBox" bold + collector name
- Right side: "Sign out" button in warm style (gold border, `#b89048` text)

**Tab bar (two tabs — unchanged count):**
Each tab has a character icon on top + label below:
- Submit → `sb-collection.png`
- Recent → `sb-expenses.png`

Active tab: `--sb-bg-warm` bg, gold border, gold label. Inactive: transparent bg, 40% opacity icon, `--sb-text-x` label.

The DenominationCalculator remains a modal overlay triggered from within the Submit form (existing behavior). It is NOT a new tab.

Pending count badge: gold background `#d4a843`, dark text, positioned on the Recent tab.

The `body.style.background` override switches from `#08081a` to `#fef9f0`.

---

### 5.4 Mobile Submit Form (`MobileSubmitForm.js`)

Replace all `GLASS_CARD` style objects and dark rgba backgrounds with warm equivalents:
- Card background: `--sb-bg-warm`, border `--sb-border-s`, border-radius `14px`
- Section labels: `--sb-text-x`
- Field labels: `--sb-text-s`
- Inputs/selects: white bg, `--sb-border` border, `--sb-text` text
- Submit button: gold gradient, white text, gold shadow
- Total amount display: `--sb-gold` color
- Calculator trigger button: warm bg, gold icon

---

### 5.5 Mobile Recent List (`MobileRecentList.js`)

- List item cards: `--sb-bg-warm` bg, `--sb-border-s` border
- Amount values: gold for collections, red for expenses
- Pending badge: gold `#d4a843`
- "Add supplement" button: warm outline gold style
- Empty state: `sb-expenses.png` (56px, centered), "No recent entries" in `--sb-text-x`

---

### 5.6 Connection Banner (`ConnectionBanner.js`)

**Offline / queued state:**
- Background: `linear-gradient(90deg, #fff8e0, #fdefc0)`, border `#e8c870`
- `sb-offline.png` (24px) on left
- Text: "Offline — N entries queued" in `#8a6028`

**Online / syncing state:**
- Background: `linear-gradient(90deg, #e8f8e0, #d0f0c0)`, border `#a0d880`
- `sb-online.png` (24px) on left
- Text: "Back online — syncing…" in `#3a7020`

Both states remove the current dark amber/indigo pill style.

---

### 5.7 Denomination Calculator (`DenominationCalculator.js`)

- Background: `--sb-bg-warm` card
- Header area: `sb-calculator.png` (28px) + "Count Cash" label in warm style
- Input rows: white bg, gold border-focus, `--sb-text` value
- Total: large gold value display

---

## 6. What Does NOT Change

- All business logic, API calls, form validation, auth flow
- Component file structure (no files added or removed)
- Recharts chart library usage (only colors change)
- The Google Sign-In button (rendered by Google's SDK, unstyled by us)
- JWT authentication and localStorage behavior
- Mobile routing (`/mobile` path)

---

## 7. Files to Modify

| File | Change |
|---|---|
| `frontend/src/App.js` | Loading state: bg + spinner color |
| `frontend/src/components/LoginNew.js` | Full warm redesign + StewardBox hero |
| `frontend/src/components/Dashboard.js` | Sidebar nav icons + warm palette throughout |
| `frontend/src/components/mobile/MobileLayout.js` | Remove dark glass, warm header + 3-tab design |
| `frontend/src/components/mobile/MobileSubmitForm.js` | Warm card styles, gold button |
| `frontend/src/components/mobile/MobileRecentList.js` | Warm card styles, empty state |
| `frontend/src/components/mobile/ConnectionBanner.js` | Character banners for offline/online |
| `frontend/src/components/mobile/DenominationCalculator.js` | Warm card + sb-calculator.png header |

---

## 8. Non-Goals

- No new features or routes
- No font changes
- No animation / transition additions beyond what already exists
- No changes to the backend
- No changes to other components not listed above (PrintReportModal, UserManagement, ReportsView, FinancialRecordsManager, CustomFields*)
