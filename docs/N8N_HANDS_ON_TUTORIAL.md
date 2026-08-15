# n8n Hands-On Tutorial: Build Automations from Scratch

> ⚠️ **Partly superseded (August 2026).**
>
> Part 1, the **Google Forms Processor**, targets `/api/forms/*`, which was
> removed when the Google Forms ingestion path was retired. It cannot be
> completed as written — collections now arrive through the mobile PWA. The
> backup and weekly-report parts still work; they use `/api/webhooks/*`.
>
> Wherever this tutorial sets `SBCC_API_URL` to a `railway.app` address, use
> `https://sbcc-financial-system.vercel.app` instead.

## 🎯 What You'll Build

By the end of this tutorial, you'll have created:
1. ⚠️ **Google Forms Processor** - Handle form submissions with retry logic *(retired — see the note above)*
2. **Daily Database Backup** - Auto-backup to Google Drive
3. **Weekly Financial Report** - Email summary every Monday

**Estimated Time:** 2-3 hours
**Difficulty:** Beginner-friendly

---

## 📋 Prerequisites Checklist

Before starting, make sure you have:

- [ ] n8n deployed on Railway (running at `https://your-n8n.up.railway.app`)
- [ ] Railway backend deployed with webhook routes (`/api/webhooks`)
- [ ] Gmail account with App Password created
- [ ] Google Drive folder for backups
- [ ] Neon DB connection string
- [ ] Coffee/tea ☕

---

## 🚀 Part 1: Deploy n8n on Railway (15 min)

### Step 1.1: Create New Railway Service

1. **Go to Railway Dashboard**: https://railway.app/dashboard

2. **Click "New Project"** → **"Deploy from GitHub repo"**

3. **Select:** `sbcc-financial-system` repository

4. **Configure:**
   - Service Name: `sbcc-n8n`
   - Root Directory: `/n8n`
   - Builder: Dockerfile

### Step 1.2: Set Environment Variables

Click **"Variables"** tab and add:

```bash
# Authentication
N8N_BASIC_AUTH_ACTIVE=true
N8N_BASIC_AUTH_USER=admin
N8N_BASIC_AUTH_PASSWORD=YourSecurePassword123!

# Host (Railway will provide the domain)
N8N_HOST=${{RAILWAY_STATIC_URL}}
N8N_PORT=5678
WEBHOOK_URL=https://${{RAILWAY_STATIC_URL}}

# Encryption Key (generate with: openssl rand -hex 32)
N8N_ENCRYPTION_KEY=paste-your-32-char-hex-here

# Your API
SBCC_API_URL=https://sbcc-financial-system-production.up.railway.app
WEBHOOK_SECRET=your-webhook-secret-key

# Database
NEON_DATABASE_URL=your-neon-connection-string

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-gmail-app-password
NOTIFICATION_EMAIL=admin@sbcc.church
```

### Step 1.3: Generate Encryption Key

Open terminal and run:
```bash
openssl rand -hex 32
```

Copy the output and paste into `N8N_ENCRYPTION_KEY`

### Step 1.4: Deploy

1. Click **"Deploy"**
2. Wait 2-3 minutes for build
3. Check **"Deployments"** tab for success ✅
4. Click the generated URL (like `sbcc-n8n.up.railway.app`)

### Step 1.5: Login to n8n

1. Browser opens with login screen
2. Enter credentials from Step 1.2
3. You should see n8n dashboard! 🎉

**✅ Checkpoint:** Can you access n8n dashboard?

---

## 🎓 Part 2: n8n Basics (10 min)

### Understanding n8n Concepts

**Workflow:** A series of connected nodes that automate a task
**Node:** A single step in the workflow (like "send email" or "query database")
**Trigger:** The starting point of a workflow (schedule, webhook, etc.)
**Connection:** Data flows between nodes through connections

### The n8n Interface

```
┌─────────────────────────────────────────┐
│  ⚙️ Settings   📊 Executions   ➕ New   │  ← Top menu
├─────────────────────────────────────────┤
│  📁 My Workflows                        │  ← Sidebar
│  ├─ Workflow 1                          │
│  └─ Workflow 2                          │
├─────────────────────────────────────────┤
│                                         │
│         [Canvas - drag nodes here]      │  ← Main area
│                                         │
│                                         │
├─────────────────────────────────────────┤
│  + Add Node                             │  ← Node panel
│  🔍 Search nodes...                     │
└─────────────────────────────────────────┘
```

