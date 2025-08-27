# SBCC Financial System - Environment Setup Guide

## 🎯 Overview

This guide will walk you through setting up all three environments:
- **Development** (Local) - Your daily work environment
- **Staging** (Railway + Supabase) - For testing before production
- **Production** (Railway + Supabase) - Live church financial system

---

## 🔧 Development Environment Setup (START HERE)

### 1. Prerequisites
- Node.js 18+ installed
- Git installed
- Code editor (VS Code recommended)

### 2. Initial Setup
```bash
# Clone and install dependencies
git clone <your-repo-url>
cd sbcc-financial-system

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies  
cd ../frontend
npm install
```

### 3. Configure Development Environment

**No action needed!** Development is already configured to use:
- ✅ SQLite database (local file)
- ✅ Port 3001 for backend
- ✅ Port 3000 for frontend

### 4. Start Development Environment
```bash
# Terminal 1: Start Backend
cd backend
npm run dev

# Terminal 2: Start Frontend
cd frontend
npm start
```

### 5. Test Development
- Visit: http://localhost:3000
- Login: admin@sbcc.church / admin123
- ✅ Should work perfectly!

---

## 🧪 Staging Environment Setup

### 1. Create Staging Supabase Database

1. **Go to Supabase Dashboard**: https://supabase.com
2. **Create New Project**:
   - Name: `sbcc-financial-staging`
   - Database Password: Choose strong password (save it!)
   - Region: Same as production
3. **Get Connection String**:
   - Settings → Database → Connection String → URI
   - Copy: `postgresql://postgres:[PASSWORD]@db.[PROJECT-ID].supabase.co:5432/postgres`

### 2. Set Up Staging Database Tables

1. **Go to SQL Editor** in Supabase
2. **Run the setup script** from `SUPABASE_MANUAL_SETUP.sql`:
```sql
-- Copy and paste the entire content from SUPABASE_MANUAL_SETUP.sql
-- This creates all tables and initial users
```

### 3. Create Staging Railway Service

1. **Go to Railway Dashboard**: https://railway.app
2. **Create New Project**: `sbcc-financial-staging`
3. **Deploy from GitHub**:
   - Connect your repository
   - Select the main branch
4. **Configure Environment Variables**:
   ```bash
   NODE_ENV=staging
   USE_POSTGRESQL=true
   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[STAGING-ID].supabase.co:5432/postgres
   JWT_SECRET=staging-jwt-secret-different-from-dev
   ```

### 4. Configure Staging Google OAuth

1. **Go to Google Cloud Console**: https://console.cloud.google.com
2. **Create New OAuth Client** (or add URLs to existing):
   - Authorized origins: `https://[your-staging-url].up.railway.app`
   - Authorized redirect URIs: `https://[your-staging-url].up.railway.app/auth/callback`
3. **Update Backend Environment**:
   ```bash
   GOOGLE_CLIENT_ID=your-staging-client-id
   GOOGLE_CLIENT_SECRET=your-staging-client-secret
   ```

### 5. Update Frontend for Staging

Edit `frontend/.env.staging`:
```bash
REACT_APP_API_URL=https://sbcc-financial-system-staging.up.railway.app
REACT_APP_GOOGLE_CLIENT_ID=your-staging-client-id
```

### 6. Test Staging Environment
```bash
# Build and test staging
cd frontend
npm run start:staging

# Should connect to staging API
```

---

## 🚀 Production Environment Setup

### 1. Create Production Supabase Database

1. **Create Separate Supabase Project**:
   - Name: `sbcc-financial-production`
   - **Different from staging!**
   - Strong password (save securely)

2. **Set Up Production Tables**:
   - Use same SQL script from `SUPABASE_MANUAL_SETUP.sql`
   - **Important**: This will be your live data!

### 2. Configure Production Railway Service

**Update your existing Railway production service**:

