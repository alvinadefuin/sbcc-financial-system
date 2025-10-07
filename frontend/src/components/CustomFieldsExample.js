import React, { useState, useEffect } from 'react';
import apiService from '../utils/api';

/**
 * This is a simplified example showing how to integrate custom fields
 * into a form for adding/editing collection records.
 *
 * Use this as a reference when updating FinancialRecordsManager.
 */
const CustomFieldsExample = () => {
  const [customFields, setCustomFields] = useState([]);
  const [formData, setFormData] = useState({
    // Standard collection fields
    date: '',
    particular: '',
    total_amount: '',
    general_tithes_offering: '',
    // Custom fields will be stored separately
    custom_fields: {}
  });

  // Load custom fields when component mounts
  useEffect(() => {
    loadCustomFields();
  }, []);

  const loadCustomFields = async () => {
    try {
      const fields = await apiService.getCustomFields('collections');
      setCustomFields(fields);

      // Initialize custom fields with default values
      const customFieldsInit = {};
      fields.forEach(field => {
        customFieldsInit[field.field_name] = field.default_value || '';
      });
      setFormData(prev => ({
        ...prev,
        custom_fields: customFieldsInit
      }));
    } catch (error) {
      console.error('Error loading custom fields:', error);
    }
  };

  // Handle standard field changes
  const handleFieldChange = (fieldName, value) => {
    setFormData(prev => ({
      ...prev,
      [fieldName]: value
    }));
  };

  // Handle custom field changes
  const handleCustomFieldChange = (fieldName, value) => {
    setFormData(prev => ({
      ...prev,
      custom_fields: {
        ...prev.custom_fields,
        [fieldName]: value
      }
    }));
  };

  // Render input based on field type
  const renderCustomFieldInput = (field) => {
    const value = formData.custom_fields[field.field_name] || '';

    switch (field.field_type) {
      case 'decimal':
      case 'integer':
        return (
          <input
            type="number"
            step={field.field_type === 'decimal' ? '0.01' : '1'}
            value={value}
            onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder={`Enter ${field.field_label}`}
          />
        );

      case 'text':
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            placeholder={`Enter ${field.field_label}`}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={value}
            onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
        );

      case 'boolean':
        return (
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={value === true || value === 'true'}
              onChange={(e) => handleCustomFieldChange(field.field_name, e.target.checked)}
              className="h-4 w-4 text-blue-600"
            />
            <label className="ml-2 text-sm text-gray-700">
              {field.field_label}
            </label>
          </div>
        );

      default:
        return null;
    }
  };

  // Group fields by category for better organization
  const groupFieldsByCategory = () => {
    const grouped = {};
    customFields.forEach(field => {
      const category = field.category || 'other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(field);
    });
    return grouped;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Calculate total if not provided
      const generalTithes = parseFloat(formData.general_tithes_offering) || 0;
      const gcash = parseFloat(formData.custom_fields.gcash) || 0;
      const calculatedTotal = generalTithes + gcash;

      // Step 1: Create the collection with standard fields
      const collectionData = {
        date: formData.date,
        particular: formData.particular || 'Collection Entry',
        total_amount: formData.total_amount || calculatedTotal,
        general_tithes_offering: formData.general_tithes_offering || 0,
        // Include custom_fields in the request
        custom_fields: formData.custom_fields
      };

      const response = await apiService.addCollection(collectionData);

      console.log('Collection added successfully:', response);
      alert('Collection added with custom fields!');

      // Reset form
      setFormData({
        date: '',
        particular: '',
        total_amount: '',
        general_tithes_offering: '',
        custom_fields: {}
      });

      // Reinitialize custom fields
      loadCustomFields();
    } catch (error) {
      console.error('Error saving collection:', error);
      alert('Error: ' + error.message);
    }
  };

  const groupedFields = groupFieldsByCategory();

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">
          Custom Fields Integration Example
        </h2>

        <p className="text-gray-600 mb-6">
          This example shows how to integrate custom fields into a collection form.
          Custom fields like "GCash" and "Payment Reference" are loaded dynamically
          and rendered based on their field type.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Standard Fields */}
          <div className="border-b border-gray-200 pb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Standard Collection Fields
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => handleFieldChange('date', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Particular
                </label>
                <input
                  type="text"
                  value={formData.particular}
                  onChange={(e) => handleFieldChange('particular', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Collection Entry"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  General Tithes & Offering
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.general_tithes_offering}
                  onChange={(e) => handleFieldChange('general_tithes_offering', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Total Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.total_amount}
                  onChange={(e) => handleFieldChange('total_amount', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Custom Fields - Grouped by Category */}
          {Object.keys(groupedFields).length > 0 && (
            <div className="border-b border-gray-200 pb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">
                Custom Fields
              </h3>

              {Object.entries(groupedFields).map(([category, fields]) => (
                <div key={category} className="mb-4">
                  <h4 className="text-sm font-medium text-gray-600 mb-3 uppercase">
                    {category}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {fields.map((field) => (
                      <div key={field.id}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {field.field_label}
                          {field.is_required === 1 && (
                            <span className="text-red-500 ml-1">*</span>
                          )}
                        </label>
                        {renderCustomFieldInput(field)}
                        {field.description && (
                          <p className="text-xs text-gray-500 mt-1">
                            {field.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Preview of Data */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="text-sm font-semibold text-gray-700 mb-2">
              Form Data Preview:
            </h4>
            <pre className="text-xs text-gray-600 overflow-auto">
              {JSON.stringify(formData, null, 2)}
            </pre>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold"
          >
            Add Collection with Custom Fields
          </button>
        </form>

        {/* Implementation Notes */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-blue-900 mb-2">Implementation Notes:</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>✓ Custom fields are loaded from API on component mount</li>
            <li>✓ Fields are grouped by category for better organization</li>
            <li>✓ Different input types rendered based on field_type</li>
            <li>✓ Custom field values stored in formData.custom_fields object</li>
            <li>✓ Both standard and custom fields sent together in API request</li>
            <li>✓ The backend automatically saves custom field values</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CustomFieldsExample;