**Quick Tips:**
- **Click canvas** to add nodes
- **Drag** to connect nodes
- **Click node** to configure
- **Green play button** to test workflow
- **Active toggle** to enable automation

---

## 🔨 Part 3: Build Workflow #1 - Google Forms Processor (45 min)

### What This Workflow Does

```
Form Submitted → Validate Data → Check User → Submit to API → Send Email
```

### Step 3.1: Create New Workflow

1. Click **"New"** button (top right)
2. Workflow name: `Google Forms to API`
3. Click **"Save"** (Ctrl+S)

### Step 3.2: Add Webhook Trigger

1. **Click the "+" button** on canvas
2. **Search:** "webhook"
3. **Select:** "Webhook" node
4. **Configure:**
   - **HTTP Method:** POST
   - **Path:** `google-form-collection`
   - **Respond:** Using 'Respond to Webhook' node
5. **Click "Execute Node"** to test
6. **Copy the Production URL** - you'll need this later!

Example URL: `https://your-n8n.up.railway.app/webhook/google-form-collection`

**💡 TIP:** This URL is what Google Forms will send data to!

### Step 3.3: Add Data Validation (IF Node)

1. **Click "+"** after the Webhook node
2. **Search:** "if"
3. **Select:** "IF" node
4. **Configure:**
   - **Condition 1:**
     - Value 1: `{{ $json.submitter_email }}`
     - Operation: `is not empty`
   - **Click "Add Condition"**
   - **Condition 2:**
     - Value 1: `{{ $json.date }}`
     - Operation: `is not empty`

**What this does:** Checks if email and date exist before proceeding

**🎯 Try It:**
- Click "Execute Node"
- See if it goes to "true" or "false" branch

### Step 3.4: Add HTTP Request - Validate User

1. **From the IF node's "true" output**, click "+"
2. **Search:** "HTTP Request"
3. **Select:** "HTTP Request" node
4. **Configure:**
   - **Method:** GET
   - **URL:** `{{ $env.SBCC_API_URL }}/api/forms/validate-user/{{ $json.submitter_email }}`
   - **Authentication:** None
   - **Options** → **Timeout:** 10000

**What this does:** Checks if the user is authorized to submit forms

**🎯 Try It:**
- Click "Execute Node"
- You should see a response with `canSubmit: true/false`

### Step 3.5: Add Another IF - Check Authorization

1. **After HTTP Request**, click "+"
2. **Add:** "IF" node
3. **Configure:**
   - **Condition:**
     - Value 1: `{{ $json.canSubmit }}`
     - Operation: `equal`
     - Value 2: `true`

### Step 3.6: Add HTTP Request - Submit to API

1. **From IF's "true" output**, click "+"
2. **Add:** "HTTP Request" node
3. **Configure:**
   - **Method:** POST
   - **URL:** `{{ $env.SBCC_API_URL }}/api/forms/collection`
   - **Send Body:** ON (toggle to yes)
   - **Body Content Type:** JSON
   - **Specify Body:** Using JSON
   - **JSON:**
   ```json
   {
     "submitter_email": "={{ $('Webhook').item.json.submitter_email }}",
     "date": "={{ $('Webhook').item.json.date }}",
     "description": "={{ $('Webhook').item.json.description }}",
     "general_tithes_offering": "={{ $('Webhook').item.json.general_tithes_offering || 0 }}",
     "sunday_school": "={{ $('Webhook').item.json.sunday_school || 0 }}",
     "brotherhood": "={{ $('Webhook').item.json.brotherhood || 0 }}"
   }
   ```
   - **Options** → **Retry on Fail:** ON
   - **Max Tries:** 3
   - **Wait Between Tries:** 2000ms

**💡 Understanding the JSON:**
- `$('Webhook')` references the Webhook node's data
- `.item.json.field_name` gets the specific field
- `|| 0` provides default value of 0 if empty

**What this does:** Sends the form data to your API with automatic retry!

### Step 3.7: Add Send Email - Success Notification

1. **After successful API call**, click "+"
2. **Search:** "Email Send"
3. **Add:** "Send Email" node
4. **First, add credentials:**
   - Click **"Create New Credential"**
   - **SMTP Host:** smtp.gmail.com
   - **SMTP Port:** 587
   - **User:** your-email@gmail.com
   - **Password:** your-gmail-app-password
   - **Click "Save"**

