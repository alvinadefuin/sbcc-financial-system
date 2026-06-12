# StewardBox UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign all 8 UI components to a unified Warm Light "Sunshine" theme, rename the app to "StewardBox", and wire in all 7 StewardBox mascot images contextually.

**Architecture:** Pure visual reskin — no logic, routing, or data-fetching changes. All work happens in `frontend/src/`. Shared color values live in a new `frontend/src/utils/theme.js` constants file used as inline style values; Tailwind classes are updated in Tailwind-based components (Dashboard.js, LoginNew.js). Work in the `ui-redesign` worktree at `.worktrees/ui-redesign`.

**Tech Stack:** React 18, Tailwind CSS 3, inline style objects, Plus Jakarta Sans font, Recharts (color updates only).

---

## File Map

| File | What changes |
|---|---|
| `frontend/src/utils/theme.js` | **Create** — SB color token constants |
| `frontend/src/index.css` | Body bg, `.mobile-input` warm, skeleton shimmer, scrollbar |
| `frontend/src/App.js` | Loading state bg + spinner color |
| `frontend/src/components/LoginNew.js` | Full warm redesign + StewardBox hero |
| `frontend/src/components/Dashboard.js` | Sidebar nav icons + warm palette + insight card |
| `frontend/src/components/mobile/MobileLayout.js` | Remove dark glass, warm header + character tabs |
| `frontend/src/components/mobile/MobileSubmitForm.js` | Warm card styles |
| `frontend/src/components/mobile/MobileRecentList.js` | Warm card styles + empty state |
| `frontend/src/components/mobile/ConnectionBanner.js` | Character banners |
| `frontend/src/components/mobile/DenominationCalculator.js` | Warm bottom sheet + sb-calculator.png |

---

## Task 1: Design tokens + CSS base

**Files:**
- Create: `frontend/src/utils/theme.js`
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Establish the passing test baseline**

Run from `.worktrees/ui-redesign/frontend`:
```bash
cd .worktrees/ui-redesign/frontend && npm test -- --watchAll=false 2>&1 | tail -20
```
Expected: all tests pass (or note any pre-existing failures — do not proceed if new failures appear during the redesign).

- [ ] **Step 2: Create `frontend/src/utils/theme.js`**

```js
export const SB = {
  bg:      '#fef9f0',
  bgWarm:  '#fff8e6',
  border:  '#e8d090',
  borderS: '#f0e4b0',
  text:    '#3d2a08',
  textS:   '#8a6028',
  textX:   '#b89048',
  gold:    '#c49030',
  goldL:   '#d4a843',
  red:     '#c04828',
  green:   '#4a8030',
};

export const G = {
  hero:    'linear-gradient(160deg, #fff8e0, #fde8b0, #f8d880)',
  button:  'linear-gradient(135deg, #d4a843, #c49030)',
  sidebar: 'linear-gradient(180deg, #fff8e6, #fef3d0)',
};
```

- [ ] **Step 3: Update `frontend/src/index.css`**

Replace the `body` rule inside `@layer base`:
```css
body {
  margin: 0;
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #fef9f0;
}
```

Replace `.scrollbar-thin` scrollbar color:
```css
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: #e8d090 transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background-color: #e8d090;
  border-radius: 2px;
}
```

Replace `.skeleton-shimmer` keyframes (used by `animate-skeleton`):
```css
@keyframes skeleton-shimmer {
  0%, 100% { background-color: #f0e4b0; }
  50%       { background-color: #e8d090; }
}
```

Replace the entire `.mobile-input` block:
```css
.mobile-input {
  background: #fff8e6;
  border: 1.5px solid #e8d090;
  border-radius: 10px;
  color: #3d2a08;
  width: 100%;
  padding: 10px 14px;
  font-size: 14px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  box-sizing: border-box;
}
.mobile-input:focus {
  border-color: #c49030;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(196,144,48,0.12);
}
.mobile-input::placeholder { color: #b89048; }
.mobile-input option { background: #fff8e6; color: #3d2a08; }
.mobile-input[type="date"]::-webkit-calendar-picker-indicator { filter: none; cursor: pointer; opacity: 0.6; }
.mobile-input.mono { font-family: 'JetBrains Mono', monospace; font-size: 13px; }
```

- [ ] **Step 4: Run tests to confirm baseline still passes**

```bash
cd .worktrees/ui-redesign/frontend && npm test -- --watchAll=false 2>&1 | tail -20
```
Expected: same pass count as Step 1.

- [ ] **Step 5: Commit**

```bash
cd .worktrees/ui-redesign && git add frontend/src/utils/theme.js frontend/src/index.css && git commit -m "feat: add StewardBox warm theme tokens and update CSS base"
```

---

## Task 2: App.js — warm loading state

**Files:**
- Modify: `frontend/src/App.js`

- [ ] **Step 1: Update the loading return in `App.js`**

Find and replace the loading state JSX (lines 41–49):
```jsx
if (loading) {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#fef9f0' }}>
      <div className="text-center">
        <div
          className="w-9 h-9 border-2 rounded-full animate-spin mx-auto mb-4"
          style={{ borderColor: '#f0e4b0', borderTopColor: '#d4a843' }}
        />
        <p className="text-sm font-medium tracking-tight" style={{ color: '#b89048' }}>Loading...</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd .worktrees/ui-redesign && git add frontend/src/App.js && git commit -m "feat: warm loading state in App.js"
```

---

## Task 3: ConnectionBanner.js — character banners

**Files:**
- Modify: `frontend/src/components/mobile/ConnectionBanner.js`

- [ ] **Step 1: Replace the entire file content**

```jsx
import React, { useState, useEffect } from 'react';

const BASE = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '7px 16px',
  flexShrink: 0,
};

export default function ConnectionBanner({ pendingCount, syncing }) {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (!online) {
    return (
      <div style={{ ...BASE, background: 'linear-gradient(90deg, #fff8e0, #fdefc0)', borderBottom: '1px solid #e8c870' }}>
        <img src="/sb-offline.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#8a6028' }}>
          Offline — {pendingCount} {pendingCount === 1 ? 'entry' : 'entries'} queued
        </span>
      </div>
    );
  }

  if (syncing) {
    return (
      <div style={{ ...BASE, background: 'linear-gradient(90deg, #e8f8e0, #d0f0c0)', borderBottom: '1px solid #a0d880' }}>
        <img src="/sb-online.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#3a7020' }}>
          Syncing{pendingCount > 0 ? ` ${pendingCount} ${pendingCount === 1 ? 'entry' : 'entries'}` : ''}…
        </span>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div style={{ ...BASE, background: 'linear-gradient(90deg, #fff8e0, #fdefc0)', borderBottom: '1px solid #e8c870' }}>
        <img src="/sb-offline.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: '#8a6028' }}>
          {pendingCount} {pendingCount === 1 ? 'entry' : 'entries'} pending sync
        </span>
      </div>
    );
  }

  return (
    <div style={{ ...BASE, background: 'linear-gradient(90deg, #e8f8e0, #d0f0c0)', borderBottom: '1px solid #a0d880' }}>
      <img src="/sb-online.png" alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: '#3a7020' }}>All synced</span>
    </div>
  );
}
```

