# n8n Database to Google Sheets Sync Tutorial

## Overview

This tutorial guides you through setting up an **automated hourly sync** from your Neon PostgreSQL database to Google Sheets using n8n.

**What it does:**
- Fetches all collections and expenses from your database every hour
- Updates two Google Sheets tabs: "Collections" and "Expenses"
- Keeps your spreadsheet in sync with your database automatically

**Time:** 30-45 minutes

---

## Prerequisites

- ✅ n8n running locally (from previous tutorial)
- ✅ Backend API running on `http://localhost:3001`
- ✅ Google account for Google Sheets
- ✅ Google Cloud Console access (for OAuth setup)

---

## Part 1: Create Google Sheets Template

### Step 1.1: Create New Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Click **"+ Blank"** to create new spreadsheet
3. Name it: **"SBCC Financial Records"**
4. **Copy the Spreadsheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[THIS-IS-YOUR-SPREADSHEET-ID]/edit
   ```
   Save this ID for later!

### Step 1.2: Create Collections Sheet

1. **Rename Sheet1** to **"Collections"**
2. **Add headers** in Row 1:
   ```
   | ID | Date | Control Number | Description | Tithes & Offerings | Sunday School | Youth | Sisterhood SJ | Sisterhood Labuin | Brotherhood | Bank Interest | Total Amount | Created By | Created At | Updated At |
   ```

3. **Format the sheet:**
   - Select Row 1 → **Bold** and **Background color: Light blue**
   - Select columns with amounts → **Format** → **Number** → **Currency**
   - Freeze Row 1: **View** → **Freeze** → **1 row**

### Step 1.3: Create Expenses Sheet

1. **Add new sheet**: Click **"+"** at bottom
2. **Name it:** **"Expenses"**
3. **Add headers** in Row 1:
   ```
   | ID | Date | Description | Category | PBCM Share | Pastoral Support | CAP Assistance | Honorarium | Conference/Seminar | Fellowship | Anniversary/Christmas | Supplies | Utilities | Vehicle Maintenance | LTO Registration | Transportation | Building Maintenance | ABCCOP National | CBCC Share | Kabalikat Share | ABCCOP Community | Total Amount | Created By | Created At | Updated At |
   ```

4. **Format the sheet:**
   - Select Row 1 → **Bold** and **Background color: Light orange**
   - Select amount columns → **Format** → **Number** → **Currency**
   - Freeze Row 1: **View** → **Freeze** → **1 row**

**Save the spreadsheet!** ✅

---

## Part 2: Set Up Google Cloud OAuth

### Step 2.1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** → **"New Project"**
3. **Project name:** `SBCC n8n Integration`
4. Click **"Create"**
5. Wait for project to be created (~30 seconds)

### Step 2.2: Enable Google Sheets API

1. In your project, go to **"APIs & Services"** → **"Library"**
2. Search: **"Google Sheets API"**
3. Click on it → Click **"Enable"**
4. Wait for API to be enabled

### Step 2.3: Create OAuth Credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"+ Create Credentials"** → **"OAuth client ID"**
3. If prompted, configure **OAuth consent screen**:
   - **User Type:** External
   - **App name:** `SBCC n8n Integration`
   - **User support email:** Your email
   - **Developer contact:** Your email
   - Click **"Save and Continue"**
   - **Scopes:** Skip (click "Save and Continue")
   - **Test users:** Add your email
   - Click **"Save and Continue"**

4. **Create OAuth Client ID:**
   - **Application type:** Web application
   - **Name:** `n8n Local`
   - **Authorized redirect URIs:** Click **"+ Add URI"**
   - Add: `http://localhost:5678/rest/oauth2-credential/callback`
   - Click **"Create"**

5. **Save your credentials:**
   - **Client ID:** Copy and save
   - **Client Secret:** Copy and save
   - Click **"OK"**

---

## Part 3: Configure n8n Google Sheets Credentials

### Step 3.1: Add Google Sheets OAuth Credentials

