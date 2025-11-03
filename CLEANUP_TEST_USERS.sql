-- Cleanup Test Users Created by Automation
-- Run this in Supabase SQL Editor to remove all test accounts

-- Step 1: Delete profiles for test users
DELETE FROM profiles
WHERE email LIKE 'test-%@mailinator.com';

-- Step 2: Get the auth user IDs that need to be deleted
-- Note: You may need to use the Supabase dashboard Authentication -> Users
-- to manually delete auth.users entries, as direct deletion requires admin privileges

-- Check how many test users exist
SELECT 
  COUNT(*) as test_user_count,
  'profiles' as table_name
FROM profiles
WHERE email LIKE 'test-%@mailinator.com'

UNION ALL

SELECT 
  COUNT(*) as test_user_count,
  'auth.users' as table_name
FROM auth.users
WHERE email LIKE 'test-%@mailinator.com';

-- To see the list of test users:
SELECT id, email, created_at
FROM profiles
WHERE email LIKE 'test-%@mailinator.com'
ORDER BY created_at DESC;