- [ ] **Step 2: Run tests**

```bash
cd .worktrees/ui-redesign/frontend && npm test -- --watchAll=false --testPathPattern=ConnectionBanner 2>&1 | tail -15
```
Expected: 4 passing. ("All synced", "3 entries queued", "Syncing", and the second "All synced" test all still pass — text content is unchanged.)

- [ ] **Step 3: Commit**

```bash
cd .worktrees/ui-redesign && git add frontend/src/components/mobile/ConnectionBanner.js && git commit -m "feat: warm ConnectionBanner with StewardBox offline/online images"
```

---

## Task 4: LoginNew.js — warm redesign + StewardBox hero

**Files:**
- Modify: `frontend/src/components/LoginNew.js`

- [ ] **Step 1: Replace the JSX return block**

The logic (state, handlers, useEffect hooks) is unchanged. Only the `return (...)` block changes. Replace everything from `return (` to the closing `);` with:

```jsx
  return (
    <div className="min-h-screen flex" style={{ background: '#fef9f0' }}>
      {/* Left panel — desktop only */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(160deg, #fff8e0, #fde8b0, #f8d880)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(196,144,48,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
        <div className="relative flex items-center gap-3">
          <img src="/sb-icon.png" alt="StewardBox" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          <span className="font-bold text-base tracking-tight" style={{ color: '#3d2a08' }}>StewardBox</span>
        </div>
        <div className="relative text-center">
          <img src="/sb-collection.png" alt="StewardBox character"
            style={{ width: 120, height: 120, objectFit: 'contain', margin: '0 auto 24px', filter: 'drop-shadow(0 8px 24px rgba(180,120,20,0.25))' }} />
          <p className="text-xs mb-4 uppercase tracking-[0.2em] font-bold" style={{ color: '#b89048' }}>
            Church Financial Management
          </p>
          <h2 className="text-4xl font-bold leading-[1.15] mb-2 tracking-tight" style={{ color: '#3d2a08' }}>
            StewardBox
          </h2>
          <p className="text-sm font-medium mb-5" style={{ color: '#8a6028' }}>by SBCC</p>
          <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: '#b89048' }}>
            Track collections, monitor expenses, and generate reports — all in one secure place.
          </p>
        </div>
        <p className="relative text-xs font-medium" style={{ color: '#c4a060' }}>
          © {new Date().getFullYear()} SBCC. All rights reserved.
        </p>
      </div>

      {/* Right panel — sign-in form */}
      <div className="flex-1 flex items-center justify-center p-8" style={{ background: '#fff' }}>
        <div className="w-full max-w-sm animate-fade-in">
          {/* Mobile hero */}
          <div className="flex flex-col items-center mb-8 lg:hidden"
            style={{ background: 'linear-gradient(160deg, #fff8e0, #fde8b0)', borderRadius: 20, padding: '28px 20px 24px', marginBottom: 32, border: '1px solid #e8d090' }}>
            <img src="/sb-collection.png" alt="StewardBox" style={{ width: 80, height: 80, objectFit: 'contain', marginBottom: 12, filter: 'drop-shadow(0 4px 12px rgba(180,120,20,0.2))' }} />
            <h1 className="font-bold text-xl tracking-tight" style={{ color: '#3d2a08', margin: 0 }}>StewardBox</h1>
            <p className="text-sm" style={{ color: '#8a6028', margin: '2px 0 0' }}>by SBCC</p>
          </div>

          <h1 className="text-2xl font-bold mb-1.5 tracking-tight" style={{ color: '#3d2a08' }}>Welcome back</h1>
          <p className="text-sm mb-7" style={{ color: '#b89048' }}>Sign in to your account to continue</p>

          {/* Tab switcher */}
          <div className="flex p-1 mb-6 rounded-xl" style={{ background: '#fff8e6', border: '1px solid #f0e4b0' }}>
            <button
              onClick={() => { setLoginMethod("google"); setError(""); }}
              disabled={!googleConfig?.configured}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-semibold rounded-lg transition
                ${loginMethod === "google"
                  ? "bg-white shadow-sm"
                  : "disabled:opacity-40 disabled:cursor-not-allowed"}`}
              style={{ color: loginMethod === "google" ? '#3d2a08' : '#b89048' }}
            >
              <Chrome className="w-4 h-4" />
              Google
            </button>
            <button
              onClick={() => { setLoginMethod("password"); setError(""); }}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition
                ${loginMethod === "password" ? "bg-white shadow-sm" : ""}`}
              style={{ color: loginMethod === "password" ? '#3d2a08' : '#b89048' }}
            >
              Password
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl px-4 py-3 mb-5" style={{ background: '#fff1f0', border: '1px solid #f5c0b8' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#c04828' }} />
              <p className="text-sm font-medium" style={{ color: '#9a2a18' }}>{error}</p>
            </div>
          )}

          {/* Google sign-in */}
          {loginMethod === "google" && (
            <div className="space-y-4">
              {googleConfig?.configured ? (
                <>
                  <div id="google-signin-button" className="w-full flex justify-center" />
                  <p className="text-xs text-center" style={{ color: '#b89048' }}>Only approved Google accounts can sign in</p>
                </>
              ) : (
                <div className="rounded-xl px-4 py-6 text-center" style={{ background: '#fff8e6', border: '1px solid #e8d090' }}>
                  <p className="text-sm font-medium mb-1" style={{ color: '#8a6028' }}>Google OAuth is not configured</p>
                  <p className="text-xs" style={{ color: '#b89048' }}>Contact your administrator or use password login</p>
                </div>
              )}
            </div>
          )}

          {/* Password sign-in */}
          {loginMethod === "password" && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8a6028' }}>
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#b89048' }} />
                  <input
                    type="email"
                    value={credentials.email}
                    onChange={(e) => { setCredentials({ ...credentials, email: e.target.value }); setError(""); }}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm transition"
                    style={{ border: '1.5px solid #e8d090', background: '#fff8e6', color: '#3d2a08', outline: 'none' }}
                    onFocus={e => { e.target.style.borderColor = '#c49030'; e.target.style.boxShadow = '0 0 0 3px rgba(196,144,48,0.12)'; }}
                    onBlur={e => { e.target.style.borderColor = '#e8d090'; e.target.style.boxShadow = 'none'; }}
                    placeholder="you@sbcc.church"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#8a6028' }}>
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#b89048' }} />
                  <input
                    type="password"
                    value={credentials.password}
                    onChange={(e) => { setCredentials({ ...credentials, password: e.target.value }); setError(""); }}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm transition"
                    style={{ border: '1.5px solid #e8d090', background: '#fff8e6', color: '#3d2a08', outline: 'none' }}
                    onFocus={e => { e.target.style.borderColor = '#c49030'; e.target.style.boxShadow = '0 0 0 3px rgba(196,144,48,0.12)'; }}
                    onBlur={e => { e.target.style.borderColor = '#e8d090'; e.target.style.boxShadow = 'none'; }}
                    placeholder="••••••••"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 text-sm font-bold py-3 px-4 rounded-xl transition focus:outline-none"
                style={{
                  background: loading ? '#f0e4b0' : 'linear-gradient(135deg, #d4a843, #c49030)',
                  color: loading ? '#b89048' : '#fff',
                  boxShadow: loading ? 'none' : '0 4px 14px rgba(196,144,48,0.35)',
                }}
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(196,144,48,0.3)', borderTopColor: '#c49030' }} />
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-center text-xs pt-1" style={{ color: '#b89048' }}>
                Default: admin@sbcc.church / admin123
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 2: Commit**

```bash
cd .worktrees/ui-redesign && git add frontend/src/components/LoginNew.js && git commit -m "feat: StewardBox warm login with hero and gold palette"
```

---

## Task 5: MobileLayout.js — warm header + character tab icons

**Files:**
- Modify: `frontend/src/components/mobile/MobileLayout.js`

- [ ] **Step 1: Replace the entire file**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import ConnectionBanner from './ConnectionBanner';
import MobileSubmitForm from './MobileSubmitForm';
import MobileRecentList from './MobileRecentList';
import { syncPendingEntries } from '../../utils/syncManager';

export default function MobileLayout({ user, onLogout }) {
  const [tab, setTab] = useState('submit');
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [prefill, setPrefill] = useState(null);

  useEffect(() => {
    document.body.style.background = '#fef9f0';
    return () => { document.body.style.background = ''; };
  }, []);

  const handleQueueChange = useCallback((count) => setPendingCount(count), []);

  const handleSubmitted = useCallback((result) => {
    if (result.status === 'success') setTab('recent');
    if (result.status === 'queued') {
      setPendingCount(prev => prev + 1);
      setTimeout(() => setTab('recent'), 800);
    }
  }, []);

  const handleAddSupplement = useCallback((entry) => {
    const otherMethod = entry.payment_method === 'Cash' ? 'GCash' : 'Cash';
    setPrefill({ date: entry.date, payment_method: otherMethod });
    setTab('submit');
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      setSyncing(true);
      await syncPendingEntries(handleQueueChange);
      setSyncing(false);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [handleQueueChange]);

  const tabStyle = (active) => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    padding: '8px 4px',
    borderRadius: 10,
    border: active ? '1px solid #e8c870' : '1px solid transparent',
    cursor: 'pointer',
    background: active ? 'linear-gradient(135deg, #fff8e6, #fdefc0)' : 'transparent',
    transition: 'all 0.2s ease',
    fontFamily: 'inherit',
  });

  const tabLabel = (active) => ({
    fontSize: 11,
    fontWeight: 600,
    color: active ? '#c49030' : '#b89048',
  });

  return (
    <div style={{
      height: '100dvh',
      maxWidth: 430,
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      background: '#fef9f0',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <ConnectionBanner pendingCount={pendingCount} syncing={syncing} />

      {/* Warm header */}
      <div style={{
        padding: '14px 20px 12px',
        flexShrink: 0,
        background: 'linear-gradient(160deg, #fff8e0, #fde8b0, #f8d880)',
        borderBottom: '1px solid #e8d090',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src="/sb-icon.png"
              alt="StewardBox"
              style={{ width: 36, height: 36, objectFit: 'contain', flexShrink: 0 }}
            />
            <div>
              <h1 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#3d2a08', lineHeight: 1.2 }}>
                StewardBox
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8a6028', lineHeight: 1 }}>
                {user?.name}
              </p>
            </div>
          </div>
          <button
            onClick={onLogout}
            style={{
              fontSize: 12, color: '#b89048',
              padding: '6px 13px', borderRadius: 8,
              background: 'rgba(196,144,48,0.08)',
              border: '1px solid #e8d090',
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Tab bar with character icons */}
      <div style={{
        padding: '10px 14px',
        flexShrink: 0,
        background: '#fff8e6',
        borderBottom: '1px solid #f0e4b0',
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={tabStyle(tab === 'submit')} onClick={() => setTab('submit')}>
            <img
              src="/sb-collection.png"
              alt=""
              style={{ width: 24, height: 24, objectFit: 'contain', opacity: tab === 'submit' ? 1 : 0.4 }}
            />
            <span style={tabLabel(tab === 'submit')}>Submit</span>
          </button>

          <button style={{ ...tabStyle(tab === 'recent'), position: 'relative' }} onClick={() => setTab('recent')}>
            <img
              src="/sb-expenses.png"
              alt=""
              style={{ width: 24, height: 24, objectFit: 'contain', opacity: tab === 'recent' ? 1 : 0.4 }}
            />
            <span style={tabLabel(tab === 'recent')}>Recent</span>
            {pendingCount > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 12,
                width: 16, height: 16, borderRadius: '50%',
                background: '#d4a843', color: '#3d2a08',
                fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'submit'
          ? <MobileSubmitForm
              user={user}
              onSubmitted={handleSubmitted}
              prefill={prefill}
              onPrefillConsumed={() => setPrefill(null)}
            />
          : <MobileRecentList
              onQueueChange={handleQueueChange}
              onAddSupplement={handleAddSupplement}
            />
        }
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd .worktrees/ui-redesign && git add frontend/src/components/mobile/MobileLayout.js && git commit -m "feat: warm MobileLayout with StewardBox header and character tab icons"
```