1. Open n8n at `http://localhost:5678`
2. Click **Settings** (gear icon) in top right
3. Click **"Credentials"** in sidebar
4. Click **"+ Add Credential"**
5. Search: **"Google Sheets OAuth2 API"**
6. **Configure:**
   - **Client ID:** Paste from Google Cloud Console
   - **Client Secret:** Paste from Google Cloud Console
   - **Authorization URL:** (leave default)
   - **Access Token URL:** (leave default)
   - **Scope:** (leave default)

7. Click **"Connect my account"**
8. **Sign in with Google** → Select your account
9. **Grant permissions** → Click **"Allow"**
10. You should see **"Connected successfully"** ✅
11. Click **"Save"**

---

## Part 4: Import and Configure the Workflow

### Step 4.1: Import the Workflow

1. In n8n, click **"Workflows"** in sidebar
2. Click **"+ Add workflow"** → **"Import from File"**
3. **Navigate to:**
   ```
   /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system/n8n/workflows/2-database-to-sheets-sync.json
   ```
4. Click **"Import"**
5. You should see the workflow with 7 nodes

### Step 4.2: Update Environment Variables

1. Open your `.env` file:
   ```bash
   cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system/n8n
   nano .env
   ```

2. **Add this line** (if not already there):
   ```bash
   WEBHOOK_SECRET=your-secure-secret-key-change-this
   ```

3. **Save and exit** (Ctrl+X, then Y, then Enter)

4. **Restart n8n:**
   ```bash
   docker-compose down && docker-compose up -d
   ```

5. **Wait 15 seconds**, then refresh your browser

### Step 4.3: Configure Google Sheets Nodes

**For each Google Sheets node (there are 4):**

1. **Clear Collections Sheet** node:
   - Click the node
   - **Document:** Click dropdown → Select **"SBCC Financial Records"**
   - **Sheet:** Select **"Collections"**
   - **Clear:** All Data

2. **Update Collections Sheet** node:
   - **Document:** Select **"SBCC Financial Records"**
   - **Sheet:** Select **"Collections"**
   - **Operation:** Append or Update
   - **Columns:** Auto-map Input Data
   - **Matching Columns:** `id`

3. **Clear Expenses Sheet** node:
   - **Document:** Select **"SBCC Financial Records"**
   - **Sheet:** Select **"Expenses"**
   - **Clear:** All Data

4. **Update Expenses Sheet** node:
   - **Document:** Select **"SBCC Financial Records"**
   - **Sheet:** Select **"Expenses"**
   - **Operation:** Append or Update
   - **Columns:** Auto-map Input Data
   - **Matching Columns:** `id`

5. **Save the workflow** (top right)

---

## Part 5: Test the Workflow

### Step 5.1: Manual Test

1. Make sure your **backend is running**:
   ```bash
   cd /Users/alvinadefuin/Desktop/dev_projects/sbcc-financial-system/backend
   npm run dev
   ```

2. In n8n, click **"Execute workflow"** button (top right)

3. **Watch the execution:**
   - Schedule trigger fires ✅
   - Fetch Collections from DB ✅
   - Fetch Expenses from DB ✅
   - Clear Collections Sheet ✅
   - Update Collections Sheet ✅
   - Clear Expenses Sheet ✅
   - Update Expenses Sheet ✅

4. **Check your Google Sheet** - you should see data! 🎉

### Step 5.2: Verify the Data

1. Open your **"SBCC Financial Records"** spreadsheet
2. **Collections tab** should have rows with:
   - ID, Date, Control Number, Description, amounts, etc.
3. **Expenses tab** should have rows with:
   - ID, Date, Description, Category, amounts, etc.

---

## Part 6: Activate Automatic Sync

### Step 6.1: Activate the Workflow

1. In n8n, click the **toggle switch** at top right (next to "Active")
2. Switch should turn **green** ✅
3. The workflow will now run **every hour automatically**

### Step 6.2: How It Works

