# Mobile Form Fields Manager — Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `CustomFieldsManager.js` from a full-screen modal overlay into an inline admin page with drag-to-reorder, active/inactive toggle, and a collapsible inline add/edit form.

**Architecture:** Full component rewrite that removes the `fixed inset-0` modal wrapper and renders as a white card flowing inside the existing Dashboard sub-view slot. Active toggle and drag-to-reorder both use the existing `PUT /api/custom-fields/:id` endpoint (which accepts partial updates via `COALESCE`) — no backend changes needed. Dashboard.js gets a one-line cleanup to remove the now-dead `onClose` prop.

**Tech Stack:** React 18, Tailwind CSS, `@testing-library/react`, HTML5 Drag-and-Drop API, `apiService.updateCustomField` (existing)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Rewrite | `frontend/src/components/CustomFieldsManager.js` | Entire component — inline card, field rows, active toggle, inline form, drag-to-reorder |
| Create | `frontend/src/components/CustomFieldsManager.test.js` | All tests for the new component |
| Modify | `frontend/src/components/Dashboard.js:517` | Remove `onClose` prop from `<CustomFieldsManager>` |

> **Backend note:** The spec calls for `PATCH /api/custom-fields/:id`. The backend only has `PUT /api/custom-fields/:id`, but it uses `COALESCE` for every column, so sending `{ is_active: 0 }` only updates that column. Use `apiService.updateCustomField(id, payload)` throughout — no new API method needed.

---

## Task 1: Component Shell, Field List, and Active Toggle

**Files:**
- Create: `frontend/src/components/CustomFieldsManager.test.js`
- Rewrite: `frontend/src/components/CustomFieldsManager.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/components/CustomFieldsManager.test.js`:

```jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CustomFieldsManager from './CustomFieldsManager';
import apiService from '../utils/api';

jest.mock('../utils/api', () => ({
  getCustomFields: jest.fn(),
  createCustomField: jest.fn(),
  updateCustomField: jest.fn(),
  deleteCustomField: jest.fn(),
}));

const FIELDS = [
  { id: 1, field_name: 'general_tithes', field_label: 'General Tithes & Offering', field_type: 'decimal', is_active: 1, is_required: 0, display_order: 0, category: '', description: '' },
  { id: 2, field_name: 'bank_interest', field_label: 'Bank Interest', field_type: 'decimal', is_active: 1, is_required: 0, display_order: 1, category: '', description: '' },
  { id: 3, field_name: 'notes', field_label: 'Notes', field_type: 'text', is_active: 1, is_required: 0, display_order: 2, category: '', description: '' },
  { id: 4, field_name: 'brotherhood', field_label: 'Brotherhood', field_type: 'decimal', is_active: 0, is_required: 0, display_order: 3, category: '', description: '' },
];

beforeEach(() => {
  jest.clearAllMocks();
  apiService.getCustomFields.mockResolvedValue(FIELDS);
});

// ─── Structure ───────────────────────────────────────────────────────────────

test('renders as an inline element, not a modal overlay', async () => {
  const { container } = render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());
  expect(container.querySelector('.fixed')).toBeNull();
  expect(container.querySelector('.inset-0')).toBeNull();
  expect(container.querySelector('.z-50')).toBeNull();
});

test('does not accept an onClose prop (component has no close button)', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
});

// ─── Field list ───────────────────────────────────────────────────────────────

test('shows all fields returned by the API', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => {
    expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument();
    expect(screen.getByText('Bank Interest')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.getByText('Brotherhood')).toBeInTheDocument();
  });
});

test('shows /mobile chip only for decimal fields', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());
  const chips = screen.getAllByText(/\/mobile/);
  // 3 decimal fields (general_tithes, bank_interest, brotherhood) — including inactive
  expect(chips).toHaveLength(3);
  // Notes is text type — no chip
  const noteRow = screen.getByText('Notes').closest('[draggable]');
  expect(noteRow).not.toHaveTextContent('/mobile');
});

test('inactive rows render at reduced opacity', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('Brotherhood')).toBeInTheDocument());
  const brotherhoodRow = screen.getByText('Brotherhood').closest('[draggable]');
  expect(brotherhoodRow.className).toMatch(/opacity/);
});

test('shows empty state when no fields exist', async () => {
  apiService.getCustomFields.mockResolvedValue([]);
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText(/No fields yet/i)).toBeInTheDocument());
});

// ─── Active toggle ────────────────────────────────────────────────────────────

test('active toggle calls updateCustomField with flipped is_active', async () => {
  apiService.updateCustomField.mockResolvedValue({});
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  // field id=1 is active (is_active=1) — click to deactivate
  const toggles = screen.getAllByRole('button', { name: /activate|deactivate/i });
  fireEvent.click(toggles[0]);

  expect(apiService.updateCustomField).toHaveBeenCalledWith(1, { is_active: 0 });
});

test('active toggle reverts on API error', async () => {
  apiService.updateCustomField.mockRejectedValue(new Error('Network error'));
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  const toggles = screen.getAllByRole('button', { name: /activate|deactivate/i });
  fireEvent.click(toggles[0]);

  await waitFor(() => expect(screen.getByText(/Failed to update field/i)).toBeInTheDocument());
});

// ─── Delete ───────────────────────────────────────────────────────────────────

test('delete calls deleteCustomField after confirm', async () => {
  window.confirm = jest.fn().mockReturnValue(true);
  apiService.deleteCustomField.mockResolvedValue({});
  apiService.getCustomFields.mockResolvedValue(FIELDS.filter((f) => f.id !== 1));
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
  fireEvent.click(deleteButtons[0]);

  expect(window.confirm).toHaveBeenCalled();
  await waitFor(() => expect(apiService.deleteCustomField).toHaveBeenCalledWith(1));
});

test('delete does nothing when confirm is cancelled', async () => {
  window.confirm = jest.fn().mockReturnValue(false);
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
  fireEvent.click(deleteButtons[0]);

  expect(apiService.deleteCustomField).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npm test -- --watchAll=false --testPathPattern=CustomFieldsManager --verbose 2>&1 | tail -20
```

Expected: Multiple failures — `CustomFieldsManager` still imports as modal, no `aria-label` on toggle, etc.

- [ ] **Step 3: Rewrite `CustomFieldsManager.js`**

Replace the entire file with:

