# Task: Integrate Custom Fields into FinancialRecordsManager

**Status**: Planned
**Priority**: Medium
**Estimated Time**: 2-3 hours
**Branch**: `feature/dynamic-fields`

## 📋 Overview

Integrate the dynamic custom fields system into the production FinancialRecordsManager component so that users can add/edit custom fields (like GCash, PayMaya, etc.) when managing collection and expense records.

## ✅ Prerequisites (Already Complete)

- [x] Custom fields database schema created
- [x] Custom fields API endpoints implemented
- [x] CustomFieldsManager UI for admins to manage fields
- [x] CustomFieldsExample component showing integration pattern
- [x] Backend supports saving/loading custom field values
- [x] GCash and Payment Reference fields created and tested

## 🎯 Goals

1. Users can see and fill in custom fields when adding/editing collections
2. Users can see and fill in custom fields when adding/editing expenses
3. Custom field values are displayed in the records table
4. Custom field values are included in exports and reports
5. The integration feels seamless with existing UI

## 📁 Files to Modify

### Primary File
- `frontend/src/components/FinancialRecordsManagerNew.js` (943 lines)

### Reference File
- `frontend/src/components/CustomFieldsExample.js` - Working example to copy patterns from

## 🔧 Implementation Steps

### Step 1: Add Custom Fields State (Lines ~90-100)

Add state variables for custom fields:

```javascript
const [customFields, setCustomFields] = useState([]);
const [loadingFields, setLoadingFields] = useState(false);
```

Update formData initialization to include custom_fields:

```javascript
const [formData, setFormData] = useState({
  // ... existing fields ...
  custom_fields: {} // Add this
});
```

### Step 2: Load Custom Fields on Component Mount

Add useEffect to load custom fields when activeTab changes:

```javascript
useEffect(() => {
  if (activeTab === 'collections' || activeTab === 'expenses') {
    loadCustomFields(activeTab);
  }
}, [activeTab]);

const loadCustomFields = async (tableName) => {
  try {
    setLoadingFields(true);
    const fields = await apiService.getCustomFields(tableName);
    setCustomFields(fields);

    // Initialize custom fields in formData with default values
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
  } finally {
    setLoadingFields(false);
  }
};
```

### Step 3: Add Custom Field Input Handler

Add handler for custom field changes:

```javascript
const handleCustomFieldChange = (fieldName, value) => {
  setFormData(prev => ({
    ...prev,
    custom_fields: {
      ...prev.custom_fields,
      [fieldName]: value
    }
  }));
};
```

### Step 4: Create Custom Field Renderer Function

Copy the `renderCustomFieldInput` function from CustomFieldsExample.js:

```javascript
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
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          placeholder={`Enter ${field.field_label}`}
          required={field.is_required === 1}
        />
      );

    case 'text':
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          placeholder={`Enter ${field.field_label}`}
          required={field.is_required === 1}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => handleCustomFieldChange(field.field_name, e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
          required={field.is_required === 1}
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
```

### Step 5: Add Custom Fields Section to Form UI

Find where the collection/expense form fields are rendered (around line 400-600) and add a custom fields section:

```javascript
{/* Custom Fields Section - Add after standard fields */}
{customFields.length > 0 && (
  <div className="mt-6 pt-6 border-t border-gray-200">
    <h3 className="text-lg font-semibold text-gray-800 mb-4">
      Custom Fields
    </h3>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {customFields
        .filter(field => field.is_active === 1)
        .map((field) => (
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
)}
```

### Step 6: Update Total Calculation (Collections Only)

Update the `calculateTotal` function to include custom decimal fields:

```javascript
const calculateTotal = (data, recordType) => {
  if (recordType === "collections") {
    const parseValue = (value) => {
      if (!value || value === "") return 0;
      return parseFloat(value.toString().replace(/,/g, '')) || 0;
    };

    let total = parseValue(data.general_tithes_offering) +
           parseValue(data.bank_interest) +
           parseValue(data.sisterhood_san_juan) +
           // ... other standard fields ...
           parseValue(data.special_purpose_pledge);

    // Add custom decimal fields to total
    if (data.custom_fields) {
      customFields.forEach(field => {
        if (field.field_type === 'decimal' && field.category === 'main') {
          total += parseValue(data.custom_fields[field.field_name]);
        }
      });
    }

    return total;
  }
  // ... rest of function
};
```

### Step 7: Update Form Submit Handler

Ensure custom_fields are included when saving:

```javascript
const handleAddRecord = async () => {
  try {
    // ... existing validation ...

    const recordData = {
      ...formData,
      custom_fields: formData.custom_fields // Ensure this is included
    };

    if (activeTab === "collections") {
      await apiService.addCollection(recordData);
    } else {
      await apiService.addExpense(recordData);
    }

    // ... rest of handler ...
  }
};
```

### Step 8: Update Edit Handler

When editing a record, load existing custom field values:

```javascript
const handleEditRecord = async (record) => {
  setEditingRecord(record);
  setFormData({
    ...record,
    custom_fields: record.custom_fields || {} // Load existing values
  });
  setShowAddForm(true);
};
```

### Step 9: Display Custom Fields in Table (Optional)

Add custom field columns to the records table. This is optional but recommended:

```javascript
{/* Add custom field columns after standard columns */}
{customFields
  .filter(f => f.is_active === 1)
  .map(field => (
    <th key={field.id} className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
      {field.field_label}
    </th>
  ))}

{/* In the table body */}
{customFields
  .filter(f => f.is_active === 1)
  .map(field => (
    <td key={field.id} className="px-4 py-2 text-sm text-gray-900">
      {record.custom_fields?.[field.field_name] || '-'}
    </td>
  ))}
```

### Step 10: Reset Form Handler

Update the reset function to clear custom fields:

```javascript
const resetForm = () => {
  setFormData({
    // ... existing fields ...
    custom_fields: {}
  });

  // Reinitialize custom fields with defaults
  loadCustomFields(activeTab);
};
```

## 🧪 Testing Checklist

- [ ] Custom fields load when switching between Collections/Expenses tabs
- [ ] GCash field appears in Collections form
- [ ] Can add a collection with GCash value
- [ ] GCash value is saved to database
- [ ] Can edit a collection and modify GCash value
- [ ] GCash value displays in the records table
- [ ] Total amount auto-calculates including GCash
- [ ] Custom fields work for Expenses tab too
- [ ] Required custom fields are validated
- [ ] Different field types (text, date, boolean) render correctly
- [ ] Form resets properly after submission

## 📝 Notes

- The CustomFieldsExample.js component has all the patterns needed
- Copy-paste approach: Take working code from example and adapt it
- Test incrementally: Add each step and test before moving to next
- The backend already supports everything - just need frontend changes

## 🚀 Future Enhancements (Optional)

- [ ] Add custom field filter/search in records table
- [ ] Include custom fields in CSV/Excel exports
- [ ] Show custom fields in print reports
- [ ] Add field-level permissions (admin-only fields)
- [ ] Add conditional fields (show field X only if field Y has value Z)

## 🔗 References

- **Working Example**: `frontend/src/components/CustomFieldsExample.js`
- **API Documentation**: See `backend/routes/customFields.js` for endpoints
- **Helper Functions**: `backend/utils/customFieldsHelper.js`
- **Database Schema**: `backend/config/database.js` lines 158-186

---

**Created**: 2025-10-07
**Last Updated**: 2025-10-07
**Assigned To**: TBD
**Blocked By**: None (all prerequisites complete)
