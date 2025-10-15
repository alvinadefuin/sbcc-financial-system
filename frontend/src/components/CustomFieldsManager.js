import React, { useState, useEffect } from 'react';
import apiService from '../utils/api';

const CustomFieldsManager = ({ tableName, onClose }) => {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  const [formData, setFormData] = useState({
    field_name: '',
    field_label: '',
    field_type: 'decimal',
    default_value: '',
    is_required: false,
    category: '',
    description: ''
  });

  const fieldTypes = [
    { value: 'decimal', label: 'Decimal (Money)' },
    { value: 'text', label: 'Text' },
    { value: 'date', label: 'Date' },
    { value: 'integer', label: 'Integer' },
    { value: 'boolean', label: 'Yes/No' }
  ];

  const categories = {
    collections: [
      { value: 'main', label: 'Main Collection' },
      { value: 'pass_through', label: 'Pass-Through Account' },
      { value: 'allocation', label: 'Fund Allocation' }
    ],
    expenses: [
      { value: 'main', label: 'Main Expense' },
      { value: 'operational', label: 'Operational Fund' },
      { value: 'pastoral', label: 'Pastoral Team' },
      { value: 'pbcm', label: 'PBCM Share' }
    ]
  };

  useEffect(() => {
    loadFields();
  }, [tableName]);

  const loadFields = async () => {
    try {
      setLoading(true);
      const data = await apiService.getCustomFields(tableName);
      setFields(data);
      setError(null);
    } catch (err) {
      setError('Failed to load custom fields');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (editingField) {
        await apiService.updateCustomField(editingField.id, formData);
      } else {
        await apiService.createCustomField({
          ...formData,
          table_name: tableName
        });
      }

      await loadFields();
      resetForm();
      setShowAddForm(false);
      setEditingField(null);
    } catch (err) {
      setError(err.message || 'Failed to save custom field');
    }
  };

  const handleEdit = (field) => {
    setEditingField(field);
    setFormData({
      field_name: field.field_name,
      field_label: field.field_label,
      field_type: field.field_type,
      default_value: field.default_value || '',
      is_required: field.is_required === 1,
      category: field.category || '',
      description: field.description || ''
    });
    setShowAddForm(true);
  };

  const handleDelete = async (fieldId) => {
    if (!window.confirm('Are you sure you want to delete this field?')) {
      return;
    }

    try {
      await apiService.deleteCustomField(fieldId);
      await loadFields();
    } catch (err) {
      setError('Failed to delete custom field');
    }
  };

  const handleSyncToGoogleForm = async () => {
    if (!window.confirm('This will update your Google Form with all custom fields. Continue?')) {
      return;
    }

    try {
      setSyncing(true);
      setSyncMessage(null);
      setError(null);

      const result = await apiService.syncCustomFieldsToGoogleForm(tableName);

      if (result.success) {
        setSyncMessage({
          type: 'success',
          text: result.message,
          details: result.details
        });
      } else {
        setError(result.error || 'Sync failed');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to sync with Google Form';
      const hint = err.response?.data?.hint;
      setError(hint ? `${errorMsg}. ${hint}` : errorMsg);
    } finally {
      setSyncing(false);
    }
  };

  const resetForm = () => {
    setFormData({
      field_name: '',
      field_label: '',
      field_type: 'decimal',
      default_value: '',
      is_required: false,
      category: '',
      description: ''
    });
    setEditingField(null);
  };

  const handleCancel = () => {
    resetForm();
    setShowAddForm(false);
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">
              Manage {tableName === 'collections' ? 'Collection' : 'Expense'} Fields
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-md">
              {error}
            </div>
          )}

          {syncMessage && (
            <div className={`mb-4 p-4 rounded-md ${
              syncMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
            }`}>
              <p className="font-medium">{syncMessage.text}</p>
              {syncMessage.details && (
                <p className="text-sm mt-1">
                  Added: {syncMessage.details.added}, Updated: {syncMessage.details.updated}, Skipped: {syncMessage.details.skipped}
                </p>
              )}
            </div>
          )}

          {/* Add/Edit Form */}
          {showAddForm && (
            <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-lg font-semibold mb-4">
                {editingField ? 'Edit Field' : 'Add New Field'}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Field Name * (lowercase, no spaces)
                  </label>
                  <input
                    type="text"
                    value={formData.field_name}
                    onChange={(e) => setFormData({ ...formData, field_name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                    disabled={editingField !== null}
                    placeholder="e.g., gcash_amount"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Display Label *
                  </label>
                  <input
                    type="text"
                    value={formData.field_label}
                    onChange={(e) => setFormData({ ...formData, field_label: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                    placeholder="e.g., GCash Amount"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Field Type *
                  </label>
                  <select
                    value={formData.field_type}
                    onChange={(e) => setFormData({ ...formData, field_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  >
                    {fieldTypes.map(type => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select category (optional)</option>
                    {categories[tableName]?.map(cat => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Value
                  </label>
                  <input
                    type="text"
                    value={formData.default_value}
                    onChange={(e) => setFormData({ ...formData, default_value: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    placeholder="Optional default value"
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_required"
                    checked={formData.is_required}
                    onChange={(e) => setFormData({ ...formData, is_required: e.target.checked })}
                    className="h-4 w-4 text-blue-600"
                  />
                  <label htmlFor="is_required" className="ml-2 text-sm text-gray-700">
                    Required field
                  </label>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    rows="2"
                    placeholder="Optional description"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  {editingField ? 'Update Field' : 'Add Field'}
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {!showAddForm && (
            <div className="mb-4 flex gap-3">
              <button
                onClick={() => setShowAddForm(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                + Add New Field
              </button>
              <button
                onClick={handleSyncToGoogleForm}
                disabled={syncing || fields.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {syncing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Syncing...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Sync to Google Form
                  </>
                )}
              </button>
            </div>
          )}

          {/* Fields List */}
          <div className="space-y-2">
            {fields.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                No custom fields defined yet. Click "Add New Field" to create one.
              </p>
            ) : (
              fields.map((field) => (
                <div
                  key={field.id}
                  className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-md hover:shadow-sm"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="font-semibold text-gray-800">{field.field_label}</h4>
                      <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                        {field.field_type}
                      </span>
                      {field.category && (
                        <span className="text-xs px-2 py-1 bg-gray-100 text-gray-800 rounded">
                          {field.category}
                        </span>
                      )}
                      {field.is_required === 1 && (
                        <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded">
                          Required
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      Field name: <code className="bg-gray-100 px-1 rounded">{field.field_name}</code>
                    </p>
                    {field.description && (
                      <p className="text-sm text-gray-500 mt-1">{field.description}</p>
                    )}
                  </div>

                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleEdit(field)}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(field.id)}
                      className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomFieldsManager;
