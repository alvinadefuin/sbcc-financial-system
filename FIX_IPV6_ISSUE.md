# 🚨 URGENT: Fix IPv6 Connection Issue

## The Problem
Your production API is trying to connect to Supabase using IPv6 address:
```
connect ENETUNREACH 2406:da18:243:7415:7356:d2b3:e220:b6e:5432
```

Railway's network doesn't support IPv6 connections to external services properly.

## The Solution

### Option 1: Force IPv4 Connection (RECOMMENDED)

1. **Go to your Supabase Dashboard**
2. **Get the IPv4 connection string:**
   - Go to Settings → Database
   - Look for "Connection pooling" section
   - Use the **Pooler** connection string (not direct)
   - It should look like: `postgresql://postgres:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres`

3. **Update Railway Environment Variable:**
   - Go to Railway → Variables
   - Update `DATABASE_URL` with the pooler connection string
   - This uses Supabase's connection pooler which is IPv4-only

### Option 2: Use Direct IPv4 Host

1. **Find the IPv4 address of your Supabase database:**
   ```bash
   # Get your Supabase host from the connection string
   # Example: db.xxxxxxxxxxxx.supabase.co
   
   # Find its IPv4 address
   nslookup -type=A db.xxxxxxxxxxxx.supabase.co
   ```

2. **Update connection string to use IP directly:**
   ```
   postgresql://postgres:[PASSWORD]@[IPv4-ADDRESS]:5432/postgres
   ```
   
   ⚠️ Note: This is less reliable as IPs can change

### Option 3: Add Connection Pooling Fix in Code

Add this to Railway environment variables:
```
NODE_OPTIONS=--dns-result-order=ipv4first
```

This forces Node.js to prefer IPv4 addresses.

## Quick Test

After updating the DATABASE_URL, test with:
```bash
curl -X POST https://sbcc-financial-system-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sbcc.church","password":"admin123"}'
```

Should return a JWT token if successful!

## Why This Happens

- Supabase provides both IPv4 and IPv6 addresses
- Railway's container network has issues with IPv6 external connections
- Node.js prefers IPv6 when available
- The connection pooler only uses IPv4, avoiding the issue

## Permanent Fix

Always use the **Pooler connection string** from Supabase for Railway deployments!