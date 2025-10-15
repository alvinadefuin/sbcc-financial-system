/**
 * Google Apps Script - Custom Fields Form Sync Endpoint
 *
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Form
 * 2. Click Extensions > Apps Script
 * 3. Replace Code.gs content with this file
 * 4. Deploy as Web App (Execute as: Me, Access: Anyone)
 * 5. Copy the deployment URL and save it in your backend .env as GOOGLE_FORM_SYNC_WEBHOOK_URL
 */

// Configuration - Update these values
const FORM_ID = 'YOUR_GOOGLE_FORM_ID'; // Get from form URL
const API_SECRET = 'your-shared-secret-key'; // Must match backend .env

/**
 * Main webhook endpoint - receives POST requests from your backend
 */
function doPost(e) {
  try {
    // Parse request
    const data = JSON.parse(e.postData.contents);

    // Verify secret key
    if (data.secret !== API_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Unauthorized'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const customFields = data.customFields;
    const tableName = data.tableName;

    // Update form with custom fields
    const result = syncCustomFieldsToForm(customFields, tableName);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: `Synced ${result.added} fields to Google Form`,
      details: result
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Sync custom fields to Google Form
 */
function syncCustomFieldsToForm(customFields, tableName) {
  const form = FormApp.openById(FORM_ID);
  const existingItems = form.getItems();

  let added = 0;
  let updated = 0;
  let skipped = 0;

  customFields.forEach(field => {
    // Skip inactive fields
    if (field.is_active !== 1) {
      skipped++;
      return;
    }

    // Check if question already exists
    const existingItem = existingItems.find(item =>
      item.getTitle() === field.field_label
    );

    if (existingItem) {
      // Update existing question
      updateFormItem(existingItem, field);
      updated++;
    } else {
      // Add new question
      addFormItem(form, field);
      added++;
    }
  });

  return { added, updated, skipped, total: customFields.length };
}

/**
 * Add new form item based on field type
 */
function addFormItem(form, field) {
  let item;

  switch (field.field_type) {
    case 'decimal':
    case 'integer':
      item = form.addTextItem();
      item.setTitle(field.field_label);
      item.setHelpText(field.description || `Enter ${field.field_label}`);
      item.setRequired(field.is_required === 1);

      // Add number validation
      const validation = FormApp.createTextValidation()
        .requireNumber()
        .build();
      item.setValidation(validation);
      break;

    case 'text':
      item = form.addTextItem();
      item.setTitle(field.field_label);
      item.setHelpText(field.description || `Enter ${field.field_label}`);
      item.setRequired(field.is_required === 1);
      break;

    case 'date':
      item = form.addDateItem();
      item.setTitle(field.field_label);
      item.setHelpText(field.description || `Select ${field.field_label}`);
      item.setRequired(field.is_required === 1);
      break;

    case 'boolean':
      item = form.addMultipleChoiceItem();
      item.setTitle(field.field_label);
      item.setHelpText(field.description || '');
      item.setChoiceValues(['Yes', 'No']);
      item.setRequired(field.is_required === 1);
      break;

    default:
      item = form.addTextItem();
      item.setTitle(field.field_label);
      item.setRequired(field.is_required === 1);
  }

  return item;
}

/**
 * Update existing form item
 */
function updateFormItem(item, field) {
  // Update help text and required status
  const itemType = item.getType();

  if (itemType === FormApp.ItemType.TEXT) {
    item.asTextItem()
      .setHelpText(field.description || `Enter ${field.field_label}`)
      .setRequired(field.is_required === 1);
  } else if (itemType === FormApp.ItemType.DATE) {
    item.asDateItem()
      .setHelpText(field.description || `Select ${field.field_label}`)
      .setRequired(field.is_required === 1);
  } else if (itemType === FormApp.ItemType.MULTIPLE_CHOICE) {
    item.asMultipleChoiceItem()
      .setHelpText(field.description || '')
      .setRequired(field.is_required === 1);
  }
}

/**
 * Test function - run this manually to verify setup
 */
function testSync() {
  const testData = {
    secret: API_SECRET,
    tableName: 'collections',
    customFields: [
      {
        field_name: 'gcash',
        field_label: 'GCash Amount',
        field_type: 'decimal',
        is_required: 0,
        is_active: 1,
        description: 'Enter the GCash collection amount',
        category: 'main'
      },
      {
        field_name: 'payment_reference',
        field_label: 'Payment Reference Number',
        field_type: 'text',
        is_required: 0,
        is_active: 1,
        description: 'Enter payment reference/transaction ID',
        category: 'main'
      }
    ]
  };

  const result = syncCustomFieldsToForm(testData.customFields, testData.tableName);
  Logger.log(result);
}
