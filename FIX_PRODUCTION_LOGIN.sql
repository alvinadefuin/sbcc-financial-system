-- URGENT FIX: Production Login Issue
-- Run this in your Supabase SQL Editor IMMEDIATELY

-- Step 1: Check current users
SELECT id, email, name, role, 
       CASE WHEN password_hash IS NULL THEN 'NO PASSWORD!' 
            ELSE 'Password exists' 
       END as password_status
FROM users;

-- Step 2: Fix admin password hash
UPDATE users 
SET password_hash = '$2a$10$liJZdKPKDdDxw2kEag7eVe54w8ss9RW7AxQ3wIIVwpxcLnHTQMWeC'
WHERE email = 'admin@sbcc.church';

-- Step 3: Fix test member password hash  
UPDATE users 
SET password_hash = '$2a$10$liJZdKPKDdDxw2kEag7eVe54w8ss9RW7AxQ3wIIVwpxcLnHTQMWeC'
WHERE email = 'member@sbcc.church';

-- Step 4: Verify the fix
SELECT email, name, role,
       CASE WHEN password_hash = '$2a$10$liJZdKPKDdDxw2kEag7eVe54w8ss9RW7AxQ3wIIVwpxcLnHTQMWeC' 
            THEN '✅ Password OK' 
            ELSE '❌ Password wrong' 
       END as password_check
FROM users
ORDER BY email;

-- Step 5: Ensure users are active
UPDATE users SET is_active = true WHERE email IN ('admin@sbcc.church', 'member@sbcc.church');

-- Final verification
SELECT '🎉 FIXED! Try logging in now with admin@sbcc.church / admin123' as status;