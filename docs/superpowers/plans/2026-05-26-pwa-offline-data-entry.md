# PWA Offline-First Data Entry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Google Forms with a mobile PWA `/mobile` route that supports offline data entry with automatic sync when connectivity is restored.

**Architecture:** Add a `/mobile` path to the existing React app (detected via `window.location.pathname`). Offline submissions are queued in IndexedDB using the `idb` library and synced by a `syncManager.js` listener when the `online` event fires. Backend gets duplicate detection (409 Conflict) on POST for both collections and expenses, and issues 30-day JWTs when login includes `{ pwa: true }`.

**Tech Stack:** React 19, Tailwind CSS, `idb` (IndexedDB wrapper), Service Worker (custom, `public/sw.js`), Node.js/Express (local), Vercel serverless functions (`api/`), SQLite (local) / Neon PostgreSQL (production).

---

## File Map

### Backend — modify existing
| File | Change |
|------|--------|
| `backend/routes/auth.js:38-43` | Read `pwa` from body; issue 30d JWT if truthy |
| `backend/routes/collections.js:69-192` | Duplicate check before INSERT; honor `force` flag |
| `backend/routes/expenses.js:55-175` | Duplicate check before INSERT; honor `force` flag |
| `api/auth.js:41-45` | Same 30d JWT change (Vercel production) |
| `api/collections.js` | Same duplicate check (Vercel production) |
| `api/expenses.js` | Same duplicate check (Vercel production) |

### Frontend — create new
| File | Responsibility |
|------|----------------|
| `frontend/src/utils/syncQueue.js` | IndexedDB CRUD for the offline queue |
| `frontend/src/utils/syncManager.js` | Drain queue on `online` event |
| `frontend/src/components/mobile/ConnectionBanner.js` | Online/offline/syncing status strip |
| `frontend/src/components/mobile/MobileSubmitForm.js` | Collection/Expense toggle form |
| `frontend/src/components/mobile/MobileRecentList.js` | Last 20 entries + queue entries with badges |
| `frontend/src/components/mobile/MobileLayout.js` | Tab shell: banner + Submit + Recent |
| `frontend/public/sw.js` | App shell caching service worker |

### Frontend — modify existing
| File | Change |
|------|--------|
| `frontend/public/manifest.json` | SBCC branding, `start_url: /mobile`, indigo theme |
| `frontend/src/utils/api.js` | Add `loginPwa`, `submitForMobile`, `getRecentEntries` |
| `frontend/src/index.js` | Register service worker |
| `frontend/src/App.js` | Detect `/mobile` path; render `MobileLayout` |

---

## Task 1: Update PWA Manifest

**Files:**
- Modify: `frontend/public/manifest.json`

- [ ] **Step 1: Update manifest**

Replace the entire contents of `frontend/public/manifest.json` with:

```json
{
  "short_name": "SBCC Finance",
  "name": "SBCC Financial System",
  "icons": [
    {
      "src": "favicon.ico",
      "sizes": "64x64 32x32 24x24 16x16",
      "type": "image/x-icon"
    },
    {
      "src": "logo192.png",
      "type": "image/png",
      "sizes": "192x192",
      "purpose": "any maskable"
    },
    {
      "src": "logo512.png",
      "type": "image/png",
      "sizes": "512x512",
      "purpose": "any maskable"
    }
  ],
  "start_url": "/mobile",
  "display": "standalone",
  "theme_color": "#6366f1",
  "background_color": "#020617",
  "description": "SBCC church financial records — offline-capable mobile entry"
}
```

- [ ] **Step 2: Verify in browser**

Run: `cd frontend && npm start`

Navigate to `http://localhost:3000`. Open DevTools → Application → Manifest. Confirm `start_url` is `/mobile` and `display` is `standalone`.

- [ ] **Step 3: Commit**

```bash
git add frontend/public/manifest.json
git commit -m "feat: update PWA manifest for SBCC mobile app"
```

---

## Task 2: Backend — 30-Day JWT for PWA Login

**Files:**
- Modify: `backend/routes/auth.js:10-54`
- Modify: `api/auth.js:21-60`

- [ ] **Step 1: Write the test (curl)**

Start the backend: `cd backend && npm run dev` (port 3001).

Baseline check — default login returns 24h token:
```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@sbcc.church","password":"admin123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo $TOKEN | cut -d. -f2 | base64 -d 2>/dev/null | python3 -c "import sys,json; data=json.load(sys.stdin); print('exp:', data['exp'])"
```

Save the `exp` value. We'll verify it increases to 30d after the change.

- [ ] **Step 2: Update `backend/routes/auth.js` login route**

In the `/login` handler, change the body destructuring and JWT sign call (around line 10-43):

```javascript
// Change line 11 from:
const { email, password } = req.body;
// To:
const { email, password, pwa } = req.body;
```

```javascript
// Change the jwt.sign call (around line 38-42) from:
const token = jwt.sign(
  { id: user.id, email: user.email, role: user.role, name: user.name },
  JWT_SECRET,
  { expiresIn: "24h" }
);
// To:
const token = jwt.sign(
  { id: user.id, email: user.email, role: user.role, name: user.name },
  JWT_SECRET,
  { expiresIn: pwa ? "30d" : "24h" }
);
```

- [ ] **Step 3: Run test — verify 30d expiry**

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@sbcc.church","password":"admin123","pwa":true}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo $TOKEN | cut -d. -f2 | \
  awk '{l=length($0)%4; if(l>0){$0=$0 substr("====",1,4-l)}}1' | \
  base64 -d 2>/dev/null | python3 -m json.tool
