# n8n Automation Architecture

## Overview

This document explains the n8n automation architecture for the SBCC Financial System.

---

## Architecture Decision

### ❌ **What We're NOT Using n8n For:**

**Google Forms → n8n → API**
- Too complicated
- Adds unnecessary complexity
- Google Apps Script can POST directly to API
- No benefit from n8n middleware

### ✅ **What We ARE Using n8n For:**

**Database → Google Sheets Sync**
- Perfect use case for n8n
- Scheduled automation (hourly/daily)
- Data transformation and formatting
- Reliable, repeatable workflow

---

## Current Workflows

### Workflow 1: Google Form to API (Direct - No n8n)

```
┌──────────────┐      ┌─────────────────┐      ┌──────────┐      ┌──────────┐
│ Google Form  │─────▶│ Apps Script     │─────▶│ Backend  │─────▶│ Database │
│              │      │ (Direct POST)   │      │ API      │      │ (Neon)   │
└──────────────┘      └─────────────────┘      └──────────┘      └──────────┘
```

**Flow:**
1. User submits Google Form
2. Apps Script triggers `onSubmit()`
3. Script validates user via API
4. Script POSTs form data to `/api/forms/collection` or `/api/forms/expense`
5. Backend saves to Neon PostgreSQL database

**Benefits:**
- Simple, direct path
- No middleware complexity
- Google's reliable infrastructure
- Easy to debug

---

### Workflow 2: Database to Google Sheets Sync (n8n)

```
┌──────────────┐      ┌─────────────┐      ┌──────────────┐      ┌───────────────┐
│ Schedule     │─────▶│ n8n         │─────▶│ Backend API  │─────▶│ Google Sheets │
│ (Every Hour) │      │ Workflow    │      │ /webhooks/*  │      │               │
└──────────────┘      └─────────────┘      └──────────────┘      └───────────────┘
```

**Flow:**
1. n8n Schedule Trigger fires every hour
2. HTTP Request node calls `/api/webhooks/collections-for-sheets`
3. HTTP Request node calls `/api/webhooks/expenses-for-sheets`
4. Clear Collections sheet
5. Write collections data to sheet
6. Clear Expenses sheet
7. Write expenses data to sheet

**Benefits:**
- Automated, hands-off sync
- Keeps spreadsheet up-to-date
- Easy for non-technical users to view data
- Can be used for reports, charts, sharing

---

## API Endpoints for n8n

### Collections Endpoint

**GET** `/api/webhooks/collections-for-sheets`

**Query Parameters:**
- `secret` (required): Webhook secret for authentication
- `limit` (optional): Max records to return (default: all)
- `startDate` (optional): Filter by start date (YYYY-MM-DD)
- `endDate` (optional): Filter by end date (YYYY-MM-DD)

**Response:**
```json
{
  "success": true,
  "count": 25,
  "collections": [
    {
      "id": 1,
      "date": "2025-12-14",
      "control_number": "FORM-20251214-1030",
      "description": "Sunday Service Collection",
      "general_tithes_offering": 5000,
      "sunday_school": 500,
      "youth": 300,
      "sisterhood_san_juan": 200,
      "sisterhood_labuin": 150,
      "brotherhood": 400,
      "bank_interest": 50,
      "total_amount": 6600,
      "created_by": "member@sbcc.church",
      "created_at": "2025-12-14T10:30:00Z",
      "updated_at": "2025-12-14T10:30:00Z"
    }
  ]
}
```

### Expenses Endpoint

**GET** `/api/webhooks/expenses-for-sheets`

**Query Parameters:**
- `secret` (required): Webhook secret for authentication
- `limit` (optional): Max records to return (default: all)
- `startDate` (optional): Filter by start date (YYYY-MM-DD)
- `endDate` (optional): Filter by end date (YYYY-MM-DD)

