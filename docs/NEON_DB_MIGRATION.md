# Neon DB Migration Guide

> 📌 **The migration described here has been done** — production runs on Neon.
> Keep this as the reference for the connection setup and as the procedure if the
> database ever moves again.
>
> One correction: the steps below set environment variables in the **Railway**
> dashboard. The API now runs as Vercel serverless functions, so `DATABASE_URL`
> and friends are set in the **Vercel** project settings instead.

## 🎯 Overview

This guide walks you through migrating from Supabase to Neon DB, a serverless PostgreSQL platform that's ideal for hobby projects and production applications.

## 📋 Prerequisites

- Access to Railway dashboard (backend hosting)
- Database admin access (if migrating existing data)
- 30 minutes of time

## ⚡ Why Neon DB?

| Feature | Supabase Free | Neon DB Free |
|---------|---------------|--------------|
| Database Pausing | ✗ Pauses after inactivity | ✓ Always-on |
| Storage | 500MB (with deletion policy) | 500MB (persistent) |
| Connections | 100 | 100 |
| Backups | Manual | Neon PITR; `scripts/backup-database.sh` for a manual dump |
| Best For | Full-stack apps with auth | Database-focused apps |

---

## 🚀 Step-by-Step Migration

### Step 1: Create Neon DB Account

1. **Sign up at** https://neon.tech
   - Use your Google or GitHub account (free, no credit card required)

2. **Create a new project:**
   - Click **"Create Project"**
   - Project Name: `sbcc-financial-system`
   - Region: `US East (Ohio)` or closest to your users
   - PostgreSQL Version: `16` (latest)
   - Click **"Create Project"**

### Step 2: Get Connection String

After project creation, you'll see your connection details:

```bash
# Format:
postgresql://[username]:[password]@[host]/[database]?sslmode=require

# Example:
postgresql://sbcc_user:AbCd1234XyZ@ep-cool-wave-123456.us-east-2.aws.neon.tech/sbcc_db?sslmode=require
```

**Copy this connection string** - you'll need it in the next step.

### Step 3: Update Railway Environment Variables

1. Go to **Railway Dashboard**: https://railway.app/dashboard

2. Select your backend service: **sbcc-financial-system-production**

3. Click **"Variables"** tab

4. Update/Add these variables:

   ```bash
   # Replace with your Neon connection string
   DATABASE_URL=postgresql://your-neon-connection-string

   # Enable PostgreSQL mode
   USE_POSTGRESQL=true

   # Keep these as is
   NODE_ENV=production
   JWT_SECRET=your-existing-secret
   ```

5. Click **"Deploy"** or wait for auto-deploy (2-3 minutes)

### Step 4: Verify Migration

After Railway redeploys:

#### Test 1: Health Check
```bash
curl https://sbcc-financial-system-production.up.railway.app/api/health
```

**Expected response:**
```json
{
  "status": "OK",
  "message": "SBCC Financial API is running",
  "database": "PostgreSQL",
  "timestamp": "2025-12-14T..."
}
```

#### Test 2: Database Connection
```bash
curl https://sbcc-financial-system-production.up.railway.app/api/test-db
```

**Expected response:**
```json
{
  "database": "PostgreSQL (Supabase)",
  "connected": true,
  "serverTime": "2025-12-14T12:00:00.000Z",
  "userCount": 1
}
```

#### Test 3: Login
1. Go to your frontend: https://sbcc-financial-system.vercel.app
2. Login with your admin account (`ADMIN_EMAIL` / `ADMIN_PASSWORD`)
3. If successful, database is working! ✅

### Step 5: Data Migration (If Needed)

#### Option A: Fresh Start (Recommended for Testing)
- Neon DB will auto-initialize with empty tables
- Admin user seeded from `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- **No action needed!**

#### Option B: Migrate Existing Data from Supabase

If you have important data in Supabase:

**1. Export from Supabase:**
```bash
# Install PostgreSQL client tools if not installed
brew install postgresql  # macOS
# OR
sudo apt-get install postgresql-client  # Linux

# Export database
pg_dump "postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres" \
  --no-owner --no-acl > supabase_backup.sql
```

**2. Import to Neon:**
```bash
# Clean import (recommended for migration)
psql "postgresql://[neon-connection-string]" < supabase_backup.sql
```

**3. Verify data:**
```bash
# Count users
psql "postgresql://[neon-connection-string]" \
  -c "SELECT COUNT(*) FROM users;"

# Count collections
psql "postgresql://[neon-connection-string]" \
  -c "SELECT COUNT(*) FROM collections;"
```

---

## 🔧 Troubleshooting

### Issue: "DATABASE_URL is not set"
**Solution:**
- Verify you added `DATABASE_URL` in Railway Variables
- Redeploy the service
- Check Railway logs: `railway logs`

### Issue: "Connection timeout"
**Solution:**
- Check Neon project status (should be green in dashboard)
- Verify connection string includes `?sslmode=require`
- Try adding `&connect_timeout=10` to connection string

### Issue: "Tables not created"
**Solution:**
1. Check Railway deployment logs for initialization messages
2. Look for: "PostgreSQL tables initialized successfully"
3. If not found, manually restart deployment

### Issue: "Authentication failed"
**Solution:**
- Double-check connection string (especially password)
- Ensure you copied the entire connection string with `?sslmode=require`
- Try resetting Neon password in dashboard

---

## 📊 Post-Migration Checklist

- [ ] Health endpoint returns "OK"
- [ ] Test database endpoint shows `userCount: 1`
- [ ] Can login to frontend
- [ ] Can view dashboard (collections/expenses)
- [ ] Can create new collection record
- [ ] Can create new expense record
- [ ] Google Forms integration still works

---

## 🎉 Success!

Your database is now on Neon DB! Benefits:

- ✅ **Always-on** - No more idle pausing
- ✅ **Persistent** - Data never gets deleted
- ✅ **Faster** - Serverless with instant cold starts
- ✅ **Free** - 500MB storage, unlimited queries

---

## 🔄 Rollback (If Needed)

If something goes wrong, you can rollback to Supabase:

1. Go to Railway → Variables
2. Change `DATABASE_URL` back to your Supabase connection string
3. Redeploy

---

## 📖 Next Steps

After successful migration:

1. **Confirm Neon's point-in-time restore window** covers what you need — it is
   the only automated backup since n8n was removed in August 2026
2. **Take a manual dump** with `scripts/backup-database.sh` before any schema change
3. **Check the mobile PWA** submits collections end to end (Google Forms
   ingestion was retired in August 2026)

---

## 🆘 Need Help?

- **Neon Docs**: https://neon.tech/docs
- **Railway Support**: https://railway.app/help
- **Check Logs**: `railway logs` in your project directory
