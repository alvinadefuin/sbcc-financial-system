# Mobile Customizable Fields + Remove Google Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Google Forms nav page and make the /mobile form's collection and expense amount fields fully admin-customizable via the existing custom_fields system.

**Architecture:** The `custom_fields` DB table and `customFields.js` backend route already exist. We'll seed the current hardcoded fields as defaults into `custom_fields` on first run, then update `MobileSubmitForm.js` to fetch fields dynamically from the API instead of using hardcoded constants. The admin manages fields through the existing `CustomFieldsManager` modal in the dashboard sidebar.

**Tech Stack:** React, Node.js/Express, SQLite, Axios, existing `custom_fields` DB schema

---

## File Map

| File | Action | What changes |
|------|--------|--------------|
| `frontend/src/components/Dashboard.js` | Modify | Remove `GoogleFormsManager` component, `showGoogleForms` state, nav item, and render block |
| `frontend/src/components/mobile/MobileSubmitForm.js` | Modify | Replace hardcoded field constants with dynamic fetch from `/api/custom-fields/collections` and `/api/custom-fields/expenses`; derive initial form state from API response |
| `backend/config/database.js` | Modify | Add seeding logic that inserts default collection + expense amount fields into `custom_fields` if none exist yet |
| `frontend/src/App.mobile.test.js` | Modify | Update/add tests for dynamic field loading in MobileSubmitForm |

---

## Task 1: Seed Default Fields in Database

Default collection and expense amount fields need to exist in `custom_fields` so the mobile form works on first load without the admin having to add them manually.

**Files:**
- Modify: `backend/config/database.js`

- [ ] **Step 1: Read the current database init to find where to add seeding**

Open `backend/config/database.js`. Look for the `db.serialize` block that runs `CREATE TABLE IF NOT EXISTS`. The seed logic goes right after all tables are created.

- [ ] **Step 2: Add the seed function after table creation**

In `backend/config/database.js`, after the last `CREATE TABLE IF NOT EXISTS` statement (before the closing of `db.serialize`), add:

```javascript
// Seed default custom fields if none exist yet
db.get(`SELECT COUNT(*) as count FROM custom_fields WHERE table_name = 'collections'`, (err, row) => {
  if (err || (row && row.count > 0)) return;

  const defaultCollectionFields = [
    ['general_tithes_offering', 'General Tithes & Offering', 0],
    ['bank_interest', 'Bank Interest', 1],
    ['sisterhood_san_juan', 'Sisterhood (San Juan)', 2],
    ['sisterhood_labuin', 'Sisterhood (Labuin)', 3],
    ['brotherhood', 'Brotherhood', 4],
    ['youth', 'Youth', 5],
    ['couples', 'Couples', 6],
    ['sunday_school', 'Sunday School', 7],
    ['special_purpose_pledge', 'Special Purpose / Pledge', 8],
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO custom_fields
      (table_name, field_name, field_label, field_type, is_required, display_order, is_active, created_by)
    VALUES ('collections', ?, ?, 'decimal', 0, ?, 1, 'system')
  `);
  defaultCollectionFields.forEach(([name, label, order]) => stmt.run(name, label, order));
  stmt.finalize();
});