```jsx
import React, { useState, useEffect } from 'react';
import apiService from '../utils/api';

const FIELD_TYPES = [
  { value: 'decimal', label: 'Decimal (Money)' },
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'integer', label: 'Integer' },
  { value: 'boolean', label: 'Yes/No' },
];

const CATEGORIES = {
  collections: [
    { value: 'main', label: 'Main Collection' },
    { value: 'pass_through', label: 'Pass-Through Account' },
    { value: 'allocation', label: 'Fund Allocation' },
  ],
  expenses: [
    { value: 'main', label: 'Main Expense' },
    { value: 'operational', label: 'Operational Fund' },
    { value: 'pastoral', label: 'Pastoral Team' },
    { value: 'pbcm', label: 'PBCM Share' },
  ],
};

const slugify = (value) =>
  value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

const EMPTY_FORM = {
  field_label: '',
  field_name: '',
  field_type: 'decimal',
  is_required: false,
  category: '',
  description: '',
};

const CustomFieldsManager = ({ tableName }) => {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [preDragFields, setPreDragFields] = useState(null);

  useEffect(() => {
    loadFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName]);

  const loadFields = async () => {
    try {
      setLoading(true);
      const data = await apiService.getCustomFields(tableName);
      setFields(data);
      setError(null);
    } catch (err) {
      setError('Failed to load fields');
    } finally {
      setLoading(false);
    }
  };

  const openAddForm = () => {
    setEditingField(null);
    setFormData(EMPTY_FORM);
    setAdvancedOpen(false);
    setFormOpen(true);
  };

  const openEditForm = (field) => {
    setEditingField(field);
    setFormData({
      field_label: field.field_label,
      field_name: field.field_name,
      field_type: field.field_type,
      is_required: field.is_required === 1,
      category: field.category || '',
      description: field.description || '',
    });
    setAdvancedOpen(false);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingField(null);
    setFormData(EMPTY_FORM);
    setAdvancedOpen(false);
  };

  const handleLabelChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      field_label: value,
      ...(editingField ? {} : { field_name: slugify(value) }),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      if (editingField) {
        await apiService.updateCustomField(editingField.id, {
          field_label: formData.field_label,
          is_required: formData.is_required,
          category: formData.category,
          description: formData.description,
        });
      } else {
        await apiService.createCustomField({
          field_name: formData.field_name,
          field_label: formData.field_label,
          field_type: formData.field_type,
          is_required: formData.is_required,
          category: formData.category,
          description: formData.description,
          table_name: tableName,
        });
      }
      await loadFields();
      closeForm();
    } catch (err) {
      setError(err.message || 'Failed to save field');
    }
  };

  const handleToggleActive = async (field) => {
    const newActive = field.is_active === 1 ? 0 : 1;
    setFields((prev) =>
      prev.map((f) => (f.id === field.id ? { ...f, is_active: newActive } : f))
    );
    try {
      await apiService.updateCustomField(field.id, { is_active: newActive });
    } catch (err) {
      setFields((prev) =>
        prev.map((f) => (f.id === field.id ? { ...f, is_active: field.is_active } : f))
      );
      setError('Failed to update field');
    }
  };

  const handleDelete = async (field) => {
    if (!window.confirm(`Delete "${field.field_label}"?`)) return;
    try {
      await apiService.deleteCustomField(field.id);
      await loadFields();
    } catch (err) {
      setError('Failed to delete field');
    }
  };

  const handleDragStart = (e, index) => {
    setDragIndex(index);
    setPreDragFields([...fields]);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const reordered = [...fields];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(index, 0, moved);
    setDragIndex(index);
    setFields(reordered);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const saved = preDragFields;
    setDragIndex(null);
    setPreDragFields(null);

    const withOrder = fields.map((f, i) => ({ ...f, display_order: i }));
    setFields(withOrder);

    const changed = withOrder.filter((f) => {
      const orig = saved.find((p) => p.id === f.id);
      return orig && orig.display_order !== f.display_order;
    });

    if (changed.length === 0) return;

    try {
      await Promise.all(
        changed.map((f) =>
          apiService.updateCustomField(f.id, { display_order: f.display_order })
        )
      );
    } catch (err) {
      setFields(saved);
      setError('Failed to save new order');
    }
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const title = tableName === 'collections' ? 'Collection Fields' : 'Expense Fields';

  if (loading) {
    return <div className="text-center py-8 text-slate-500">Loading...</div>;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            These fields appear as amount inputs in /mobile
          </p>
        </div>
        {!formOpen && (
          <button
            onClick={openAddForm}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition"
          >
            + Add Field
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* Inline add/edit form */}
      {formOpen && (
        <div className="mx-6 mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">
            {editingField ? 'Edit Field' : 'Add Field'}
          </h3>
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
      )}

      {/* Field list */}
      <div className="px-6 py-4 space-y-2">
        {fields.length === 0 ? (
          <p className="text-center text-slate-400 py-8 text-sm">
            No fields yet. Click "+ Add Field" to create one.
          </p>
        ) : (
          fields.map((field, index) => (
            <div
              key={field.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              className={`flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white transition ${
                field.is_active !== 1 ? 'opacity-45' : ''
              } ${dragIndex === index ? 'ring-2 ring-indigo-400' : ''}`}
            >
              {/* Drag handle */}
              <span
                className="text-slate-300 cursor-grab hover:text-slate-500 select-none"
                aria-hidden="true"
              >
                ⠿
              </span>

              {/* Field info */}
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-slate-800 text-sm">{field.field_label}</span>
                <code className="block text-xs text-slate-400 mt-0.5">{field.field_name}</code>
              </div>

              {/* Type badge */}
              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">
                {field.field_type}
              </span>

              {/* /mobile chip — only for decimal fields */}
              {field.field_type === 'decimal' && (
                <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full font-medium">
                  📱 /mobile
                </span>
              )}

              {/* Active toggle */}
              <button
                onClick={() => handleToggleActive(field)}
                aria-label={field.is_active === 1 ? 'Deactivate field' : 'Activate field'}
                className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${
                  field.is_active === 1 ? 'bg-indigo-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    field.is_active === 1 ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>

              {/* Edit / Delete */}
              <button
                onClick={() => openEditForm(field)}
                className="text-xs px-2 py-1 text-slate-600 hover:text-indigo-600 rounded border border-slate-200 hover:border-indigo-300"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(field)}
                aria-label="Delete field"
                className="text-xs px-2 py-1 text-slate-600 hover:text-red-600 rounded border border-slate-200 hover:border-red-300"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CustomFieldsManager;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npm test -- --watchAll=false --testPathPattern=CustomFieldsManager --verbose 2>&1 | tail -30
```

