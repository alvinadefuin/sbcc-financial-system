# n8n Automation Setup Guide

## 🤖 Overview

This guide will help you deploy n8n and set up automated workflows for:
- ✅ Google Forms processing with retry logic
- ✅ Daily database backups to Google Drive
- ✅ Weekly financial reports via email
- ✅ Budget alerts and monitoring

---

## 🚀 Quick Start: Deploy n8n on Railway

### Option 1: One-Click Deploy (Recommended)

1. **Go to Railway**: https://railway.app/new

2. **Deploy from GitHub**:
   - Select your repository: `sbcc-financial-system`
   - Root Directory: `/n8n`
   - Click **"Deploy"**

3. **Set Environment Variables** in Railway:
   ```bash
   N8N_USER=admin
   N8N_PASSWORD=your-secure-password-123
   N8N_HOST=your-n8n.up.railway.app
   WEBHOOK_URL=https://your-n8n.up.railway.app
   N8N_ENCRYPTION_KEY=your-random-32-char-hex-string

   # Your API Configuration
   SBCC_API_URL=https://sbcc-financial-system-production.up.railway.app
   WEBHOOK_SECRET=your-webhook-secret

   # Database (for backups)
   NEON_DATABASE_URL=your-neon-connection-string

   # Email Configuration
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=your-gmail-app-password
   NOTIFICATION_EMAIL=admin@sbcc.church
   ```

4. **Generate Encryption Key**:
   ```bash
   openssl rand -hex 32
   ```

5. **Deploy** and wait 2-3 minutes

6. **Access n8n**:
   - URL: `https://your-n8n.up.railway.app`
   - Login with credentials from step 3

---

### Option 2: Local Testing (Docker)

```bash
cd n8n
cp .env.example .env
# Edit .env with your values
docker-compose up -d

# Access at: http://localhost:5678
```

---

## 📧 Gmail Setup (For Email Notifications)

n8n needs a Gmail App Password to send emails:

1. **Enable 2-Factor Authentication** on your Google account
   - https://myaccount.google.com/security

2. **Create App Password**:
   - Go to: https://myaccount.google.com/apppasswords
   - Select app: "Mail"
   - Select device: "Other (Custom name)" → Enter "n8n"
   - Click **"Generate"**
   - Copy the 16-character password

3. **Add to Railway Variables**:
   ```bash
   SMTP_USER=your-email@gmail.com
   SMTP_PASSWORD=abcd efgh ijkl mnop  # (spaces optional)
   ```

---

## 📊 Import Workflows

After n8n is running:

### 1. Login to n8n Dashboard

Visit: `https://your-n8n.up.railway.app`

### 2. Import Workflows

1. Click **"Workflows"** → **"Import"**
2. Upload these files from `/n8n/workflows/`:
   - `1-google-forms-to-api.json` - Google Forms processing
   - `2-database-backup.json` - Daily backups
   - `3-weekly-financial-report.json` - Weekly reports

3. For each workflow:
   - Click workflow name
   - Update credentials (Google Drive, PostgreSQL, SMTP)
   - Click **"Active"** toggle to enable
   - Click **"Save"**

---

## 🔧 Configure Credentials

### PostgreSQL (Neon DB)

1. Click **Settings** (gear icon) → **Credentials** → **Add Credential**
2. Select **"PostgreSQL"**
3. Enter:
   ```
   Name: Neon PostgreSQL
   Host: ep-cool-wave-123456.us-east-2.aws.neon.tech
   Database: sbcc_db
   User: sbcc_user
   Password: your-neon-password
   Port: 5432
   SSL: Enabled
   ```

### Google Drive

1. Click **Add Credential** → **"Google Drive OAuth2 API"**
2. Follow OAuth setup:
   - Use same Google Cloud project as your app
   - Enable Google Drive API
   - Add OAuth redirect: `https://your-n8n.up.railway.app/rest/oauth2-credential/callback`
3. Enter Client ID and Secret
4. Click **"Connect"**
5. Create a folder for backups and copy its ID from URL

### SMTP (Gmail)

1. Click **Add Credential** → **"SMTP"**
2. Enter:
   ```
   Name: Gmail SMTP
   Host: smtp.gmail.com
   Port: 587
   User: your-email@gmail.com
   Password: your-app-password
   Secure: No (uses STARTTLS)
   ```

---

## 🔗 Configure Webhooks

### Get Webhook URLs

For each workflow with a webhook trigger:

1. Open workflow in n8n
2. Click the **"Webhook"** node
3. Copy the **"Production URL"**

Example:
```
https://your-n8n.up.railway.app/webhook/google-form-collection
https://your-n8n.up.railway.app/webhook/google-form-expense
```

