# Easy View Accessible Theme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a per-device "Easy View" theme that enlarges type, darkens every failing colour to WCAG AA, and widens touch targets, without changing any screen's layout or flow.

**Also included:** finishing the rename of the app from "SBCC Financial System" to StewardBox (Task 13) — added to scope after the spec was approved, and independent of the theme work.

**Architecture:** One attribute — `data-view="easy"` on `<html>` — swaps a set of CSS custom properties defined in `index.css`. Tailwind's own `fontSize` and `colors` scales are pointed at those variables in `tailwind.config.js`, so existing `text-sm` classes become themeable with no edit, and `text-[#3d2a08]` classes are mechanically rewritten to `text-sb-text`. A `easy:` Tailwind variant carries the handful of layout deltas. `utils/theme.js` exports the same tokens as `var(...)` strings for the 269 inline `style` objects.

**Tech Stack:** React 19, Tailwind CSS 3.4, CRA (`react-scripts` 5), React Testing Library, Jest.

**Spec:** `docs/superpowers/specs/2026-08-16-easy-view-theme-design.md`

---

## Critical Context For The Engineer

Read these before starting. They are non-obvious and will cost you hours if missed.

1. **`react-scripts` hardcodes `resetMocks: true`.** Any implementation declared inside a `jest.mock()` factory is stripped before each test. Declare bare `jest.fn()` in the factory and set return values with `mockResolvedValue` / `mockReturnValue` inside `beforeEach`. The symptom of getting this wrong is a confusing crash *inside the component*, not a mocking error.
2. **`frontend/src/setupTests.js`** is where jsdom gaps are polyfilled — `structuredClone` and `ResizeObserver` (which Recharts' `ResponsiveContainer` constructs on mount). Any test rendering `Dashboard` needs them.
3. **jsdom does not resolve CSS custom properties or apply stylesheets.** Do not write tests that assert a rendered colour or font size. That is why Task 2 tests the *token table* instead — pure arithmetic, fully verifiable.
4. **This feature is frontend-only.** It touches neither `api/` nor `backend/`, so the "api/ and backend/ are mirrors" rule in CLAUDE.md does not apply here.
5. **Completion bar:** `cd frontend && CI=true npm test` and `cd frontend && CI=true npm run build` both pass. Manual verification in a running app is not available in this environment.
6. **Run all commands from `frontend/`** unless stated otherwise.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `frontend/src/theme/tokens.js` | The single source of truth: both token sets as raw hex, plus which tokens are text / border / surface |
| `frontend/src/theme/contrast.js` | `contrastRatio(hexA, hexB)` — WCAG relative luminance |
| `frontend/src/theme/tokens.test.js` | Contrast regression test + a parity test that `index.css` matches `tokens.js` |
| `frontend/src/hooks/useViewMode.js` | Reads/writes `localStorage`, sets the `data-view` attribute, exports `applyViewMode()` for pre-render use |
| `frontend/src/hooks/useViewMode.test.js` | Hook behaviour incl. storage failure |
| `frontend/src/components/ViewModeToggle.js` | The labelled toggle button, shared by both surfaces |
| `frontend/src/components/ViewModeToggle.test.js` | Label and `aria-pressed` behaviour |

**Modify:**

| File | Change |
|---|---|
| `frontend/tailwind.config.js` | `extend.fontSize` → variable tuples; `extend.colors.sb` → variables; `easy` variant plugin |
| `frontend/src/index.css` | Both token blocks; `.mobile-input` / `.mobile-submit-btn` to use tokens |
| `frontend/src/index.js` | Call `applyViewMode()` before `root.render` |
| `frontend/src/utils/theme.js` | Export `var(...)` strings instead of hex |
| `frontend/src/components/mobile/MobileLayout.js` | Mount the toggle; tokenise |
| `frontend/src/components/Dashboard.js` | Mount the toggle; tokenise (75 arbitrary classes) |
| `frontend/src/components/mobile/MobileSubmitForm.js` | Tokenise; 1-column `easy:` layout; 44px targets |
| Remaining in-scope components | Tokenise (see Task 9) |

**Deferred, do not touch:** `ActivityLogView.js`, `UserManagement.js`, `CustomFieldsManager.js`, `CustomFieldsExample.js`.

---

## Task 1: Prove the Tailwind variable override works

This is the go/no-go for the whole approach. Tailwind `fontSize` entries are `[size, { lineHeight }]` tuples; supplying a bare variable silently drops every default line-height in the app. Prove the tuple form emits both properties before building anything on it.

**Files:**
- Modify: `frontend/tailwind.config.js`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Add a minimal token block to `index.css`**

Insert directly after the `@tailwind utilities;` line (currently line 6):

```css
:root {
  --fs-sm: 14px;
  --lh-sm: 20px;
}
```

- [ ] **Step 2: Point Tailwind's `sm` step at those variables**

Replace the whole of `frontend/tailwind.config.js` with:

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontSize: {
        sm: ['var(--fs-sm)', { lineHeight: 'var(--lh-sm)' }],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Build and inspect the emitted CSS**

```bash
cd frontend && CI=true npm run build && grep -o "\.text-sm{[^}]*}" build/static/css/*.css
```

Expected output — **both** properties present:

```
.text-sm{font-size:var(--fs-sm);line-height:var(--lh-sm)}
```

**If `line-height` is missing, STOP.** The approach needs rework; report back before continuing. If it is present, the go/no-go has passed.

- [ ] **Step 4: Commit**

```bash
git add frontend/tailwind.config.js frontend/src/index.css
git commit -m "build: point Tailwind's sm font step at CSS variables"
```

---

## Task 2: Token tables and the contrast regression test

The load-bearing test. `tokens.js` is the single source of truth; `index.css` is generated from it by hand, and a test asserts the two never drift.

**Files:**
- Create: `frontend/src/theme/contrast.js`
- Create: `frontend/src/theme/tokens.js`
- Create: `frontend/src/theme/tokens.test.js`

- [ ] **Step 1: Write the contrast helper**

Create `frontend/src/theme/contrast.js`:

```js
// WCAG 2.1 relative luminance and contrast ratio.
// https://www.w3.org/TR/WCAG21/#dfn-relative-luminance

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map(i => channel(parseInt(m[1].slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
```

- [ ] **Step 2: Write the token tables**

Create `frontend/src/theme/tokens.js`:

```js
// Single source of truth for both themes.
//
// index.css declares these same values as CSS custom properties; tokens.test.js
// asserts the two files agree, so this table cannot drift out of sync with what
// actually renders.
//
// Naming: a token used as TEXT or a BORDER darkens in Easy View. A token used as
// a SURFACE or a FILL keeps its value — Easy View should still look like
// StewardBox. Where one hex served both roles in the old code it is split into
// two tokens here (e.g. `gold` vs `goldFill`).

export const DEFAULT_TOKENS = {
  // surfaces — never change between themes
  'sb-bg':            '#fef9f0',
  'sb-warm':          '#fff8e6',
  'sb-warm-2':        '#fef3d0',
  'sb-white':         '#fffdf5',
  'sb-hover-warm':    '#fff8e0',
  'sb-hover-warm-2':  '#fff3d8',
  'sb-hover-soft':    '#f0e4b0',
  'sb-red-bg':        '#fff0ee',
  'sb-red-bg-2':      '#fff5f0',
  'sb-green-bg':      '#f0f8e8',

  // text
  'sb-text':          '#3d2a08',
  'sb-text-s':        '#8a6028',
  'sb-text-x':        '#b89048',
  'sb-text-alt':      '#8a6a2a',
  'sb-text-faint':    '#d4c090',
  'sb-muted':         '#c4a870',
  'sb-gold':          '#c49030',
  'sb-gold-l':        '#d4a843',
  'sb-gold-h-text':   '#b87830',
  'sb-red':           '#c04828',
  'sb-red-alt':       '#b3452f',
  'sb-red-h':         '#a03820',
  'sb-green':         '#4a8030',

  // borders
  'sb-border':        '#e8d090',
  'sb-border-s':      '#f0e4b0',
  'sb-border-a':      '#e8c870',
  'sb-red-border':    '#f0b8a8',
  'sb-red-border-2':  '#f0c0b0',
  'sb-green-border':  '#a0c880',
  'sb-green-border-2':'#a0c870',

  // fills — solid blocks that carry text or act as indicators
  'sb-gold-fill':     '#c49030',
  'sb-gold-fill-h':   '#b07d24',
  'sb-red-fill':      '#c04828',
  'sb-green-fill':    '#4a8030',
  'sb-brown-fill':    '#b87038',
  'sb-on-fill':       '#fff8e6',
};

export const EASY_TOKENS = {
  ...DEFAULT_TOKENS,

  // text — every value below clears 4.5:1 on all four surfaces
  'sb-text-s':        '#4a3208',
  'sb-text-x':        '#6b4a14',
  'sb-text-alt':      '#4a3208',
  'sb-text-faint':    '#6b4a14',
  'sb-muted':         '#6b4a14',
  'sb-gold':          '#6f4a0c',
  'sb-gold-l':        '#6f4a0c',
  'sb-gold-h-text':   '#5a3d10',
  'sb-red':           '#8f2f18',
  'sb-red-alt':       '#8f2f18',
  'sb-red-h':         '#6f2410',
  'sb-green':         '#2f5a1c',

  // borders — 3:1 minimum, and rendered at 2px (see index.css --sb-bw)
  'sb-border':        '#8a6028',
  'sb-border-s':      '#8a6028',
  'sb-border-a':      '#6f4a0c',
  'sb-red-border':    '#8f2f18',
  'sb-red-border-2':  '#8f2f18',
  'sb-green-border':  '#2f5a1c',
  'sb-green-border-2':'#2f5a1c',

  // fills — darkened so the cream label on top clears AA, and so the small
  // status dots clear the 3:1 bar for non-text indicators
  'sb-gold-fill':     '#6f4a0c',
  'sb-gold-fill-h':   '#5a3d10',
  'sb-red-fill':      '#8f2f18',
  'sb-green-fill':    '#2f5a1c',
  'sb-brown-fill':    '#7a4310',
};

// Every surface a foreground token can land on.
export const SURFACES = ['#fef9f0', '#fff8e6', '#fef3d0', '#f8d880'];

// Classification drives the test below.
export const TEXT_TOKENS = [
  'sb-text', 'sb-text-s', 'sb-text-x', 'sb-text-alt', 'sb-text-faint',
  'sb-muted', 'sb-gold', 'sb-gold-l', 'sb-gold-h-text',
  'sb-red', 'sb-red-alt', 'sb-red-h', 'sb-green',
];

export const BORDER_TOKENS = [
  'sb-border', 'sb-border-s', 'sb-border-a',
  'sb-red-border', 'sb-red-border-2', 'sb-green-border', 'sb-green-border-2',
];

// Fills that carry `sb-on-fill` text, or act as a standalone indicator.
export const FILL_TOKENS = [
  'sb-gold-fill', 'sb-gold-fill-h', 'sb-red-fill', 'sb-green-fill', 'sb-brown-fill',
];

export const TYPE_TOKENS = {
  default: {
    '--fs-2xs': '10px', '--lh-2xs': '14px',
    '--fs-xs':  '12px', '--lh-xs':  '16px',
    '--fs-sm':  '14px', '--lh-sm':  '20px',
    '--fs-base':'16px', '--lh-base':'24px',
    '--fs-lg':  '18px', '--lh-lg':  '28px',
    '--fs-xl':  '20px', '--lh-xl':  '28px',
    '--fs-2xl': '24px', '--lh-2xl': '32px',
    '--sb-bw':  '1px',
    '--sb-ctl-h': '38px',
    '--sb-tap': '22px',
    '--sb-ring': '3px',
  },
  easy: {
    '--fs-2xs': '14px', '--lh-2xs': '20px',
    '--fs-xs':  '16px', '--lh-xs':  '22px',
    '--fs-sm':  '18px', '--lh-sm':  '26px',
    '--fs-base':'20px', '--lh-base':'30px',
    '--fs-lg':  '23px', '--lh-lg':  '32px',
    '--fs-xl':  '26px', '--lh-xl':  '34px',
    '--fs-2xl': '30px', '--lh-2xl': '38px',
    '--sb-bw':  '2px',
    '--sb-ctl-h': '56px',
    '--sb-tap': '44px',
    '--sb-ring': '4px',
  },
};
```

- [ ] **Step 3: Write the failing test**

Create `frontend/src/theme/tokens.test.js`:

```js
import fs from 'fs';
import path from 'path';
import { contrastRatio } from './contrast';
import {
  DEFAULT_TOKENS, EASY_TOKENS, SURFACES,
  TEXT_TOKENS, BORDER_TOKENS, FILL_TOKENS, TYPE_TOKENS,
} from './tokens';

const AA_TEXT = 4.5;
const NON_TEXT = 3;

describe('Easy View contrast', () => {
  test.each(TEXT_TOKENS)('%s clears AA on every surface', (name) => {
    const colour = EASY_TOKENS[name];
    SURFACES.forEach(surface => {
      // Reported as an object so a failure names the surface, not just a number.
      expect({ surface, ok: contrastRatio(colour, surface) >= AA_TEXT })
        .toEqual({ surface, ok: true });
    });
  });

  test.each(BORDER_TOKENS)('%s clears 3:1 on every surface', (name) => {
    const colour = EASY_TOKENS[name];
    SURFACES.forEach(surface => {
      expect(contrastRatio(colour, surface)).toBeGreaterThanOrEqual(NON_TEXT);
    });
  });

  test.each(FILL_TOKENS)('%s carries readable label text and reads as an indicator', (name) => {
    const fill = EASY_TOKENS[name];
    // The cream label sitting on top of the fill (e.g. the Copy button).
    expect(contrastRatio(EASY_TOKENS['sb-on-fill'], fill)).toBeGreaterThanOrEqual(AA_TEXT);
    // The fill used as a bare status dot against the warm surface.
    expect(contrastRatio(fill, '#fff8e6')).toBeGreaterThanOrEqual(NON_TEXT);
  });

  test('Easy View never shrinks a font size', () => {
    Object.keys(TYPE_TOKENS.default)
      .filter(k => k.startsWith('--fs-'))
      .forEach(k => {
        expect(parseInt(TYPE_TOKENS.easy[k], 10))
          .toBeGreaterThan(parseInt(TYPE_TOKENS.default[k], 10));
      });
  });

  test('Easy View meets the 44px minimum touch target', () => {
    expect(parseInt(TYPE_TOKENS.easy['--sb-tap'], 10)).toBeGreaterThanOrEqual(44);
  });

  test('the two token sets define exactly the same names', () => {
    expect(Object.keys(EASY_TOKENS).sort()).toEqual(Object.keys(DEFAULT_TOKENS).sort());
  });
});

describe('index.css matches tokens.js', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');

  const block = (selector) => {
    const start = css.indexOf(selector + ' {');
    if (start === -1) throw new Error(`No "${selector} {" block in index.css`);
    return css.slice(start, css.indexOf('}', start));
  };

  test('every default colour token is declared on :root', () => {
    const root = block(':root');
    Object.entries(DEFAULT_TOKENS).forEach(([name, value]) => {
      expect(root).toContain(`--${name}: ${value};`);
    });
  });

  test('every Easy View colour override is declared', () => {
    const easy = block('html[data-view="easy"]');
    Object.entries(EASY_TOKENS)
      .filter(([name, value]) => DEFAULT_TOKENS[name] !== value)
      .forEach(([name, value]) => {
        expect(easy).toContain(`--${name}: ${value};`);
      });
  });

  test('every type and control token is declared in both blocks', () => {
    const root = block(':root');
    const easy = block('html[data-view="easy"]');
    Object.entries(TYPE_TOKENS.default).forEach(([name, value]) => {
      expect(root).toContain(`${name}: ${value};`);
    });
    Object.entries(TYPE_TOKENS.easy).forEach(([name, value]) => {
      expect(easy).toContain(`${name}: ${value};`);
    });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern="theme/tokens" 2>&1 | tail -25
```

Expected: the contrast tests PASS (the values were chosen to), and the three `index.css matches tokens.js` tests FAIL with `No ":root {" block in index.css` — because `index.css` currently has `:root` nowhere and only the two placeholder variables from Task 1.

- [ ] **Step 5: Write the token blocks into `index.css`**

Replace the `:root` block added in Task 1 (directly after `@tailwind utilities;`) with the full declaration. Every value must match `tokens.js` character for character — the test compares strings.

```css
:root {
  /* surfaces */
  --sb-bg: #fef9f0;
  --sb-warm: #fff8e6;
  --sb-warm-2: #fef3d0;
  --sb-white: #fffdf5;
  --sb-hover-warm: #fff8e0;
  --sb-hover-warm-2: #fff3d8;
  --sb-hover-soft: #f0e4b0;
  --sb-red-bg: #fff0ee;
  --sb-red-bg-2: #fff5f0;
  --sb-green-bg: #f0f8e8;

  /* text */
  --sb-text: #3d2a08;
  --sb-text-s: #8a6028;
  --sb-text-x: #b89048;
  --sb-text-alt: #8a6a2a;
  --sb-text-faint: #d4c090;
  --sb-muted: #c4a870;
  --sb-gold: #c49030;
  --sb-gold-l: #d4a843;
  --sb-gold-h-text: #b87830;
  --sb-red: #c04828;
  --sb-red-alt: #b3452f;
  --sb-red-h: #a03820;
  --sb-green: #4a8030;

  /* borders */
  --sb-border: #e8d090;
  --sb-border-s: #f0e4b0;
  --sb-border-a: #e8c870;
  --sb-red-border: #f0b8a8;
  --sb-red-border-2: #f0c0b0;
  --sb-green-border: #a0c880;
  --sb-green-border-2: #a0c870;

  /* fills */
  --sb-gold-fill: #c49030;
  --sb-gold-fill-h: #b07d24;
  --sb-red-fill: #c04828;
  --sb-green-fill: #4a8030;
  --sb-brown-fill: #b87038;
  --sb-on-fill: #fff8e6;

  /* type */
  --fs-2xs: 10px;
  --lh-2xs: 14px;
  --fs-xs: 12px;
  --lh-xs: 16px;
  --fs-sm: 14px;
  --lh-sm: 20px;
  --fs-base: 16px;
  --lh-base: 24px;
  --fs-lg: 18px;
  --lh-lg: 28px;
  --fs-xl: 20px;
  --lh-xl: 28px;
  --fs-2xl: 24px;
  --lh-2xl: 32px;

  /* controls */
  --sb-bw: 1px;
  --sb-ctl-h: 38px;
  --sb-tap: 22px;
  --sb-ring: 3px;
}

html[data-view="easy"] {
  /* text */
  --sb-text-s: #4a3208;
  --sb-text-x: #6b4a14;
  --sb-text-alt: #4a3208;
  --sb-text-faint: #6b4a14;
  --sb-muted: #6b4a14;
  --sb-gold: #6f4a0c;
  --sb-gold-l: #6f4a0c;
  --sb-gold-h-text: #5a3d10;
  --sb-red: #8f2f18;
  --sb-red-alt: #8f2f18;
  --sb-red-h: #6f2410;
  --sb-green: #2f5a1c;

  /* borders */
  --sb-border: #8a6028;
  --sb-border-s: #8a6028;
  --sb-border-a: #6f4a0c;
  --sb-red-border: #8f2f18;
  --sb-red-border-2: #8f2f18;
  --sb-green-border: #2f5a1c;
  --sb-green-border-2: #2f5a1c;

  /* fills */
  --sb-gold-fill: #6f4a0c;
  --sb-gold-fill-h: #5a3d10;
  --sb-red-fill: #8f2f18;
  --sb-green-fill: #2f5a1c;
  --sb-brown-fill: #7a4310;

  /* type */
  --fs-2xs: 14px;
  --lh-2xs: 20px;
  --fs-xs: 16px;
  --lh-xs: 22px;
  --fs-sm: 18px;
  --lh-sm: 26px;
  --fs-base: 20px;
  --lh-base: 30px;
  --fs-lg: 23px;
  --lh-lg: 32px;
  --fs-xl: 26px;
  --lh-xl: 34px;
  --fs-2xl: 30px;
  --lh-2xl: 38px;

  /* controls */
  --sb-bw: 2px;
  --sb-ctl-h: 56px;
  --sb-tap: 44px;
  --sb-ring: 4px;
}
```

- [ ] **Step 6: Run the test to verify it passes**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern="theme/tokens" 2>&1 | tail -15
```

Expected: PASS, all suites.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/theme frontend/src/index.css
git commit -m "feat: add Easy View design tokens with a contrast regression test"
```

---

## Task 3: The `useViewMode` hook

**Files:**
- Create: `frontend/src/hooks/useViewMode.js`
- Create: `frontend/src/hooks/useViewMode.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/hooks/useViewMode.test.js`:

```js
import { renderHook, act } from '@testing-library/react';
import useViewMode, { applyViewMode, STORAGE_KEY } from './useViewMode';

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.view;
});

test('defaults to the standard theme', () => {
  const { result } = renderHook(() => useViewMode());
  expect(result.current[0]).toBe('default');
  expect(document.documentElement.dataset.view).toBeUndefined();
});

test('switching to easy sets the attribute and persists', () => {
  const { result } = renderHook(() => useViewMode());
  act(() => result.current[1]('easy'));
  expect(result.current[0]).toBe('easy');
  expect(document.documentElement.dataset.view).toBe('easy');
  expect(window.localStorage.getItem(STORAGE_KEY)).toBe('easy');
});

test('switching back to default removes the attribute', () => {
  window.localStorage.setItem(STORAGE_KEY, 'easy');
  const { result } = renderHook(() => useViewMode());
  expect(result.current[0]).toBe('easy');
  act(() => result.current[1]('default'));
  expect(document.documentElement.dataset.view).toBeUndefined();
  expect(window.localStorage.getItem(STORAGE_KEY)).toBe('default');
});

test('reads a stored preference on init', () => {
  window.localStorage.setItem(STORAGE_KEY, 'easy');
  const { result } = renderHook(() => useViewMode());
  expect(result.current[0]).toBe('easy');
});

test('ignores an unrecognised stored value', () => {
  window.localStorage.setItem(STORAGE_KEY, 'enormous');
  const { result } = renderHook(() => useViewMode());
  expect(result.current[0]).toBe('default');
});

test('survives localStorage throwing', () => {
  const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('denied');
  });

  const { result } = renderHook(() => useViewMode());
  expect(result.current[0]).toBe('default');
  act(() => result.current[1]('easy'));
  // The attribute still applies even though the preference could not be saved.
  expect(document.documentElement.dataset.view).toBe('easy');

  getItem.mockRestore();
  setItem.mockRestore();
});

test('applyViewMode sets the attribute before any React render', () => {
  window.localStorage.setItem(STORAGE_KEY, 'easy');
  applyViewMode();
  expect(document.documentElement.dataset.view).toBe('easy');
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern="useViewMode" 2>&1 | tail -12
```

Expected: FAIL — `Cannot find module './useViewMode'`.

- [ ] **Step 3: Write the hook**

Create `frontend/src/hooks/useViewMode.js`:

```js
import { useState, useCallback } from 'react';

export const STORAGE_KEY = 'sbViewMode';

const MODES = ['default', 'easy'];

// Storage is wrapped throughout: Safari private mode and locked-down device
// policies both throw on access, and a theme preference is never worth a crash.
export function readStoredMode() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return MODES.includes(stored) ? stored : 'default';
  } catch {
    return 'default';
  }
}

function writeAttribute(mode) {
  if (mode === 'easy') {
    document.documentElement.dataset.view = 'easy';
  } else {
    delete document.documentElement.dataset.view;
  }
}

// Called from index.js before the first render. Doing this in an effect instead
// would paint the small theme and then snap larger on every load — precisely the
// flash the people who need Easy View can least afford.
export function applyViewMode() {
  writeAttribute(readStoredMode());
}

export default function useViewMode() {
  const [mode, setMode] = useState(readStoredMode);

  const update = useCallback((next) => {
    const value = MODES.includes(next) ? next : 'default';
    setMode(value);
    writeAttribute(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Preference could not be saved; the theme still applies for this session.
    }
  }, []);

  return [mode, update];
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern="useViewMode" 2>&1 | tail -12
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Apply the mode before first render**

In `frontend/src/index.js`, add the import after the existing `./index.css` import and call it before `root.render`:

```js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { applyViewMode } from './hooks/useViewMode';

applyViewMode();

const root = ReactDOM.createRoot(document.getElementById('root'));
```

Leave the rest of the file unchanged.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useViewMode.js frontend/src/hooks/useViewMode.test.js frontend/src/index.js
git commit -m "feat: add the useViewMode hook and apply it before first render"
```

---

## Task 4: The `ViewModeToggle` component

One component, used on both surfaces. Labelled in words — this audience cannot be asked to decode an icon.

**Files:**
- Create: `frontend/src/components/ViewModeToggle.js`
- Create: `frontend/src/components/ViewModeToggle.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ViewModeToggle.test.js`:

```js
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ViewModeToggle from './ViewModeToggle';
import { STORAGE_KEY } from '../hooks/useViewMode';

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.view;
});

test('renders a visible text label, not an icon alone', () => {
  render(<ViewModeToggle />);
  const button = screen.getByRole('button', { name: /big text/i });
  expect(button).toHaveTextContent(/big text/i);
});

test('is not pressed by default', () => {
  render(<ViewModeToggle />);
  expect(screen.getByRole('button', { name: /big text/i }))
    .toHaveAttribute('aria-pressed', 'false');
});

test('turns Easy View on and reports it', () => {
  render(<ViewModeToggle />);
  const button = screen.getByRole('button', { name: /big text/i });
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(document.documentElement.dataset.view).toBe('easy');
  expect(window.localStorage.getItem(STORAGE_KEY)).toBe('easy');
});

test('turns Easy View back off', () => {
  render(<ViewModeToggle />);
  const button = screen.getByRole('button', { name: /big text/i });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(document.documentElement.dataset.view).toBeUndefined();
});

test('shows the current state in words', () => {
  render(<ViewModeToggle />);
  expect(screen.getByText(/off/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /big text/i }));
  expect(screen.getByText(/on/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern="ViewModeToggle" 2>&1 | tail -12
```

Expected: FAIL — `Cannot find module './ViewModeToggle'`.

- [ ] **Step 3: Write the component**

Create `frontend/src/components/ViewModeToggle.js`:

```js
import React from 'react';
import { Type } from 'lucide-react';
import useViewMode from '../hooks/useViewMode';

// The label is always visible: an icon-only control is unusable for the people
// this mode exists for. `variant` only changes the shape, never the wording.
export default function ViewModeToggle({ variant = 'compact', className = '' }) {
  const [mode, setMode] = useViewMode();
  const on = mode === 'easy';

  const base = variant === 'nav'
    ? 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium border'
    : 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border';

  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => setMode(on ? 'default' : 'easy')}
      className={`${base} transition-colors ${
        on
          ? 'bg-sb-hoverSoft border-sb-borderA text-sb-text'
          : 'bg-sb-warm border-sb-border text-sb-textS'
      } ${className}`}
      style={{ minHeight: 'var(--sb-tap)', borderWidth: 'var(--sb-bw)' }}
    >
      <Type className="flex-shrink-0" style={{ width: 16, height: 16 }} aria-hidden="true" />
      <span>Big Text</span>
      <span className="font-semibold">{on ? 'On' : 'Off'}</span>
    </button>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern="ViewModeToggle" 2>&1 | tail -12
```

Expected: PASS, 5 tests.

Note: `bg-sb-hoverSoft` and friends do not resolve to anything yet — Task 5 registers them. jsdom does not apply CSS, so the tests pass regardless; the classes become live after Task 5. The camelCase is deliberate: Tailwind builds the class name from the config key, so `sb: { hoverSoft: ... }` yields `bg-sb-hoverSoft`, **not** `bg-sb-hover-soft`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ViewModeToggle.js frontend/src/components/ViewModeToggle.test.js
git commit -m "feat: add the Big Text toggle component"
```

---

## Task 5: Register every token with Tailwind

**Files:**
- Modify: `frontend/tailwind.config.js`

- [ ] **Step 1: Write the full config**

Replace `frontend/tailwind.config.js` entirely:

```js
const plugin = require('tailwindcss/plugin');

// Colour and size values live in src/index.css as custom properties, and in
// src/theme/tokens.js as the source of truth a test asserts against. This file
// only wires Tailwind's scales up to them, so `text-sm` and `text-sb-text`
// re-theme themselves when <html data-view="easy"> appears.
const c = (name) => `var(--${name})`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontSize: {
        '2xs':  ['var(--fs-2xs)',  { lineHeight: 'var(--lh-2xs)' }],
        xs:     ['var(--fs-xs)',   { lineHeight: 'var(--lh-xs)' }],
        sm:     ['var(--fs-sm)',   { lineHeight: 'var(--lh-sm)' }],
        base:   ['var(--fs-base)', { lineHeight: 'var(--lh-base)' }],
        lg:     ['var(--fs-lg)',   { lineHeight: 'var(--lh-lg)' }],
        xl:     ['var(--fs-xl)',   { lineHeight: 'var(--lh-xl)' }],
        '2xl':  ['var(--fs-2xl)',  { lineHeight: 'var(--lh-2xl)' }],
      },
      colors: {
        sb: {
          bg:          c('sb-bg'),
          warm:        c('sb-warm'),
          warm2:       c('sb-warm-2'),
          white:       c('sb-white'),
          hoverWarm:   c('sb-hover-warm'),
          hoverWarm2:  c('sb-hover-warm-2'),
          hoverSoft:   c('sb-hover-soft'),
          redBg:       c('sb-red-bg'),
          redBg2:      c('sb-red-bg-2'),
          greenBg:     c('sb-green-bg'),

          text:        c('sb-text'),
          textS:       c('sb-text-s'),
          textX:       c('sb-text-x'),
          textAlt:     c('sb-text-alt'),
          textFaint:   c('sb-text-faint'),
          muted:       c('sb-muted'),
          gold:        c('sb-gold'),
          goldL:       c('sb-gold-l'),
          goldHText:   c('sb-gold-h-text'),
          red:         c('sb-red'),
          redAlt:      c('sb-red-alt'),
          redH:        c('sb-red-h'),
          green:       c('sb-green'),

          border:      c('sb-border'),
          borderS:     c('sb-border-s'),
          borderA:     c('sb-border-a'),
          redBorder:   c('sb-red-border'),
          redBorder2:  c('sb-red-border-2'),
          greenBorder: c('sb-green-border'),
          greenBorder2:c('sb-green-border-2'),

          goldFill:    c('sb-gold-fill'),
          goldFillH:   c('sb-gold-fill-h'),
          redFill:     c('sb-red-fill'),
          greenFill:   c('sb-green-fill'),
          brownFill:   c('sb-brown-fill'),
          onFill:      c('sb-on-fill'),
        },
      },
    },
  },
  plugins: [
    plugin(function ({ addVariant }) {
      // `easy:grid-cols-1` — layout deltas stay next to the default they replace.
      addVariant('easy', 'html[data-view="easy"] &');
    }),
  ],
};
```

- [ ] **Step 2: Verify the variant and colours emit**

```bash
cd frontend && CI=true npm run build && grep -c "data-view=\"easy\"" build/static/css/*.css
```

Expected: a count of at least `1` — the `ViewModeToggle` classes from Task 4 plus the `easy` variant are now compiled. If the count is `0`, the plugin is not registered; recheck the `plugins` array.

- [ ] **Step 3: Run the full suite**

```bash
cd frontend && CI=true npm test 2>&1 | tail -20
```

Expected: PASS, no regressions.

- [ ] **Step 4: Commit**

```bash
git add frontend/tailwind.config.js
git commit -m "build: register Easy View colour and type tokens with Tailwind"
```

---

## Task 6: Point `utils/theme.js` at the tokens

This file exists today, exports raw hex, and is imported by nothing. It becomes the accessor for inline `style` objects.

**Files:**
- Modify: `frontend/src/utils/theme.js`

- [ ] **Step 1: Rewrite the file**

Replace `frontend/src/utils/theme.js` entirely:

```js
// Inline `style` objects read their colours from here so they re-theme with the
// Tailwind classes. Values are `var(...)` strings, not hex — the actual colours
// live in src/index.css, and src/theme/tokens.js is the source of truth those
// are checked against.

export const SB = {
  bg:        'var(--sb-bg)',
  bgWarm:    'var(--sb-warm)',
  bgWarm2:   'var(--sb-warm-2)',
  white:     'var(--sb-white)',
  border:    'var(--sb-border)',
  borderS:   'var(--sb-border-s)',
  borderA:   'var(--sb-border-a)',
  text:      'var(--sb-text)',
  textS:     'var(--sb-text-s)',
  textX:     'var(--sb-text-x)',
  muted:     'var(--sb-muted)',
  gold:      'var(--sb-gold)',
  goldL:     'var(--sb-gold-l)',
  goldFill:  'var(--sb-gold-fill)',
  onFill:    'var(--sb-on-fill)',
  red:       'var(--sb-red)',
  green:     'var(--sb-green)',
};

// Control metrics — swap with the theme, so a tap target grows without the
// component knowing which mode it is in.
export const M = {
  controlHeight: 'var(--sb-ctl-h)',
  tap:           'var(--sb-tap)',
  border:        'var(--sb-bw)',
  ring:          'var(--sb-ring)',
};

// Type steps, for inline styles that cannot use a Tailwind class.
export const T = {
  xxs:  'var(--fs-2xs)',
  xs:   'var(--fs-xs)',
  sm:   'var(--fs-sm)',
  base: 'var(--fs-base)',
  lg:   'var(--fs-lg)',
  xl:   'var(--fs-xl)',
  xxl:  'var(--fs-2xl)',
};

export const G = {
  hero:    'linear-gradient(160deg, var(--sb-hover-warm), #fde8b0, #f8d880)',
  button:  'linear-gradient(135deg, var(--sb-gold-l), var(--sb-gold-fill))',
  sidebar: 'linear-gradient(180deg, var(--sb-warm), var(--sb-warm-2))',
  active:  'linear-gradient(135deg, var(--sb-warm), #fdefc0)',
};
```

- [ ] **Step 2: Move the shared CSS classes onto tokens**

In `frontend/src/index.css`, replace the `.mobile-input` and `.mobile-submit-btn` rule bodies (currently lines 83–133, now shifted down by the token blocks) so they read from the variables. Keep every other declaration as-is:

```css
.mobile-input {
  background: var(--sb-warm);
  border: var(--sb-bw) solid var(--sb-border);
  border-radius: 10px;
  color: var(--sb-text);
  width: 100%;
  min-height: var(--sb-ctl-h);
  padding: 10px 14px;
  font-size: var(--fs-sm);
  font-family: 'Plus Jakarta Sans', sans-serif;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  box-sizing: border-box;
}
.mobile-input:focus {
  border-color: var(--sb-gold);
  background: #fff;
  box-shadow: 0 0 0 var(--sb-ring) rgba(196,144,48,0.22);
}
.mobile-input::placeholder { color: var(--sb-text-x); }
.mobile-input option { background: var(--sb-warm); color: var(--sb-text); }
.mobile-input[type="date"]::-webkit-calendar-picker-indicator { filter: none; cursor: pointer; opacity: 0.6; }
.mobile-input.mono { font-family: 'JetBrains Mono', monospace; font-size: var(--fs-xs); }

.mobile-submit-btn {
  width: 100%;
  min-height: var(--sb-tap);
  padding: 14px;
  border-radius: 12px;
  font-size: var(--fs-sm);
  font-weight: 600;
  font-family: 'Plus Jakarta Sans', sans-serif;
  cursor: pointer;
  border: none;
  outline: none;
  letter-spacing: 0.03em;
  background: linear-gradient(135deg, var(--sb-gold-l), var(--sb-gold-fill-h));
  color: #0a0809;
  position: relative;
  overflow: hidden;
  transition: transform 0.15s ease, opacity 0.15s ease;
}
```

Also change the `body` background at the top of `@layer base` from `#fef9f0` to `var(--sb-bg)`, and the three `.scrollbar-thin` colours from `#e8d090` to `var(--sb-border)`.

- [ ] **Step 3: Run the full suite and build**

```bash
cd frontend && CI=true npm test 2>&1 | tail -20 && CI=true npm run build 2>&1 | tail -5
```

Expected: tests PASS, build succeeds. The `tokens.test.js` `index.css` parity tests must still pass — the token declarations themselves were not edited.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/theme.js frontend/src/index.css
git commit -m "refactor: read shared styles from the theme tokens"
```

---

## Task 7: Mount the toggle on mobile

**Files:**
- Modify: `frontend/src/components/mobile/MobileLayout.js:105-138`
- Modify: `frontend/src/components/mobile/MobileLayout.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/components/mobile/MobileLayout.test.js`:

```js
test('offers the Big Text toggle in the header', () => {
  render(<MobileLayout user={user} onLogout={jest.fn()} />);
  expect(screen.getByRole('button', { name: /big text/i })).toBeInTheDocument();
});
```

`user` is the module-level const already declared at the top of that file
(`{ name: 'Collector', email: 'collector@sbcc.church' }`), and the existing
`beforeEach` already stubs every API method the layout calls. Add nothing else.

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern="MobileLayout" 2>&1 | tail -12
```

Expected: FAIL — `Unable to find an accessible element with the role "button" and name /big text/i`.

- [ ] **Step 3: Add the toggle**

In `MobileLayout.js`, add the import at the top:

```js
import ViewModeToggle from '../ViewModeToggle';
```

Then change the button-row container (line 105) so it wraps, and add the toggle as its first child:

```js
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <ViewModeToggle />
```

Leave the existing Help and Sign out buttons exactly as they are, after it. `flexWrap: 'wrap'` is what lets the row become two lines in Easy View instead of overflowing the 430px frame.

- [ ] **Step 4: Run it to verify it passes**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern="MobileLayout" 2>&1 | tail -12
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/mobile/MobileLayout.js frontend/src/components/mobile/MobileLayout.test.js
git commit -m "feat: offer the Big Text toggle in the mobile header"
```

---

## Task 8: Mount the toggle on desktop

**Files:**
- Modify: `frontend/src/components/Dashboard.js:439-450`
- Modify: `frontend/src/components/Dashboard.activity.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/Dashboard.viewmode.test.js`:

```js
import React from 'react';
import { render, screen } from '@testing-library/react';
import Dashboard from './Dashboard';
import apiService from '../utils/api';

// This is the exact mock surface Dashboard.activity.test.js uses and it is known
// to work. Note the plain-object factory — Dashboard's suite does NOT use the
// { __esModule: true, default: {...} } shape that the mobile suites use. Copying
// the wrong one leaves apiService undefined at render time.
jest.mock('../utils/api', () => ({
  getCollections: jest.fn(),
  getExpenses: jest.fn(),
  getActivity: jest.fn(),
  healthCheck: jest.fn(),
}));

// resetMocks is on, so every return value must be set here, not in the factory.
beforeEach(() => {
  apiService.getCollections.mockResolvedValue([]);
  apiService.getExpenses.mockResolvedValue([]);
  apiService.getActivity.mockResolvedValue({ entries: [], total: 0, limit: 50, offset: 0 });
  apiService.healthCheck.mockResolvedValue({ status: 'OK' });
  window.localStorage.clear();
  delete document.documentElement.dataset.view;
});

test('offers the Big Text toggle in the sidebar', async () => {
  render(<Dashboard user={{ id: 1, email: 'a@b.c', name: 'A', role: 'admin' }} onLogout={() => {}} />);
  expect(await screen.findByRole('button', { name: /big text/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern="Dashboard.viewmode" 2>&1 | tail -12
```

Expected: FAIL — no matching button.

- [ ] **Step 3: Add the toggle**

In `Dashboard.js`, add the import alongside the other component imports:

```js
import ViewModeToggle from "./ViewModeToggle";
```

Then in the sidebar footer block (the `<div className="pt-3 mt-auto">` at line 439), insert the toggle directly after the divider and before the Change Password button:

```jsx
            <div className="h-px mx-1 mb-3" style={{ background: '#e8d090' }} />
            <ViewModeToggle variant="nav" className="mb-1" />
            <button
              onClick={() => setShowChangePassword(true)}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern="Dashboard.viewmode" 2>&1 | tail -12
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Dashboard.js frontend/src/components/Dashboard.viewmode.test.js
git commit -m "feat: offer the Big Text toggle in the desktop sidebar"
```

---

## Task 9: Rewrite the arbitrary hex classes

180 occurrences across the in-scope files, drawn from this fixed map. This is mechanical; the guard in Task 11 proves it was complete.

**Files (in scope):** `Dashboard.js`, `ReportsView.js`, `HelpGuide.js`, `ChangePasswordModal.js`, `SundayCollectionModal.js`, `CollectionDateCalendar.js`, `Login.js`, and everything under `components/mobile/`.

**Do not touch:** `ActivityLogView.js`, `UserManagement.js`, `CustomFieldsManager.js`, `CustomFieldsExample.js`.

- [ ] **Step 1: Apply the replacement map**

Run from the repo root. Each `sed` is scoped to the in-scope files only:

```bash
cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system/frontend/src

FILES="components/Dashboard.js components/ReportsView.js components/HelpGuide.js \
components/ChangePasswordModal.js components/SundayCollectionModal.js \
components/CollectionDateCalendar.js components/Login.js components/mobile/*.js"

# Order matters: hover: and bg-/text-/border- prefixes are matched whole, so the
# longest-prefixed patterns are safe to run in any order within one pass.
sed -i '' \
  -e 's/text-\[#b89048\]/text-sb-textX/g' \
  -e 's/text-\[#3d2a08\]/text-sb-text/g' \
  -e 's/text-\[#c49030\]/text-sb-gold/g' \
  -e 's/text-\[#8a6028\]/text-sb-textS/g' \
  -e 's/text-\[#c04828\]/text-sb-red/g' \
  -e 's/text-\[#4a8030\]/text-sb-green/g' \
  -e 's/text-\[#fff8e6\]/text-sb-onFill/g' \
  -e 's/text-\[#d4c090\]/text-sb-textFaint/g' \
  -e 's/text-\[#b3452f\]/text-sb-redAlt/g' \
  -e 's/text-\[#8a6a2a\]/text-sb-textAlt/g' \
  -e 's/hover:text-\[#8a6028\]/hover:text-sb-textS/g' \
  -e 's/hover:text-\[#b87830\]/hover:text-sb-goldHText/g' \
  -e 's/hover:text-\[#a03820\]/hover:text-sb-redH/g' \
  -e 's/border-\[#e8d090\]/border-sb-border/g' \
  -e 's/border-\[#f0e4b0\]/border-sb-borderS/g' \
  -e 's/border-\[#e8c870\]/border-sb-borderA/g' \
  -e 's/border-\[#f0b8a8\]/border-sb-redBorder/g' \
  -e 's/border-\[#f0c0b0\]/border-sb-redBorder2/g' \
  -e 's/border-\[#a0c880\]/border-sb-greenBorder/g' \
  -e 's/border-\[#a0c870\]/border-sb-greenBorder2/g' \
  -e 's/bg-\[#fff8e6\]/bg-sb-warm/g' \
  -e 's/bg-\[#fef9f0\]/bg-sb-bg/g' \
  -e 's/bg-\[#fffdf5\]/bg-sb-white/g' \
  -e 's/bg-\[#f0e4b0\]/bg-sb-hoverSoft/g' \
  -e 's/bg-\[#fff5f0\]/bg-sb-redBg2/g' \
  -e 's/bg-\[#fff0ee\]/bg-sb-redBg/g' \
  -e 's/bg-\[#f0f8e8\]/bg-sb-greenBg/g' \
  -e 's/bg-\[#c49030\]/bg-sb-goldFill/g' \
  -e 's/bg-\[#c04828\]/bg-sb-redFill/g' \
  -e 's/bg-\[#4a8030\]/bg-sb-greenFill/g' \
  -e 's/bg-\[#b87038\]/bg-sb-brownFill/g' \
  -e 's/hover:bg-\[#f0e4b0\]/hover:bg-sb-hoverSoft/g' \
  -e 's/hover:bg-\[#fef3d0\]/hover:bg-sb-warm2/g' \
  -e 's/hover:bg-\[#fff8e0\]/hover:bg-sb-hoverWarm/g' \
  -e 's/hover:bg-\[#fff3d8\]/hover:bg-sb-hoverWarm2/g' \
  -e 's/hover:bg-\[#fff0ee\]/hover:bg-sb-redBg/g' \
  -e 's/hover:bg-\[#b07d24\]/hover:bg-sb-goldFillH/g' \
  -e 's/ring-\[#c49030\]/ring-sb-gold/g' \
  $FILES

# text-[10px] and text-[11px] are arbitrary literals no config override reaches.
sed -i '' -e 's/text-\[10px\]/text-2xs/g' -e 's/text-\[11px\]/text-2xs/g' $FILES
```

- [ ] **Step 2: Verify no arbitrary hex class survives in scope**

```bash
cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system/frontend/src && \
grep -rn "\-\[#[0-9a-fA-F]" components/Dashboard.js components/ReportsView.js \
  components/HelpGuide.js components/ChangePasswordModal.js \
  components/SundayCollectionModal.js components/CollectionDateCalendar.js \
  components/Login.js components/mobile/ | grep -v "\.test\.js"
```

Expected: **no output.** Any line printed is a class the map missed — add it to `tokens.js`, `index.css`, `tailwind.config.js`, and the `sed` map, then re-run.

- [ ] **Step 3: Run the suite and build**

```bash
cd frontend && CI=true npm test 2>&1 | tail -20 && CI=true npm run build 2>&1 | tail -5
```

Expected: tests PASS, build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -u && git commit -m "refactor: replace arbitrary hex classes with theme tokens"
```

---

## Task 10: Replace inline hex and inline font sizes

~120 hex literals inside `style={{ ... }}` objects and 78 inline `fontSize` values, in the in-scope files.

**Files:** the same in-scope list as Task 9. `MobileSubmitForm.js`, `MobileRecentList.js`, `DenominationCalculator.js`, `MobileHelp.js`, and `MobileLayout.js` hold most of them.

- [ ] **Step 1: Import the tokens in each file being edited**

```js
import { SB, M, T, G } from '../../utils/theme';   // from components/mobile/
import { SB, M, T, G } from '../utils/theme';      // from components/
```

- [ ] **Step 2: Replace hex literals with token references**

Apply this map wherever the hex appears inside a `style` object. The role determines the token — a colour used as text takes the text token, the same hex used as a fill takes the fill token:

| Hex | As text / border | As surface / fill |
|---|---|---|
| `#3d2a08` | `SB.text` | — |
| `#8a6028` | `SB.textS` | — |
| `#b89048` | `SB.textX` | — |
| `#c4a870` | `SB.muted` | — |
| `#c49030` | `SB.gold` | `SB.goldFill` |
| `#d4a843` | `SB.goldL` | `SB.goldL` |
| `#c04828` | `SB.red` | `SB.red` |
| `#4a8030` | `SB.green` | `SB.green` |
| `#e8d090` | `SB.border` | — |
| `#f0e4b0` | `SB.borderS` | — |
| `#e8c870` | `SB.borderA` | — |
| `#fef9f0` | — | `SB.bg` |
| `#fff8e6` | — | `SB.bgWarm` |
| `#fef3d0` | — | `SB.bgWarm2` |
| `#fffdf5` | — | `SB.white` |

Gradients: replace the three literal gradients with `G.hero`, `G.button`, `G.sidebar`, and the repeated `'linear-gradient(135deg, #fff8e6, #fdefc0)'` active-state gradient with `G.active`.

- [ ] **Step 3: Replace inline font sizes with type tokens**

Map each inline `fontSize` to its nearest step. These are the exact values present:

| Inline value | Count | Replace with |
|---|---|---|
| `fontSize: 9` | 1 | `fontSize: T.xxs` |
| `fontSize: 10` | 5 | `fontSize: T.xxs` |
| `fontSize: 11` | 11 | `fontSize: T.xs` |
| `fontSize: 12` | 28 | `fontSize: T.xs` |
| `fontSize: 13` | 17 | `fontSize: T.sm` |
| `fontSize: 14` | 2 | `fontSize: T.sm` |
| `fontSize: 15` | 6 | `fontSize: T.base` |
| `fontSize: 17` | 1 | `fontSize: T.lg` |
| `fontSize: 20` | 1 | `fontSize: T.xl` |
| `fontSize: 22` | 1 | `fontSize: T.xxl` |
| `fontSize: 28` | 1 | `fontSize: T.xxl` |

- [ ] **Step 4: Grow the touch targets**

In `MobileSubmitForm.js`, the calculator button (around line 111) is a fixed 22×22. Replace its `width: 22, height: 22` with `minWidth: M.tap, minHeight: M.tap`, and its `border: '1px solid #e8c870'` with `border: \`${M.border} solid ${SB.borderA}\``.

Do the same for the prefill-banner dismiss button (around line 335), which is 20×20.

- [ ] **Step 5: Run the suite and build**

```bash
cd frontend && CI=true npm test 2>&1 | tail -20 && CI=true npm run build 2>&1 | tail -5
```

Expected: tests PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -u && git commit -m "refactor: read inline styles from the theme tokens"
```

---

## Task 11: The token guard script

Stops the next person reintroducing a raw hex into a migrated file.

**Files:**
- Create: `frontend/scripts/lint-tokens.js`
- Modify: `frontend/package.json`

- [ ] **Step 1: Write the script**

Create `frontend/scripts/lint-tokens.js`:

```js
#!/usr/bin/env node
// Fails if a migrated component reintroduces a raw hex colour. Colour belongs in
// src/index.css as a token, so that Easy View can override it.
const fs = require('fs');
const path = require('path');

const MIGRATED = [
  'components/Dashboard.js',
  'components/ReportsView.js',
  'components/HelpGuide.js',
  'components/ChangePasswordModal.js',
  'components/SundayCollectionModal.js',
  'components/CollectionDateCalendar.js',
  'components/Login.js',
  'components/ViewModeToggle.js',
  'components/mobile/ConnectionBanner.js',
  'components/mobile/DenominationCalculator.js',
  'components/mobile/MobileHelp.js',
  'components/mobile/MobileLayout.js',
  'components/mobile/MobileRecentList.js',
  'components/mobile/MobileSubmitForm.js',
  'components/mobile/MobileSummary.js',
];

// Pure-black overlays and shadow rgba() are not themeable colour; allow them.
const ALLOWED = /#0a0809/;

const src = path.join(__dirname, '..', 'src');
let failed = 0;

MIGRATED.forEach(rel => {
  const file = path.join(src, rel);
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const hits = line.match(/#[0-9a-fA-F]{6}\b/g);
    if (!hits) return;
    hits.filter(h => !ALLOWED.test(h)).forEach(h => {
      console.error(`${rel}:${i + 1}  raw colour ${h} — use a token from src/utils/theme.js`);
      failed += 1;
    });
  });
});

if (failed) {
  console.error(`\n${failed} raw colour(s) found in migrated files.`);
  process.exit(1);
}
console.log(`lint:tokens — ${MIGRATED.length} files clean.`);
```

- [ ] **Step 2: Register the script**

In `frontend/package.json`, add to `"scripts"`:

```json
    "lint:tokens": "node scripts/lint-tokens.js",
```

- [ ] **Step 3: Run it**

```bash
cd frontend && npm run lint:tokens
```

Expected: `lint:tokens — 15 files clean.` If it reports hits, they are real misses from Tasks 9–10; fix them and re-run.

- [ ] **Step 4: Commit**

```bash
git add frontend/scripts/lint-tokens.js frontend/package.json
git commit -m "chore: add a lint guard against raw colours in migrated files"
```

---

## Task 12: Layout deltas via the `easy:` variant

The changes that make Easy View readable rather than merely larger.

**Files:**
- Modify: `frontend/src/components/mobile/MobileSubmitForm.js`
- Modify: `frontend/src/components/Dashboard.js`

- [ ] **Step 1: One column for the mobile breakdown grid**

`MobileSubmitForm.js` has three `gridTemplateColumns: '1fr 1fr'` inline grids (around lines 396, 438, 457). Inline styles cannot carry a Tailwind variant, so convert each to a class:

```jsx
<div className="grid grid-cols-2 easy:grid-cols-1 gap-2.5">
```

Remove the corresponding `style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}`.

- [ ] **Step 2: Let field labels wrap instead of clipping**

In `MobileSubmitForm.js`, the `Field` component (line 43) and `BreakdownField` (line 85) both set `whiteSpace: 'nowrap'` with `textOverflow: 'ellipsis'`. That is what turns "General Tithes & Offering" into "General Tithes & Off…".

Replace the inline truncation on both with a class so it can be switched off:

```jsx
<span className="truncate easy:whitespace-normal easy:overflow-visible">
```

and delete `overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'` from the style objects.

- [ ] **Step 3: Widen the desktop sidebar**

In `Dashboard.js` line 385, the expanded sidebar is `lg:w-64`. Add the Easy View width:

```jsx
${sidebarCollapsed ? "lg:w-[68px]" : "lg:w-64 easy:lg:w-80"}
```

- [ ] **Step 4: Give Recharts explicit tick sizes**

Recharts reads font size from props, not CSS, so its axes stay small otherwise. In `Dashboard.js`, find each `<XAxis` and `<YAxis` and set the tick font size from the token. Add near the other helpers at the top of the component:

```js
const chartTick = { fill: 'var(--sb-text-s)', fontSize: 'var(--fs-xs)' };
```

and apply it to all six axis elements in `Dashboard.js` — that is the complete
count; `grep -c "<XAxis\|<YAxis" components/Dashboard.js` returns `6`:

```jsx
<XAxis dataKey="month" tick={chartTick} />
<YAxis tick={chartTick} />
```

`ReportsView.js` renders no axes (`grep -c "XAxis\|YAxis"` returns `0`), so it
needs no chart change.

- [ ] **Step 5: Run the suite and build**

```bash
cd frontend && CI=true npm test 2>&1 | tail -20 && CI=true npm run build 2>&1 | tail -5
```

Expected: tests PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -u && git commit -m "feat: apply Easy View layout and chart deltas"
```

---

## Task 13: Rename the app to StewardBox

Scope added after the spec was approved, so this plan is its only record. Independent of Tasks 1–12 — it can run at any point.

The UI already says StewardBox everywhere. What is left is the packaging around it, and three of those strings are seen by real people:

- `frontend/public/index.html` still titles the browser tab **SBCC Financial System**
- `frontend/public/manifest.json` offers **"StewardBox — SBCC Financial System"** at the PWA install prompt — a half-finished rename, which is how the tab title got missed
- `n8n/workflows/3-weekly-financial-report.json` signs the weekly email **"Generated automatically by SBCC Financial System"**, and that workflow is live

**"SBCC" on its own stays.** It is the church's name, and it is correct in `manifest.json`'s description ("SBCC church financial records"). Only the app name `SBCC Financial System` is being replaced.

**Files:**
- Modify: `frontend/public/index.html:30`
- Modify: `frontend/public/manifest.json:2-3`
- Modify: `frontend/src/manifest.test.js` (extend the existing `PWA install identity` describe)
- Modify: `n8n/workflows/3-weekly-financial-report.json`
- Modify: `README.md:1`, `CLAUDE.md:7`, `frontend/README.md:1`, `NEXT_STEPS_CONTEXT.md:1`
- Modify: `docs/app-character-context.md:1,3`
- Modify: `GOOGLE_SHEETS_SETUP.md:14,28,37,53,125`
- Modify: `frontend/public/playbook/index.html:7,319,719`
- Modify: `scripts/backup-database.sh:4`, `scripts/restore-database.sh:4`

**Deliberately NOT renamed** — do not touch these:

| Left alone | Why |
|---|---|
| `docs/superpowers/specs/*` and `plans/*` (6 files) | Dated records of what was decided at the time. Rewriting them falsifies the history. |
| `name` in `package.json` (`sbcc-financial-system`) and `backend/package.json` (`sbcc-financial-backend`) | Package identifiers, recorded in both lockfiles and possibly used for Vercel/Railway project inference. Renaming risks the deploy for a string no user ever sees. |
| `n8n/workflows/1-google-forms-to-api.json` | Dead workflow — CLAUDE.md records that `/api/forms/*` was removed in August 2026. |
| `database/church_financial.db`, the repo directory name | Infrastructure identifiers; backup and restore scripts resolve real paths through them. |

- [ ] **Step 1: Write the failing test**

Append these three tests inside the **existing** `describe('PWA install identity', ...)` block in `frontend/src/manifest.test.js`, after the `create-react-app` test. The file already reads `manifest` and `indexHtml` at module scope — reuse them, do not re-read the files.

```js
  /**
   * The app became StewardBox in August 2026 but the rename stopped at
   * short_name: the tab still read "SBCC Financial System" and the install
   * prompt offered "StewardBox — SBCC Financial System". "SBCC" alone is the
   * church and is still correct in the description; only the old app name goes.
   */
  test('the browser tab is titled with the app name', () => {
    const match = indexHtml.match(/<title>([^<]*)<\/title>/);
    expect(match).not.toBeNull();
    expect(match[1].trim()).toBe('StewardBox');
  });

  test('the PWA installs under the app name', () => {
    expect(manifest.short_name).toBe('StewardBox');
    expect(manifest.name.startsWith('StewardBox')).toBe(true);
  });

  test('the retired app name appears in neither public file', () => {
    expect(indexHtml).not.toMatch(/SBCC Financial System/);
    expect(JSON.stringify(manifest)).not.toMatch(/SBCC Financial System/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern="manifest" 2>&1 | tail -25
```

Expected: 3 FAILURES —
- `the browser tab is titled with the app name`: `Expected "StewardBox", Received "SBCC Financial System"`
- `the PWA installs under the app name`: passes `short_name`, fails nothing (`name` already starts with StewardBox) — **this one may pass already; that is fine**
- `the retired app name appears in neither public file`: fails on both files

- [ ] **Step 3: Rename in the two public files**

```bash
cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system
sed -i '' 's|<title>SBCC Financial System</title>|<title>StewardBox</title>|' frontend/public/index.html
sed -i '' 's|"name": "StewardBox — SBCC Financial System",|"name": "StewardBox — Church Financial Records",|' frontend/public/manifest.json
```

`short_name` is already `StewardBox` and needs no change. The manifest `description` keeps "SBCC church financial records" — that is the church, not the app.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && CI=true npx react-scripts test --testPathPattern="manifest" 2>&1 | tail -15
```

Expected: PASS, all tests in the file.

- [ ] **Step 5: Rename the live weekly email footer**

```bash
cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system
sed -i '' 's|Generated automatically by SBCC Financial System|Generated automatically by StewardBox|' n8n/workflows/3-weekly-financial-report.json
python3 -c "import json;json.load(open('n8n/workflows/3-weekly-financial-report.json'));print('workflow JSON still parses')"
```

Expected: `workflow JSON still parses`. The string sits inside an escaped HTML email body, so a malformed edit would corrupt the whole workflow — the parse check is the guard.

Note for the operator: editing the file does **not** update the workflow running in n8n. The renamed workflow has to be re-imported there for the email footer to change. Flag this in the completion message; it is a manual step outside the repo.

- [ ] **Step 6: Rename the clean prose targets**

```bash
cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system
sed -i '' 's|SBCC Financial System|StewardBox|g' \
  README.md \
  frontend/README.md \
  NEXT_STEPS_CONTEXT.md \
  GOOGLE_SHEETS_SETUP.md \
  scripts/backup-database.sh \
  scripts/restore-database.sh
sed -i '' 's|presenting the SBCC Financial System to|presenting StewardBox to|' frontend/public/playbook/index.html
sed -i '' 's|<span><strong>SBCC Financial System</strong></span>|<span><strong>StewardBox</strong></span>|' frontend/public/playbook/index.html
```

- [ ] **Step 7: Hand-edit the four that a find-and-replace would mangle**

Each of these reads as nonsense after a blind substitution ("StewardBox — StewardBox Character Guide"), so apply the exact replacement given:

`CLAUDE.md` line 7 — the parenthetical becomes redundant once the name is the name:

```markdown
StewardBox is a church financial
```

`docs/app-character-context.md` line 1:

```markdown
# StewardBox Character Guide
```

`docs/app-character-context.md` line 3 — the mascot cannot be "the brand character of StewardBox" when the app is named after it:

```markdown
**StewardBox** is the official mascot and brand character of the app.
```

`frontend/public/playbook/index.html` line 719:

```html
      <p>StewardBox. Developed by Alvin Adefuin.</p>
```

- [ ] **Step 8: Confirm only the deliberate exclusions remain**

```bash
cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system
git ls-files -z | xargs -0 grep -lI "SBCC Financial System" 2>/dev/null | sort
```

Expected output — exactly these six historical documents and the dead workflow, and nothing else:

```
docs/superpowers/plans/2026-05-25-ui-redesign.md
docs/superpowers/plans/2026-05-26-pwa-offline-data-entry.md
docs/superpowers/plans/2026-06-11-google-sheets-reports.md
docs/superpowers/specs/2026-06-11-google-sheets-reports-design.md
docs/superpowers/specs/2026-06-12-stewardbox-ui-redesign-design.md
docs/superpowers/specs/2026-06-14-desktop-edit-delete-only-design.md
docs/superpowers/specs/2026-08-15-in-app-user-guide-design.md
n8n/workflows/1-google-forms-to-api.json
```

Any other path in that list is a miss — rename it and re-run.

- [ ] **Step 9: Run the frontend suite and build**

```bash
cd frontend && CI=true npm test 2>&1 | tail -20 && CI=true npm run build 2>&1 | tail -5
```

Expected: tests PASS, build succeeds.

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: rename the app from SBCC Financial System to StewardBox"
```

---

## Task 14: Full verification

- [ ] **Step 1: Run everything**

```bash
cd frontend && CI=true npm test 2>&1 | tail -25
cd frontend && CI=true npm run build 2>&1 | tail -8
cd frontend && npm run lint:tokens
```

Expected: all tests pass, build succeeds, lint reports clean.

- [ ] **Step 2: Confirm both themes compiled into the CSS**

```bash
cd frontend && grep -o "html\[data-view=\"easy\"\]" build/static/css/*.css | head -3
```

Expected: at least one match — the Easy View block survived the production build's CSS minification and tree-shaking.

- [ ] **Step 3: Report what remains unverified**

State plainly in the completion message: the rendered CSS cascade, real-viewport layout at 430px and desktop widths, and Recharts tick rendering were **not** verified, because manual verification in a running app is unavailable in this environment. The token contrast values, the hook behaviour, the toggle behaviour, and the absence of raw colours all are verified.

Also state the one action the repo cannot perform: the renamed
`n8n/workflows/3-weekly-financial-report.json` must be **re-imported into n8n** before
the weekly email stops signing itself "SBCC Financial System". Editing the file in git
does not touch the workflow n8n is running.

- [ ] **Step 4: Update CLAUDE.md**

Add to the "File Locations for Common Tasks" table:

```markdown
| Theme tokens / Easy View | `frontend/src/theme/tokens.js`, `frontend/src/index.css`, `frontend/tailwind.config.js` |
```

And change the existing Styling row to:

```markdown
| Styling | Tailwind classes; tokens in `frontend/src/utils/theme.js` — never a raw hex, `npm run lint:tokens` enforces it |
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md && git commit -m "docs: record where the theme tokens live"
```

---

## Deferred To A Follow-Up

`ActivityLogView.js`, `UserManagement.js`, `CustomFieldsManager.js`, and `CustomFieldsExample.js` keep the default palette. All four are admin or super-admin tooling that the elderly leaders this feature serves do not open. They will look unchanged when Easy View is on — a known, accepted gap, not a bug.