---

## Task 6: MobileSubmitForm.js — warm card styles

**Files:**
- Modify: `frontend/src/components/mobile/MobileSubmitForm.js`

- [ ] **Step 1: Replace the `GLASS_CARD` constant**

Find:
```js
const GLASS_CARD = {
  background: 'rgba(255,255,255,0.06)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 18,
  overflow: 'hidden',
};
```
Replace with:
```js
const GLASS_CARD = {
  background: '#fff8e6',
  border: '1px solid #f0e4b0',
  borderRadius: 14,
  overflow: 'hidden',
};
```

- [ ] **Step 2: Update `CardSection` label style**

Find the `<p>` inside `CardSection`:
```js
<p style={{
  margin: '0 0 8px 4px',
  fontSize: 11, fontWeight: 700,
  letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.3)',
}}>
```
Replace `color` value:
```js
color: '#b89048',
```

- [ ] **Step 3: Update `Field` label style**

Find the `<span>` inside `Field`:
```js
<span style={{
  display: 'block', fontSize: 11, fontWeight: 500,
  color: 'rgba(255,255,255,0.35)', marginBottom: 5,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}}>
```
Replace `color`:
```js
color: '#8a6028',
```

- [ ] **Step 4: Update the type toggle container**

Find the type toggle `<div>`:
```js
<div style={{
  display: 'flex', gap: 3, padding: 4,
  borderRadius: 13,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.09)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
}}>
```
Replace with:
```js
<div style={{
  display: 'flex', gap: 3, padding: 4,
  borderRadius: 13,
  background: '#fff8e6',
  border: '1px solid #f0e4b0',
}}>
```

