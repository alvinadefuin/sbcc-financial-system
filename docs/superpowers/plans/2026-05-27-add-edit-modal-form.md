# Add/Edit Field — Modal Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the inline add/edit form in `CustomFieldsManager.js` from an expanding card into a centered modal overlay, without touching form logic or the field list.

**Architecture:** Replace the `{formOpen && <div className="mx-6 ...">}` block with a `fixed inset-0 z-50` backdrop + centered `role="dialog"` card. Add an Escape key listener via `useEffect`. The `+ Add Field` button loses its `{!formOpen && ...}` guard since the modal doesn't displace page content.

**Tech Stack:** React (hooks), Tailwind CSS, React Testing Library (existing tests)

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/components/CustomFieldsManager.js` | Replace inline form with modal overlay; remove `formOpen` guard on Add button; add Escape `useEffect` |
| `frontend/src/components/CustomFieldsManager.test.js` | Update 3 tests whose assertions describe inline (non-modal) behaviour |

---

### Task 1: Update three tests to describe modal behaviour

**Files:**
- Modify: `frontend/src/components/CustomFieldsManager.test.js`

These three tests currently assert inline/non-modal behaviour. Updating them first gives a red baseline before we touch the component.

- [ ] **Step 1: Update "renders as an inline element" → rename only**

The test on line 27 checks `.fixed`/`.inset-0`/`.z-50` are absent when the form is *closed*. That stays true after the change (the modal only mounts when `formOpen` is true), but the name is misleading. Rename it.

Replace:
```js
test('renders as an inline element, not a modal overlay', async () => {
  const { container } = render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());
  expect(container.querySelector('.fixed')).toBeNull();
  expect(container.querySelector('.inset-0')).toBeNull();
  expect(container.querySelector('.z-50')).toBeNull();
});
```
With:
```js
test('does not render a modal overlay when the form is closed', async () => {
  const { container } = render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());
  expect(container.querySelector('.fixed')).toBeNull();
  expect(container.querySelector('.inset-0')).toBeNull();
  expect(container.querySelector('.z-50')).toBeNull();
});
```

- [ ] **Step 2: Update "does not accept an onClose prop" → verify × button exists when form is open**

The test on line 35 only checked there's no close button on initial load (form closed). With the modal, there IS a `aria-label="Close"` × button — but only when the form is open. Replace the test so it *opens* the form and asserts the button is there.

Replace:
```js
test('does not accept an onClose prop (component has no close button)', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
});
```
With:
```js
test('modal has a × close button that dismisses the form', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  // No close button before form opens
  expect(screen.queryByRole('button', { name: /close/i })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Field/i }));

  // × button appears inside the modal
  const closeBtn = screen.getByRole('button', { name: /close/i });
  expect(closeBtn).toBeInTheDocument();

  // Clicking it dismisses the form
  fireEvent.click(closeBtn);
  expect(screen.queryByRole('heading', { name: /Add Field/i })).toBeNull();
});
```

- [ ] **Step 3: Update "+ Add Field opens inline form" → assert modal dialog**

The test on line 134 ends with `expect(form.closest('.fixed')).toBeNull()`. After the change the form IS inside `.fixed`, so this assertion must flip to confirm modal containment.

Replace:
```js
test('+ Add Field button opens the inline form (not a modal)', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Field/i }));

  expect(screen.getByRole('heading', { name: /Add Field/i })).toBeInTheDocument();
  // Form is NOT inside a fixed/overlay element
  const form = screen.getByRole('button', { name: /^Add Field$/i }).closest('form');
  expect(form).not.toBeNull();
  const formWrapper = form.closest('.fixed');
  expect(formWrapper).toBeNull();
});
```
With:
```js
test('+ Add Field button opens a modal dialog', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Field/i }));

  expect(screen.getByRole('heading', { name: /Add Field/i })).toBeInTheDocument();
  // Form IS inside a dialog element
  const form = screen.getByRole('button', { name: /^Add Field$/i }).closest('form');
  expect(form).not.toBeNull();
  expect(form.closest('[role="dialog"]')).not.toBeNull();
});
```

- [ ] **Step 4: Run the tests to confirm two failures**

```bash
cd frontend && npx react-scripts test --watchAll=false --testPathPattern=CustomFieldsManager 2>&1
```

Expected: **2 FAIL** — "modal has a × close button…" and "+ Add Field button opens a modal dialog". The renamed "does not render a modal overlay when form is closed" test still passes (modal not mounted when form closed). All other 20 tests still pass.

---

### Task 2: Implement the modal in `CustomFieldsManager.js`

**Files:**
- Modify: `frontend/src/components/CustomFieldsManager.js:38-469`

- [ ] **Step 1: Add Escape key `useEffect`**

Insert after the existing `useEffect` at line 49 (the `tableName` effect):

```js
useEffect(() => {
  if (!formOpen) return;
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') closeForm();
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [formOpen]);
```

- [ ] **Step 2: Remove `{!formOpen && ...}` guard from the `+ Add Field` button**

The button is in the header at lines 228–235. Remove the conditional wrapper so it is always rendered.

Replace:
```jsx
        {!formOpen && (
          <button
            onClick={openAddForm}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
          >
            + Add Field
          </button>
        )}
```
With:
```jsx
        <button
          onClick={openAddForm}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
        >
          + Add Field
        </button>
```

- [ ] **Step 3: Gate the outer error banner so it hides when the modal is open**

The error inside the modal (Step 4) will handle form-submit errors. The outer banner stays for toggle/delete/reorder errors. Add `!formOpen` guard:

Replace:
```jsx
      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
          {error}
        </div>
      )}
