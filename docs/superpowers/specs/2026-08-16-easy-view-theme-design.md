# Easy View — An Accessible Theme for Elderly Church Leaders

**Date:** 2026-08-16
**Status:** Approved

## Problem

The elderly leaders of the church cannot comfortably read StewardBox. Two causes,
both measured against the codebase rather than assumed:

**The text is too pale.** Contrast ratios computed against the app's own background
`#fef9f0`, where WCAG AA requires 4.5:1 for body text:

| Color | Uses | Ratio | Verdict |
|---|---|---|---|
| `#b89048` | 145 | 2.81:1 | fails |
| `#c49030` | 141 | 2.71:1 | fails |
| `#d4a843` | 23 | 2.11:1 | fails |
| `#c4a870` | 4 | 2.18:1 | fails |

These are not incidental colors. `#b89048` and `#c49030` are the two most-used
values in the entire frontend — field hints, section headings, tab labels,
placeholder text, the selected nav item, and the running total on the submit form.

**The text is too small, and the targets too tight.** Mobile form field labels are
11px and clipped with an ellipsis rather than wrapped, so "General Tithes &
Offering" renders as "General Tithes & Off…". The denomination-calculator button
beside each amount is 22×22px, half the 44px minimum both Apple and Google publish.
The desktop dashboard uses `text-xs` (12px) 113 times and `text-[10px]` four times.

Enlarging the type alone would not fix this: the pale gold stays hard to see at any
size.

## Solution Overview

A second theme, **Easy View**, that the user switches on per device. The current
theme is untouched and remains the default.

Easy View keeps every screen's layout and every step of every flow identical to the
default theme. It changes color, type scale, control metrics, and column count. A
leader who learned the app in one mode can still be talked through it in the other,
and there is no second flow to build, test, or keep in sync.

## Decisions

| Decision | Choice |
|---|---|
| Surfaces | Both — mobile PWA and desktop dashboard |
| Direction | Same screens, scaled up. Rejected: a guided one-question-per-screen form (Direction B) |
| Persistence | Per device, `localStorage`. Rejected: per-account, which needs a `users` column plus mirrored endpoints |
| Mechanism | CSS custom properties keyed off a `data-view` attribute on `<html>` |
| Default | The current theme, unchanged |
| v1 coverage | Screens leaders use. Activity Log, User Management, and Mobile Form Fields deferred |
| Backgrounds | Unchanged. Easy View must still look like StewardBox |

Direction B remains viable as a later layer on top of this work; it is not
foreclosed. It was declined for v1 because it is slower for a Sunday count and
doubles the submit-form surface area.

## Mechanism

`document.documentElement` carries `data-view="easy"`, or carries nothing at all in
the default theme. Every visual difference derives from that one attribute.

### `frontend/src/index.css`

`:root` defines the default token set. `html[data-view="easy"]` redefines the same
token names. Three groups:

- **Color** — surfaces, text, borders, accent, semantic red/green
- **Type** — a font-size variable and a matching line-height variable per step
- **Controls** — input min-height, minimum touch target, border width, focus ring

### `frontend/tailwind.config.js`

Three changes carry most of the migration:

1. **`theme.fontSize`** entries become tuples of variables —
   `sm: ['var(--fs-sm)', { lineHeight: 'var(--lh-sm)' }]`. All 277 uses of the named
   steps (`text-sm` 148, `text-xs` 113, `text-lg` 5, `text-base` 5, `text-2xl` 4,
   `text-xl` 2) then become themeable with no component edit at all. The six
   *arbitrary* sizes — `text-[10px]` ×4 and `text-[11px]` ×2 — are literals that no
   config override can reach, and must be rewritten by hand to a named step.
2. **`theme.extend.colors.sb.*`** maps to `var(--sb-*)`, so the 433 arbitrary-hex
   classes (`text-[#3d2a08]`) can be rewritten to named ones (`text-sb-text`).
3. **A custom `easy` variant** — `html[data-view="easy"] &` — so layout deltas stay
   local to the element they affect: `className="grid-cols-2 easy:grid-cols-1"`.

### `frontend/src/utils/theme.js`

This file already exists, exports the palette as `SB` and `G`, and is imported by
nothing. It becomes the JavaScript-side accessor, exporting `var(--sb-…)` strings so
that the 269 inline `style` objects draw from the same tokens as the Tailwind
classes. This also makes CLAUDE.md's existing claim — "palette and theme in
`frontend/src/utils/theme.js`" — true rather than aspirational.

No React context, no re-render on switch, no prop threading. Both modes are the same
components reading the same token names, so they cannot drift apart.

### Rejected alternatives

**React context with JS token objects.** Tailwind classes cannot read JavaScript
tokens, so the CSS variables would still be required; the context would be additive
work — a hook wired into every themed component, and a re-render on every switch —
for no extra coverage.

**An override stylesheet using `!important`.** Inline styles can only be overridden
with `!important`, and no selector can express "elements whose *text* is `#b89048`"
short of `[style*="#b89048"]`, which also matches every place that hex is a
background. Cheapest to ship and unmaintainable thereafter.

## The Switch

`frontend/src/hooks/useViewMode.js` reads `localStorage.sbViewMode`, writes
`document.documentElement.dataset.view`, and returns `[mode, setMode]`. Storage
access is wrapped in `try/catch`, matching the existing pattern at
`Dashboard.js:71`.