- [ ] **Step 5: Update the type toggle button colors**

Find the `[…].map(([val, label, color, bg])` array and replace the color tuples:
```js
['collection', 'Collection', '#c49030', 'rgba(196,144,48,0.15)'],
['expense', 'Expense', '#c04828', 'rgba(192,72,40,0.10)'],
```
And update inactive color in the button style:
```js
color: type === val ? color : '#b89048',
```

- [ ] **Step 6: Update prefill banner to warm style**

Find the `prefillBanner` div:
```js
background: 'rgba(212,168,67,0.08)',
border: '1px solid rgba(212,168,67,0.18)',
```
Replace with:
```js
background: '#fff8e6',
border: '1px solid #e8d090',
```
And the span color:
```js
color: 'rgba(212,168,67,0.85)',
```
Replace with:
```js
color: '#8a6028',
```

- [ ] **Step 7: Update BreakdownField calc button to warm**

Find the calc button in `BreakdownField`:
```js
background: 'rgba(212,168,67,0.12)',
border: '1px solid rgba(212,168,67,0.25)',
color: 'rgba(212,168,67,0.7)',
```
Replace with:
```js
background: 'rgba(196,144,48,0.10)',
border: '1px solid #e8c870',
color: '#c49030',
```
And the `BreakdownField` label span color (next to the button):
```js
color: 'rgba(255,255,255,0.35)',
```
Replace with:
```js
color: '#8a6028',
```

And the input active style in BreakdownField:
```js
style={hasValue ? { borderColor: 'rgba(212,168,67,0.3)', color: '#d4a843' } : {}}
```
Replace with:
```js
style={hasValue ? { borderColor: '#c49030', color: '#c49030' } : {}}
```

- [ ] **Step 8: Run all tests**

```bash
cd .worktrees/ui-redesign/frontend && npm test -- --watchAll=false 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
cd .worktrees/ui-redesign && git add frontend/src/components/mobile/MobileSubmitForm.js && git commit -m "feat: warm card styles in MobileSubmitForm"
```

---

## Task 7: MobileRecentList.js — warm cards + empty state

**Files:**
- Modify: `frontend/src/components/mobile/MobileRecentList.js`

- [ ] **Step 1: Replace `GLASS_CARD` and `CARD_DIVIDER`**

Find:
```js
const GLASS_CARD = {
  background: 'rgba(255,255,255,0.055)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 14,
  padding: 13,
  marginBottom: 8,
};

const CARD_DIVIDER = {
  borderTop: '1px solid rgba(255,255,255,0.06)',
  marginTop: 10,
  paddingTop: 10,
};
```
Replace with:
```js
const GLASS_CARD = {
  background: '#fff8e6',
  border: '1px solid #f0e4b0',
  borderRadius: 14,
  padding: 13,
  marginBottom: 8,
};

const CARD_DIVIDER = {
  borderTop: '1px solid #f0e4b0',
  marginTop: 10,
  paddingTop: 10,
};
```

- [ ] **Step 2: Update `StatusBadge` color config**

Replace the `cfg` object:
```js
const cfg = {
  pending:   { bg: 'rgba(196,144,48,0.12)',  color: '#c49030',  border: 'rgba(196,144,48,0.25)' },
  failed:    { bg: 'rgba(192,72,40,0.10)',   color: '#c04828',  border: 'rgba(192,72,40,0.22)' },
  duplicate: { bg: 'rgba(200,110,20,0.10)',  color: '#b87020',  border: 'rgba(200,110,20,0.22)' },
};
const c = cfg[status] || { bg: '#fff8e6', color: '#b89048', border: '#e8d090' };
```

- [ ] **Step 3: Update `SectionHeader` label color**

Find:
```js
color: 'rgba(255,255,255,0.3)'
```
Inside `SectionHeader`, replace with:
```js
color: '#b89048'
```

- [ ] **Step 4: Update `TypeIcon` backgrounds**

Replace the `TypeIcon` `<div>` styles:
```js
background: isCollection ? 'rgba(196,144,48,0.10)' : 'rgba(192,72,40,0.08)',
border: `1px solid ${isCollection ? 'rgba(196,144,48,0.20)' : 'rgba(192,72,40,0.18)'}`,
```

- [ ] **Step 5: Update card text colors**

Inside the queued card render, find:
```js
color: '#e2e2ec'  // type label
color: 'rgba(255,255,255,0.28)'  // date
color: '#f87171'  // failed error text
color: '#fb923c'  // duplicate text
```
Replace with:
```js
color: '#3d2a08'   // type label
color: '#8a6028'   // date
color: '#c04828'   // failed error text
color: '#b87020'   // duplicate text
```

Inside the synced entries card:
```js
color: '#e2e2ec'           // entry type
color: 'rgba(255,255,255,0.28)'  // date · creator
```
Replace with:
```js
color: '#3d2a08'
color: '#8a6028'
```

- [ ] **Step 6: Update `ActionBtn` styles**

```js
function ActionBtn({ accent, onClick, children }) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '7px 14px', borderRadius: 8,
      fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
      border: accent ? '1px solid #e8c870' : '1px solid #f0e4b0',
      background: accent ? 'rgba(196,144,48,0.12)' : 'rgba(180,120,20,0.05)',
      color: accent ? '#c49030' : '#8a6028',
    }}>
      {children}
    </button>
  );
}
```

- [ ] **Step 7: Update the supplement button in synced entries**

Find the `+ Add GCash` / `+ Add Cash` button inline styles:
```js
border: '1px solid rgba(212,168,67,0.25)',
background: 'rgba(212,168,67,0.08)',
color: 'rgba(212,168,67,0.75)',
```
Replace with:
```js
border: '1px solid #e8c870',
background: 'rgba(196,144,48,0.08)',
color: '#c49030',
```

- [ ] **Step 8: Replace the empty state**

