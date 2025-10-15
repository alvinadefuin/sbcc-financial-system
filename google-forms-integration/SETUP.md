# Google Form Sync - Setup Guide

This guide explains how to set up automated syncing of custom fields from your SBCC Financial System to Google Forms.

## Overview

The Google Form Sync feature allows admins to automatically add custom fields to their Google Form by clicking a button in the Custom Fields Manager. This eliminates the need to manually update the form every time a new field is created.

## Prerequisites

- Admin access to SBCC Financial System
- Access to your Google Form
- Access to backend server environment variables

## Setup Instructions

### Step 1: Deploy the Apps Script Webhook

1. Open your Google Form (the one used for collections/expenses)

2. Click **Extensions > Apps Script**

3. Delete any existing code in `Code.gs`

4. Copy the entire contents of `google-forms-integration/sync-endpoint.js` and paste it into `Code.gs`

5. **Update Configuration Values:**
   ```javascript
   const FORM_ID = 'YOUR_GOOGLE_FORM_ID';  // See instructions below
   const API_SECRET = 'your-shared-secret-key';  // Create a strong random key
   ```

   **To find your FORM_ID:**
   - Look at your Google Form URL
   - Example: `https://docs.google.com/forms/d/1ABCdef123XYZ/edit`
   - The FORM_ID is: `1ABCdef123XYZ`

   **To create a strong API_SECRET:**
   - Use a password generator or run this in your terminal:
     ```bash
     openssl rand -base64 32
     ```
   - Copy the generated key and paste it in both the Apps Script AND your backend .env file

6. Click **Deploy > New deployment**

7. Click the gear icon ⚙️ next to "Select type" and choose **Web app**

8. Configure the deployment:
   - **Description:** "Custom Fields Sync Webhook"
   - **Execute as:** Me (your Google account)
   - **Who has access:** Anyone

   ⚠️ **Important:** "Anyone" means anyone with the URL can access it, but they need the API_SECRET to actually sync fields, so it's secured.

9. Click **Deploy**

10. **Copy the deployment URL** - you'll need this for the next step
    - It will look like: `https://script.google.com/macros/s/ABC123.../exec`

11. Click **Authorize access** and grant permissions when prompted

### Step 2: Configure Backend Environment Variables

1. Open your backend `.env` file (or add these to your production environment):

   ```env
   # Google Form Sync Configuration
   GOOGLE_FORM_SYNC_WEBHOOK_URL=https://script.google.com/macros/s/ABC123.../exec
   GOOGLE_FORM_SYNC_SECRET=your-shared-secret-key
   ```

2. **Important:** The `GOOGLE_FORM_SYNC_SECRET` must match the `API_SECRET` you set in the Apps Script

3. Restart your backend server to apply the changes:
   ```bash
   cd backend
   npm run dev  # or restart your production server
   ```

### Step 3: Test the Setup

1. Log in to SBCC Financial System as an admin

2. Go to Dashboard > **Custom Fields**

3. Make sure you have at least one active custom field (like "GCash Amount")

4. Click the **"Sync to Google Form"** button

5. Confirm the sync when prompted

6. Check the results:
   - ✅ **Success:** You should see a green message showing how many fields were added/updated
   - ❌ **Error:** Check the troubleshooting section below

7. Open your Google Form to verify the new questions were added

## How It Works

```
Admin Dashboard                Backend API                 Google Apps Script
     |                              |                              |
     |-- Clicks "Sync" button       |                              |
     |                              |                              |
     |-- POST /api/custom-fields/   |                              |
     |   sync-to-google-form        |                              |
     |                              |                              |
     |                              |-- Fetch custom fields        |
     |                              |   from database              |
     |                              |                              |
     |                              |-- POST to webhook URL ------>|
     |                              |   with secret + fields       |
     |                              |                              |
     |                              |                              |-- Verify secret
     |                              |                              |
     |                              |                              |-- Add/update form
     |                              |                              |   questions
     |                              |                              |
     |                              |<---- Success response -------|
     |                              |                              |
     |<-- Display success message --|                              |
```

## Field Type Mapping

The sync automatically converts your custom field types to appropriate Google Form question types:

| Custom Field Type | Google Form Question Type | Validation |
|------------------|---------------------------|------------|
| `decimal` | Text (short answer) | Number validation |
| `integer` | Text (short answer) | Number validation |
| `text` | Text (short answer) | None |
| `date` | Date picker | None |
| `boolean` | Multiple choice | Yes/No options |

## Usage Tips