The attribute is applied in `index.js` **before the first render**, not inside an
effect. An effect would let the small theme paint first and then snap larger on
every load, which is exactly the flash this audience can least afford.

Two entry points, both labeled in words and never icon-only:

- **Mobile** — a third control in the header reading `Big Text · Off`. At the 430px
  max width, with Help and Sign out already present, the button row wraps to a
  second line in Easy mode. An honest wrap is preferred to hiding the control inside
  a menu.
- **Desktop** — an item in the sidebar footer above Change Password, styled to match
  the surrounding nav items.

Both render as `<button aria-pressed={...}>`.

## Token Values

### Color

Every Easy View value below was verified at or above 4.5:1 against all four
surfaces it can appear on — `#fef9f0`, `#fff8e6`, `#fef3d0`, and the `#f8d880`
active-tab fill. The worst case across those four is quoted.

| Token | Default | Easy View | Worst-case ratio |
|---|---|---|---|
| `--sb-text` | `#3d2a08` | `#3d2a08` (unchanged) | 9.87 |
| `--sb-text-s` | `#8a6028` | `#4a3208` | 8.64 |
| `--sb-text-x` | `#b89048` | `#6b4a14` | 5.78 |
| `--sb-muted` | `#c4a870` | `#6b4a14` | 5.78 |
| `--sb-gold` | `#c49030` | `#6f4a0c` | 5.68 |
| `--sb-red` | `#c04828` | `#8f2f18` | 5.85 |
| `--sb-green` | `#4a8030` | `#2f5a1c` | 5.82 |
| `--sb-border` | `#e8d090`, 1px | `#8a6028`, 2px | 4.00 (3:1 needed) |

Backgrounds are deliberately unchanged.

### Type

Approximately 1.3×, with line-height variables supplied alongside every size:

| Step | Default | Easy View |
|---|---|---|
| `--fs-2xs` | 10px | 14px |
| `--fs-xs` | 12px | 16px |
| `--fs-sm` | 14px | 18px |
| `--fs-base` | 16px | 20px |
| `--fs-lg` | 18px | 23px |
| `--fs-xl` | 20px | 26px |
| `--fs-2xl` | 24px | 30px |

A new `2xs` step is registered in the Tailwind config so the six arbitrary
`text-[10px]` / `text-[11px]` classes have a named step to move to.

The 78 inline `fontSize` px values map onto these same tokens by nearest step.

### Controls

| Token | Default | Easy View |
|---|---|---|
| `--ctl-h` (input min-height) | 38px | 56px |
| `--tap` (minimum target) | 22px | 44px |
| `--ring` (focus ring) | 3px | 4px |

### Layout, via the `easy:` variant

- Mobile financial-breakdown grid: 2 columns → 1
- Mobile Control No. / Payment pair: 2 columns → 1
- Field labels: `truncate` and `white-space: nowrap` removed, so labels wrap and
  "General Tithes & Offering" reads in full
- Sidebar width and nav item height increase
- The calculator icon button gains a visible "Count bills" text label

## Scope

**In scope for v1:** Login, all six mobile PWA components, the desktop dashboard
shell, Reports, the Sunday Collection modal, the collection date calendar, Change
Password, and the Help guide.

**Deferred:** Activity Log, User Management, and Mobile Form Fields. All three are
admin or super-admin tooling that the elderly leaders this feature serves do not
open. They keep the default palette until a follow-up pass.

**Out of scope:** dark mode; syncing the preference across devices; Direction B's
guided step-by-step form; any change to backend, API, or database. This feature is
frontend-only and touches neither `api/` nor `backend/`, so the mirror rule in
CLAUDE.md does not apply.

## Testing

The completion bar from CLAUDE.md: relevant tests pass and
`cd frontend && npm run build` succeeds. Manual verification in a running app is not
available in this environment.

The load-bearing test is a **unit test over the token table** asserting that every
Easy View text token reaches at least 4.5:1 against every surface it can sit on, and
that borders reach 3:1. This is pure arithmetic over token values, so jsdom's
inability to see rendered CSS does not weaken it. It is the contrast check from this
document promoted to a permanent regression test — the property that actually
motivates the feature becomes the property that cannot silently break.

Also covered:

- `useViewMode`: defaults to the current theme; persists on change; reads back on
  init; falls back safely when `localStorage` throws
- The attribute lands on `document.documentElement` before first render
- Both toggles render a text label and reflect state through `aria-pressed`
- A `lint:tokens` script asserting no raw `#hex` survives in migrated files

**Explicitly not verified by any of the above:** the real CSS cascade, rendered
layout at true viewport sizes, and Recharts tick sizing. These require a human eye
or a browser and will be stated as unverified when the work is reported.

## Risks

1. **The Tailwind `fontSize` tuple override.** Supplying bare variables instead of
   `[size, { lineHeight }]` tuples would silently drop every default line-height in
   the app. Proving this override behaves is the first step of implementation and a
   go/no-go for the whole approach — not an assumption to build on top of.
2. **Recharts reads props, not CSS.** Axis ticks, legends, and tooltips take font
   size as component props and will not inherit the tokens. They need explicit
   values threaded from the token set.
3. **A wide mechanical diff.** 433 class rewrites plus ~120 inline hex replacements.
   Mitigated by per-file commits, the `lint:tokens` guard, and the existing test
   suite.