Find the `{isEmpty && (...)}` block and replace with:
```jsx
{isEmpty && (
  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', gap: 12 }}>
    <img src="/sb-expenses.png" alt="" style={{ width: 56, height: 56, objectFit: 'contain', opacity: 0.75 }} />
    <p style={{ margin: 0, fontSize: 13, color: '#b89048' }}>No entries yet</p>
  </div>
)}
```

- [ ] **Step 9: Update `SkeletonCard` skeleton**

Find:
```js
function SkeletonCard() {
  return <div className="animate-skeleton" style={{ borderRadius: 14, height: 66, marginBottom: 8 }} />;
}
```
The `animate-skeleton` keyframes were already updated in Task 1 (warm colors), so no change needed here.

- [ ] **Step 10: Run tests**

```bash
cd .worktrees/ui-redesign/frontend && npm test -- --watchAll=false --testPathPattern=MobileRecentList 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 11: Commit**

```bash
cd .worktrees/ui-redesign && git add frontend/src/components/mobile/MobileRecentList.js && git commit -m "feat: warm cards and StewardBox empty state in MobileRecentList"
```

---

## Task 8: DenominationCalculator.js — warm bottom sheet

**Files:**
- Modify: `frontend/src/components/mobile/DenominationCalculator.js`

- [ ] **Step 1: Replace the backdrop style**

Find:
```js
background: 'rgba(0,0,0,0.6)',
backdropFilter: 'blur(4px)',
WebkitBackdropFilter: 'blur(4px)',
```
Replace with:
```js
background: 'rgba(60,30,0,0.35)',
backdropFilter: 'blur(4px)',
WebkitBackdropFilter: 'blur(4px)',
```

- [ ] **Step 2: Replace the sheet panel style**

Find the inner sheet div (the one with `background: 'rgba(10,10,28,0.97)'`):
```js
background: 'rgba(10,10,28,0.97)',
backdropFilter: 'blur(40px)',
WebkitBackdropFilter: 'blur(40px)',
borderTop: '1px solid rgba(255,255,255,0.12)',
```
Replace with:
```js
background: '#fef9f0',
borderTop: '1.5px solid #e8d090',
```
(Remove the `backdropFilter` and `WebkitBackdropFilter` lines entirely.)

- [ ] **Step 3: Replace the drag handle color**

Find:
```js
background: 'rgba(255,255,255,0.15)'
```
(inside the drag handle div), replace with:
```js
background: '#e8d090'
```

- [ ] **Step 4: Replace the header section**

Find the header `<div>` with `padding: '14px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)'`:
```js
borderBottom: '1px solid rgba(255,255,255,0.07)'
```
Replace with:
```js
borderBottom: '1px solid #f0e4b0'
```

Inside the header, replace the field label `<p>` style:
```js
color: 'rgba(255,255,255,0.3)'
```
with:
```js
color: '#b89048'
```

Replace the subtext `<p>` color:
```js
color: 'rgba(255,255,255,0.25)'
```
with:
```js
color: '#b89048'
```

Replace the TOTAL label `<p>` color:
```js
color: 'rgba(255,255,255,0.3)'
```
with:
```js
color: '#b89048'
```

Add `sb-calculator.png` before the field label `<p>`. Replace the left header div content:
```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
  <img src="/sb-calculator.png" alt="" style={{ width: 32, height: 32, objectFit: 'contain' }} />
  <div>
    <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#b89048' }}>
      {fieldLabel}
    </p>
    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#b89048' }}>
      Count denominations below
    </p>
  </div>
</div>
```

- [ ] **Step 5: Replace denomination row styles**

Find the per-row `<div>` with:
```js
background: count > 0 ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.04)',
border: `1px solid ${count > 0 ? 'rgba(212,168,67,0.2)' : 'rgba(255,255,255,0.07)'}`,
```
Replace with:
```js
background: count > 0 ? 'rgba(196,144,48,0.10)' : '#fff8e6',
border: `1px solid ${count > 0 ? '#e8c870' : '#f0e4b0'}`,
```

Replace denomination label color:
```js
color: count > 0 ? '#d4a843' : 'rgba(255,255,255,0.5)',
```
with:
```js
color: count > 0 ? '#c49030' : '#b89048',
```

Replace qty input color:
```js
color: count > 0 ? '#fff' : 'rgba(255,255,255,0.25)',
```
with:
```js
color: count > 0 ? '#3d2a08' : '#b89048',
```

Replace subtotal color:
```js
color: subtotal > 0 ? 'rgba(212,168,67,0.8)' : 'rgba(255,255,255,0.15)',
```
with:
```js
color: subtotal > 0 ? '#c49030' : '#e8d090',
```

- [ ] **Step 6: Replace footer action styles**

Find the footer `<div>`:
```js
borderTop: '1px solid rgba(255,255,255,0.07)',
```
Replace with:
```js
borderTop: '1px solid #f0e4b0',
```

Replace the Clear button style:
```js
background: 'rgba(255,255,255,0.05)',
border: '1px solid rgba(255,255,255,0.1)',
color: 'rgba(255,255,255,0.35)',
```
with:
```js
background: '#fff8e6',
border: '1px solid #e8d090',
color: '#b89048',
```

Replace the Confirm button disabled state:
```js
background: total > 0
  ? 'linear-gradient(135deg, #d4a843 0%, #c49030 100%)'
  : 'rgba(255,255,255,0.06)',
border: total > 0 ? 'none' : '1px solid rgba(255,255,255,0.1)',
color: total > 0 ? '#0a0a1c' : 'rgba(255,255,255,0.25)',
```
with:
```js
background: total > 0
  ? 'linear-gradient(135deg, #d4a843 0%, #c49030 100%)'
  : '#f0e4b0',
border: total > 0 ? 'none' : '1px solid #e8d090',
color: total > 0 ? '#3d2a08' : '#b89048',
```

- [ ] **Step 7: Replace `StepBtn` styles**

```js
function StepBtn({ onClick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: disabled ? '#f5ead8' : '#fff8e6',
        border: `1px solid ${disabled ? '#f0e4b0' : '#e8d090'}`,
        color: disabled ? '#e8d090' : '#8a6028',
        fontSize: 20, fontWeight: 400,
        fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1,
        transition: 'all 0.12s',
      }}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 8: Commit**

```bash
cd .worktrees/ui-redesign && git add frontend/src/components/mobile/DenominationCalculator.js && git commit -m "feat: warm DenominationCalculator bottom sheet with sb-calculator.png"
```

---

## Task 9: Dashboard.js — sidebar warm palette + StewardBox nav icons

**Files:**
- Modify: `frontend/src/components/Dashboard.js`

- [ ] **Step 1: Update `navSections` to include `imgSrc` for character items**

