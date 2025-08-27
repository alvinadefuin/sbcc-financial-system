# Railway Environment Variables Setup

## Required Variables for Supabase

You MUST add these variables in Railway Dashboard → Your Service → Variables tab:

### 1. DATABASE_URL (Required)
```
DATABASE_URL=postgresql://postgres:[YOUR_PASSWORD]@db.[PROJECT_ID].supabase.co:5432/postgres
```
Replace [YOUR_PASSWORD] with your actual Supabase password
Replace [PROJECT_ID] with your Supabase project ID

### 2. USE_POSTGRESQL (Required)
```
USE_POSTGRESQL=true
```

### 3. NODE_ENV (Should be set automatically)
```
NODE_ENV=production
```

### 4. PORT (Set automatically by Railway)
```
PORT=3000
```

## How to Add Variables:

1. Go to Railway dashboard
2. Click on your service (sbcc-financial-system)
3. Click "Variables" tab
4. Click "Raw Editor" or add one by one:
   - Click "+ New Variable"
   - Add name and value
   - Press Enter to save

## Verify Your Setup:

After adding variables and redeploying, check:

1. **Health Check:**
   ```
   https://sbcc-financial-system-production.up.railway.app/api/health
   ```
   Should return:
   ```json
   {
     "status": "OK",
     "message": "SBCC Financial API is running",
     "database": "PostgreSQL"
   }
   ```

2. **Database Test:**
   ```
   https://sbcc-financial-system-production.up.railway.app/api/test-db
   ```
   Should return connection info and user count

## Common Issues:

### "API endpoint not found" Error
- The app is using the production route handler
- Check if the deployment logs show "Using PostgreSQL database"
- Wait for full deployment to complete

### Database Connection Failed
- Double-check your DATABASE_URL is correct
- Ensure password doesn't have special characters that need escaping
- Check Supabase dashboard that database is running

### Still Using SQLite
- Make sure USE_POSTGRESQL=true is set
- DATABASE_URL must start with "postgresql://"
- Redeploy after setting variables