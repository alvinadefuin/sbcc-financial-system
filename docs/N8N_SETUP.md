# n8n Automation Setup Guide

## 🤖 Overview

This guide will help you deploy n8n and set up automated workflows for:
- ✅ Database to Google Sheets sync (hourly)
- ✅ Daily database backups to Google Drive
- ✅ Weekly financial reports via email
- ✅ Budget alerts and monitoring

**Note:** We do NOT use n8n for Google Forms → API submission. That uses Google Apps Script directly for simplicity.

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

5. **Access your n8n instance**:
   ```
   https://your-n8n.up.railway.app
   ```

### Option 2: Local Development

See `docs/GETTING_STARTED_N8N.md` for local Docker setup.

---

## 📦 Available Workflows

### Workflow 1: Database to Google Sheets Sync

**File:** `n8n/workflows/2-database-to-sheets-sync.json`

**What it does:**
- Runs every hour
- Fetches all collections and expenses from database
- Updates Google Sheets with latest data
- Perfect for viewing/reporting

**Setup Tutorial:** `docs/N8N_SHEETS_SYNC_TUTORIAL.md`

**Status:** ✅ Ready to use

---

### Workflow 2: Daily Database Backup (Future)

**What it will do:**
- Runs daily at 2 AM
- Exports PostgreSQL database
- Uploads to Google Drive
- Keeps last 7 backups

**Status:** 🚧 Not yet implemented

---

### Workflow 3: Weekly Financial Report (Future)

**What it will do:**
- Runs every Monday at 9 AM
- Fetches previous week's data
- Generates summary
- Emails to church leaders

**Status:** 🚧 Not yet implemented

---

### Workflow 4: Budget Alert Notifications (Future)

**What it will do:**
- Runs daily at 8 AM
- Checks budget utilization
- Sends alert if >80% spent
- Email/Slack notification

**Status:** 🚧 Not yet implemented

---

## 🔧 Configuration

### Environment Variables

Required for all workflows:
```bash
SBCC_API_URL=https://your-backend.up.railway.app
WEBHOOK_SECRET=your-secret-key
```

Required for Google Sheets sync:
- Google Sheets OAuth2 credentials (see tutorial)

Required for email workflows:
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-gmail-app-password
NOTIFICATION_EMAIL=admin@sbcc.church
```

Required for backup workflows:
```bash
NEON_DATABASE_URL=postgresql://user:pass@host.neon.tech:5432/dbname
```

---

## 🧪 Testing

### Test Backend API Endpoints

```bash
# Health check
curl https://your-backend.up.railway.app/api/health

# Test collections endpoint (requires secret)
curl "https://your-backend.up.railway.app/api/webhooks/collections-for-sheets?secret=your-secret&limit=5"

# Test expenses endpoint
curl "https://your-backend.up.railway.app/api/webhooks/expenses-for-sheets?secret=your-secret&limit=5"
```

### Test n8n Workflows

1. **Go to n8n UI**
2. **Open workflow**
3. **Click "Execute Workflow"** (manual test)
4. **Check execution log**
5. **Verify results** (check Google Sheets)

---

## 📊 Monitoring

### View Execution History

1. Go to n8n UI
2. Click **"Executions"** in sidebar
3. See all workflow runs:
   - ✅ Green = Success
   - ❌ Red = Failed
   - 🟡 Yellow = Running

### Check Logs

**Railway logs:**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# View logs
railway logs
```

**Docker logs (local):**
```bash
cd n8n
docker-compose logs -f
```

---

## 🔐 Security

### Webhook Authentication

All webhook endpoints require secret:

**Query parameter:**
```bash
?secret=your-webhook-secret
```

**Header:**
```bash
-H "x-webhook-secret: your-webhook-secret"
```

### Best Practices

1. ✅ Change default passwords before production
2. ✅ Use HTTPS in production (Railway provides this)
3. ✅ Rotate secrets periodically
4. ✅ Monitor execution logs for errors
5. ✅ Use OAuth2 for Google services (not API keys)
6. ✅ Keep encryption key secure (never commit to git)

---

## 🚢 Deployment Checklist

### Pre-deployment

- [ ] Backend deployed to Railway
- [ ] Neon database configured
- [ ] Environment variables ready
- [ ] Google Cloud OAuth credentials created

### Deploy n8n

- [ ] Deploy n8n to Railway
- [ ] Set all environment variables
- [ ] Access n8n UI (https://your-n8n.up.railway.app)
- [ ] Create admin account

### Configure Workflows

- [ ] Set up Google Sheets OAuth credentials
- [ ] Import workflow: `2-database-to-sheets-sync.json`
- [ ] Configure Google Sheets document ID
- [ ] Test workflow manually
- [ ] Activate workflow

### Verify

- [ ] Test backend API endpoints
- [ ] Check workflow executions
- [ ] Verify Google Sheets updates
- [ ] Monitor execution logs

---

## 📚 Additional Resources

- **Architecture:** `docs/N8N_ARCHITECTURE.md`
- **Getting Started:** `docs/GETTING_STARTED_N8N.md`
- **Sheets Sync Tutorial:** `docs/N8N_SHEETS_SYNC_TUTORIAL.md`
- **n8n Documentation:** https://docs.n8n.io/
- **Railway Documentation:** https://docs.railway.app/

---

## 🆘 Troubleshooting

### Issue: Cannot access n8n UI

**Fix:** Check Railway deployment logs, ensure service is running

### Issue: "Invalid webhook secret"

**Fix:** Verify `WEBHOOK_SECRET` matches in both n8n and backend

### Issue: Google Sheets authentication failed

**Fix:** Re-authenticate OAuth2 credentials in n8n

### Issue: Workflow execution failed

**Fix:** Check execution logs in n8n UI for detailed error messages

### Issue: Backend API not responding

**Fix:** Verify `SBCC_API_URL` is correct and backend is deployed

---

## 📞 Support

For issues or questions:
1. Check execution logs in n8n
2. Review backend API logs in Railway
3. Consult documentation in `docs/` folder
4. Check n8n community: https://community.n8n.io/

---

Happy automating! 🚀