### Update Google Forms Apps Script

1. Go to your Google Form
2. **Extensions** → **Apps Script**
3. Replace with new scripts from `/google-forms-integration/`:
   - Collection: `Apps-Script-Collection-Form-N8N.js`
   - Expense: `Apps-Script-Expense-Form-N8N.js`

4. Update `N8N_WEBHOOK_URL` in each script:
   ```javascript
   const N8N_WEBHOOK_URL = 'https://your-n8n.up.railway.app/webhook/google-form-collection';
   ```

5. **Save** and **Run** `setupTrigger()`

---

## 🧪 Test Workflows

### Test 1: Google Forms Processing

1. In Apps Script, run `testFormSubmission()`
2. Check n8n **Executions** tab for successful run
3. Verify email notification was sent
4. Check database for new record

### Test 2: Database Backup

1. In n8n, open "Database Backup" workflow
2. Click **"Execute Workflow"** button
3. Check Google Drive for backup file
4. Verify email notification

### Test 3: Weekly Report

1. Open "Weekly Financial Report" workflow
2. Click **"Execute Workflow"**
3. Check email for financial report
4. Verify data accuracy

---

## 📅 Workflow Schedule Summary

| Workflow | Schedule | Action |
|----------|----------|--------|
| Google Forms | On webhook trigger | Process form submissions |
| Database Backup | Daily at 2:00 AM | Backup to Google Drive |
| Weekly Report | Monday at 8:00 AM | Email financial summary |

---

## 🔍 Monitoring & Logs

### View Execution History

1. Click **"Executions"** in n8n
2. See all workflow runs (success/failure)
3. Click any execution to see details

### Common Issues

**Workflow Failed: "Connection timeout"**
- Check database connection credentials
- Verify Neon DB is active

**Webhook not triggering**
- Verify webhook URL in Google Apps Script
- Check n8n workflow is "Active"
- Test with Apps Script `testFormSubmission()`

**Email not sending**
- Verify Gmail App Password
- Check SMTP credentials in n8n
- Ensure 2FA is enabled on Google account

---

## 🎯 Advanced Configuration

### Add Slack Notifications (Optional)

1. Create Slack webhook: https://api.slack.com/messaging/webhooks
2. In n8n workflows, add **"Slack"** node after success/error
3. Configure with your webhook URL

### Add More Report Types

Create custom reports by:
1. Duplicating "Weekly Report" workflow
2. Modify SQL queries for different data
3. Update schedule (daily, monthly, etc.)

### Budget Alert Thresholds

Edit "Budget Alerts" workflow:
- Modify threshold from 80% to your preference
- Add email recipients
- Customize alert message

---

## 🔐 Security Best Practices

1. **Change default passwords** immediately
2. **Use strong encryption key** (32+ characters)
3. **Enable HTTPS** on n8n (Railway does this automatically)
4. **Limit webhook access** with `WEBHOOK_SECRET`
5. **Regularly rotate** Gmail App Passwords

---

## 📖 Architecture Diagram

```
Google Forms
    ↓
Google Apps Script
    ↓
n8n Webhook (validation + retry)
    ↓
Railway API (Express)
    ↓
Neon DB (PostgreSQL)
    ↓
Your Frontend (Vercel)

Side Workflows:
- n8n → Google Drive (backups)
- n8n → Gmail (notifications)
- n8n → PostgreSQL (reports)
```

---

## 🆘 Troubleshooting

### n8n won't start on Railway
- Check logs: `railway logs -s n8n`
- Verify all environment variables are set
- Check port binding (should be 5678)

### Workflows not executing
- Ensure workflow is **Active** (toggle on)
- Check n8n logs in Executions tab
- Verify credentials are connected

### Backups failing
- Test PostgreSQL connection manually
- Check Google Drive permissions
- Verify `pg_dump` is available in n8n container

---

## 🎉 Success Checklist

- [ ] n8n deployed and accessible
- [ ] All 3 workflows imported and active
- [ ] Credentials configured (PostgreSQL, Gmail, Google Drive)
- [ ] Google Forms updated with n8n webhook URLs
- [ ] Test submission successful
- [ ] Daily backup working
- [ ] Weekly report received

---

## 📚 Next Steps

1. **Monitor for 1 week** to ensure all automations work
2. **Create additional workflows** as needed
3. **Set up monitoring** (optional: Uptime Robot for n8n)
4. **Document custom workflows** for your team

---

## 🔗 Resources

- n8n Docs: https://docs.n8n.io
- Community: https://community.n8n.io
- Templates: https://n8n.io/workflows
- Your Workflows: `/n8n/workflows/`