Expected: All Task 1 tests pass (structure, field list, active toggle, delete).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CustomFieldsManager.js frontend/src/components/CustomFieldsManager.test.js
git commit -m "feat: rewrite CustomFieldsManager as inline page with active toggle"
```

---

## Task 2: Inline Add/Edit Form Tests

**Files:**
- Modify: `frontend/src/components/CustomFieldsManager.test.js` (append tests)
- No implementation changes needed — the form code is already in the Task 1 rewrite

- [ ] **Step 1: Append form tests to `CustomFieldsManager.test.js`**

Add the following tests at the bottom of the file (after the existing delete tests):

```jsx
// ─── Add/Edit form ────────────────────────────────────────────────────────────

test('+ Add Field button opens the inline form (not a modal)', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Field/i }));

  expect(screen.getByText('Add Field')).toBeInTheDocument();
  // Form is NOT inside a fixed/overlay element
  const form = screen.getByRole('button', { name: /Add Field/i }).closest('form');
  expect(form).not.toBeNull();
  const formWrapper = form.closest('.fixed');
  expect(formWrapper).toBeNull();
});

test('typing in Display Label auto-fills Field Name on add', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Field/i }));

  const labelInput = screen.getByPlaceholderText(/GCash Amount/i);
  fireEvent.change(labelInput, { target: { value: 'GCash Amount' } });

  const fieldNameInput = screen.getByPlaceholderText(/gcash_amount/i);
  expect(fieldNameInput.value).toBe('gcash_amount');
});

test('Field Name input is disabled when editing', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[0]);

  const fieldNameInput = screen.getByPlaceholderText(/gcash_amount/i);
  expect(fieldNameInput).toBeDisabled();
});

test('Advanced section is hidden by default and shows on click', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Field/i }));

  expect(screen.queryByText('Category')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: /Advanced/i }));

  expect(screen.getByText('Category')).toBeInTheDocument();
  expect(screen.getByText('Description')).toBeInTheDocument();
});

test('submitting Add form calls createCustomField with correct payload', async () => {
  apiService.createCustomField.mockResolvedValue({ id: 99 });
  apiService.getCustomFields.mockResolvedValue([...FIELDS, { id: 99, field_name: 'gcash_amount', field_label: 'GCash Amount', field_type: 'decimal', is_active: 1, is_required: 0, display_order: 4, category: '', description: '' }]);
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Field/i }));
  fireEvent.change(screen.getByPlaceholderText(/GCash Amount/i), { target: { value: 'GCash Amount' } });
  fireEvent.click(screen.getByRole('button', { name: /^Add Field$/i }));

  await waitFor(() =>
    expect(apiService.createCustomField).toHaveBeenCalledWith(
      expect.objectContaining({
        field_label: 'GCash Amount',
        field_name: 'gcash_amount',
        field_type: 'decimal',
        table_name: 'collections',
      })
    )
  );
});

