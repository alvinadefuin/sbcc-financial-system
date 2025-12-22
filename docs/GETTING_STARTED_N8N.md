# Getting Started with n8n for SBCC Financial System

## Quick Start Guide

This guide helps you get started with n8n automation for your financial system.

---

## What You Have Now

✅ **Branch:** `feature/n8n-sheets-sync`
✅ **Backend API endpoints** for fetching financial data
✅ **n8n workflow template** for Database → Google Sheets sync
✅ **Comprehensive tutorials** for setup and configuration

---

## Two Approaches to Choose From

### Approach 1: Google Forms → API (Direct - Recommended for Forms)

**Use this for:** Submitting form data to your database

**Setup:**
1. Use Google Apps Script (already set up)
2. Script POSTs directly to your backend API
3. No n8n needed for this flow

**Benefits:**
- Simple, reliable, fast
- No middleware complexity
- Google's infrastructure

**Tutorial:** See existing Google Apps Script code in your Google Forms

---

### Approach 2: Database → Google Sheets (n8n - Recommended for Reporting)

**Use this for:** Syncing database records to Google Sheets for viewing/reporting

**Setup:**
1. Follow tutorial: `docs/N8N_SHEETS_SYNC_TUTORIAL.md`
2. Configure Google OAuth credentials
3. Import workflow: `n8n/workflows/2-database-to-sheets-sync.json`
4. Activate workflow

**Benefits:**
- Automated hourly sync
- Easy data viewing in spreadsheets
- Can share with non-technical users
- Perfect for reports and charts

**Tutorial:** `docs/N8N_SHEETS_SYNC_TUTORIAL.md` (30-45 minutes)

---

## Step-by-Step: Set Up Google Sheets Sync

### Prerequisites

- ✅ n8n running locally (`docker-compose up -d` in `n8n/` folder)
- ✅ Backend running (`npm run dev` in `backend/` folder)
- ✅ Google account

### Steps

1. **Read the architecture document:**
   ```bash
   cat docs/N8N_ARCHITECTURE.md
   ```

2. **Follow the tutorial:**
   ```bash
   cat docs/N8N_SHEETS_SYNC_TUTORIAL.md
   ```

3. **Test the workflow:**
   - Open n8n at `http://localhost:5678`
   - Import workflow from `n8n/workflows/2-database-to-sheets-sync.json`
   - Configure Google Sheets credentials
   - Execute manually to test
   - Activate for hourly sync

4. **View results:**
   - Open your Google Sheet
   - See Collections and Expenses tabs auto-populate!

---

## File Structure

```
sbcc-financial-system/
├── backend/
│   └── routes/
│       └── webhooks.js              # API endpoints for n8n
├── n8n/
│   ├── docker-compose.yml           # n8n Docker setup (updated)
│   ├── .env                         # Environment variables
│   └── workflows/
│       ├── 1-google-forms-to-api.json         # NOT USED (too complex)
│       └── 2-database-to-sheets-sync.json     # ✅ USE THIS ONE
└── docs/
    ├── N8N_ARCHITECTURE.md          # Why we chose this approach
    ├── N8N_SHEETS_SYNC_TUTORIAL.md  # Step-by-step setup guide
    ├── N8N_HANDS_ON_TUTORIAL.md     # Original learning tutorial
    └── GETTING_STARTED_N8N.md       # This file!
```

---

## Commands Cheat Sheet

### Start n8n (Local)
```bash
cd n8n
docker-compose up -d
```

### View n8n Logs
```bash
docker-compose logs -f
```

### Stop n8n
```bash
docker-compose down
```

### Restart n8n (after .env changes)
```bash
docker-compose down && docker-compose up -d
```

### Start Backend
```bash
cd backend
npm run dev
```

### Test API Endpoints
```bash
# Health check
curl http://localhost:3001/api/health

# Test collections endpoint (requires secret)
curl "http://localhost:3001/api/webhooks/collections-for-sheets?secret=change-this-secret&limit=10"

# Test expenses endpoint
curl "http://localhost:3001/api/webhooks/expenses-for-sheets?secret=change-this-secret&limit=10"
```

---

## Environment Variables

### n8n `.env` (Local Development)
```bash
# Location: n8n/.env

N8N_USER=admin
N8N_PASSWORD=admin123
N8N_HOST=localhost
WEBHOOK_URL=http://localhost:5678
N8N_ENCRYPTION_KEY=local-dev-key-not-for-production-use-123456789012
N8N_SECURE_COOKIE=false

# Important for workflows:
SBCC_API_URL=http://host.docker.internal:3001
WEBHOOK_SECRET=your-secure-secret-key-change-this
```

### Backend `.env.development` (already configured)
```bash
# Database URL points to Neon PostgreSQL
DATABASE_URL=postgresql://...
```

---

## Troubleshooting

### Issue: "Cannot connect to API"
**Fix:** Make sure backend is running on `http://localhost:3001`
```bash
cd backend
npm run dev
```

### Issue: "Invalid webhook secret"
**Fix:** Check `n8n/.env` has `WEBHOOK_SECRET` set, then restart n8n
```bash
cd n8n
docker-compose down && docker-compose up -d
```

### Issue: "Google Sheets authentication failed"
**Fix:** Follow OAuth setup in tutorial `docs/N8N_SHEETS_SYNC_TUTORIAL.md` Part 2 & 3

### Issue: n8n not starting
**Fix:** Check Docker is running
```bash
docker ps  # Should show sbcc-n8n container
```

---

## Next Steps

1. ✅ **Test locally** - Follow `N8N_SHEETS_SYNC_TUTORIAL.md`
2. ✅ **Verify sync works** - Check Google Sheets updates
3. ✅ **Customize schedule** - Change from hourly to your preference
4. 🚀 **Deploy to production** - Use Railway for backend + n8n

---

## Production Deployment (Future)

When ready to deploy:

1. **Deploy backend to Railway** (already done)
2. **Deploy n8n to Railway** (separate service)
3. **Update `.env` with production URLs**
4. **Re-configure Google OAuth** with production redirect URL
5. **Test workflows in production**

---

## Summary

**Use Case 1: Form Submission**
- ✅ Google Apps Script → API → Database
- Simple, direct, reliable

**Use Case 2: Data Reporting**
- ✅ n8n → API → Google Sheets
- Automated, scheduled, powerful

**Best of both worlds!** 🎉

---

## Need Help?

- **Architecture:** `docs/N8N_ARCHITECTURE.md`
- **Setup Tutorial:** `docs/N8N_SHEETS_SYNC_TUTORIAL.md`
- **n8n Docs:** https://docs.n8n.io/
- **API Endpoints:** See `backend/routes/webhooks.js`

Happy automating! 🚀