Find the `navSections` array definition (around line 285) and add `imgSrc` to the four character-mapped items:
```js
const navSections = [
  {
    label: "Overview",
    items: [
      { id: "overview", label: "Dashboard", icon: LayoutDashboard, imgSrc: '/sb-dashboard.png', onClick: () => { clearSubViews(); setSelectedView("overview"); setSidebarOpen(false); }, active: selectedView === "overview" && !isSubView },
      { id: "analytics", label: "Analytics", icon: BarChart2, onClick: () => { clearSubViews(); setSelectedView("analytics"); setSidebarOpen(false); }, active: selectedView === "analytics" && !isSubView },
      { id: "reports", label: "Reports", icon: BookOpen, imgSrc: '/sb-google-sheet.png', onClick: () => { clearSubViews(); setSelectedView("reports"); setSidebarOpen(false); }, active: selectedView === "reports" && !isSubView },
    ],
  },
  ...(user?.role === "admin" || user?.role === "super_admin" ? [{
    label: "Management",
    items: [
      { id: "records", label: "Manage Records", icon: Database, imgSrc: '/sb-expenses.png', onClick: () => { clearSubViews(); setShowRecordsManager(true); setSidebarOpen(false); }, active: showRecordsManager },
      { id: "users", label: "Users", icon: UserCog, onClick: () => { clearSubViews(); setShowUserManagement(true); setSidebarOpen(false); }, active: showUserManagement },
      { id: "fields", label: "Mobile Form Fields", icon: Settings, onClick: () => { clearSubViews(); setShowCustomFields(true); setSidebarOpen(false); }, active: showCustomFields },
```
(The rest of the array is unchanged — keep Print Report, etc.)

- [ ] **Step 2: Update `NavItem` to render `imgSrc` when present**

Find the `NavItem` component and replace it:
```jsx
const NavItem = ({ item }) => (
  <button
    onClick={item.onClick}
    onMouseEnter={(e) => showTooltip(e, item.label)}
    onMouseLeave={hideTooltip}
    className={`w-full flex items-center rounded-xl text-sm font-medium transition-all duration-150 border
      ${sidebarCollapsed ? "lg:justify-center lg:px-0 lg:py-2.5 px-3 py-2.5 gap-3" : "gap-3 px-3 py-2.5"}
      ${item.active
        ? "border-[#e8c870] shadow-sm"
        : "border-transparent"}`}
    style={item.active
      ? { background: 'linear-gradient(135deg, #fff8e6, #fdefc0)', color: '#c49030' }
      : { color: '#8a6028' }}
  >
    {item.imgSrc ? (
      <img
        src={item.imgSrc}
        alt=""
        style={{
          flexShrink: 0,
          opacity: item.active ? 1 : 0.4,
          filter: item.active ? 'none' : 'grayscale(0.3)',
          width: sidebarCollapsed ? 20 : 18,
          height: sidebarCollapsed ? 20 : 18,
          objectFit: 'contain',
        }}
      />
    ) : (
      <item.icon className={`flex-shrink-0 ${sidebarCollapsed ? "lg:w-5 lg:h-5 w-4 h-4" : "w-4 h-4"}`} />
    )}
    <span className={sidebarCollapsed ? "lg:hidden" : ""}>{item.label}</span>
  </button>
);
```

- [ ] **Step 3: Update `Sidebar` component — logo and structure**

Inside `Sidebar`, find the logo section:
```jsx
<div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-900/50 ring-1 ring-indigo-500/30">
  <Shield className="w-4 h-4 text-white" />
</div>
<span className="text-white font-bold text-sm tracking-tight whitespace-nowrap">
  SBCC Financial
</span>
```
Replace with:
```jsx
<img src="/sb-icon.png" alt="StewardBox" style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0 }} />
<span className="font-bold text-sm tracking-tight whitespace-nowrap" style={{ color: '#3d2a08' }}>
  StewardBox
</span>
```

Remove the indigo gradient overlay inside the logo header:
```jsx
<div className="absolute inset-0 bg-gradient-to-br from-indigo-600/8 via-transparent to-transparent pointer-events-none" />
```

- [ ] **Step 4: Update the `<aside>` background and border**

Find:
```jsx
className={`fixed inset-y-0 left-0 z-50 bg-slate-950 flex flex-col ...`}
style={{ boxShadow: "1px 0 0 0 rgba(30,41,59,0.8)" }}
```
Replace the className portion `bg-slate-950` with `bg-[#fff8e6]`, and update the style:
```jsx
style={{ background: 'linear-gradient(180deg, #fff8e6, #fef3d0)', boxShadow: '1px 0 0 0 #e8d090' }}
```

- [ ] **Step 5: Update sidebar section labels and dividers**

Find the section label `<p>`:
```jsx
className="px-3 mb-1.5 text-[10px] font-bold text-slate-600 uppercase tracking-widest"
```
Replace `text-slate-600` with `text-[#b89048]`.

Find collapsed dividers:
```jsx
<div className="h-px bg-slate-800/70 mx-2 mb-3" />
```
Replace with:
```jsx
<div className="h-px mx-2 mb-3" style={{ background: '#e8d090' }} />
```

Find the bottom sign-out divider:
```jsx
<div className="h-px bg-slate-800/70 mx-1 mb-3" />
```
Replace with:
```jsx
<div className="h-px mx-1 mb-3" style={{ background: '#e8d090' }} />
```

- [ ] **Step 6: Update the sign-out button**

Find:
```jsx
className={`w-full flex items-center rounded-xl text-sm font-medium text-rose-500 hover:bg-rose-500/10 hover:text-rose-400 ...`}
```
Replace `text-rose-500` with `text-[#c04828]` and `hover:text-rose-400` with `hover:text-[#a03820]`.

- [ ] **Step 7: Update the user footer**

Find the user footer `<div>`:
```jsx
className={`p-3 border-t border-slate-800/60 flex-shrink-0 ...`}
```
Replace `border-slate-800/60` with `border-[#e8d090]`.

Find the avatar circle:
```jsx
className="w-8 h-8 bg-indigo-600 rounded-full ... ring-2 ring-indigo-900/60 shadow-sm"
```
Replace with:
```jsx
className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
style={{ background: 'linear-gradient(135deg, #d4a843, #c49030)', ring: 'none' }}
```

Find the user name `<p>`:
```jsx
className="text-sm font-semibold text-white truncate leading-tight"
```
Replace `text-white` with `text-[#3d2a08]`.

Find the user role `<p>`:
```jsx
className="text-[11px] text-slate-500 capitalize mt-0.5"
```
Replace `text-slate-500` with `text-[#8a6028]`.

- [ ] **Step 8: Update the collapsed tooltip**

