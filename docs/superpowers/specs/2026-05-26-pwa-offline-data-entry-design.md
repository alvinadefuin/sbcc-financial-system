# PWA Offline-First Data Entry — Design Spec

**Date:** 2026-05-26
**Status:** Approved

## Overview

Replace Google Forms as the data input method with a Progressive Web App (PWA) built on top of the existing React frontend. The PWA allows 2–3 designated users (treasurers/admins) to submit collection and expense entries from their phones, with full offline support. Entries made without WiFi are queued locally and synced automatically when connectivity is restored.

This retires the Google Forms integration, n8n workflows, and Apps Script webhook layer entirely.

---

## Goals

- Replace Google Forms with a purpose-built mobile input interface
- Support offline data entry with automatic sync on WiFi restore
- Work on both iOS and Android via browser (no app store install)
- Reuse all existing backend API endpoints with minimal changes
- Show recent entries including who submitted them

---

## Architecture

### PWA Layer (Frontend)

Three additions to the existing React app:

1. **Web App Manifest** — update `frontend/public/manifest.json` with proper app name, icons, theme color, and `display: standalone` so browsers prompt "Add to Home Screen"
2. **Service Worker** — cache the app shell for offline loading; intercept failed API submissions and route them to the sync queue
3. **Offline Sync Queue** — IndexedDB store (via `idb` library) that holds pending entries; a sync manager drains the queue when connectivity is restored

### New Route: `/mobile`

A phone-optimized layout added to the existing React app. Desktop users can access it too — it's just a narrower, touch-friendly view. Two tabs:

**Submit tab**
- Toggle between Collection and Expense at the top
- Input form with all relevant fields (mirrors `FinancialRecordsManager` fields, no table/charts/filters)
- Submit button with loading state
- Handles offline submission by queuing to IndexedDB

**Recent tab**
- List of the last 20 entries (collections and expenses combined)
- Each entry shows: date, type, total amount, submitted by (username)
- Pending entries (not yet synced) show a "pending" badge
- Failed entries show a "failed" badge with error message and retry option
- Duplicate-flagged entries show a warning with Submit Anyway / Cancel buttons

**Persistent connection banner**
- Shown at top of both tabs
- Offline: `"Offline — X entries pending sync"`
- Online with queue: `"Syncing..."`
- Online, all synced: `"Synced"`

---

## Offline Queue Behavior

1. User submits a form entry while offline
2. Entry is saved to IndexedDB with status `pending` and a local timestamp
3. Entry immediately appears in Recent tab with a "pending" badge
4. When WiFi is restored, sync manager sends pending entries to the backend in chronological order
5. On success: entry status updated to `synced`, badge clears
6. On backend rejection (validation error): status set to `failed`, error shown in Recent tab
7. On duplicate detection (409): status set to `duplicate`, user presented with Submit Anyway / Cancel

---

## Duplicate Detection

**Same-user, same-session:** If the same user taps Submit twice before the first response returns, the second tap is ignored (disabled button during submission).

**Cross-user duplicates:** When an entry reaches the backend, it checks for an existing record with:
- Same date
- Same type (collection or expense)
- Same total amount

If a match is found, the backend returns `409 Conflict` with the conflicting entry's details (submitted by, date, amount).

The PWA displays: *"A similar entry was already submitted by [username] on [date]."* with two buttons:
- **Submit Anyway** — resends the request with a `force: true` flag, bypasses duplicate check, saves normally
- **Cancel** — discards the pending entry

Force-submitted entries are saved and displayed in Recent with no special badge.

---

## Authentication

No changes to the login flow. Users log in with existing credentials (email/password or Google OAuth) on their phone browser.

**Extended token expiry for PWA users:** When a login request includes `{ pwa: true }` in the body, the backend issues a JWT with a 30-day expiry instead of the current default. The `/mobile` route sends this flag automatically on login.

**Token expiry while offline:** If a token expires while the user has pending entries in the queue, the entries are preserved in IndexedDB. When the user reconnects, they are prompted to re-login before the sync proceeds.

---

## Backend Changes

Minimal — two targeted changes:

### 1. Auth route (`backend/routes/auth.js`)
- Accept optional `pwa: true` in login request body
- If present, issue JWT with 30-day expiry

### 2. Collections & Expenses routes
- Before inserting a new record, check for same date + type + total amount
- If match found and request does not include `force: true`, return `409 Conflict` with conflicting record details
- If `force: true` is present, skip the check and insert normally

No schema changes required. No new tables.

---

## What Gets Retired

Once the PWA is live and the 2–3 users have confirmed it works:

- Google Forms (both collection and expense forms)
- Apps Script webhook (`google-forms-integration/`)
- n8n workflows (`n8n/workflows/`)
- n8n Docker setup (`n8n/`)
- `api/forms.js`, `api/webhooks.js` (Vercel API routes for form sync)
- `api/google-sheets.js` (if no longer needed)
- Backend routes: `backend/routes/forms.js`, `backend/routes/webhooks.js`

The `UpdateGoogleSheetModal.js` component can also be removed from the dashboard if Google Sheets export is no longer needed.

---

## Data Flow (After)

```
Phone browser (PWA)
  └── Submit form
        ├── Online → POST /api/collections or /api/expenses → Neon DB
        └── Offline → IndexedDB queue → sync on WiFi → same endpoints
```

---

## Out of Scope

- Editing or deleting entries from the mobile view (admin dashboard handles this)
- Push notifications for sync completion
- Multi-device queue conflict resolution (not needed for 2–3 users)
- Dark mode for mobile view
