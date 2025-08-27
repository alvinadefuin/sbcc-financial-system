# Environment Setup Plan for SBCC Financial System

## Current Problem
- No clear environment separation
- Dev and prod configurations mixed
- Same Google OAuth for all environments
- Database switching issues between SQLite and PostgreSQL

## Proposed Solution: 3-Tier Environment Setup

### 🔧 **Development Environment (Local)**
**Purpose**: Local development and testing
- **Database**: SQLite (local file)
- **Backend API**: http://localhost:3001
- **Frontend**: http://localhost:3000 
- **Google OAuth**: Development client ID (localhost URLs)
- **Environment**: `NODE_ENV=development`
- **Data**: Test data, gets reset frequently

**Configuration**:
```bash
# backend/.env.development
NODE_ENV=development
PORT=3001
JWT_SECRET=dev-secret-key
DATABASE_URL=./database/church_financial.db
USE_POSTGRESQL=false
GOOGLE_CLIENT_ID=dev-google-client-id
```

```bash
# frontend/.env.development  
REACT_APP_API_URL=http://localhost:3001
REACT_APP_GOOGLE_CLIENT_ID=dev-google-client-id
REACT_APP_ENVIRONMENT=development
```

### 🧪 **Staging Environment (Railway + Supabase)**
**Purpose**: Testing before production deployment
- **Database**: Supabase PostgreSQL (staging database)
- **Backend API**: https://sbcc-financial-system-staging.up.railway.app
- **Frontend**: Same app pointing to staging API
- **Google OAuth**: Staging client ID (staging URLs)
- **Environment**: `NODE_ENV=staging`
- **Data**: Test data that mimics production

**Configuration**:
```bash
# Railway Variables (Staging Service)
NODE_ENV=staging
USE_POSTGRESQL=true
DATABASE_URL=postgresql://postgres:[PASS]@db.[STAGING-ID].supabase.co:5432/postgres
GOOGLE_CLIENT_ID=staging-google-client-id
```

### 🚀 **Production Environment (Railway + Supabase)**
**Purpose**: Live church financial system
- **Database**: Supabase PostgreSQL (production database)
- **Backend API**: https://sbcc-financial-system-production.up.railway.app
- **Frontend**: Production build
- **Google OAuth**: Production client ID (production URLs)
- **Environment**: `NODE_ENV=production`
- **Data**: Live church data (backed up)

**Configuration**:
```bash
# Railway Variables (Production Service)
NODE_ENV=production  
USE_POSTGRESQL=true
DATABASE_URL=postgresql://postgres:[PASS]@db.[PROD-ID].supabase.co:5432/postgres
GOOGLE_CLIENT_ID=production-google-client-id
```

## Implementation Steps

### Phase 1: Fix Development Environment
1. ✅ Ensure local dev uses SQLite
2. ✅ Configure local Google OAuth
3. ✅ Test all features locally

### Phase 2: Set Up Staging Environment  
1. Create separate Railway staging service
2. Create separate Supabase staging database
3. Configure staging Google OAuth
4. Deploy and test staging

### Phase 3: Set Up Production Environment
1. Keep existing Railway production service
2. Create separate Supabase production database  
3. Configure production Google OAuth
4. Migrate live data carefully

### Phase 4: Environment-Aware Frontend
1. Dynamic API URL based on environment
2. Environment-specific configurations
3. Build scripts for each environment

## Benefits
- ✅ **Clear separation** between dev/staging/prod
- ✅ **Safe testing** before production
- ✅ **No accidental data mixing**
- ✅ **Proper Google OAuth** for each environment
- ✅ **Easy debugging** - know which environment has issues
- ✅ **Rollback capability** - staging tests before prod

## Migration Strategy
1. **Week 1**: Fix development (current priority)
2. **Week 2**: Set up staging environment
3. **Week 3**: Migrate production to proper setup
4. **Week 4**: Test and optimize all environments

This will solve all current configuration conflicts and provide a professional deployment setup.