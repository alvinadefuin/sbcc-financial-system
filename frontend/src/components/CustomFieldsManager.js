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
    setError(null);
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
    if (!preDragFields) return;
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
    if (preDragFields) {
      setFields(preDragFields);
    }
    setPreDragFields(null);
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
            Decimal fields appear as amount inputs in the mobile form
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
                field.is_active !== 1 ? 'opacity-50' : ''
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