```

Expected: `"exp"` is ~30 days from now (> 2,500,000 seconds in the future).

- [ ] **Step 4: Apply the same change to `api/auth.js`**

In `api/auth.js`, find the `POST /api/auth/login` handler (around line 21-60):

```javascript
// Change:
const { email, password } = req.body;
// To:
const { email, password, pwa } = req.body;
```

```javascript
// Change the jwt.sign call from:
const token = jwt.sign(
  { id: user.id, email: user.email, role: user.role, name: user.name },
  JWT_SECRET,
  { expiresIn: '24h' }
);
// To:
const token = jwt.sign(
  { id: user.id, email: user.email, role: user.role, name: user.name },
  JWT_SECRET,
  { expiresIn: pwa ? '30d' : '24h' }
);
```

- [ ] **Step 5: Commit**

```bash
git add backend/routes/auth.js api/auth.js
git commit -m "feat: issue 30-day JWT when pwa:true in login request"
```

---

## Task 3: Backend — Duplicate Detection in Collections

**Files:**
- Modify: `backend/routes/collections.js:69-192`
- Modify: `api/collections.js`

- [ ] **Step 1: Write the test (curl)**

With backend running, create a collection:
```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@sbcc.church","password":"admin123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s -X POST http://localhost:3001/api/collections \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"date":"2026-05-26","general_tithes_offering":5000}'
```

Then POST the same request again — expect a `409` (after the fix). Right now it will succeed (201).

- [ ] **Step 2: Add duplicate detection in `backend/routes/collections.js`**

In the POST `/` handler, **after** `calculatedTotal` is computed and validated (after line ~115, before the INSERT query), add:

```javascript
  // Duplicate detection
  if (!req.body.force) {
    const dup = await new Promise((resolve, reject) => {
      req.db.get(
        'SELECT id, created_by, date FROM collections WHERE date = ? AND total_amount = ?',
        [date, calculatedTotal],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });
    if (dup) {
      return res.status(409).json({
        error: 'Duplicate entry detected',
        conflict: { id: dup.id, submitted_by: dup.created_by, date: dup.date, total_amount: calculatedTotal },
      });
    }
  }
```

Make the route handler `async` (it already is: `router.post("/", authenticateToken, async (req, res) => {`).

- [ ] **Step 3: Run test — verify 409**

```bash
# Second POST with same date and amount should return 409
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/collections \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"date":"2026-05-26","general_tithes_offering":5000}'
```

Expected output: `409`

- [ ] **Step 4: Verify `force: true` bypasses check**

```bash
curl -s -w "\n%{http_code}" -X POST http://localhost:3001/api/collections \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"date":"2026-05-26","general_tithes_offering":5000,"force":true}'
```

Expected: response body contains `"id"` and status `200`.

- [ ] **Step 5: Apply same change to `api/collections.js`**

Open `api/collections.js` and find the POST handler for creating a collection. After `calculatedTotal` is computed and validated, add:

```javascript
  // Duplicate detection
  if (!req.body.force) {
    const dup = await db.get(
      'SELECT id, created_by, date FROM collections WHERE date = $1 AND total_amount = $2',
      [date, calculatedTotal]
    );
    if (dup) {
      return res.status(409).json({
        error: 'Duplicate entry detected',
        conflict: { id: dup.id, submitted_by: dup.created_by, date: dup.date, total_amount: calculatedTotal },
      });
    }
  }
```

Note: `api/` uses the `db.get()` promise API (Neon PostgreSQL), not the callback SQLite API. The parameterized query uses `$1`/`$2` instead of `?`.

- [ ] **Step 6: Commit**

```bash
git add backend/routes/collections.js api/collections.js
git commit -m "feat: add duplicate detection (409) to collections POST"
```

---

## Task 4: Backend — Duplicate Detection in Expenses

**Files:**
- Modify: `backend/routes/expenses.js:55-175`
- Modify: `api/expenses.js`

- [ ] **Step 1: Write the test (curl)**

Create an expense:
```bash
curl -s -X POST http://localhost:3001/api/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"date":"2026-05-26","category":"supplies","total_amount":1500}'
```

Posting the same again should return 409 after the fix.

- [ ] **Step 2: Add duplicate detection in `backend/routes/expenses.js`**

The POST handler starts at line 55 and is **not** async. Change the function signature to async and add the duplicate check after `calculatedTotal` is computed and validated (after the `calculatedTotal <= 0` check, before the INSERT query):

```javascript
// Change the route declaration from:
router.post("/", authenticateToken, (req, res) => {
// To:
router.post("/", authenticateToken, async (req, res) => {
```

Then add after the `calculatedTotal <= 0` validation block:

```javascript
  // Duplicate detection
  if (!req.body.force) {
    const dup = await new Promise((resolve, reject) => {
      req.db.get(
        'SELECT id, created_by, date FROM expenses WHERE date = ? AND total_amount = ?',
        [date, calculatedTotal],
        (err, row) => (err ? reject(err) : resolve(row))
      );
    });
    if (dup) {
      return res.status(409).json({
        error: 'Duplicate entry detected',
        conflict: { id: dup.id, submitted_by: dup.created_by, date: dup.date, total_amount: calculatedTotal },
      });
    }
  }
```

- [ ] **Step 3: Run test — verify 409**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/api/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"date":"2026-05-26","category":"supplies","total_amount":1500}'
```

Expected: `409`

- [ ] **Step 4: Verify `force: true` bypasses check**

```bash
curl -s -w "\n%{http_code}" -X POST http://localhost:3001/api/expenses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"date":"2026-05-26","category":"supplies","total_amount":1500,"force":true}'
```

Expected: status `200`, body contains `"id"`.

- [ ] **Step 5: Apply same change to `api/expenses.js`**

Same pattern as `api/collections.js` — find the POST handler, make it async, add:

```javascript
  if (!req.body.force) {
    const dup = await db.get(
      'SELECT id, created_by, date FROM expenses WHERE date = $1 AND total_amount = $2',
      [date, calculatedTotal]
    );
    if (dup) {
      return res.status(409).json({
        error: 'Duplicate entry detected',
        conflict: { id: dup.id, submitted_by: dup.created_by, date: dup.date, total_amount: calculatedTotal },
      });
    }
  }
```

- [ ] **Step 6: Commit**

```bash
git add backend/routes/expenses.js api/expenses.js
git commit -m "feat: add duplicate detection (409) to expenses POST"
```

---

## Task 5: Install `idb` and Create `syncQueue.js`

**Files:**
- Create: `frontend/src/utils/syncQueue.js`
- Create: `frontend/src/utils/syncQueue.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/syncQueue.test.js`:

```javascript
import { enqueue, getAll, getPending, updateStatus, remove } from './syncQueue';

// jest-environment: jsdom (CRA default) provides indexedDB via fake-indexeddb
// No additional setup needed — idb falls back gracefully in jsdom

beforeEach(async () => {
  // Clear the database between tests by re-opening with a higher version
  // Simpler: just remove all items
  const all = await getAll();
  for (const item of all) {
    await remove(item.localId);
  }
});

test('enqueue adds item with pending status and localId', async () => {
  const item = await enqueue({ type: 'collection', data: { date: '2026-05-26', total_amount: 100 } });
  expect(item.localId).toBeDefined();
  expect(item.status).toBe('pending');
  expect(item.queuedAt).toBeDefined();
});

test('getAll returns all queued items', async () => {
  await enqueue({ type: 'collection', data: { date: '2026-05-26' } });
  await enqueue({ type: 'expense', data: { date: '2026-05-26' } });
  const all = await getAll();
  expect(all.length).toBe(2);
});

test('getPending returns only pending items', async () => {
  const a = await enqueue({ type: 'collection', data: {} });
  await enqueue({ type: 'expense', data: {} });
  await updateStatus(a.localId, 'synced');
  const pending = await getPending();
  expect(pending.length).toBe(1);
  expect(pending[0].status).toBe('pending');
});

test('updateStatus changes item status', async () => {
  const item = await enqueue({ type: 'collection', data: {} });
  await updateStatus(item.localId, 'failed', 'Network error');
  const all = await getAll();
  const updated = all.find(i => i.localId === item.localId);
  expect(updated.status).toBe('failed');
  expect(updated.error).toBe('Network error');
});

test('remove deletes item from queue', async () => {
  const item = await enqueue({ type: 'collection', data: {} });
  await remove(item.localId);
  const all = await getAll();
  expect(all.find(i => i.localId === item.localId)).toBeUndefined();
});

test('getPending returns items in chronological order', async () => {
  // enqueue sequentially so timestamps differ
  const a = await enqueue({ type: 'collection', data: {} });
  await new Promise(r => setTimeout(r, 5));
  const b = await enqueue({ type: 'expense', data: {} });
  const pending = await getPending();
  expect(pending[0].localId).toBe(a.localId);
  expect(pending[1].localId).toBe(b.localId);
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd frontend && npm test -- --testPathPattern=syncQueue --watchAll=false
```

Expected: `Cannot find module './syncQueue'`

- [ ] **Step 3: Install `idb`**

```bash
cd frontend && npm install idb
```

- [ ] **Step 4: Create `syncQueue.js`**

Create `frontend/src/utils/syncQueue.js`:

```javascript
import { openDB } from 'idb';

const DB_NAME = 'sbcc-offline';
const STORE = 'queue';
const VERSION = 1;

function getDB() {
  return openDB(DB_NAME, VERSION, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: 'localId' });
    },
  });
}

export async function enqueue(entry) {
  const db = await getDB();
  const item = {
    ...entry,
    localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    status: 'pending',
    queuedAt: new Date().toISOString(),
    error: null,
  };
  await db.put(STORE, item);
  return item;
}

export async function getAll() {
  const db = await getDB();
  return db.getAll(STORE);
}

export async function updateStatus(localId, status, error = null) {
  const db = await getDB();
  const item = await db.get(STORE, localId);
  if (!item) return;
  await db.put(STORE, { ...item, status, error });
}

export async function remove(localId) {
  const db = await getDB();
  await db.delete(STORE, localId);
}

export async function getPending() {
  const all = await getAll();
  return all
    .filter(item => item.status === 'pending')
    .sort((a, b) => new Date(a.queuedAt) - new Date(b.queuedAt));
}
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd frontend && npm test -- --testPathPattern=syncQueue --watchAll=false
```

Expected: `6 tests passed`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/syncQueue.js frontend/src/utils/syncQueue.test.js frontend/package.json frontend/package-lock.json
git commit -m "feat: add IndexedDB offline sync queue (idb)"
```

---

## Task 6: Create `syncManager.js`

**Files:**
- Create: `frontend/src/utils/syncManager.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/utils/syncManager.test.js`:

```javascript
import { syncPendingEntries, startSyncListener } from './syncManager';
import { enqueue, getAll, getPending } from './syncQueue';
import axios from 'axios';

jest.mock('axios');
jest.mock('./syncQueue', () => ({
  getPending: jest.fn(),
  updateStatus: jest.fn(),
  remove: jest.fn(),
}));

const { getPending: mockGetPending, updateStatus: mockUpdateStatus, remove: mockRemove } = require('./syncQueue');

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('authToken', 'test-token');
});

test('syncPendingEntries calls POST for each pending entry and removes on success', async () => {
  mockGetPending.mockResolvedValue([
    { localId: 'id-1', type: 'collection', data: { date: '2026-05-26' } },
  ]);
  axios.post = jest.fn().mockResolvedValue({ data: { id: 42 } });

  await syncPendingEntries();

  expect(axios.post).toHaveBeenCalledWith(
    expect.stringContaining('/api/collections'),
    expect.objectContaining({ date: '2026-05-26' }),
    expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } })
  );
  expect(mockRemove).toHaveBeenCalledWith('id-1');
});

test('syncPendingEntries marks entry as failed on network error', async () => {
  mockGetPending.mockResolvedValue([
    { localId: 'id-2', type: 'expense', data: { date: '2026-05-26' } },
  ]);
  axios.post = jest.fn().mockRejectedValue(new Error('Network Error'));

  await syncPendingEntries();

  expect(mockUpdateStatus).toHaveBeenCalledWith('id-2', 'failed', 'Network Error');
});

test('syncPendingEntries marks entry as duplicate on 409', async () => {
  mockGetPending.mockResolvedValue([
    { localId: 'id-3', type: 'collection', data: { date: '2026-05-26' } },
  ]);
  const err = new Error('Conflict');
  err.response = { status: 409, data: { conflict: { submitted_by: 'admin', date: '2026-05-26' } } };
  axios.post = jest.fn().mockRejectedValue(err);

  await syncPendingEntries();

  expect(mockUpdateStatus).toHaveBeenCalledWith('id-3', 'duplicate', JSON.stringify({ submitted_by: 'admin', date: '2026-05-26' }));
});

test('startSyncListener returns a cleanup function', () => {
  const cleanup = startSyncListener(jest.fn());
  expect(typeof cleanup).toBe('function');
  cleanup();
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd frontend && npm test -- --testPathPattern=syncManager --watchAll=false
```

Expected: `Cannot find module './syncManager'`

- [ ] **Step 3: Create `syncManager.js`**

Create `frontend/src/utils/syncManager.js`:

```javascript
import axios from 'axios';
import { getPending, updateStatus, remove } from './syncQueue';

const API_BASE = process.env.REACT_APP_API_URL || '';

async function submitEntry(entry) {
  const url = entry.type === 'collection'
    ? `${API_BASE}/api/collections`
    : `${API_BASE}/api/expenses`;
  const token = localStorage.getItem('authToken');
  return axios.post(url, { ...entry.data, force: entry.force || false }, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function syncPendingEntries(onUpdate) {
  const pending = await getPending();
  for (const entry of pending) {
    try {
      await submitEntry(entry);
      await remove(entry.localId);
    } catch (err) {
      if (err.response?.status === 409) {
        await updateStatus(entry.localId, 'duplicate', JSON.stringify(err.response.data.conflict));
      } else {
        await updateStatus(entry.localId, 'failed', err.message);
      }
    }
    onUpdate?.();
  }
}

export function startSyncListener(onUpdate) {
  const handle = () => syncPendingEntries(onUpdate);
  window.addEventListener('online', handle);
  return () => window.removeEventListener('online', handle);
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd frontend && npm test -- --testPathPattern=syncManager --watchAll=false
```

Expected: `4 tests passed`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/syncManager.js frontend/src/utils/syncManager.test.js
git commit -m "feat: add syncManager to drain offline queue on reconnect"
```

---

## Task 7: Update `api.js` with Mobile Methods

**Files:**
- Modify: `frontend/src/utils/api.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/api.mobile.test.js`:

```javascript
import apiService from './api';

jest.mock('axios', () => {
  const mockAxios = {
    create: jest.fn(() => mockAxios),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    post: jest.fn(),
    get: jest.fn(),
  };
  return mockAxios;
});

jest.mock('./syncQueue', () => ({
  enqueue: jest.fn().mockResolvedValue({ localId: 'queued-123', status: 'pending' }),
}));

const mockAxios = require('axios');

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('authToken', 'test-token');
});

test('loginPwa calls POST with pwa:true and stores token', async () => {
  mockAxios.post.mockResolvedValue({ data: { token: 'tok123', user: { id: 1, name: 'Admin' } } });
  const result = await apiService.loginPwa('admin@sbcc.church', 'admin123');
  expect(mockAxios.post).toHaveBeenCalledWith(
    '/api/auth/login',
    { email: 'admin@sbcc.church', password: 'admin123', pwa: true }
  );
  expect(localStorage.getItem('authToken')).toBe('tok123');
});

test('submitForMobile returns success when online', async () => {
  mockAxios.post.mockResolvedValue({ data: { id: 5 } });
  const result = await apiService.submitForMobile('collection', { date: '2026-05-26' });
  expect(result.status).toBe('success');
  expect(result.data.id).toBe(5);
});

test('submitForMobile queues entry when offline (no response)', async () => {
  const networkErr = new Error('Network Error');
  mockAxios.post.mockRejectedValue(networkErr);
  const result = await apiService.submitForMobile('collection', { date: '2026-05-26' });
  expect(result.status).toBe('queued');
  expect(result.localId).toBe('queued-123');
});

test('submitForMobile returns duplicate status on 409', async () => {
  const err = new Error('Conflict');
  err.response = { status: 409, data: { conflict: { submitted_by: 'bob', date: '2026-05-26' } } };
  mockAxios.post.mockRejectedValue(err);
  const result = await apiService.submitForMobile('collection', { date: '2026-05-26' });
  expect(result.status).toBe('duplicate');
  expect(result.conflict.submitted_by).toBe('bob');
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd frontend && npm test -- --testPathPattern=api.mobile --watchAll=false
```

Expected: failures on `loginPwa` and `submitForMobile` not defined.

- [ ] **Step 3: Add methods to `api.js`**

At the top of `frontend/src/utils/api.js`, add after the `import axios` line:

```javascript
import { enqueue } from './syncQueue';
```

In the `ApiService` class, add these three methods after `deleteUser`:

```javascript
  async loginPwa(email, password) {
    const response = await this.api.post('/api/auth/login', { email, password, pwa: true });
    if (response.data.token) {
      localStorage.setItem('authToken', response.data.token);
    }
    return response.data;
  }

  async submitForMobile(type, data) {
    const url = type === 'collection' ? '/api/collections' : '/api/expenses';
    try {
      const response = await this.api.post(url, data);
      return { status: 'success', data: response.data };
    } catch (error) {
      if (!error.response) {
        const queued = await enqueue({ type, data });
        return { status: 'queued', localId: queued.localId };
      }
      if (error.response.status === 409) {
        return { status: 'duplicate', conflict: error.response.data.conflict };
      }
      throw new Error(error.response?.data?.error || 'Submission failed');
    }
  }

  async getRecentEntries(limit = 20) {
    const [colRes, expRes] = await Promise.all([
      this.api.get('/api/collections').catch(() => ({ data: [] })),
      this.api.get('/api/expenses').catch(() => ({ data: [] })),
    ]);
    const collections = colRes.data.slice(0, limit).map(c => ({ ...c, entryType: 'collection' }));
    const expenses = expRes.data.slice(0, limit).map(e => ({ ...e, entryType: 'expense' }));
    return [...collections, ...expenses]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit);
  }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd frontend && npm test -- --testPathPattern=api.mobile --watchAll=false
```

Expected: `4 tests passed`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/api.js frontend/src/utils/api.mobile.test.js
git commit -m "feat: add loginPwa, submitForMobile, getRecentEntries to ApiService"
```

---

## Task 8: Service Worker and Registration

**Files:**
- Create: `frontend/public/sw.js`
- Modify: `frontend/src/index.js`

- [ ] **Step 1: Create `public/sw.js`**

Create `frontend/public/sw.js`:

```javascript
const CACHE = 'sbcc-shell-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll(['/', '/mobile', '/index.html'])
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;

  // Let API requests pass through; never cache them
  if (request.url.includes('/api/')) return;

  // Navigation requests: serve from cache on failure (offline shell)
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: cache-first
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
```

- [ ] **Step 2: Register service worker in `src/index.js`**

Add after the `reportWebVitals()` call at the bottom of `frontend/src/index.js`:

```javascript
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failure is non-fatal — app still works online
    });
  });
}
```

- [ ] **Step 3: Verify SW registers**

Run: `cd frontend && npm start`

Open DevTools → Application → Service Workers. Confirm `sw.js` shows as "Activated and running".

- [ ] **Step 4: Commit**

```bash
git add frontend/public/sw.js frontend/src/index.js
git commit -m "feat: add service worker for app shell caching"
```

---

## Task 9: `ConnectionBanner` Component

**Files:**
- Create: `frontend/src/components/mobile/ConnectionBanner.js`
- Create: `frontend/src/components/mobile/ConnectionBanner.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/mobile/ConnectionBanner.test.js`:

```javascript
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import ConnectionBanner from './ConnectionBanner';

// jsdom starts as online
test('shows Synced when online and no pending entries', () => {
  render(<ConnectionBanner pendingCount={0} syncing={false} />);
  expect(screen.getByText('Synced')).toBeInTheDocument();
});

test('shows pending count when offline', () => {
  // Simulate offline
  Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
  render(<ConnectionBanner pendingCount={3} syncing={false} />);
  expect(screen.getByText(/3 entries pending sync/)).toBeInTheDocument();
  Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
});

test('shows Syncing... when syncing prop is true', () => {
  render(<ConnectionBanner pendingCount={0} syncing={true} />);
  expect(screen.getByText('Syncing...')).toBeInTheDocument();
});

test('shows Synced when online with no pending and not syncing', () => {
  render(<ConnectionBanner pendingCount={0} syncing={false} />);
  expect(screen.getByText('Synced')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd frontend && npm test -- --testPathPattern=ConnectionBanner --watchAll=false
```

Expected: `Cannot find module './ConnectionBanner'`

- [ ] **Step 3: Create `ConnectionBanner.js`**

Create `frontend/src/components/mobile/ConnectionBanner.js`:

```javascript
import React, { useState, useEffect } from 'react';

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
      <div className="bg-amber-500 text-white text-xs font-medium text-center py-1.5 px-4">
        Offline — {pendingCount} {pendingCount === 1 ? 'entry' : 'entries'} pending sync
      </div>
    );
  }
  if (syncing || pendingCount > 0) {
    return (
      <div className="bg-blue-500 text-white text-xs font-medium text-center py-1.5 px-4">
        Syncing...
      </div>
    );
  }
  return (
    <div className="bg-emerald-500 text-white text-xs font-medium text-center py-1.5 px-4">
      Synced
    </div>
  );
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd frontend && npm test -- --testPathPattern=ConnectionBanner --watchAll=false
```

Expected: `4 tests passed`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/mobile/ConnectionBanner.js frontend/src/components/mobile/ConnectionBanner.test.js
git commit -m "feat: add ConnectionBanner component for online/offline status"
```

---

## Task 10: `MobileSubmitForm` Component

**Files:**
- Create: `frontend/src/components/mobile/MobileSubmitForm.js`
- Create: `frontend/src/components/mobile/MobileSubmitForm.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/mobile/MobileSubmitForm.test.js`:

```javascript
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MobileSubmitForm from './MobileSubmitForm';
import apiService from '../../utils/api';

jest.mock('../../utils/api', () => ({
  submitForMobile: jest.fn(),
}));

const user = { name: 'Admin', email: 'admin@sbcc.church' };

test('renders collection form by default', () => {
  render(<MobileSubmitForm user={user} onSubmitted={jest.fn()} />);
  expect(screen.getByText('Collection')).toBeInTheDocument();
  expect(screen.getByLabelText(/Date/i)).toBeInTheDocument();
});

test('switches to expense form on toggle', () => {
  render(<MobileSubmitForm user={user} onSubmitted={jest.fn()} />);
  fireEvent.click(screen.getByText('Expense'));
  expect(screen.getByLabelText(/Category/i)).toBeInTheDocument();
});

test('disables submit button while submitting', async () => {
  apiService.submitForMobile.mockImplementation(() => new Promise(() => {})); // never resolves
  render(<MobileSubmitForm user={user} onSubmitted={jest.fn()} />);
  fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: '2026-05-26' } });
  fireEvent.change(screen.getByLabelText(/General Tithes/i), { target: { value: '5000' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
  expect(screen.getByRole('button', { name: /Submitting/i })).toBeDisabled();
});

test('calls onSubmitted after successful submission', async () => {
  const onSubmitted = jest.fn();
  apiService.submitForMobile.mockResolvedValue({ status: 'success', data: { id: 1 } });
  render(<MobileSubmitForm user={user} onSubmitted={onSubmitted} />);
  fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: '2026-05-26' } });
  fireEvent.change(screen.getByLabelText(/General Tithes/i), { target: { value: '5000' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
  await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
});

test('shows duplicate conflict dialog on 409', async () => {
  apiService.submitForMobile.mockResolvedValue({
    status: 'duplicate',
    conflict: { submitted_by: 'bob@sbcc.church', date: '2026-05-26', total_amount: 5000 },
  });
  render(<MobileSubmitForm user={user} onSubmitted={jest.fn()} />);
  fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: '2026-05-26' } });
  fireEvent.change(screen.getByLabelText(/General Tithes/i), { target: { value: '5000' } });
  fireEvent.click(screen.getByRole('button', { name: /Submit/i }));
  await waitFor(() => expect(screen.getByText(/already submitted by/i)).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /Submit Anyway/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd frontend && npm test -- --testPathPattern=MobileSubmitForm --watchAll=false
```

Expected: `Cannot find module './MobileSubmitForm'`

- [ ] **Step 3: Create `MobileSubmitForm.js`**

Create `frontend/src/components/mobile/MobileSubmitForm.js`:

```javascript
import React, { useState } from 'react';
import apiService from '../../utils/api';

const EXPENSE_CATEGORIES = [
  'workers_share', 'supplies', 'utilities', 'building_maintenance',
  'vehicle_maintenance', 'transportation_gas', 'honorarium',
  'fellowship_events', 'abccop_national', 'cbcc_share', 'kabalikat_share',
];

const INITIAL_COLLECTION = {
  date: '', particular: '', control_number: '', payment_method: 'Cash',
  general_tithes_offering: '', bank_interest: '', sisterhood_san_juan: '',
  sisterhood_labuin: '', brotherhood: '', youth: '', couples: '',
  sunday_school: '', special_purpose_pledge: '',
};

const INITIAL_EXPENSE = {
  date: '', particular: '', category: '', cheque_number: '', forms_number: '',
  pbcm_share_expense: '', pastoral_worker_support: '', cap_assistance: '',
  honorarium: '', conference_seminar: '', fellowship_events: '',
  anniversary_christmas: '', supplies: '', utilities: '', vehicle_maintenance: '',
  lto_registration: '', transportation_gas: '', building_maintenance: '',
  abccop_national: '', cbcc_share: '', kabalikat_share: '', abccop_community: '',
};

export default function MobileSubmitForm({ user, onSubmitted }) {
  const [type, setType] = useState('collection');
  const [form, setForm] = useState(INITIAL_COLLECTION);
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [error, setError] = useState(null);
  const [queued, setQueued] = useState(false);

  const handleTypeToggle = (t) => {
    setType(t);
    setForm(t === 'collection' ? INITIAL_COLLECTION : INITIAL_EXPENSE);
    setConflict(null);
    setError(null);
    setQueued(false);
  };

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const doSubmit = async (force = false) => {
    setSubmitting(true);
    setError(null);
    setConflict(null);
    setQueued(false);
    try {
      const payload = force ? { ...form, force: true } : { ...form };
      const result = await apiService.submitForMobile(type, payload);
      if (result.status === 'success' || result.status === 'queued') {
        if (result.status === 'queued') setQueued(true);
        setForm(type === 'collection' ? INITIAL_COLLECTION : INITIAL_EXPENSE);
        onSubmitted(result);
      } else if (result.status === 'duplicate') {
        setConflict(result.conflict);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    doSubmit(false);
  };

  const handleSubmitAnyway = () => {
    setConflict(null);
    doSubmit(true);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-4">
      {/* Type toggle */}
      <div className="flex rounded-lg overflow-hidden border border-slate-700">
        <button
          type="button"
          onClick={() => handleTypeToggle('collection')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            type === 'collection' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
          }`}
        >
          Collection
        </button>
        <button
          type="button"
          onClick={() => handleTypeToggle('expense')}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            type === 'expense' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'
          }`}
        >
          Expense
        </button>
      </div>

      {/* Date field */}
      <div>
        <label htmlFor="date" className="block text-xs font-medium text-slate-400 mb-1">
          Date <span className="text-red-400">*</span>
        </label>
        <input
          id="date"
          name="date"
          type="date"
          required
          value={form.date}
          onChange={handleChange}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
        />
      </div>

      {type === 'collection' ? (
        <>
          <div>
            <label htmlFor="general_tithes_offering" className="block text-xs font-medium text-slate-400 mb-1">
              General Tithes &amp; Offering
            </label>
            <input
              id="general_tithes_offering"
              name="general_tithes_offering"
              type="number"
              min="0"
              step="0.01"
              value={form.general_tithes_offering}
              onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="0.00"
            />
          </div>
          {['bank_interest','sisterhood_san_juan','sisterhood_labuin','brotherhood','youth','couples','sunday_school','special_purpose_pledge'].map(field => (
            <div key={field}>
              <label htmlFor={field} className="block text-xs font-medium text-slate-400 mb-1 capitalize">
                {field.replace(/_/g, ' ')}
              </label>
              <input
                id={field}
                name={field}
                type="number"
                min="0"
                step="0.01"
                value={form[field]}
                onChange={handleChange}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="0.00"
              />
            </div>
          ))}
          <div>
            <label htmlFor="particular" className="block text-xs font-medium text-slate-400 mb-1">
              Particular / Notes
            </label>
            <input
              id="particular"
              name="particular"
              type="text"
              value={form.particular}
              onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="Optional"
            />
          </div>
          <div>
            <label htmlFor="payment_method" className="block text-xs font-medium text-slate-400 mb-1">
              Payment Method
            </label>
            <select
              id="payment_method"
              name="payment_method"
              value={form.payment_method}
              onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option>Cash</option>
              <option>Check</option>
              <option>Bank Transfer</option>
              <option>GCash</option>
            </select>
          </div>
        </>
      ) : (
        <>
          <div>
            <label htmlFor="category" className="block text-xs font-medium text-slate-400 mb-1">
              Category <span className="text-red-400">*</span>
            </label>
            <select
              id="category"
              name="category"
              required
              value={form.category}
              onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">Select category</option>
              {EXPENSE_CATEGORIES.map(c => (
                <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          {['pbcm_share_expense','pastoral_worker_support','cap_assistance','honorarium','conference_seminar','fellowship_events','anniversary_christmas','supplies','utilities','vehicle_maintenance','lto_registration','transportation_gas','building_maintenance','abccop_national','cbcc_share','kabalikat_share','abccop_community'].map(field => (
            <div key={field}>
              <label htmlFor={field} className="block text-xs font-medium text-slate-400 mb-1 capitalize">
                {field.replace(/_/g, ' ')}
              </label>
              <input
                id={field}
                name={field}
                type="number"
                min="0"
                step="0.01"
                value={form[field]}
                onChange={handleChange}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="0.00"
              />
            </div>
          ))}
          <div>
            <label htmlFor="particular" className="block text-xs font-medium text-slate-400 mb-1">
              Particular / Notes
            </label>
            <input
              id="particular"
              name="particular"
              type="text"
              value={form.particular}
              onChange={handleChange}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
              placeholder="Optional"
            />
          </div>
        </>
      )}

      {/* Feedback messages */}
      {queued && (
        <p className="text-amber-400 text-sm">Entry saved offline — will sync when connected.</p>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Duplicate conflict dialog */}
      {conflict && (
        <div className="p-4 bg-amber-950 border border-amber-700 rounded-lg space-y-3">
          <p className="text-sm text-amber-300">
            A similar entry was already submitted by <strong>{conflict.submitted_by}</strong> on {conflict.date}.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmitAnyway}
              className="flex-1 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium"
            >
              Submit Anyway
            </button>
            <button
              type="button"
              onClick={() => setConflict(null)}
              className="flex-1 py-2 rounded-lg bg-slate-700 text-white text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 rounded-lg bg-indigo-600 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd frontend && npm test -- --testPathPattern=MobileSubmitForm --watchAll=false
```