**Response:**
```json
{
  "success": true,
  "count": 15,
  "expenses": [
    {
      "id": 1,
      "date": "2025-12-14",
      "description": "Monthly utilities payment",
      "category": "utilities",
      "pbcm_share_expense": 1000,
      "pastoral_worker_support": 5000,
      "cap_assistance": 0,
      "honorarium": 2000,
      "conference_seminar": 0,
      "fellowship_events": 500,
      "anniversary_christmas": 0,
      "supplies": 800,
      "utilities": 1500,
      "vehicle_maintenance": 0,
      "lto_registration": 0,
      "transportation_gas": 600,
      "building_maintenance": 0,
      "abccop_national": 500,
      "cbcc_share": 300,
      "kabalikat_share": 200,
      "abccop_community": 0,
      "total_amount": 12400,
      "created_by": "admin@sbcc.church",
      "created_at": "2025-12-14T14:00:00Z",
      "updated_at": "2025-12-14T14:00:00Z"
    }
  ]
}
```

---

## Environment Variables

### n8n `.env` Configuration

```bash
# Authentication
N8N_USER=admin
N8N_PASSWORD=admin123

# Host Configuration
N8N_HOST=localhost
WEBHOOK_URL=http://localhost:5678

# Security
N8N_ENCRYPTION_KEY=local-dev-key-not-for-production-use-123456789012
N8N_SECURE_COOKIE=false

# API Configuration
SBCC_API_URL=http://host.docker.internal:3001
WEBHOOK_SECRET=your-secure-secret-key-change-this

# Database (for future workflows)
NEON_DATABASE_URL=postgresql://user:pass@host.neon.tech:5432/dbname?sslmode=require

# Email (for future workflows)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-gmail-app-password
NOTIFICATION_EMAIL=your-email@gmail.com
```

---

## Security

### Webhook Authentication

All webhook endpoints require authentication via secret:

**Header-based:**
```bash
curl -H "x-webhook-secret: your-secret" \
  http://localhost:3001/api/webhooks/collections-for-sheets
```

**Query parameter:**
```bash
curl "http://localhost:3001/api/webhooks/collections-for-sheets?secret=your-secret"
```

### Best Practices

1. **Change default secrets** before production
2. **Use HTTPS** in production (Railway provides this)
3. **Rotate secrets** periodically
4. **Monitor webhook logs** for unauthorized attempts
5. **Use OAuth2** for Google Sheets (not API keys)

---

## Future Workflows (Ideas)

### Workflow 3: Google Sheets → Database (Reverse Sync)
- For manual data entry in sheets
- Sync back to database
- Conflict resolution

### Workflow 4: Weekly Financial Report Email
- Schedule: Every Monday 9 AM
- Fetch previous week's data
- Generate summary
- Email to church leaders

### Workflow 5: Budget Alert Notifications
- Schedule: Daily at 8 AM
- Check budget utilization
- Send alert if >80% spent
- Slack/Email notification

### Workflow 6: Database Backup to Google Drive
- Schedule: Daily at 2 AM
- Export PostgreSQL dump
- Upload to Google Drive
- Keep last 7 backups

---

## Monitoring

### n8n Execution History

1. Go to n8n UI
2. Click **"Executions"** in sidebar
3. View all workflow runs
4. Click any execution to see:
   - Input/output data
   - Execution time
   - Error details
   - Node-by-node breakdown

### Backend API Logs

Monitor webhook calls:
```bash
# View backend logs
cd backend
npm run dev

# Look for lines like:
# GET /api/webhooks/collections-for-sheets
# Response: 200 OK
```

---

## Deployment

### Local Development

```bash
# Start backend
cd backend
npm run dev

# Start n8n
cd ../n8n
docker-compose up -d

# View logs
docker-compose logs -f
```

### Production (Railway)

1. Deploy backend to Railway
2. Deploy n8n to Railway (separate service)
3. Update environment variables
4. Re-configure Google OAuth with production redirect URL
5. Test webhooks with production URLs

---

## Summary

✅ **Simple flow for forms:** Google Apps Script → API → Database

✅ **Powerful automation for sync:** n8n → API → Google Sheets

✅ **Secure authentication:** Webhook secrets + OAuth2

✅ **Scalable architecture:** Easy to add more workflows

✅ **Easy to maintain:** Clear separation of concerns

This architecture gives you the best of both worlds: simplicity where needed, automation where it shines! 🚀