Find:
```jsx
<span className="block px-2.5 py-1.5 bg-slate-800 text-slate-100 text-xs font-semibold rounded-lg shadow-xl border border-slate-700/60 whitespace-nowrap" />
```
Replace with:
```jsx
<span className="block px-2.5 py-1.5 text-xs font-semibold rounded-lg shadow-xl whitespace-nowrap" style={{ background: '#fff8e6', color: '#3d2a08', border: '1px solid #e8d090', boxShadow: '0 4px 14px rgba(180,120,20,0.15)' }} />
```

- [ ] **Step 9: Remove `Shield` from the imports**

Find `Shield,` in the lucide-react import and remove it (no longer used).

- [ ] **Step 10: Commit**

```bash
cd .worktrees/ui-redesign && git add frontend/src/components/Dashboard.js && git commit -m "feat: warm Dashboard sidebar with StewardBox logo and contextual nav icons"
```

---

## Task 10: Dashboard.js — main area warm palette + insight card

**Files:**
- Modify: `frontend/src/components/Dashboard.js`

- [ ] **Step 1: Update the outer layout and header**

Find the outer wrapper:
```jsx
<div className="h-screen bg-slate-50 flex overflow-hidden">
```
Replace `bg-slate-50` with `bg-[#fef9f0]`.

Find the `<header>`:
```jsx
className="bg-white border-b border-slate-200 flex-shrink-0 shadow-sm"
```
Replace with:
```jsx
className="flex-shrink-0"
style={{ background: '#fff8e6', borderBottom: '1px solid #e8d090', boxShadow: '0 1px 4px rgba(180,120,20,0.08)' }}
```

Find the `<h1>` page title:
```jsx
className="text-base font-bold text-slate-900 leading-tight tracking-tight"
```
Replace `text-slate-900` with `text-[#3d2a08]`.

Find the subtitle `<p>`:
```jsx
className="text-xs text-slate-400 hidden sm:block"
```
Replace `text-slate-400` with `text-[#b89048]`.

Find the `<span>` user name in subtitle:
```jsx
className="font-medium text-slate-600"
```
Replace `text-slate-600` with `text-[#8a6028]`.

Find the search input:
```jsx
className="pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent w-44 transition"
```
Replace with:
```jsx
className="pl-9 pr-3 py-2 text-sm border rounded-xl focus:outline-none focus:ring-2 focus:border-transparent w-44 transition"
style={{ border: '1px solid #e8d090', background: '#fff8e6', color: '#3d2a08' }}
onFocus={e => e.target.style.outline = '0'}
```
And add `focus:ring-[#c49030]` to className.

Find the refresh button:
```jsx
className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-600 disabled:opacity-40 transition"
```
Replace with:
```jsx
className="p-2 rounded-xl border disabled:opacity-40 transition"
style={{ border: '1px solid #e8d090', color: '#b89048', background: 'transparent' }}
```

Find the loading spinner in header:
```jsx
<span className="flex items-center gap-1.5 text-indigo-600 font-medium">
  <RefreshCw className="w-3 h-3 animate-spin" /> Refreshing…
</span>
```
Replace `text-indigo-600` with `text-[#c49030]`.

- [ ] **Step 2: Update `StatCard` accent colors**

Find the `accent` map in `StatCard`:
```js
const accent = {
  blue:    { border: "border-l-indigo-500",  icon: "bg-indigo-50 text-indigo-600",   val: "text-slate-900" },
  emerald: { border: "border-l-emerald-500", icon: "bg-emerald-50 text-emerald-600", val: "text-emerald-700" },
  rose:    { border: "border-l-rose-500",    icon: "bg-rose-50 text-rose-600",       val: "text-rose-700" },
  purple:  { border: "border-l-violet-500",  icon: "bg-violet-50 text-violet-600",   val: "text-slate-900" },
}[accentColor] || ...
```
Replace with:
```js
const accent = {
  blue:    { border: "border-l-[#c49030]",  icon: "bg-[#fff8e6] text-[#c49030]",  val: "text-[#3d2a08]" },
  emerald: { border: "border-l-[#c49030]",  icon: "bg-[#fff8e6] text-[#c49030]",  val: "text-[#c49030]" },
  rose:    { border: "border-l-[#c04828]",  icon: "bg-[#fff5f0] text-[#c04828]",  val: "text-[#c04828]" },
  purple:  { border: "border-l-[#c49030]",  icon: "bg-[#fff8e6] text-[#c49030]",  val: "text-[#3d2a08]" },
}[accentColor] || { border: "border-l-[#c49030]", icon: "bg-[#fff8e6] text-[#c49030]", val: "text-[#3d2a08]" };
```

Find the `StatCard` container:
```jsx
className={`bg-white border border-slate-200 border-l-4 ${accent.border} rounded-xl p-5 ...`}
```
Replace `bg-white border-slate-200` with `bg-[#fff8e6] border-[#e8d090]`.

- [ ] **Step 3: Update chart card wrappers and chart line colors**

Every `bg-white border border-slate-200 rounded-2xl` card in the overview section:
```jsx
className="bg-white border border-slate-200 rounded-2xl p-6 ..."
```
Replace `bg-white` with `bg-[#fff8e6]` and `border-slate-200` with `border-[#e8d090]`.

Line chart colors (Weekly Trends):
```jsx
<Line ... dataKey="collections" stroke="#059669" ... />
<Line ... dataKey="expenses" stroke="#E11D48" ... />
<Line ... dataKey="net" stroke="#6366f1" ... />
```
Replace strokes:
```jsx
<Line ... dataKey="collections" stroke="#c49030" ... />
<Line ... dataKey="expenses" stroke="#c04828" ... />
<Line ... dataKey="net" stroke="#8a6028" ... />
```

Area chart colors (Analytics):
```jsx
<stop offset="5%" stopColor="#059669" ... />
<stop offset="95%" stopColor="#059669" ... />
<Area ... stroke="#059669" ... />
<stop offset="5%" stopColor="#E11D48" ... />
<stop offset="95%" stopColor="#E11D48" ... />
<Area ... stroke="#E11D48" ... />
```
Replace greens with `#c49030` (collections) and reds with `#c04828` (expenses).

Status bar chips — find `bg-slate-100`:
```jsx
<span className="px-2.5 py-1 bg-slate-100 rounded-full font-medium text-slate-600">
```
Replace with `bg-[#fff8e6]` and `text-[#8a6028]`.

Analytics summary cards — find `bg-indigo-500`:
```jsx
{ dot: "bg-indigo-500", label: "Net Balance", ... }
```
Replace `bg-indigo-500` with `bg-[#c49030]`.