5. **Configure email:**
   - **From Email:** `{{ $env.SMTP_USER }}`
   - **To Email:** `{{ $('Webhook').item.json.submitter_email }}`
   - **Subject:** `Collection Submitted Successfully - SBCC`
   - **Email Type:** HTML
   - **Message:**
   ```html
   <h2>Collection Submitted Successfully!</h2>
   <p>Your collection has been recorded.</p>
   <p><strong>Control Number:</strong> {{ $json.control_number }}</p>
   <p><strong>Total Amount:</strong> ₱{{ $json.total_amount }}</p>
   <p>Thank you!</p>
   ```

### Step 3.8: Add Respond to Webhook - Success

1. **After Send Email**, click "+"
2. **Add:** "Respond to Webhook" node
3. **Configure:**
   - **Respond With:** JSON
   - **Response Body:**
   ```json
   {
     "success": true,
     "message": "Collection submitted successfully",
     "record_id": "={{ $('HTTP Request').item.json.record_id }}"
   }
   ```

### Step 3.9: Add Error Handling

1. **Go back to the IF node** (authorization check)
2. **From "false" output**, click "+"
3. **Add:** "Respond to Webhook" node
4. **Configure:**
   - **Respond With:** JSON
   - **Response Code:** 403
   - **Response Body:**
   ```json
   {
     "success": false,
     "error": "User not authorized"
   }
   ```

### Step 3.10: Test the Workflow

1. **Click the Webhook node**
2. **Copy the Test URL**
3. **Open Postman or use curl:**

```bash
curl -X POST https://your-n8n.up.railway.app/webhook-test/google-form-collection \
  -H "Content-Type: application/json" \
  -d '{
    "submitter_email": "admin@sbcc.church",
    "date": "2025-12-14",
    "description": "Test collection",
    "general_tithes_offering": 1000,
    "sunday_school": 200,
    "brotherhood": 150
  }'
```

4. **Check n8n Executions tab** to see the workflow run
5. **Check your email** for confirmation

### Step 3.11: Activate the Workflow

1. **Click "Active" toggle** (top right) to ON
2. **Click "Save"** (Ctrl+S)

**🎉 Congratulations!** Your first workflow is live!

---

## 📦 Part 4: Build Workflow #2 - Daily Database Backup (45 min)

### What This Workflow Does

```
Every Day 2 AM → Backup Database → Upload to Google Drive → Send Email
```

### Step 4.1: Create New Workflow

1. **Click "New"**
2. **Name:** `Daily Database Backup`
3. **Save**

### Step 4.2: Add Schedule Trigger

1. **Click "+" on canvas**
2. **Search:** "Schedule Trigger"
3. **Select:** "Schedule Trigger" node
4. **Configure:**
   - **Trigger Interval:** Cron
   - **Cron Expression:** `0 2 * * *` (2 AM daily)
   - **Or use:** Every Day at 2:00 AM

**💡 Understanding Cron:**
- `0 2 * * *` means: minute=0, hour=2, any day, any month, any day of week

### Step 4.3: Add PostgreSQL Node (Backup)

**First, add credentials:**

1. **Click Settings** (gear icon) → **Credentials**
2. **Click "+ Add Credential"**
3. **Search:** "Postgres"
4. **Select:** "Postgres"
5. **Parse connection string:**
   - Paste your Neon connection string
   - Example: `postgresql://user:pass@host.neon.tech:5432/dbname?sslmode=require`
   - Fill in fields:
     - **Host:** ep-xxx.us-east-2.aws.neon.tech
     - **Database:** your_db_name
     - **User:** your_user
     - **Password:** your_password
     - **Port:** 5432
     - **SSL:** Enabled
6. **Test connection** → Should see ✅
7. **Click "Save"**

**Now add the node:**

1. **After Schedule**, click "+"
2. **Search:** "Execute Command"
3. **Select:** "Execute Command" node
4. **Configure:**
   - **Command:**
   ```bash
   pg_dump "{{ $env.NEON_DATABASE_URL }}" > /tmp/sbcc_backup_{{ $now.format('YYYY-MM-DD_HH-mm') }}.sql && cat /tmp/sbcc_backup_*.sql
   ```

**⚠️ Note:** The Execute Command node might not be available in all n8n versions. If not available, we'll use an alternative approach.

### Step 4.4: Alternative - Use Code Node

If Execute Command isn't available:

1. **Add:** "Code" node instead
2. **Mode:** Run Once for All Items
3. **JavaScript Code:**
```javascript
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const timestamp = new Date().toISOString().split('T')[0];
const filename = `sbcc_backup_${timestamp}.sql`;

try {
  const { stdout, stderr } = await execPromise(
    `pg_dump "${process.env.NEON_DATABASE_URL}" > /tmp/${filename} && cat /tmp/${filename}`
  );

  return [{
    json: {
      filename: filename,
      backup_data: stdout,
      timestamp: new Date().toISOString()
    }
  }];
} catch (error) {
  throw new Error(`Backup failed: ${error.message}`);
}
```