Expected: `5 tests passed`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/mobile/MobileSubmitForm.js frontend/src/components/mobile/MobileSubmitForm.test.js
git commit -m "feat: add MobileSubmitForm with offline queuing and duplicate detection"
```

---

## Task 11: `MobileRecentList` Component

**Files:**
- Create: `frontend/src/components/mobile/MobileRecentList.js`
- Create: `frontend/src/components/mobile/MobileRecentList.test.js`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/mobile/MobileRecentList.test.js`:

```javascript
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import MobileRecentList from './MobileRecentList';
import apiService from '../../utils/api';
import * as syncQueue from '../../utils/syncQueue';
import * as syncManager from '../../utils/syncManager';

jest.mock('../../utils/api', () => ({ getRecentEntries: jest.fn() }));
jest.mock('../../utils/syncQueue', () => ({ getAll: jest.fn() }));
jest.mock('../../utils/syncManager', () => ({ syncPendingEntries: jest.fn() }));

const mockEntries = [
  { id: 1, date: '2026-05-26', total_amount: 5000, created_by: 'admin@sbcc.church', entryType: 'collection' },
  { id: 2, date: '2026-05-25', total_amount: 1500, created_by: 'admin@sbcc.church', entryType: 'expense' },
];

const mockQueued = [
  { localId: 'q1', type: 'collection', status: 'pending', data: { date: '2026-05-26', general_tithes_offering: '2000' }, queuedAt: new Date().toISOString() },
];

beforeEach(() => {
  jest.clearAllMocks();
  apiService.getRecentEntries.mockResolvedValue(mockEntries);
  syncQueue.getAll.mockResolvedValue([]);
});

test('renders recent entries from API', async () => {
  render(<MobileRecentList onQueueChange={jest.fn()} />);
  await waitFor(() => expect(screen.getByText(/₱5,000/)).toBeInTheDocument());
  expect(screen.getByText(/₱1,500/)).toBeInTheDocument();
});

test('shows pending badge for queued entries', async () => {
  syncQueue.getAll.mockResolvedValue(mockQueued);
  render(<MobileRecentList onQueueChange={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('pending')).toBeInTheDocument());
});

test('shows failed badge with retry button', async () => {
  syncQueue.getAll.mockResolvedValue([
    { ...mockQueued[0], status: 'failed', error: 'Network Error' },
  ]);
  render(<MobileRecentList onQueueChange={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('failed')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
});

test('shows duplicate badge with Submit Anyway and Cancel', async () => {
  syncQueue.getAll.mockResolvedValue([
    { ...mockQueued[0], status: 'duplicate', error: JSON.stringify({ submitted_by: 'bob', date: '2026-05-26' }) },
  ]);
  render(<MobileRecentList onQueueChange={jest.fn()} />);
  await waitFor(() => expect(screen.getByText('duplicate')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /Submit Anyway/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd frontend && npm test -- --testPathPattern=MobileRecentList --watchAll=false
```

