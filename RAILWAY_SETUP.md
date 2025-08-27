# Railway Persistent Storage Setup

## ⚠️ CRITICAL: Your Data is Not Persisting!

The Google Forms submissions are being saved successfully BUT they're lost on every Railway restart/redeploy because the database is in temporary storage. Here's how to fix it:

## Steps to Enable Persistent Storage on Railway:

### Option 1: Add a Volume (Recommended)

1. **Go to your Railway project dashboard**
   - Navigate to your Railway project

2. **Add a Persistent Volume:**
   - Click on your service (sbcc-financial-system)
   - Go to the "Settings" tab
   - Scroll down to "Volumes"
   - Click "Mount Volume" or "Add Volume"
   - Set Mount Path: `/app/data`
   - Set Size: 1GB (should be sufficient for years of data)
   - Click "Deploy"

### Option 2: Use Environment Variable (Temporary Fix)

If volumes aren't available on your Railway plan:
1. Go to Variables tab in Railway
2. Add: `DATABASE_PATH=/app/backend/church_financial.db`
3. Redeploy

Note: Option 2 still uses container storage but in a more stable location

3. **Redeploy the Application:**
   - After adding the volume, trigger a new deployment
   - You can do this by pushing to your repository or clicking "Redeploy" in Railway

4. **Verify the Setup:**
   - Check the deployment logs for: "Connected to SQLite database"
   - Test form submissions through Google Forms
   - Verify data persists after a redeploy

## What Changed:

1. **Database Path:** Changed from `/tmp/church_financial.db` to `/app/data/church_financial.db`
2. **Railway Config:** Added `railway.toml` with volume mount configuration
3. **Dockerfile:** Updated to create the `/app/data` directory

## Testing Persistent Storage:

After setting up the volume:
1. Submit a test form through Google Forms
2. Check the dashboard to see if the record appears
3. Trigger a redeploy in Railway
4. Check if the data is still there after the redeploy

## Note:
- The volume must be attached BEFORE data is written
- Existing data in `/tmp` will be lost - you'll need to re-enter it
- Make sure to backup your database regularly

## Database Backup Command:
Once the volume is set up, you can backup the database using Railway CLI:
```bash
railway run sqlite3 /app/data/church_financial.db .dump > backup.sql
```