### Step 4.5: Add Google Drive Upload

**First, add credentials:**

1. **Settings** → **Credentials** → **Add**
2. **Select:** "Google Drive OAuth2 API"
3. **Follow OAuth flow:**
   - You'll need Google Cloud Console
   - Enable Google Drive API
   - Create OAuth credentials
   - Add redirect URL: `https://your-n8n.up.railway.app/rest/oauth2-credential/callback`
4. **Click "Connect"** → Authorize
5. **Save**

**Add the node:**

1. **After backup node**, click "+"
2. **Search:** "Google Drive"
3. **Add:** "Google Drive" node
4. **Configure:**
   - **Operation:** Upload
   - **Binary Property:** (leave empty if using text)
   - **File Content:** `={{ $json.backup_data }}`
   - **File Name:** `={{ $json.filename }}`
   - **Parents:** Click and select your backup folder
   - Or enter **Folder ID** from Google Drive URL

**💡 Get Folder ID:**
- Go to Google Drive
- Create folder "SBCC Backups"
- Open folder
- URL: `https://drive.google.com/drive/folders/1ABC...XYZ`
- Folder ID is: `1ABC...XYZ`

### Step 4.6: Add Cleanup Old Backups (Optional)

This is advanced, skip if you want to keep all backups for now.

### Step 4.7: Add Email Notification

1. **After Google Drive**, click "+"
2. **Add:** "Send Email" node
3. **Use existing SMTP credential**
4. **Configure:**
   - **To Email:** `{{ $env.NOTIFICATION_EMAIL }}`
   - **Subject:** `✅ Database Backup Successful - {{ $now.format('YYYY-MM-DD') }}`
   - **Email Type:** HTML
   - **Message:**
   ```html
   <h2>Database Backup Completed</h2>
   <p><strong>Date:</strong> {{ $now.format('YYYY-MM-DD HH:mm:ss') }}</p>
   <p><strong>File:</strong> {{ $('Google Drive').item.json.name }}</p>
   <p>Backup saved to Google Drive successfully.</p>
   ```

### Step 4.8: Test the Workflow

1. **Click "Execute Workflow"** button (top)
2. **Wait for completion** (may take 30-60 seconds)
3. **Check:**
   - ✅ Executions tab shows success
   - ✅ Google Drive has new backup file
   - ✅ Email received

### Step 4.9: Activate

1. **Toggle "Active"** to ON
2. **Save**

**🎉 Workflow #2 Complete!** Your database backs up daily at 2 AM!

---

## 📊 Part 5: Build Workflow #3 - Weekly Report (30 min)

### What This Workflow Does

```
Every Monday 8 AM → Query Database → Generate Report → Send Email
```

### Step 5.1: Create Workflow

1. **New workflow:** `Weekly Financial Report`
2. **Save**

### Step 5.2: Add Schedule Trigger

1. **Add:** "Schedule Trigger"
2. **Configure:**
   - **Cron:** `0 8 * * 1` (Monday at 8 AM)
   - **Or:** Every Week on Monday at 8:00 AM

### Step 5.3: Add PostgreSQL Query - Collections

1. **After trigger**, click "+"
2. **Add:** "Postgres" node
3. **Use existing credential**
4. **Configure:**
   - **Operation:** Execute Query
   - **Query:**
   ```sql
   SELECT
     COUNT(*) as count,
     SUM(total_amount) as total
   FROM collections
   WHERE date >= DATE_TRUNC('week', NOW()) - INTERVAL '1 week'
     AND date < DATE_TRUNC('week', NOW())
   ```

**What this does:** Gets last week's collections total

### Step 5.4: Add PostgreSQL Query - Expenses

1. **After collections query**, click "+"
2. **Add:** "Postgres" node
3. **Configure:**
   - **Operation:** Execute Query
   - **Query:**
   ```sql
   SELECT
     COUNT(*) as count,
     SUM(total_amount) as total
   FROM expenses
   WHERE date >= DATE_TRUNC('week', NOW()) - INTERVAL '1 week'
     AND date < DATE_TRUNC('week', NOW())
   ```

### Step 5.5: Add Code Node - Calculate Summary