Expected: `Cannot find module './MobileRecentList'`

- [ ] **Step 3: Create `MobileRecentList.js`**

Create `frontend/src/components/mobile/MobileRecentList.js`:

```javascript
import React, { useState, useEffect, useCallback } from 'react';
import apiService from '../../utils/api';
import { getAll, updateStatus, remove } from '../../utils/syncQueue';
import { syncPendingEntries } from '../../utils/syncManager';

function formatCurrency(amount) {
  return `₱${Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 0 })}`;
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    failed: 'bg-red-500/20 text-red-400 border-red-500/30',
    duplicate: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${styles[status] || ''}`}>
      {status}
    </span>
  );
}

export default function MobileRecentList({ onQueueChange }) {
  const [entries, setEntries] = useState([]);
  const [queued, setQueued] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recent, queue] = await Promise.all([
        apiService.getRecentEntries(20).catch(() => []),
        getAll(),
      ]);
      setEntries(recent);
      setQueued(queue);
      onQueueChange?.(queue.filter(q => q.status === 'pending').length);
    } finally {
      setLoading(false);
    }
  }, [onQueueChange]);

  useEffect(() => { load(); }, [load]);

  const handleRetry = async (item) => {
    await updateStatus(item.localId, 'pending', null);
    await syncPendingEntries(load);
    load();
  };

  const handleSubmitAnyway = async (item) => {
    await updateStatus(item.localId, 'pending', null);
    // Mark with force flag so syncManager bypasses duplicate check
    const { getAll: getAllQueue } = await import('../../utils/syncQueue');
    const all = await getAllQueue();
    const target = all.find(q => q.localId === item.localId);
    if (target) {
      const { openDB } = await import('idb');
      const db = await openDB('sbcc-offline', 1);
      await db.put('queue', { ...target, force: true });
    }
    await syncPendingEntries(load);
    load();
  };

  const handleCancelQueued = async (localId) => {
    await remove(localId);
    load();
  };

  if (loading) {
    return <div className="p-4 text-slate-500 text-sm text-center">Loading...</div>;
  }

  return (
    <div className="divide-y divide-slate-800">
      {/* Queued entries first */}
      {queued.map(item => {
        const conflict = item.status === 'duplicate' && item.error
          ? (() => { try { return JSON.parse(item.error); } catch { return null; } })()
          : null;
        return (
          <div key={item.localId} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white capitalize">{item.type}</p>
                <p className="text-xs text-slate-500">{item.data?.date || '—'}</p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            {item.status === 'failed' && (
              <div className="space-y-2">
                <p className="text-xs text-red-400">{item.error}</p>
                <button
                  onClick={() => handleRetry(item)}
                  className="text-xs px-3 py-1 rounded bg-slate-700 text-white"
                >
                  Retry
                </button>
              </div>
            )}
            {item.status === 'duplicate' && conflict && (
              <div className="space-y-2">
                <p className="text-xs text-orange-300">
                  Already submitted by {conflict.submitted_by} on {conflict.date}.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSubmitAnyway(item)}
                    className="text-xs px-3 py-1 rounded bg-amber-600 text-white"
                  >
                    Submit Anyway
                  </button>
                  <button
                    onClick={() => handleCancelQueued(item.localId)}
                    className="text-xs px-3 py-1 rounded bg-slate-700 text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Synced entries from API */}
      {entries.map(entry => (
        <div key={`${entry.entryType}-${entry.id}`} className="p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white capitalize">{entry.entryType}</p>
            <p className="text-xs text-slate-500">
              {entry.date} · {entry.created_by}
            </p>
          </div>
          <p className="text-sm font-semibold text-indigo-400">{formatCurrency(entry.total_amount)}</p>
        </div>
      ))}

      {queued.length === 0 && entries.length === 0 && (
        <p className="p-8 text-slate-500 text-sm text-center">No entries yet.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd frontend && npm test -- --testPathPattern=MobileRecentList --watchAll=false
```

Expected: `4 tests passed`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/mobile/MobileRecentList.js frontend/src/components/mobile/MobileRecentList.test.js
git commit -m "feat: add MobileRecentList with pending/failed/duplicate badges"
```

---

## Task 12: `MobileLayout` Component

**Files:**
- Create: `frontend/src/components/mobile/MobileLayout.js`

No separate test file — MobileLayout is a thin shell; integration is verified in App.

- [ ] **Step 1: Create `MobileLayout.js`**

Create `frontend/src/components/mobile/MobileLayout.js`:

```javascript
import React, { useState, useEffect, useCallback } from 'react';
import ConnectionBanner from './ConnectionBanner';
import MobileSubmitForm from './MobileSubmitForm';
import MobileRecentList from './MobileRecentList';
import { syncPendingEntries } from '../../utils/syncManager';

export default function MobileLayout({ user, onLogout }) {
  const [tab, setTab] = useState('submit');
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const handleQueueChange = useCallback((count) => {
    setPendingCount(count);
  }, []);

  const handleSubmitted = useCallback((result) => {
    if (result.status === 'success') {
      setTab('recent');
    }
    // If queued, stay on submit but switch to recent after a brief moment
    if (result.status === 'queued') {
      setTimeout(() => setTab('recent'), 800);
    }
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

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col max-w-md mx-auto">
      <ConnectionBanner pendingCount={pendingCount} syncing={syncing} />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div>
          <h1 className="text-sm font-semibold text-white">SBCC Finance</h1>
          <p className="text-xs text-slate-500">{user?.name}</p>
        </div>
        <button
          onClick={onLogout}
          className="text-xs text-slate-400 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-800">
        <button
          onClick={() => setTab('submit')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            tab === 'submit' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500'
          }`}
        >
          Submit
        </button>
        <button
          onClick={() => setTab('recent')}
          className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
            tab === 'recent' ? 'text-indigo-400 border-b-2 border-indigo-500' : 'text-slate-500'
          }`}
        >
          Recent
          {pendingCount > 0 && (
            <span className="absolute top-2 right-8 w-4 h-4 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'submit' ? (
          <MobileSubmitForm user={user} onSubmitted={handleSubmitted} />
        ) : (
          <MobileRecentList onQueueChange={handleQueueChange} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/mobile/MobileLayout.js
git commit -m "feat: add MobileLayout with tab shell and sync orchestration"
```

---

## Task 13: Wire `/mobile` Route in `App.js`

**Files:**
- Modify: `frontend/src/App.js`

- [ ] **Step 1: Write the test**

Create `frontend/src/App.mobile.test.js`:

```javascript
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import apiService from './utils/api';

jest.mock('./utils/api', () => ({
  getCurrentUser: jest.fn(),
  logout: jest.fn(),
}));
jest.mock('./components/mobile/MobileLayout', () => ({ user }) => (
  <div>MobileLayout for {user?.name}</div>
));
jest.mock('./components/LoginNew', () => ({ onLogin }) => <div>Login</div>);
jest.mock('./components/Dashboard', () => ({ user }) => <div>Dashboard for {user?.name}</div>);

test('renders MobileLayout when path is /mobile and user is logged in', async () => {
  window.history.pushState({}, '', '/mobile');
  apiService.getCurrentUser.mockResolvedValue({ id: 1, name: 'Treasurer', role: 'user' });
  localStorage.setItem('authToken', 'tok');

  render(<App />);
  await waitFor(() => expect(screen.getByText(/MobileLayout for Treasurer/)).toBeInTheDocument());

  window.history.pushState({}, '', '/');
  localStorage.removeItem('authToken');
});

test('renders Login when path is /mobile but not logged in', async () => {
  window.history.pushState({}, '', '/mobile');
  apiService.getCurrentUser.mockRejectedValue(new Error('No token'));
  localStorage.removeItem('authToken');

  render(<App />);
  await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());

  window.history.pushState({}, '', '/');
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd frontend && npm test -- --testPathPattern=App.mobile --watchAll=false
```

Expected: `MobileLayout` not rendered because App.js doesn't know about it yet.

- [ ] **Step 3: Update `App.js`**

Replace the contents of `frontend/src/App.js` with:

```javascript
import React, { useState, useEffect } from "react";
import "./App.css";
import Login from "./components/LoginNew";
import Dashboard from "./components/Dashboard";
import MobileLayout from "./components/mobile/MobileLayout";
import apiService from "./utils/api";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const isMobile = window.location.pathname === '/mobile';

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem("authToken");
      if (token) {
        const userData = await apiService.getCurrentUser();
        setUser(userData);
      }
    } catch (error) {
      localStorage.removeItem("authToken");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    apiService.logout();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-9 h-9 border-2 border-slate-800 border-t-indigo-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-slate-500 font-medium tracking-tight">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login onLogin={handleLogin} />;
  }

  if (isMobile) {
    return <MobileLayout user={user} onLogout={handleLogout} />;
  }

  return (
    <div className="App">
      <Dashboard user={user} onLogout={handleLogout} />
    </div>
  );
}

export default App;
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd frontend && npm test -- --testPathPattern=App.mobile --watchAll=false
```

Expected: `2 tests passed`

- [ ] **Step 5: Run all tests to check for regressions**

```bash
cd frontend && npm test -- --watchAll=false
```

Expected: all tests pass (check App.test.js — if it breaks, update the mock it uses to match the new App structure).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.js frontend/src/App.mobile.test.js
git commit -m "feat: add /mobile route in App.js rendering MobileLayout"
```

---

## Task 14: End-to-End Smoke Test

This task verifies the full flow works in a browser — not automated, manual verification.

- [ ] **Step 1: Start the full stack**

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm start
```

- [ ] **Step 2: Test online collection submission**

1. Navigate to `http://localhost:3000/mobile`
2. Log in with `admin@sbcc.church` / `admin123`
3. Verify the ConnectionBanner shows "Synced"
4. On the Submit tab, set date to today, enter ₱5,000 in General Tithes
5. Tap Submit → expect redirect to Recent tab showing the new entry

- [ ] **Step 3: Test duplicate detection**

1. On Submit tab, enter the same date and ₱5,000 in General Tithes again
2. Tap Submit → expect duplicate conflict dialog
3. Tap "Cancel" → dialog dismisses, form stays
4. Tap Submit again → dialog reappears
5. Tap "Submit Anyway" → entry submitted, appears in Recent without badge

- [ ] **Step 4: Test offline queuing**

1. In DevTools → Network → set throttling to "Offline"
2. Submit a new collection entry
3. Verify: banner shows "Offline — 1 entry pending sync", entry appears in Recent with "pending" badge
4. Switch Network back to "Online"
5. Verify: banner shows "Syncing..." then "Synced", pending badge clears from Recent

- [ ] **Step 5: Test desktop is unaffected**

1. Navigate to `http://localhost:3000`
2. Verify Dashboard still loads normally with no regressions

- [ ] **Step 6: Commit verification note**

```bash
git log --oneline -10
```

All 10 feature commits should be in order. If everything looks good, proceed to the finishing-a-development-branch skill.

---

## Spec Coverage Check

| Spec requirement | Task |
|-----------------|------|
| Web App Manifest with standalone display | Task 1 |
| Service Worker app shell caching | Task 8 |
| IndexedDB offline queue | Task 5 |
| Sync on WiFi restore | Task 6 |
| `/mobile` route, Submit + Recent tabs | Tasks 10–13 |
| Collection form | Task 10 |
| Expense form | Task 10 |
| Connection banner (offline/syncing/synced) | Task 9 |
| Pending badge in Recent | Task 11 |
| Failed badge + retry | Task 11 |
| Duplicate badge + Submit Anyway / Cancel | Task 11 |
| Backend duplicate detection (409) | Tasks 3, 4 |
| `force: true` bypass | Tasks 3, 4 |
| 30-day JWT for PWA login | Task 2 |
| Token expires while offline — entries preserved | syncQueue persists across sessions (IndexedDB) ✓ |