test('submitting Edit form calls updateCustomField with label and metadata only', async () => {
  apiService.updateCustomField.mockResolvedValue({});
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getAllByRole('button', { name: /edit/i })[0]);
  const labelInput = screen.getByDisplayValue('General Tithes & Offering');
  fireEvent.change(labelInput, { target: { value: 'General Tithes Updated' } });
  fireEvent.click(screen.getByRole('button', { name: /Update Field/i }));

  await waitFor(() =>
    expect(apiService.updateCustomField).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ field_label: 'General Tithes Updated' })
    )
  );
  // field_name must NOT be in the update payload
  const callArg = apiService.updateCustomField.mock.calls[0][1];
  expect(callArg).not.toHaveProperty('field_name');
});

test('Cancel link closes the form without saving', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /\+ Add Field/i }));
  expect(screen.getByText('Add Field')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

  expect(screen.queryByText('Add Field')).toBeNull();
  expect(apiService.createCustomField).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd frontend && npm test -- --watchAll=false --testPathPattern=CustomFieldsManager --verbose 2>&1 | tail -30
```

Expected: All tests pass. The form code was already written in Task 1.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CustomFieldsManager.test.js
git commit -m "test: add inline form tests for CustomFieldsManager"
```

---

## Task 3: Drag-to-Reorder Tests

**Files:**
- Modify: `frontend/src/components/CustomFieldsManager.test.js` (append tests)
- No implementation changes needed — drag code is already in the Task 1 rewrite

- [ ] **Step 1: Append drag-to-reorder tests to `CustomFieldsManager.test.js`**

Add the following tests at the bottom of the file:

```jsx
// ─── Drag-to-reorder ──────────────────────────────────────────────────────────

test('dragging a field over another reorders them optimistically', async () => {
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  const rows = document.querySelectorAll('[draggable]');
  // Drag row 0 (General Tithes) over row 1 (Bank Interest)
  fireEvent.dragStart(rows[0], { dataTransfer: { effectAllowed: '' } });
  fireEvent.dragOver(rows[1], { preventDefault: jest.fn() });

  // After dragOver, Bank Interest should now appear first in the DOM
  const updatedRows = document.querySelectorAll('[draggable]');
  expect(updatedRows[0].textContent).toContain('Bank Interest');
  expect(updatedRows[1].textContent).toContain('General Tithes & Offering');
});

test('drop calls updateCustomField for each field whose display_order changed', async () => {
  apiService.updateCustomField.mockResolvedValue({});
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  const rows = document.querySelectorAll('[draggable]');
  fireEvent.dragStart(rows[0], { dataTransfer: { effectAllowed: '' } });
  fireEvent.dragOver(rows[1], { preventDefault: jest.fn() });
  fireEvent.drop(rows[1], { preventDefault: jest.fn() });

  await waitFor(() => expect(apiService.updateCustomField).toHaveBeenCalled());
  // At least 2 fields changed order — both should be updated
  expect(apiService.updateCustomField.mock.calls.length).toBeGreaterThanOrEqual(2);
  // Each call passes display_order
  apiService.updateCustomField.mock.calls.forEach(([_id, payload]) => {
    expect(payload).toHaveProperty('display_order');
  });
});

test('drop error reverts fields to pre-drag order', async () => {
  apiService.updateCustomField.mockRejectedValue(new Error('Network'));
  render(<CustomFieldsManager tableName="collections" />);
  await waitFor(() => expect(screen.getByText('General Tithes & Offering')).toBeInTheDocument());

  const rows = document.querySelectorAll('[draggable]');
  fireEvent.dragStart(rows[0], { dataTransfer: { effectAllowed: '' } });
  fireEvent.dragOver(rows[1], { preventDefault: jest.fn() });
  fireEvent.drop(rows[1], { preventDefault: jest.fn() });

  await waitFor(() => {
    const revertedRows = document.querySelectorAll('[draggable]');
    // Order should revert — General Tithes first again
    expect(revertedRows[0].textContent).toContain('General Tithes & Offering');
  });
  expect(screen.getByText(/Failed to save new order/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd frontend && npm test -- --watchAll=false --testPathPattern=CustomFieldsManager --verbose 2>&1 | tail -30
```

Expected: All tests pass including the 3 drag tests.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CustomFieldsManager.test.js
git commit -m "test: add drag-to-reorder tests for CustomFieldsManager"
```

---

## Task 4: Dashboard.js Cleanup

**Files:**
- Modify: `frontend/src/components/Dashboard.js:517`

- [ ] **Step 1: Remove `onClose` prop from `<CustomFieldsManager>` in Dashboard.js**

At `frontend/src/components/Dashboard.js:517`, change:

```jsx
<CustomFieldsManager tableName={customFieldsTable} onClose={() => setShowCustomFields(false)} />
```

to:

```jsx
<CustomFieldsManager tableName={customFieldsTable} />
```

- [ ] **Step 2: Run full test suite**

```bash
cd frontend && npm test -- --watchAll=false --verbose 2>&1 | tail -30
```

Expected: All tests pass. No regressions in mobile form tests.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Dashboard.js
git commit -m "fix: remove dead onClose prop from CustomFieldsManager in Dashboard"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered by task |
|---|---|
| Remove `fixed inset-0` modal wrapper | Task 1 — root element is a plain `div.bg-white.rounded-xl` |
| Remove `onClose` prop | Task 1 — prop not accepted; Task 4 — Dashboard cleaned up |
| Remove Sync to Google Form button | Task 1 — not included in rewrite |
| Remove bottom Close button | Task 1 — not included in rewrite |
| Drag handle `⠿` with grab cursor | Task 1 — `cursor-grab` class on span |
| Type badge pill | Task 1 — `bg-slate-100` pill |
| 📱 /mobile chip for decimal only | Task 1 — `field_type === 'decimal'` guard |
| Active toggle — green/grey pill | Task 1 — `bg-indigo-500` / `bg-slate-300` |
| Active toggle calls `PATCH /api/custom-fields/:id` | Task 1 — uses `updateCustomField` (PUT with COALESCE) |
| Inactive rows at opacity 0.45 | Task 1 — `opacity-45` class |
| Edit opens inline form pre-filled | Task 1 + Task 2 |
| Delete calls `DELETE` after confirm | Task 1 |
| Display Label input (add/edit) | Task 1 |
| Field Name input, auto-slugify, disabled on edit | Task 1 + Task 2 tests |
| Field Type select, disabled on edit | Task 1 |
| Required checkbox | Task 1 |
| Advanced ▾ disclosure for Category + Description | Task 1 + Task 2 tests |
| Submit: "Add Field" / "Update Field" | Task 1 |
| Cancel link | Task 1 |
| Drag-to-reorder HTML5 API | Task 1 |
| Optimistic reorder on dragOver | Task 1 + Task 3 tests |
| Parallel `updateCustomField` on drop | Task 1 + Task 3 tests |
| Revert to pre-drag order on error | Task 1 + Task 3 tests |
| Matches dashboard light Tailwind aesthetic | Task 1 — white card, slate borders, indigo accents |

**Placeholder scan:** No TBDs, TODOs, or "similar to Task N" patterns present.

**Type consistency:** `updateCustomField(id, payload)` used identically in Task 1 active toggle, Task 1 drag drop, Task 3 tests. `createCustomField(payload)` matches `apiService.createCustomField` signature throughout.