CustomFields table selector buttons:
```jsx
className={`... bg-indigo-600 text-white ... bg-slate-100 text-slate-600 hover:bg-slate-200`}
```
Replace with:
```jsx
className={`... ${customFieldsTable === t ? '' : ''}`}
style={customFieldsTable === t
  ? { background: 'linear-gradient(135deg, #d4a843, #c49030)', color: '#fff' }
  : { background: '#fff8e6', color: '#8a6028', border: '1px solid #e8d090' }}
```

- [ ] **Step 4: Update `CustomTooltip` style**

Find:
```jsx
<div className="bg-white border border-slate-200 rounded-xl p-3 shadow-lg text-xs">
  <p className="font-semibold text-slate-700 mb-1.5">{label}</p>
```
Replace `bg-white border-slate-200` with `bg-[#fff8e6] border-[#e8d090]` and `text-slate-700` with `text-[#3d2a08]`.

- [ ] **Step 5: Update recent collections/expenses table cards**

Find the two recent-records table cards (same pattern):
```jsx
className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm"
```
Replace with `bg-[#fff8e6] border-[#e8d090]`.

Inside, find:
```jsx
className="text-sm font-semibold text-slate-800 truncate"
className="text-xs text-slate-400 mt-0.5"
className="text-sm font-bold text-emerald-600 ..."
className="text-sm font-bold text-rose-600 ..."
```
Replace:
- `text-slate-800` → `text-[#3d2a08]`
- `text-slate-400` → `text-[#b89048]`
- `text-emerald-600` → `text-[#c49030]`
- `text-rose-600` → `text-[#c04828]`

Find the "Income" badge:
```jsx
className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full"
```
Replace with `text-[#c49030] bg-[#fff8e6] border-[#e8d090]`.

The "Expense" badge stays rose (already appropriate) — replace `text-rose-700 bg-rose-50 border-rose-100` with `text-[#c04828] bg-[#fff5f0] border-[#f0c0b0]`.

- [ ] **Step 6: Add the StewardBox insight card to the Overview section**

Add a helper function `getStewardboxInsight` near the top of the component (after `collectionSources`):

```js
const getStewardboxInsight = () => {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const prevMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const prevYear = thisMonth === 0 ? thisYear - 1 : thisYear;

  const sumFor = (arr, m, y) =>
    arr.filter(i => { const d = new Date(i.date); return d.getMonth() === m && d.getFullYear() === y; })
       .reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);

  const currC = sumFor(collections, thisMonth, thisYear);
  const prevC = sumFor(collections, prevMonth, prevYear);

  if (currC > 0 && prevC > 0) {
    const pct = Math.round(((currC - prevC) / prevC) * 100);
    const monthName = new Date(thisYear, prevMonth).toLocaleString('default', { month: 'long' });
    const trend = pct >= 0 ? `up ${pct}%` : `down ${Math.abs(pct)}%`;
    return `Collections are ${trend} from ${monthName}.`;
  }
  return 'View this month\'s full summary →';
};
```

Inside `{selectedView === "overview" && (` block, after the last grid (recent collections/expenses), add:

```jsx
<div className="mt-5 flex items-center gap-4 rounded-2xl p-4 border"
  style={{ background: 'linear-gradient(135deg, #fff8e0, #fdefc0)', border: '1px solid #e8c870' }}>
  <img src="/sb-dashboard.png" alt="" style={{ width: 44, height: 44, objectFit: 'contain', flexShrink: 0 }} />
  <div className="flex-1 min-w-0">
    <p className="text-sm font-semibold" style={{ color: '#3d2a08' }}>Nice work, treasurer!</p>
    <p className="text-xs mt-0.5" style={{ color: '#8a6028' }}>{getStewardboxInsight()}</p>
  </div>
  <button
    onClick={() => { clearSubViews(); setSelectedView("reports"); }}
    className="flex-shrink-0 text-xs font-bold px-4 py-2 rounded-xl"
    style={{ background: 'linear-gradient(135deg, #d4a843, #c49030)', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(196,144,48,0.3)' }}
  >
    Export →
  </button>
</div>
```

- [ ] **Step 7: Run all tests**

```bash
cd .worktrees/ui-redesign/frontend && npm test -- --watchAll=false 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
cd .worktrees/ui-redesign && git add frontend/src/components/Dashboard.js && git commit -m "feat: warm Dashboard main area, gold charts, and StewardBox insight card"
```

---

## Task 11: Final integration check

**Files:** None (verification only)

- [ ] **Step 1: Run the full test suite one final time**

```bash
cd .worktrees/ui-redesign/frontend && npm test -- --watchAll=false 2>&1 | tail -30
```
Expected: all tests pass, same count as Task 1 Step 1.

- [ ] **Step 2: Start the dev servers and visually verify**

In two terminals from `.worktrees/ui-redesign`:
```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm start
```
Open http://localhost:3000 and verify:
- Loading screen: warm parchment bg, gold spinner ✓
- Login desktop: warm left panel with sb-collection.png hero, "StewardBox / by SBCC" ✓
- Login mobile (resize browser < 1024px): mobile hero card with sb-collection.png ✓
- Dashboard sidebar: sb-icon.png logo, "StewardBox", gold active nav with sb-dashboard.png ✓
- Dashboard main: warm stat cards, gold chart lines, insight card at bottom of overview ✓
- Open http://localhost:3000/mobile:
  - Connection banner: warm green "All synced" with sb-online.png ✓
  - Header: warm hero gradient, sb-icon.png, "StewardBox" ✓
  - Tab bar: sb-collection.png (Submit) and sb-expenses.png (Recent) ✓
  - Submit form: warm card backgrounds, gold submit button ✓
  - Calc modal: warm bottom sheet, sb-calculator.png in header ✓

- [ ] **Step 3: Create final commit if any polish fixes were made**

```bash
cd .worktrees/ui-redesign && git add -p && git commit -m "fix: polish tweaks from visual integration check"
```

---

## Appendix: Color Quick-Reference

| Old value | New value | Context |
|---|---|---|
| `#08081a` | `#fef9f0` | Page background |
| `rgba(255,255,255,0.06)` glass | `#fff8e6` | Card backgrounds |
| `rgba(255,255,255,0.09)` | `#f0e4b0` | Card borders |
| `rgba(255,255,255,0.3)` | `#b89048` | Label / tertiary text |
| `rgba(255,255,255,0.28)` | `#8a6028` | Secondary text |
| `#e2e2ec` | `#3d2a08` | Primary text |
| `indigo-600` / `#6366f1` | `#c49030` / `#d4a843` | Primary accent |
| `#059669` / `emerald-*` | `#c49030` | Collections / income |
| `#E11D48` / `rose-*` | `#c04828` | Expenses |
| `bg-slate-950` | `bg-[#fff8e6]` + sidebar gradient | Sidebar |
| `bg-slate-50` / `bg-white` | `bg-[#fef9f0]` / `bg-[#fff8e6]` | Page / card backgrounds |
