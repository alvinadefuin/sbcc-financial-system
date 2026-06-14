# Desktop Edit/Delete Only + Auto-Calculated Total Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict the desktop Financial Records view to edit and delete only (remove Add), and replace the total amount input field with a live-updating read-only bold summary row at the bottom of the edit form.

**Architecture:** All changes are in a single file — `frontend/src/components/FinancialRecordsManager.js`. The `handleAddRecord` function and its "Add" button are deleted. The add branch in `handleSubmit` is stripped. The `total_amount` input is removed from the form grid and replaced with a `col-span-full` styled summary row that reads from `formData.total_amount`, which is already kept current by the existing `useEffect`/`calculateTotal` machinery — no logic changes needed there.

**Tech Stack:** React, Tailwind CSS, @testing-library/react, Jest

---

### Task 1: Write failing tests

**Files:**
- Create: `frontend/src/components/FinancialRecordsManager.test.js`

- [ ] **Step 1: Create the test file**

```js
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import FinancialRecordsManager from './FinancialRecordsManager';

jest.mock('../utils/api', () => ({
  default: {
    getCollections: jest.fn().mockResolvedValue([
      {
        id: 1,
        date: '2026-06-01',
        particular: 'Test Collection',
        control_number: 'C2026-001',
        total_amount: 5000,
        general_tithes_offering: 3000,
        bank_interest: 500,
        sisterhood_san_juan: 0,
        sisterhood_labuin: 0,
        brotherhood: 0,
        youth: 0,
        couples: 0,
        sunday_school: 0,
        special_purpose_pledge: 1500,
        custom_fields: {}
      }
    ]),
    getExpenses: jest.fn().mockResolvedValue([]),
    getCustomFields: jest.fn().mockResolvedValue([]),
    updateCollection: jest.fn().mockResolvedValue({}),
  }
}));

describe('FinancialRecordsManager — desktop restrictions', () => {
  test('does not render an Add Collection button', async () => {
    render(<FinancialRecordsManager />);
    await waitFor(() => screen.getByText('Test Collection'));
    expect(screen.queryByText(/add collection/i)).not.toBeInTheDocument();
  });

  test('does not render an Add Expense button', async () => {
    render(<FinancialRecordsManager />);
    await waitFor(() => screen.getByText('Test Collection'));
    expect(screen.queryByText(/add expense/i)).not.toBeInTheDocument();
  });

  test('edit modal shows no total amount input', async () => {
    render(<FinancialRecordsManager />);
    await waitFor(() => screen.getByText('Test Collection'));
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.queryByPlaceholderText('30,188.00')).not.toBeInTheDocument();
  });

  test('edit modal shows a read-only Total Amount summary row', async () => {
    render(<FinancialRecordsManager />);
    await waitFor(() => screen.getByText('Test Collection'));
    fireEvent.click(screen.getByTitle('Edit'));
    // Label exists
    expect(screen.getByTestId('total-amount-summary-label')).toHaveTextContent('Total Amount');
    // Value reflects calculated total (3000 + 500 + 1500 = 5000)
    expect(screen.getByTestId('total-amount-summary-value')).toHaveTextContent('₱5,000.00');
  });
});
```

- [ ] **Step 2: Run tests to confirm they all fail**

```bash
cd frontend && npx react-scripts test --watchAll=false --testPathPattern=FinancialRecordsManager.test.js
```