db.get(`SELECT COUNT(*) as count FROM custom_fields WHERE table_name = 'expenses'`, (err, row) => {
  if (err || (row && row.count > 0)) return;

  const defaultExpenseFields = [
    ['pbcm_share_expense', 'PBCM Share', 0],
    ['pastoral_worker_support', 'Pastoral Worker Support', 1],
    ['cap_assistance', 'CAP Assistance', 2],
    ['honorarium', 'Honorarium', 3],
    ['conference_seminar', 'Conference / Seminar', 4],
    ['fellowship_events', 'Fellowship Events', 5],
    ['anniversary_christmas', 'Anniversary / Christmas', 6],
    ['supplies', 'Supplies', 7],
    ['utilities', 'Utilities', 8],
    ['vehicle_maintenance', 'Vehicle Maintenance', 9],
    ['lto_registration', 'LTO Registration', 10],
    ['transportation_gas', 'Transportation / Gas', 11],
    ['building_maintenance', 'Building Maintenance', 12],
    ['abccop_national', 'ABCCOP National', 13],
    ['cbcc_share', 'CBCC Share', 14],
    ['kabalikat_share', 'Kabalikat Share', 15],
    ['abccop_community', 'ABCCOP Community', 16],
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO custom_fields
      (table_name, field_name, field_label, field_type, is_required, display_order, is_active, created_by)
    VALUES ('expenses', ?, ?, 'decimal', 0, ?, 1, 'system')
  `);
  defaultExpenseFields.forEach(([name, label, order]) => stmt.run(name, label, order));
  stmt.finalize();
});
```

- [ ] **Step 3: Restart the backend and verify fields are seeded**

```bash
cd backend && npm run dev
```

Then in a separate terminal:
```bash
curl -s http://localhost:3001/api/health
```

Check the SQLite DB to confirm rows exist (or use the CustomFieldsManager UI after logging in).

- [ ] **Step 4: Commit**

```bash
git add backend/config/database.js
git commit -m "feat: seed default collection and expense fields into custom_fields on first run"
```

---

## Task 2: Remove Google Forms Nav Page

**Files:**
- Modify: `frontend/src/components/Dashboard.js`

- [ ] **Step 1: Delete the `GoogleFormsManager` component definition**

In `Dashboard.js`, remove lines 53–143 (the entire `const GoogleFormsManager = () => { ... };` block). Do not remove any imports that are used elsewhere.

- [ ] **Step 2: Remove `showGoogleForms` state and related logic**

In `Dashboard.js`:

Remove this line (~line 153):
```javascript
const [showGoogleForms, setShowGoogleForms] = useState(false);
```

In `clearSubViews()`, remove:
```javascript
setShowGoogleForms(false);
```

Update `isSubView` (remove `showGoogleForms ||`):
```javascript
const isSubView = showRecordsManager || showUserManagement || showCustomFieldsExample;
```

In `getPageTitle()`, remove:
```javascript
if (showGoogleForms) return "Google Forms";
```

- [ ] **Step 3: Remove the Google Forms nav item**

In the `navSections` array (Management section), remove:
```javascript
{ id: "forms", label: "Google Forms", icon: Link2, onClick: () => { clearSubViews(); setShowGoogleForms(true); setSidebarOpen(false); }, active: showGoogleForms },
```

- [ ] **Step 4: Remove the render block**

Remove:
```jsx
{showGoogleForms && (
  <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
    <GoogleFormsManager />
  </div>
)}
```

- [ ] **Step 5: Remove unused imports**

Check the top of `Dashboard.js` for any imports that are now unused after removing `GoogleFormsManager`. The `Link2` icon from lucide-react was used for the Google Forms nav item — remove it from the import if it's not used elsewhere. `Copy` and `ExternalLink` icons were used only inside `GoogleFormsManager` — remove them too.

Search: `grep -n "Link2\|Copy\|ExternalLink" frontend/src/components/Dashboard.js`

Remove any that are only referenced in the now-deleted code.

- [ ] **Step 6: Verify the app still compiles and the sidebar no longer shows Google Forms**

```bash
cd frontend && npm start
```

Log in and confirm "Google Forms" is gone from the Management section in the sidebar.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Dashboard.js
git commit -m "feat: remove Google Forms nav page (replaced by /mobile)"
```

---

## Task 3: Make MobileSubmitForm Fields Dynamic

Replace the hardcoded field constants in `MobileSubmitForm.js` with a dynamic fetch from the custom fields API.

**Files:**
- Modify: `frontend/src/components/mobile/MobileSubmitForm.js`

- [ ] **Step 1: Remove hardcoded constants and add `useEffect` for field loading**

Replace the top of `MobileSubmitForm.js` (everything from line 4 to line 59 — the constants block) with:

```javascript
import React, { useState, useMemo, useEffect } from 'react';
import apiService from '../../utils/api';
```

Then inside the `MobileSubmitForm` component, add state for dynamic fields and loading:

```javascript
const [collectionFields, setCollectionFields] = useState([]);
const [expenseFields, setExpenseFields] = useState([]);
const [fieldsLoading, setFieldsLoading] = useState(true);
```

And a `useEffect` to load them on mount:

```javascript
useEffect(() => {
  const loadFields = async () => {
    try {
      const [colFields, expFields] = await Promise.all([
        apiService.getCustomFields('collections'),
        apiService.getCustomFields('expenses'),
      ]);
      setCollectionFields(colFields.filter(f => f.field_type === 'decimal'));
      setExpenseFields(expFields.filter(f => f.field_type === 'decimal'));
    } catch (err) {
      console.error('Failed to load custom fields', err);
    } finally {
      setFieldsLoading(false);
    }
  };
  loadFields();
}, []);
```

- [ ] **Step 2: Update `INITIAL_COLLECTION` and `INITIAL_EXPENSE` to be derived dynamically**

Remove the static `INITIAL_COLLECTION` and `INITIAL_EXPENSE` objects and the `COLLECTION_AMOUNT_FIELDS` / `EXPENSE_AMOUNT_FIELDS` / `COLLECTION_AMOUNT_LABELS` / `EXPENSE_AMOUNT_LABELS` constants entirely.

Build initial form state from the loaded fields. Update `handleTypeToggle` and the `type` state initialization to reset form dynamically:

```javascript
const buildInitialForm = (fields, isCollection) => {
  const base = isCollection
    ? { date: '', particular: '', control_number: '', payment_method: 'Cash' }
    : { date: '', particular: '', category: '', cheque_number: '', forms_number: '' };
  fields.forEach(f => { base[f.field_name] = ''; });
  return base;
};
```

Replace:
```javascript
const [form, setForm] = useState(INITIAL_COLLECTION);
```
With:
```javascript
const [form, setForm] = useState({ date: '', particular: '', control_number: '', payment_method: 'Cash' });
```

And update the effect that resets form when fields load:
```javascript
useEffect(() => {
  if (!fieldsLoading) {
    setForm(buildInitialForm(isCollection ? collectionFields : expenseFields, isCollection));
  }
}, [fieldsLoading]); // eslint-disable-line react-hooks/exhaustive-deps
```

Update `handleTypeToggle`:
```javascript
const handleTypeToggle = (t) => {
  setType(t);
  setForm(buildInitialForm(t === 'collection' ? collectionFields : expenseFields, t === 'collection'));
  setConflict(null);
  setError(null);
  setQueued(false);
};
```

- [ ] **Step 3: Update the `total` calculation**

Replace:
```javascript
const total = useMemo(() => {
  const fields = type === 'collection' ? COLLECTION_AMOUNT_FIELDS : EXPENSE_AMOUNT_FIELDS;
  return fields.reduce((sum, f) => sum + (parseFloat(form[f]) || 0), 0);
}, [form, type]);
```
With:
```javascript
const total = useMemo(() => {
  const fields = isCollection ? collectionFields : expenseFields;
  return fields.reduce((sum, f) => sum + (parseFloat(form[f.field_name]) || 0), 0);
}, [form, isCollection, collectionFields, expenseFields]);
```

Note: `isCollection` is defined later in the component as `const isCollection = type === 'collection';` — move this line above the `total` useMemo.

- [ ] **Step 4: Update the Financial Breakdown render**

Replace the breakdown section JSX:

```jsx
<CardSection label={isCollection ? 'Financial Breakdown' : 'Expense Breakdown'}>
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
    {(isCollection ? COLLECTION_AMOUNT_FIELDS : EXPENSE_AMOUNT_FIELDS).map(field => {
      const labels = isCollection ? COLLECTION_AMOUNT_LABELS : EXPENSE_AMOUNT_LABELS;
      return (
        <Field key={field} label={labels[field]}>
          <input
            className="mobile-input mono"
            name={field}
            type="number"
            min="0"
            step="0.01"
            value={form[field]}
            onChange={handleChange}
            placeholder="0.00"
          />
        </Field>
      );
    })}
  </div>
</CardSection>
```

With:

```jsx
<CardSection label={isCollection ? 'Financial Breakdown' : 'Expense Breakdown'}>
  {fieldsLoading ? (
    <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
      Loading fields…
    </div>
  ) : (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {(isCollection ? collectionFields : expenseFields).map(field => (
        <Field key={field.field_name} label={field.field_label}>
          <input
            className="mobile-input mono"
            name={field.field_name}
            type="number"
            min="0"
            step="0.01"
            value={form[field.field_name] ?? ''}
            onChange={handleChange}
            placeholder="0.00"
          />
        </Field>
      ))}
    </div>
  )}
</CardSection>
```

- [ ] **Step 5: Remove the now-unused `EXPENSE_CATEGORIES` constant**

The `EXPENSE_CATEGORIES` constant at lines 36–40 is still used in the category dropdown — keep it. Only remove the 4 label/field constants.

Actually verify: `grep -n "EXPENSE_CATEGORIES\|COLLECTION_AMOUNT\|EXPENSE_AMOUNT" frontend/src/components/mobile/MobileSubmitForm.js`

After edits there should be zero references to `COLLECTION_AMOUNT_LABELS`, `COLLECTION_AMOUNT_FIELDS`, `EXPENSE_AMOUNT_LABELS`, `EXPENSE_AMOUNT_FIELDS`.

- [ ] **Step 6: Verify the mobile form loads and shows dynamic fields**

```bash
cd frontend && npm start
```

Open `http://localhost:3000/mobile`, log in, and confirm:
- Both Collection and Expense tabs show the same fields as before (seeded from Task 1)
- Switching tabs resets the form correctly
- Total calculation updates as you type amounts

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/mobile/MobileSubmitForm.js
git commit -m "feat: make mobile form fields dynamic from custom_fields API"
```

---

## Task 4: Wire Custom Fields Manager to Mobile Fields (Admin UI)

The existing `CustomFieldsManager` modal in Dashboard is already wired to the `custom_fields` table. Verify it works for managing mobile form fields and update the nav label to clarify this.

**Files:**
- Modify: `frontend/src/components/Dashboard.js`

- [ ] **Step 1: Update the "Custom Fields" nav item label and make it a sub-view (not a modal)**

Currently `CustomFieldsManager` renders as a floating modal (`showCustomFieldsManager`). For consistency with the other management pages, convert it to an inline sub-view like `showRecordsManager`.

In `Dashboard.js`:

Add state:
```javascript
const [showCustomFields, setShowCustomFields] = useState(false);
const [customFieldsTable, setCustomFieldsTable] = useState('collections');
```

In `clearSubViews()`, add:
```javascript
setShowCustomFields(false);
```

In `isSubView`, add `showCustomFields ||`:
```javascript
const isSubView = showRecordsManager || showUserManagement || showCustomFieldsExample || showCustomFields;
```

In `getPageTitle()`, add:
```javascript
if (showCustomFields) return "Mobile Form Fields";
```

Update the nav item:
```javascript
{ id: "fields", label: "Mobile Form Fields", icon: Settings, onClick: () => { clearSubViews(); setShowCustomFields(true); setSidebarOpen(false); }, active: showCustomFields },
```

Add the inline render block alongside the other sub-views:
```jsx
{showCustomFields && (
  <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto w-full">
    <div className="mb-4 flex gap-2">
      {['collections', 'expenses'].map(t => (
        <button
          key={t}
          onClick={() => setCustomFieldsTable(t)}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            customFieldsTable === t
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {t === 'collections' ? 'Collection Fields' : 'Expense Fields'}
        </button>
      ))}
    </div>
    <CustomFieldsManager tableName={customFieldsTable} onClose={() => setShowCustomFields(false)} />
  </div>
)}
```

Remove the old modal render block at the bottom of the component:
```jsx
{showCustomFieldsManager && (
  <CustomFieldsManager tableName={customFieldsTableName} onClose={() => setShowCustomFieldsManager(false)} />
)}
```

And remove the now-unused `showCustomFieldsManager` and `customFieldsTableName` states.

- [ ] **Step 2: Verify in the browser**

Log in as admin. In the sidebar under Management, click "Mobile Form Fields". Confirm:
- A tab toggle shows "Collection Fields" and "Expense Fields"
- Switching tabs shows the right fields
- You can add a new field, then reload `/mobile` — the new field should appear in the mobile form's breakdown section

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Dashboard.js
git commit -m "feat: convert Custom Fields to inline sub-view renamed Mobile Form Fields"
```

---

## Task 5: Test and Final Verification

- [ ] **Step 1: Run frontend tests**

```bash
cd frontend && npm test -- --watchAll=false
```

Expected: all existing tests pass. If `App.mobile.test.js` tests reference the hardcoded constants that no longer exist, update them to mock `apiService.getCustomFields` instead:

```javascript
// In App.mobile.test.js — mock the API
jest.mock('../../utils/api', () => ({
  default: {
    getCustomFields: jest.fn().mockResolvedValue([
      { field_name: 'general_tithes_offering', field_label: 'General Tithes & Offering', field_type: 'decimal' },
    ]),
    submitForMobile: jest.fn(),
  },
}));
```

- [ ] **Step 2: Run backend tests**

```bash
cd backend && npm test
```

- [ ] **Step 3: End-to-end smoke test**

1. Start backend: `cd backend && npm run dev`
2. Start frontend: `cd frontend && npm start`
3. Open `http://localhost:3000` — verify no "Google Forms" item in sidebar
4. Open `http://localhost:3000/mobile` — log in, verify dynamic fields load
5. Log in as admin at `/` → Management → "Mobile Form Fields" → add a new decimal field called `test_field` with label "Test Field" for collections
6. Reload `/mobile` — verify "Test Field" now appears in the Collection breakdown
7. Delete the test field via the admin panel

- [ ] **Step 4: Commit any test fixes**

```bash
git add frontend/src/ backend/
git commit -m "test: update mobile form tests for dynamic field loading"
```