### When to Sync

- After adding a new custom field
- After updating field labels or descriptions
- After changing required/optional status
- When setting up a new Google Form

### What Gets Synced

✅ **Synced to Google Form:**
- Field label (as question title)
- Field description (as help text)
- Required/optional status
- Field type and validation

❌ **NOT synced:**
- Inactive fields (is_active = 0)
- Field categories (internal use only)
- Default values
- Display order (Google Forms uses its own ordering)

### Managing Fields

**To add a new field to the form:**
1. Add it in Custom Fields Manager
2. Click "Sync to Google Form"
3. Done! New question appears in the form

**To remove a field:**
1. Delete it in Custom Fields Manager (or mark inactive)
2. Click "Sync to Google Form" (skips inactive fields)
3. **Manually delete** the old question from Google Form if desired

**To update a field:**
1. Edit it in Custom Fields Manager
2. Click "Sync to Google Form"
3. The existing question will be updated

## Troubleshooting

### Error: "Google Form sync webhook URL not configured"

**Cause:** Missing `GOOGLE_FORM_SYNC_WEBHOOK_URL` in backend .env

**Fix:**
1. Make sure you completed Step 2 above
2. Restart the backend server
3. Try again

### Error: "Unauthorized" or "403 Forbidden"

**Cause:** API_SECRET mismatch between Apps Script and backend

**Fix:**
1. Check that `API_SECRET` in Apps Script matches `GOOGLE_FORM_SYNC_SECRET` in .env
2. Both should be identical, including capitalization
3. Redeploy the Apps Script if you changed it
4. Restart backend if you changed .env

### Error: "Failed to sync with Google Form"

**Possible causes:**
- Apps Script webhook URL is incorrect
- Apps Script wasn't deployed properly
- Network/firewall issue

**Fix:**
1. Test the webhook manually using the `testSync()` function in Apps Script:
   - Open Apps Script editor
   - Select `testSync` from function dropdown
   - Click Run ▶️
   - Check Execution log for errors

2. Verify the webhook URL in .env is exactly what Google gave you (including `/exec` at the end)

3. Try redeploying the Apps Script web app

### Sync button is disabled

**Cause:** No custom fields exist yet

**Fix:** Create at least one custom field first

### Fields not appearing in Google Form

**Check:**
1. Are the fields marked as active? (is_active = 1)
2. Did the sync report success?
3. Refresh the Google Form edit page
4. Check if the questions were added at the bottom of the form

## Security Notes

- The API_SECRET acts as authentication between your backend and Google Apps Script
- Keep the API_SECRET secure - don't commit it to public repositories
- The webhook URL is not secret, but it requires the correct API_SECRET to work
- Apps Script runs with your Google account permissions
- Only admins can trigger the sync from the dashboard

## Advanced Configuration

### Multiple Forms

If you have separate Google Forms for collections and expenses:

1. Create two separate Apps Script projects (one per form)
2. Each with its own FORM_ID
3. Use different API secrets for each
4. Add both configurations to .env:
   ```env
   GOOGLE_FORM_SYNC_WEBHOOK_URL_COLLECTIONS=https://script.google.com/.../exec
   GOOGLE_FORM_SYNC_SECRET_COLLECTIONS=secret1

   GOOGLE_FORM_SYNC_WEBHOOK_URL_EXPENSES=https://script.google.com/.../exec
   GOOGLE_FORM_SYNC_SECRET_EXPENSES=secret2
   ```
5. Update backend code to use appropriate webhook based on tableName

### Custom Field Ordering

To control the order of synced questions in Google Form:

1. Set `display_order` values when creating custom fields
2. Lower numbers appear first
3. Fields with same display_order are sorted by creation date
4. Alternatively, manually reorder questions in Google Form after sync

## Maintenance

### Updating the Apps Script

If you need to update the sync logic:

1. Edit the code in Apps Script editor
2. Click **Deploy > Manage deployments**
3. Click Edit (pencil icon) on your web app deployment
4. Change version to "New version"
5. Add description of changes
6. Click **Deploy**
7. The webhook URL stays the same - no backend changes needed

### Monitoring

Check Apps Script execution logs:
1. Open Apps Script editor
2. Click **Executions** (clock icon) in left sidebar
3. View recent sync attempts and any errors

## Need Help?

- Check the [main task documentation](../tasks/add-custom-fields-to-google-forms.md)
- Review the [custom fields integration guide](../tasks/integrate-custom-fields-to-financial-records-manager.md)
- Contact your system administrator