```
With:
```jsx
      {/* Error banner — shown outside modal for toggle/delete/reorder errors */}
      {error && !formOpen && (
        <div className="mx-6 mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
          {error}
        </div>
      )}
```

- [ ] **Step 4: Replace the inline form block with the modal overlay**

Remove the entire inline block (lines 245–380):
```jsx
      {/* Inline add/edit form */}
      {formOpen && (
        <div className="mx-6 mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
          ...
        </div>
      )}
```

Replace with the modal overlay below. The form fields are identical to the inline version — only the wrapper changes:

```jsx
      {/* Modal add/edit form */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={closeForm}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-4">
              <h3 id="modal-title" className="text-lg font-semibold text-slate-800">
                {editingField ? 'Edit Field' : 'Add Field'}
              </h3>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Close"
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Error inside modal */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Display Label *
                  </label>
                  <input
                    type="text"
                    value={formData.field_label}
                    onChange={(e) => handleLabelChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="e.g., GCash Amount"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Field Name *
                  </label>
                  <input
                    type="text"
                    value={formData.field_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, field_name: slugify(e.target.value) }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                    placeholder="e.g., gcash_amount"
                    required
                    disabled={!!editingField}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Field Type *
                  </label>
                  <select
                    value={formData.field_type}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, field_type: e.target.value }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                    disabled={!!editingField}
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <input
                    id="is_required"
                    type="checkbox"
                    checked={formData.is_required}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, is_required: e.target.checked }))
                    }
                    className="h-4 w-4 text-indigo-600 rounded"
                  />
                  <label htmlFor="is_required" className="text-sm text-slate-600">
                    Required
                  </label>
                </div>
              </div>

              {/* Advanced section */}
              <button
                type="button"
                onClick={() => setAdvancedOpen((v) => !v)}
                className="mt-3 text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                Advanced {advancedOpen ? '▴' : '▾'}
              </button>
              {advancedOpen && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Category
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, category: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none"
                    >
                      <option value="">None</option>
                      {CATEGORIES[tableName]?.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, description: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none"
                      rows="2"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 mt-4">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                >
                  {editingField ? 'Update Field' : 'Add Field'}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Run tests — all 22 should pass**

```bash
cd frontend && npx react-scripts test --watchAll=false --testPathPattern=CustomFieldsManager 2>&1
```

Expected output:
```
PASS src/components/CustomFieldsManager.test.js
  ✓ does not render a modal overlay when the form is closed
  ✓ modal has a × close button that dismisses the form
  ...
  Test Suites: 1 passed, 1 total
  Tests:       22 passed, 22 total
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/CustomFieldsManager.js frontend/src/components/CustomFieldsManager.test.js
git commit -m "$(cat <<'EOF'
feat: convert add/edit field form to centered modal overlay

Replaces the inline expanding card with a fixed-position modal (backdrop
+ dialog card). Adds Escape key dismissal. + Add Field button is now
always visible since the modal doesn't displace page content.
EOF
)"
```
