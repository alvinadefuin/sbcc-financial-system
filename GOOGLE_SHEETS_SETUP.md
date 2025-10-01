# Google Sheets Integration Setup Guide

This guide will help you set up Google Sheets integration with the SBCC Financial System so you can export financial records directly to Google Sheets.

## 🎯 Overview

The integration allows:
- ✅ Export collections and expenses to Google Sheets
- ✅ Automatic data formatting and organization
- ✅ Real-time updates to your spreadsheet
- ✅ Summary sheet with financial totals
- ✅ Customizable date ranges and record types

## 📋 Prerequisites

- Google account with access to Google Sheets
- SBCC Financial System with admin access
- Google Sheets spreadsheet (we'll help you set this up)

## 🚀 Step-by-Step Setup

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Create Project" or select an existing project
3. Name your project (e.g., "SBCC Financial System")
4. Click "Create"

### Step 2: Enable Google Sheets API

1. In the Google Cloud Console, go to "APIs & Services" > "Library"
2. Search for "Google Sheets API"
3. Click on "Google Sheets API"
4. Click "Enable"

### Step 3: Create Service Account Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the service account details:
   - **Name**: SBCC Financial Sheets Service
   - **Description**: Service account for SBCC Financial System Google Sheets integration
4. Click "Create and Continue"
5. Skip the optional steps (Grant access, Grant users access)
6. Click "Done"

### Step 4: Generate Service Account Key

1. In the "Credentials" page, find your newly created service account
2. Click on the service account email
3. Go to the "Keys" tab
4. Click "Add Key" > "Create new key"
5. Select "JSON" format
6. Click "Create"
7. **IMPORTANT**: A JSON file will be downloaded to your computer. Keep this file safe!

### Step 5: Install the Credentials File

1. Rename the downloaded JSON file to `google-credentials.json`
2. Copy the file to your backend config folder:
   ```bash
   cp /path/to/downloaded/google-credentials.json backend/config/google-credentials.json
   ```

### Step 6: Set Up Your Google Sheets Spreadsheet

#### Option A: Use the Existing Spreadsheet

If you already have a Google Sheets spreadsheet (like the one shared):

1. Open your Google Sheets document
2. Get the Spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```
   Example: `1NQH1TmqqKZO3SWHyygLQ1W6T3YzJkQ_B`

3. Share the spreadsheet with the service account:
   - Open your `google-credentials.json` file
   - Copy the `client_email` value (looks like: `service-account@project.iam.gserviceaccount.com`)
   - In Google Sheets, click "Share"
   - Paste the service account email
   - Give it "Editor" permissions
   - Click "Send"

#### Option B: Create a New Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name it "SBCC Financial Records"
4. Create three sheets (tabs) with these exact names:
   - **Collections**
   - **Expenses**
   - **Summary**
5. Get the Spreadsheet ID from the URL
6. Share with service account (see Option A, step 3)

### Step 7: Configure the Application

The spreadsheet ID is already configured in the application, but you can change it:

1. In the application, go to Reports section
2. Click "Update Google Sheet"
3. Enter your Spreadsheet ID if different from the default

### Step 8: Test the Integration

1. Start your backend server:
   ```bash
   cd backend
   npm start
   ```

2. Log in to the SBCC Financial System

3. Go to the "Reports" section

4. Click "Update Google Sheet"

5. Click "Test Connection" to verify the setup

6. If successful, you should see: "Connected to [Your Spreadsheet Name]"

## 📊 How to Use

### Exporting Financial Records

1. Go to the "Reports" section in the dashboard
2. Click the "Update Google Sheet" button
3. Configure your export options:
   - **Date Range**: Select the start and end dates
   - **Record Type**: Choose Collections, Expenses, or Both
   - **Spreadsheet ID**: Verify or update if needed
4. Click "Test Connection" to ensure everything is working
5. Click "Update Google Sheets" to export the data

### What Gets Exported

#### Collections Sheet
- Date
- Description
- Control Number
- Payment Method
- General Tithes & Offering
- Sisterhood San Juan
- Youth
- Sunday School
- Bank Interest
- Miscellaneous
- Operating Funds
- Sisterhood Cabiao
- Total Amount
- Created By
- Last Updated

#### Expenses Sheet
- Date
- Description
- Category
- Forms Number
- Workers Share
- Supplies & Materials
- Utilities
- Repairs & Maintenance
- Transportation
- Communication
- Others
- Total Amount
- Created By
- Last Updated

#### Summary Sheet (when exporting both)
- Total Collections
- Total Expenses
- Net Balance
- Record Counts

## 🔧 Troubleshooting

### "Google Sheets service not configured" Error

**Solution:**
- Verify `google-credentials.json` exists in `backend/config/`
- Check that the JSON file is valid (open it in a text editor)
- Restart the backend server

### "Failed to connect to Google Sheets" Error

**Solutions:**
- Verify you've shared the spreadsheet with the service account email
- Check that the service account has "Editor" permissions
- Verify the Spreadsheet ID is correct
- Make sure Google Sheets API is enabled in Google Cloud Console

### "Permission denied" Error

**Solutions:**
- Share the spreadsheet with the service account email (from `google-credentials.json`)
- Give the service account "Editor" permissions
- Wait a few minutes for permissions to propagate

### No Data Appearing in Sheets

**Solutions:**
- Verify sheet names are exactly: "Collections", "Expenses", "Summary"
- Check that you have data in the selected date range
- Look at the browser console for error messages
- Check backend logs for detailed error information

## 🔐 Security Best Practices

1. **Protect Your Credentials**
   - Never commit `google-credentials.json` to git
   - Keep the file secure and backed up
   - The file is already in `.gitignore`

2. **Limit Service Account Permissions**
   - Only share spreadsheets that need to be updated
   - Use "Editor" permissions (not "Owner")
   - Regularly review shared spreadsheets

3. **Backup Your Data**
   - Google Sheets has version history
   - Create regular backups of your spreadsheet
   - The export replaces existing data, so previous exports are lost

## 📱 Tips & Best Practices

1. **Regular Exports**
   - Export financial data weekly or monthly
   - Keep a consistent schedule for record-keeping

2. **Data Validation**
   - Always verify the date range before exporting
   - Use "Test Connection" before exporting

3. **Sheet Organization**
   - Don't manually modify sheet names
   - You can format cells (colors, fonts) without affecting exports
   - Add additional sheets for analysis without affecting exports

4. **Multiple Spreadsheets**
   - You can export to different spreadsheets for different purposes
   - Just change the Spreadsheet ID in the export modal

## 🎉 Success!

Once set up, you can easily export your financial records to Google Sheets with just a few clicks!

## 📞 Support

If you encounter issues:
1. Check this troubleshooting guide
2. Review backend logs for detailed error messages
3. Verify all setup steps were completed
4. Contact your technical administrator

---

## 🔄 File Locations

- **Service Account Credentials**: `backend/config/google-credentials.json`
- **Backend Service**: `backend/services/googleSheetsService.js`
- **API Routes**: `backend/routes/googleSheets.js`
- **Frontend Modal**: `frontend/src/components/UpdateGoogleSheetModal.js`

---

*Built for SBCC Financial Management System*