**Schedule:**
- Runs every hour (e.g., 1:00 PM, 2:00 PM, 3:00 PM)
- Fetches latest 100 records from database
- Clears Google Sheets
- Writes fresh data to Google Sheets

**What happens:**
1. **1:00 PM** → Workflow runs → Sheets updated
2. **2:00 PM** → Workflow runs → Sheets updated
3. **3:00 PM** → Workflow runs → Sheets updated
4. And so on...

---

## Part 7: Customization Options

### Option 1: Change Sync Frequency

**To sync every 30 minutes:**
1. Click **"Schedule Every Hour"** node
2. **Interval:** Change from `1 hour` to `30 minutes`
3. **Save**

**To sync daily at 9 AM:**
1. **Trigger Interval:** Change to `Cron`
2. **Cron Expression:** `0 9 * * *`
3. **Save**

### Option 2: Filter by Date Range

**To sync only this month's records:**

1. Click **"Fetch Collections from DB"** node
2. **Options** → **Query Parameters** → **Add parameter**
3. **Name:** `startDate`
4. **Value:** `={{ $now.startOf('month').format('YYYY-MM-DD') }}`
5. **Add another parameter:**
6. **Name:** `endDate`
7. **Value:** `={{ $now.endOf('month').format('YYYY-MM-DD') }}`
8. Repeat for **"Fetch Expenses from DB"** node

### Option 3: Increase Record Limit

**To sync more than 100 records:**

1. Click **"Fetch Collections from DB"** node
2. **Options** → **Query Parameters**
3. Find `limit` parameter
4. **Value:** Change `100` to `500` (or any number)
5. Repeat for **"Fetch Expenses from DB"** node

---

## Part 8: Monitoring and Troubleshooting

### Check Workflow Executions

1. In n8n, click **"Executions"** in sidebar
2. You'll see a list of all workflow runs
3. **Green checkmark** = Success ✅
4. **Red X** = Failed ❌
5. Click any execution to see details

### Common Issues

**Issue: "Database error"**
- **Fix:** Make sure backend is running on `http://localhost:3001`
- **Test:** Open `http://localhost:3001/api/health` in browser

**Issue: "Invalid webhook secret"**
- **Fix:** Check `.env` file has `WEBHOOK_SECRET` set
- **Restart n8n** after changing `.env`

**Issue: "Google Sheets quota exceeded"**
- **Fix:** Reduce sync frequency (hourly → every 4 hours)
- **Google Sheets API has limits:** 100 read/write requests per 100 seconds

**Issue: "OAuth token expired"**
- **Fix:** Go to **Credentials** → Re-authenticate Google account
- **Click "Reconnect"** and grant permissions again

---

## Part 9: Production Deployment

When ready to deploy to Railway:

1. **Update `.env` for production:**
   ```bash
   SBCC_API_URL=https://sbcc-financial-system-production.up.railway.app
   WEBHOOK_SECRET=your-production-secret-change-this
   ```

2. **Update OAuth redirect URI:**
   - Go to Google Cloud Console
   - **Credentials** → Edit OAuth Client
   - **Add redirect URI:** `https://your-n8n.up.railway.app/rest/oauth2-credential/callback`
   - **Save**

3. **Re-authenticate in production n8n**

---

## Summary

✅ **What you built:**
- Automated hourly sync from PostgreSQL → Google Sheets
- Two-way sync: Collections and Expenses
- Secure OAuth authentication
- Configurable scheduling and filtering

✅ **What you learned:**
- Google Cloud OAuth setup
- n8n Google Sheets integration
- Scheduled workflows
- API endpoints for data export
- Workflow customization

✅ **Next steps:**
- Build **Workflow #3: Google Sheets → Database sync** (reverse direction)
- Build **Workflow #4: Weekly Financial Report Email**
- Build **Workflow #5: Budget Alert Notifications**

---

## Need Help?

- **n8n Documentation:** https://docs.n8n.io/
- **Google Sheets API:** https://developers.google.com/sheets/api
- **Backend API Docs:** See `/docs` folder

Happy automating! 🚀
