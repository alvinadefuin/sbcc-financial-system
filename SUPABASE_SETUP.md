# Supabase Setup Guide for SBCC Financial System

## Step 1: Create Your Free Supabase Account

1. Go to https://supabase.com
2. Click "Start your project"
3. Sign up with GitHub or email
4. No credit card required!

## Step 2: Create a New Project

1. Click "New project"
2. Enter these details:
   - **Name**: `sbcc-financial-system`
   - **Database Password**: Choose a strong password (save this!)
   - **Region**: Choose closest to you (e.g., Southeast Asia)
   - **Pricing Plan**: Free tier (selected by default)

3. Click "Create new project" and wait ~2 minutes for setup

## Step 3: Get Your Database Credentials

Once your project is ready:

1. Go to **Settings** (gear icon) → **Database**
2. Scroll to **Connection string**
3. Copy the **URI** under "Connection string" tab
4. It looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres`

## Step 4: Add to Railway Environment

1. Go to your Railway project
2. Click on your service (sbcc-financial-system)
3. Go to **Variables** tab
4. Add new variable:
   - **Name**: `DATABASE_URL`
   - **Value**: [Paste your Supabase connection string]
   
5. Also add:
   - **Name**: `USE_POSTGRESQL`
   - **Value**: `true`

## Step 5: Deploy

Railway will automatically redeploy with the new database connection!

## What You Get with Supabase Free Tier:

- ✅ 500MB Database storage
- ✅ Unlimited API requests  
- ✅ 2GB bandwidth
- ✅ 50MB file storage
- ✅ Social OAuth providers
- ✅ Real-time subscriptions
- ✅ Edge Functions (3,500,000 invocations)

## Your Data Will Now:
- ✅ Persist permanently
- ✅ Survive all deployments
- ✅ Be backed up automatically
- ✅ Be accessible from anywhere
- ✅ Scale as your church grows