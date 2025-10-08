# Task: Add Custom Fields to Google Forms Integration

**Status**: Planned
**Priority**: Medium
**Estimated Time**: 1-2 hours
**Branch**: `feature/dynamic-fields`
**Depends On**: Custom fields integration (completed)

## 📋 Overview

Update the Google Forms for Collections and Expenses to include custom fields. When admins add new custom fields (like GCash, PayMaya, etc.), they should automatically appear as questions in the Google Forms, and submissions should save the custom field values.

## ✅ Prerequisites (Already Complete)

- [x] Custom fields system implemented
- [x] Custom fields working in FinancialRecordsManager
- [x] GCash field created and tested
- [x] Backend supports custom field values

## 🎯 Goals

1. Google Forms should dynamically include custom fields as questions
2. Form submissions should save custom field values to database
3. Custom fields should sync between the admin UI and Google Forms
4. Different field types should map to appropriate Google Forms question types

## 📁 Files to Modify

### Backend Files
- `backend/routes/forms.js` - Add custom fields to form submissions
- `backend/services/googleSheetsService.js` (if applicable) - Include custom fields in exports

### Frontend Files
- No frontend changes needed - Google Forms are external

### Google Forms
- **Collection Form**: https://docs.google.com/forms/d/.../edit
- **Expense Form**: https://docs.google.com/forms/.../edit

## 🔧 Implementation Approach

### Option A: Manual Google Forms Update (Simpler)

**Pros**:
- Quick to implement
- No Google Forms API integration needed
- Direct control over question formatting

**Cons**:
- Admins must manually update forms when adding custom fields
- Form questions and custom fields can get out of sync

**Steps**:
1. Document how to add custom fields to Google Forms manually
2. Update form submission handler to accept custom field responses
3. Map form responses to custom_fields object in database

### Option B: Google Forms API Integration (Advanced)

**Pros**:
- Automatic sync between custom fields and form questions
- No manual maintenance needed
- Always up-to-date

**Cons**:
- Requires Google Forms API setup and authentication
- More complex implementation
- API quota limits

**Steps**:
1. Set up Google Forms API credentials
2. Create service to sync custom fields to form questions
3. Automatically add/update form questions when custom fields change

## 📝 Recommended: Option A (Manual Update)

Start with manual updates since it's simpler and the forms don't change frequently.

### Step 1: Update Form Submission Handler

Modify `backend/routes/forms.js` to accept custom field responses:

```javascript
router.post('/collections/submit', async (req, res) => {
  const {
    email,
    date,
    particular,
    // ... standard fields ...
    // Custom fields (passed as key-value pairs)
    custom_fields
  } = req.body;

  // Verify user exists
  const user = await getUserByEmail(email);
  if (!user) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // Create collection with custom fields
  const collectionData = {
    date,
    particular,
    // ... standard fields ...
    custom_fields,  // Include custom fields
    created_by: email,
    submitted_via: 'google_form'
  };

  await apiService.addCollection(collectionData);
  res.json({ success: true });
});
```

### Step 2: Update Google Forms Manually

**For Collections Form:**

1. Open the Google Form in edit mode
2. Add new questions for each custom field:
   - **GCash**: Number question, optional
   - **Payment Reference**: Short answer, optional
3. Note the exact field names for mapping

**Field Type Mapping:**
- `decimal` → Number question
- `integer` → Number question
- `text` → Short answer
- `date` → Date question
- `boolean` → Multiple choice (Yes/No)

### Step 3: Map Form Responses to Custom Fields

Update the Google Apps Script (if using) or backend handler to map responses:

```javascript
// Example mapping in form submission handler
const formResponse = req.body;

const custom_fields = {
  gcash: formResponse.gcash_amount || 0,
  payment_reference: formResponse.payment_ref || ''
};
```

### Step 4: Document the Process

Create admin documentation explaining:
1. How to add custom fields in the admin UI
2. How to add corresponding questions to Google Forms
3. Field name conventions to ensure proper mapping

## 🧪 Testing Checklist

- [ ] Add a custom field in admin UI (e.g., "PayMaya")
- [ ] Manually add corresponding question to Google Form
- [ ] Submit a test entry through Google Form with custom field value
- [ ] Verify submission saves to database with custom field
- [ ] Edit the record in FinancialRecordsManager - custom field value should appear
- [ ] Check that total calculation includes custom field (if decimal)

## 📝 Admin Documentation

Create a guide for church admins:

### Adding Custom Fields to Google Forms

1. **Add field in Admin UI:**
   - Click "Custom Fields"
   - Add new field (e.g., "PayMaya")
   - Note the field name (e.g., `paymaya`)

2. **Update Google Form:**
   - Open Collections/Expenses form
   - Add new question matching the field type
   - Title: Use the field label (e.g., "PayMaya")
   - Set as optional (unless required in admin UI)

3. **Field Name Mapping:**
   - Form question parameter: Should match custom field name
   - Example: `paymaya` field → form parameter `paymaya`

## 🔗 Alternative: Apps Script Integration

If you want automatic syncing, you can use Google Apps Script:

```javascript
// In Google Form's Apps Script
function onFormSubmit(e) {
  const formResponse = e.response;
  const itemResponses = formResponse.getItemResponses();

  // Build custom_fields object
  const custom_fields = {};
  itemResponses.forEach(item => {
    const questionTitle = item.getItem().getTitle();
    const response = item.getResponse();

    // Map custom field questions
    if (questionTitle === 'GCash') {
      custom_fields.gcash = response;
    } else if (questionTitle === 'Payment Reference') {
      custom_fields.payment_reference = response;
    }
  });

  // Submit to backend
  const payload = {
    // ... standard fields ...
    custom_fields: custom_fields
  };

  UrlFetchApp.fetch('YOUR_API_URL/api/forms/collections/submit', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  });
}
```

## 🚀 Future Enhancements

- [ ] Automatic Google Forms API integration
- [ ] Field validation sync between admin UI and forms
- [ ] Conditional questions based on custom field values
- [ ] Bulk import/export of custom field data
- [ ] Custom field templates for common use cases

## 🔗 References

- **Google Forms API**: https://developers.google.com/forms/api
- **Apps Script**: https://developers.google.com/apps-script
- **Custom Fields Backend**: `backend/routes/customFields.js`
- **Form Submission Handler**: `backend/routes/forms.js`

---

**Created**: 2025-10-08
**Last Updated**: 2025-10-08
**Assigned To**: TBD
**Blocked By**: None