1. **Environment Variables**:
   ```bash
   NODE_ENV=production
   USE_POSTGRESQL=true
   DATABASE_URL=postgresql://postgres:[PROD-PASSWORD]@db.[PROD-ID].supabase.co:5432/postgres
   JWT_SECRET=production-super-secure-secret
   ```

### 3. Configure Production Google OAuth

1. **Create Production OAuth Client**:
   - Authorized origins: `https://sbcc-financial-system-production.up.railway.app`
   - **Separate from staging!**

2. **Update Railway Variables**:
   ```bash
   GOOGLE_CLIENT_ID=production-client-id
   GOOGLE_CLIENT_SECRET=production-client-secret
   ```

---

## 📋 Quick Reference

### Commands for Each Environment

**Development:**
```bash
# Backend
cd backend && npm run dev

# Frontend
cd frontend && npm start
```

**Staging:**
```bash
# Backend (deployed to Railway staging)
npm run staging

# Frontend (local testing against staging)
npm run start:staging
```

**Production:**
```bash
# Backend (deployed to Railway production)
npm run prod

# Frontend (build for production)
npm run build:prod
```

### Environment URLs

| Environment | Backend API | Frontend | Database |
|-------------|-------------|----------|----------|
| Development | `localhost:3001` | `localhost:3000` | SQLite (local) |
| Staging | `https://staging.up.railway.app` | Local dev server | Supabase Staging |
| Production | `https://production.up.railway.app` | Production build | Supabase Production |

---

## 🔐 Security Checklist

### Development
- ✅ Uses local SQLite (no internet required)
- ✅ Development secrets (not sensitive)
- ✅ Google OAuth for localhost

### Staging  
- ✅ Separate database from production
- ✅ Different JWT secrets
- ✅ Staging Google OAuth client
- ✅ Test data only

### Production
- ✅ Separate database from staging
- ✅ Strong, unique JWT secret
- ✅ Production Google OAuth client  
- ✅ Regular backups
- ✅ Live church data

---

## 🚨 Important Notes

### Database Separation
- **Development**: SQLite file (gets reset often)
- **Staging**: Supabase staging database (test data)
- **Production**: Supabase production database (LIVE DATA)
- **Never mix these up!**

### Google OAuth Setup
- **Each environment needs its own OAuth client**
- **URLs must match exactly**
- **Test each environment separately**

### Deployment Process
1. **Develop locally** (SQLite)
2. **Test on staging** (Supabase staging)
3. **Deploy to production** (Supabase production)

### Data Migration
- **Development → Staging**: Export/Import test data
- **Staging → Production**: Careful migration of live data
- **Always backup before migration!**

---

## 📞 Support

If you encounter issues:

1. **Check environment variables** are set correctly
2. **Verify database connections** using health endpoints
3. **Test Google OAuth** in each environment separately
4. **Check Railway deployment logs**
5. **Verify Supabase database connectivity**

### Health Check Endpoints
- Development: `http://localhost:3001/api/health`
- Staging: `https://staging.up.railway.app/api/health`  
- Production: `https://production.up.railway.app/api/health`

---

## ✅ Setup Verification

### Development Environment
- [ ] Backend starts on port 3001
- [ ] Frontend starts on port 3000
- [ ] Can login with admin@sbcc.church / admin123
- [ ] Database shows as "SQLite"
- [ ] Google OAuth works (if configured)

### Staging Environment  
- [ ] Staging Railway service deployed
- [ ] Supabase staging database created
- [ ] Environment variables set
- [ ] Health endpoint returns PostgreSQL
- [ ] Can login with staging credentials
- [ ] Google OAuth works with staging URLs

### Production Environment
- [ ] Production Railway service updated
- [ ] Supabase production database created
- [ ] Production environment variables set
- [ ] Health endpoint returns PostgreSQL  
- [ ] Google OAuth configured for production URLs
- [ ] Live data migrated safely

---

**🎉 Once all environments are set up, you'll have a professional-grade deployment pipeline!**