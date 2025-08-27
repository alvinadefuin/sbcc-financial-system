# 🔧 Troubleshooting Guide

## 🚨 Common Issues & Quick Fixes

### 🟥 **"Login Failed" Error**

**Symptom**: Login form shows "Login failed" message

**Causes & Solutions**:

1. **Wrong password hash in database**:
   ```sql
   -- Run this in your database (SQLite for dev, Supabase for prod)
   UPDATE users 
   SET password_hash = '$2a$10$liJZdKPKDdDxw2kEag7eVe54w8ss9RW7AxQ3wIIVwpxcLnHTQMWeC'
   WHERE email = 'admin@sbcc.church';
   ```

2. **Database not initialized**:
   ```bash
   # For development (SQLite)
   cd backend
   rm -rf ../database/
   npm run dev  # Will recreate database
   ```

3. **API not responding**:
   ```bash
   # Check if backend is running
   curl http://localhost:3001/api/health
   # Should return: {"status":"OK","database":"SQLite"}
   ```

---

### 🟥 **"Google OAuth is not configured"**

**Symptom**: Google login button shows error message

**Solutions**:

1. **For Development** - Update `backend/.env.development`:
   ```bash
   GOOGLE_CLIENT_ID=your-actual-dev-client-id
   GOOGLE_CLIENT_SECRET=your-actual-dev-secret
   ```

2. **For Production** - Update Railway variables:
   ```bash
   GOOGLE_CLIENT_ID=production-client-id
   GOOGLE_CLIENT_SECRET=production-client-secret
   ```

3. **Google Cloud Console Setup**:
   - Go to https://console.cloud.google.com
   - APIs & Services → Credentials
   - Create OAuth 2.0 Client ID
   - Add authorized origins and redirect URIs

---

### 🟥 **"Backend is not responding"**

**Symptom**: Frontend can't connect to API

**Quick Checks**:
```bash
# 1. Is backend running?
curl http://localhost:3001/api/health

# 2. Check what's using port 3001
lsof -i:3001

# 3. Kill and restart
lsof -ti:3001 | xargs kill -9
cd backend && npm run dev
```

**Environment Issues**:
```bash
# Check which environment backend thinks it's in
# Look for log: "🌍 Environment: development"

# If wrong environment, check NODE_ENV
echo $NODE_ENV

# Reset environment
unset NODE_ENV
cd backend && npm run dev
```

---

### 🟥 **Database Connection Errors**

#### SQLite Issues (Development):
```bash
# Database locked error
rm -rf backend/database/church_financial.db*
npm run dev

# Permission issues
chmod -R 755 backend/database/
npm run dev
```

#### PostgreSQL Issues (Production):
```bash
# Test connection string
curl -X POST https://your-app.up.railway.app/api/test-db

# Check Railway environment variables:
# - DATABASE_URL should start with "postgresql://"
# - USE_POSTGRESQL should be "true"
```

---

### 🟥 **"Port 3001 already in use"**

**Quick Fix**:
```bash
# Kill process using port 3001
lsof -ti:3001 | xargs kill -9

# Or find and kill manually
lsof -i:3001
kill -9 <PID>

# Restart backend
npm run dev
```

**Alternative**:
```bash
# Use different port temporarily
PORT=3002 npm run dev
```

---

### 🟥 **Frontend Build Errors**

#### React Compile Errors:
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear React cache
npm start -- --reset-cache
```

#### Environment Variable Issues:
```bash
# Check environment files exist
ls -la frontend/.env*

# Check variables are loaded
# In browser console: console.log(process.env)
```

---

### 🟥 **Railway Deployment Issues**

#### Build Failures:
1. **Check Railway logs** in dashboard
2. **Common fixes**:
   ```bash
   # Ensure all dependencies in package.json
   npm install --save missing-package
   
   # Check Node.js version compatibility
   # Update engines in package.json if needed
   ```

#### Environment Variable Issues:
1. **Verify in Railway dashboard**:
   - `NODE_ENV=production`
   - `USE_POSTGRESQL=true`  
   - `DATABASE_URL` starts with `postgresql://`

2. **Test deployment**:
   ```bash
   curl https://your-app.up.railway.app/api/health
   ```

---

### 🟥 **Google Forms Integration Issues**

#### Forms Submit Successfully But No Data:
1. **Check Railway logs** for errors during form submission
2. **Test API endpoint**:
   ```bash
   curl -X POST https://your-app.up.railway.app/api/forms/collection \
     -H "Content-Type: application/json" \
     -d '{"submitter_email":"member@sbcc.church","date":"2025-08-27","total_amount":1000}'
   ```

3. **Verify user exists**:
   ```sql
   -- In Supabase SQL Editor
   SELECT * FROM users WHERE email = 'member@sbcc.church';
   
   -- Create if missing
   INSERT INTO users (email, name, role, password_hash, is_active)
   VALUES ('member@sbcc.church', 'Test Member', 'user', 'hash', true);
   ```

---

## 🔍 **Debugging Tools**

### API Health Checks:
```bash
# Development
curl http://localhost:3001/api/health

# Production
curl https://your-app.up.railway.app/api/health

# Expected response
{"status":"OK","message":"SBCC Financial API is running","database":"SQLite|PostgreSQL"}
```

### Database Queries:
```bash
# Development (SQLite)
sqlite3 backend/database/church_financial.db "SELECT COUNT(*) FROM users;"

# Production (via API)
curl https://your-app.up.railway.app/api/test-db
```

### Frontend Network Tab:
1. Open browser Developer Tools
2. Go to Network tab
3. Try login/actions
4. Check for failed API calls (red status codes)

---

## 📊 **Environment Verification**

### Development Checklist:
```bash
# Backend checks
curl http://localhost:3001/api/health
# ✅ Should show "database":"SQLite"

# Frontend checks  
ls frontend/.env.development
# ✅ Should exist and contain REACT_APP_API_URL=http://localhost:3001

# Login test
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sbcc.church","password":"admin123"}'
# ✅ Should return JWT token
```

### Production Checklist:
```bash
# API health
curl https://your-app.up.railway.app/api/health
# ✅ Should show "database":"PostgreSQL"

# Database connection
curl https://your-app.up.railway.app/api/test-db
# ✅ Should show connection info

# Form submission test
curl -X POST https://your-app.up.railway.app/api/forms/create-test-user \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test"}'
# ✅ Should create user successfully
```

---

## 🆘 **Emergency Reset Procedures**

### Complete Development Reset:
```bash
# Stop all processes
pkill -f "node.*server.js"
pkill -f "react-scripts"

# Clean everything
rm -rf backend/database/
rm -rf backend/node_modules/
rm -rf frontend/node_modules/

# Reinstall and restart
cd backend && npm install && npm run dev &
cd frontend && npm install && npm start &
```

### Production Emergency Fix:
1. **Revert Railway to last working deployment**
2. **Check Supabase database is accessible**
3. **Verify environment variables in Railway**
4. **Redeploy from main branch**

---

## 📞 **Getting Help**

### Information to Gather:
1. **Environment** (development/staging/production)
2. **Error messages** (exact text)
3. **Steps to reproduce** 
4. **Browser console errors**
5. **API response codes**

### Useful Commands for Debugging:
```bash
# Check processes
ps aux | grep node

# Check ports
netstat -tlnp | grep :3001

# Check environment variables
env | grep -E "(NODE_ENV|DATABASE_URL|REACT_APP)"

# Check logs
tail -f ~/.pm2/logs/*.log  # if using PM2
```

---

**💡 Tip**: Most issues are environment-related. Double-check that you're running the right environment with the right configuration files!