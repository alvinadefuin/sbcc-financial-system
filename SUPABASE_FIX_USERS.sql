-- Fix user passwords in Supabase
-- Run this in your Supabase SQL Editor

-- Update admin user with correct password hash
UPDATE users 
SET password_hash = '$2a$10$liJZdKPKDdDxw2kEag7eVe54w8ss9RW7AxQ3wIIVwpxcLnHTQMWeC'
WHERE email = 'admin@sbcc.church';

-- Update test member user with correct password hash  
UPDATE users 
SET password_hash = '$2a$10$liJZdKPKDdDxw2kEag7eVe54w8ss9RW7AxQ3wIIVwpxcLnHTQMWeC'
WHERE email = 'member@sbcc.church';

-- Verify users exist
SELECT id, email, name, role, is_active, created_at FROM users;

-- Test login by checking password hash
SELECT 
  email, 
  name,
  role,
  CASE WHEN password_hash = '$2a$10$liJZdKPKDdDxw2kEag7eVe54w8ss9RW7AxQ3wIIVwpxcLnHTQMWeC' 
    THEN 'Password OK' 
    ELSE 'Password mismatch' 
  END as password_status
FROM users;