1. **After both queries**, click "+"
2. **Add:** "Code" node
3. **JavaScript:**
```javascript
// Get data from previous nodes
const collectionsData = $input.all()[0].json;
const expensesData = $input.all()[1].json;

const collections = {
  count: collectionsData[0]?.count || 0,
  total: parseFloat(collectionsData[0]?.total || 0)
};

const expenses = {
  count: expensesData[0]?.count || 0,
  total: parseFloat(expensesData[0]?.total || 0)
};

const netBalance = collections.total - expenses.total;

return [{
  json: {
    period: 'Last Week',
    collections,
    expenses,
    netBalance,
    formatted: {
      collectionsTotal: '₱' + collections.total.toLocaleString(),
      expensesTotal: '₱' + expenses.total.toLocaleString(),
      netBalance: '₱' + netBalance.toLocaleString()
    }
  }
}];
```

### Step 5.6: Add Send Email - Report

1. **After Code**, click "+"
2. **Add:** "Send Email"
3. **Configure:**
   - **To:** `{{ $env.NOTIFICATION_EMAIL }}`
   - **Subject:** `📊 Weekly Financial Report - SBCC`
   - **Email Type:** HTML
   - **Message:**
   ```html
   <h2>📊 Weekly Financial Report</h2>
   <h3>{{ $json.period }}</h3>

   <table style="width:100%; border-collapse: collapse;">
     <tr style="background: #f4f4f4;">
       <th style="padding: 10px; text-align: left;">Item</th>
       <th style="padding: 10px; text-align: right;">Amount</th>
     </tr>
     <tr>
       <td style="padding: 10px;">Total Collections</td>
       <td style="padding: 10px; text-align: right; color: green;">
         {{ $json.formatted.collectionsTotal }}
       </td>
     </tr>
     <tr>
       <td style="padding: 10px;">Total Expenses</td>
       <td style="padding: 10px; text-align: right; color: red;">
         {{ $json.formatted.expensesTotal }}
       </td>
     </tr>
     <tr style="background: #f4f4f4; font-weight: bold;">
       <td style="padding: 10px;">Net Balance</td>
       <td style="padding: 10px; text-align: right;">
         {{ $json.formatted.netBalance }}
       </td>
     </tr>
   </table>

   <p><small>Generated: {{ $now.format('YYYY-MM-DD HH:mm') }}</small></p>
   ```

### Step 5.7: Test & Activate

1. **Execute workflow**
2. **Check email**
3. **Activate** when satisfied

**🎉 All 3 Workflows Complete!**

---

## ✅ Part 6: Update Google Forms (15 min)

### Step 6.1: Get Webhook URLs

From your n8n workflows, copy the **Production URLs**:

Example: `https://your-n8n.up.railway.app/webhook/google-form-collection`

### Step 6.2: Update Collection Form

1. **Open your Google Form** (Collection)
2. **Extensions** → **Apps Script**
3. **Replace code** with `/google-forms-integration/Apps-Script-Collection-Form-N8N.js`
4. **Update line 14:**
   ```javascript
   const N8N_WEBHOOK_URL = 'https://your-actual-n8n-url.railway.app/webhook/google-form-collection';
   ```
5. **Save** (Ctrl+S)
6. **Run** `setupTrigger()` function

### Step 6.3: Test Google Form

1. **Submit a test form**
2. **Check n8n Executions** - should see workflow run
3. **Check database** - should have new record
4. **Check email** - should receive confirmation

---

## 🎓 What You Learned

- ✅ How to create workflows from scratch
- ✅ Using webhook triggers
- ✅ Connecting multiple nodes
- ✅ Writing expressions with `{{ }}`
- ✅ Error handling with IF nodes
- ✅ Retry logic for API calls
- ✅ Scheduling with cron
- ✅ Database queries
- ✅ Email notifications
- ✅ Google Drive integration

---

## 📚 Next Steps

1. **Explore n8n templates:** https://n8n.io/workflows
2. **Add Slack notifications** (optional)
3. **Create custom reports**
4. **Monitor executions regularly**

---

## 🆘 Common Issues

### "Node failed to execute"
- Check **Executions** tab for error details
- Verify credentials are connected
- Test with Execute Node button

### "Webhook not triggering"
- Ensure workflow is **Active**
- Check webhook URL is correct
- Test with Postman first

### "Email not sending"
- Verify Gmail App Password (not regular password)
- Check SMTP credentials
- Try sending test email from node

---

## 🎉 Congratulations!

You've built a complete automation system from scratch! You now understand:
- n8n workflow fundamentals
- How to connect different services
- Error handling and retry logic
- Scheduling automated tasks

**Keep experimenting and building more workflows!** 🚀
