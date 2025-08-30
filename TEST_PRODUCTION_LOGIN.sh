#!/bin/bash

# Test Production Login Script
# Run this after Railway deploys the latest changes

echo "🔍 Testing SBCC Financial System Production API..."
echo "================================================"

# Test 1: Health Check
echo -e "\n📋 Test 1: Health Check"
echo "------------------------"
curl -s https://sbcc-financial-system-production.up.railway.app/api/health | python3 -m json.tool

# Test 2: Login with admin credentials
echo -e "\n🔐 Test 2: Admin Login"
echo "----------------------"
curl -X POST https://sbcc-financial-system-production.up.railway.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@sbcc.church","password":"admin123"}' \
  -s | python3 -m json.tool

# Test 3: Test database endpoint (for debugging)
echo -e "\n💾 Test 3: Database Connection Test"
echo "------------------------------------"
curl -s https://sbcc-financial-system-production.up.railway.app/api/test-db | python3 -m json.tool

echo -e "\n✅ Tests complete!"
echo "=================="
echo ""
echo "Expected results:"
echo "- Health Check: Should show PostgreSQL database"
echo "- Admin Login: Should return JWT token and user info"
echo "- Database Test: Should show connection details"