Expected: 4 tests fail (component still renders the Add button; edit modal still shows the total input; summary row doesn't exist yet).

---

### Task 2: Remove Add capability from desktop

**Files:**
- Modify: `frontend/src/components/FinancialRecordsManager.js`

- [ ] **Step 3: Delete the `handleAddRecord` function (lines 363–366)**

Remove this block entirely:

```js
  const handleAddRecord = () => {
    resetForm();
    setShowAddForm(true);
  };
```

- [ ] **Step 4: Remove the Add button from the tab bar (lines 632–638)**

Remove this button element entirely from the tab bar `div`:

```jsx
          <button
            onClick={handleAddRecord}
            className="flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-lg transition mb-1" style={{ background: 'linear-gradient(135deg, #d4a843, #c49030)' }}
          >
            <Plus className="w-4 h-4" />
            Add {activeTab === "collections" ? "Collection" : "Expense"}
          </button>
```

After this removal, the tab bar `<div className="flex items-center justify-between mb-0">` will only contain the tabs `<div className="flex">`. You may simplify that outer div's className to remove `justify-between` since there's no longer a second element:

```jsx
          <div className="flex">
```

- [ ] **Step 5: Remove the add branch from `handleSubmit` (lines 531–539)**

In `handleSubmit`, the block currently reads:

```js
      if (editingRecord) {
        // Update existing record
        if (activeTab === "collections") {
          await apiService.updateCollection(editingRecord.id, submitData);
        } else {
          await apiService.updateExpense(editingRecord.id, submitData);
        }
        showNotification(`${activeTab.slice(0, -1)} updated successfully`);
      } else {
        // Add new record
        if (activeTab === "collections") {
          await apiService.addCollection(submitData);
        } else {
          await apiService.addExpense(submitData);
        }
        showNotification(`${activeTab.slice(0, -1)} added successfully`);
      }
```

Replace it with (drop the outer `if/else`, keep only the update path):

```js
      if (activeTab === "collections") {
        await apiService.updateCollection(editingRecord.id, submitData);
      } else {
        await apiService.updateExpense(editingRecord.id, submitData);
      }
      showNotification(`${activeTab.slice(0, -1)} updated successfully`);
```

- [ ] **Step 6: Simplify the form modal title**

Find (line 671):
```jsx
                {editingRecord ? "Edit Record" : `Add ${activeTab === "collections" ? "Collection" : "Expense"}`}
```

Replace with:
```jsx
                Edit Record
```

- [ ] **Step 7: Simplify the save button label**

Find (line 996):
```jsx
                {loading ? "Saving..." : editingRecord ? "Save Changes" : "Add Record"}
```

Replace with:
```jsx
                {loading ? "Saving..." : "Save Changes"}
```

- [ ] **Step 8: Update the empty-state table message**

Find (line 1058):
```jsx
                        {searchTerm ? "No records match your filters." : "No records yet. Add your first entry."}
```

Replace with:
```jsx
                        {searchTerm ? "No records match your filters." : "No records found."}
```

- [ ] **Step 9: Run the first two tests to confirm they now pass**

```bash
cd frontend && npx react-scripts test --watchAll=false --testPathPattern=FinancialRecordsManager.test.js
```

Expected: "does not render an Add Collection button" and "does not render an Add Expense button" pass. The other two still fail (summary row not yet added).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/FinancialRecordsManager.js frontend/src/components/FinancialRecordsManager.test.js
git commit -m "feat: remove Add capability from desktop Financial Records view"
```

---

### Task 3: Replace total amount input with read-only summary row

**Files:**
- Modify: `frontend/src/components/FinancialRecordsManager.js`

- [ ] **Step 11: Remove the total_amount input block from the form grid**

Find and delete this entire `<div>` block (lines 714–729):

```jsx
            <div>
              <label className="block text-xs font-medium text-[#b89048] mb-1">
                Total Amount
              </label>
              <input
                type="text"
                value={formData.total_amount}
                onChange={(e) => handleCurrencyInput('total_amount', e.target.value)}
                onBlur={(e) => handleCurrencyBlur('total_amount', e.target.value)}
                className={`w-full px-3 py-2 text-sm border rounded-lg text-[#3d2a08] placeholder-[#b89048] focus:outline-none focus:ring-2 focus:ring-[#c49030] focus:border-[#c49030] transition ${
                  errors.total_amount ? "border-rose-400" : "border-[#e8d090]"
                }`}
                placeholder="30,188.00"
              />
              {errors.total_amount && <p className="mt-1 text-xs text-rose-600">{errors.total_amount}</p>}
            </div>
```

- [ ] **Step 12: Add the summary row at the bottom of the form grid**

Just before the closing `</div>` of the form grid (the one immediately before `</div>` closing the `p-6` wrapper — currently around line 978 after the custom fields section), add:

```jsx
            {/* Total Amount Summary */}
            <div className="col-span-full border-t border-[#e8d090] pt-4 mt-2">
              <div className="flex items-center justify-between">
                <span
                  data-testid="total-amount-summary-label"
                  className="text-sm font-bold text-[#3d2a08]"
                >
                  Total Amount
                </span>
                <span
                  data-testid="total-amount-summary-value"
                  className="text-lg font-bold text-[#c49030]"
                >
                  ₱{formData.total_amount || '0.00'}
                </span>
              </div>
              {errors.total_amount && (
                <p className="mt-1 text-xs text-rose-600 text-right">{errors.total_amount}</p>
              )}
            </div>
```

- [ ] **Step 13: Update the validation error message for total_amount**

In `validateForm` (around line 458–461), find:

```js
    if (finalTotal <= 0) {
      newErrors.total_amount = activeTab === "collections"
        ? "Either total amount or individual collection amounts must be provided"
        : "Either total amount or individual expense amounts must be provided";
    }
```

Replace with:

```js
    if (finalTotal <= 0) {
      newErrors.total_amount = activeTab === "collections"
        ? "At least one collection amount must be provided"
        : "At least one expense amount must be provided";
    }
```

- [ ] **Step 14: Run all four tests to confirm they all pass**

```bash
cd frontend && npx react-scripts test --watchAll=false --testPathPattern=FinancialRecordsManager.test.js
```

Expected: all 4 tests pass.

- [ ] **Step 15: Commit**

```bash
git add frontend/src/components/FinancialRecordsManager.js
git commit -m "feat: replace total amount input with read-only summary row in edit form"
```

---

### Task 4: Manual verification

- [ ] **Step 16: Start the frontend dev server**

```bash
cd frontend && npm start
```

- [ ] **Step 17: Verify in browser**

1. Open `http://localhost:3000`, log in as `admin@sbcc.church` / `admin123`.
2. Navigate to the Financial Records view.
3. Confirm: no "Add Collection" or "Add Expense" button is visible.
4. Click the Edit icon on any record.
5. Confirm: the modal title says "Edit Record".
6. Confirm: no editable "Total Amount" input field is present.
7. Confirm: a bold "Total Amount" summary row appears at the bottom of the form with the correct calculated value.
8. Change one of the individual amount fields (e.g. General Tithes & Offering) and confirm the summary row value updates live.
9. Clear all individual fields and confirm the summary shows `₱0.00` and the form blocks submit with a validation error.
10. Save a valid edit and confirm the record updates correctly.
