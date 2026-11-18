-- Debug permissions issue
-- Run this to see what's happening

-- Step 1: Check all policies on profiles table
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;

-- Step 2: Check if you're actually logged in as admin
SELECT id, email, role
FROM profiles
WHERE id = auth.uid();

-- Step 3: Check the specific user you're trying to update
SELECT id, email, role
FROM profiles
WHERE email = 'jt@mailinator.com';

-- Step 4: Try a manual update to see the exact error
-- Replace 'USER_ID_HERE' with jt@mailinator.com's actual UUID
-- UPDATE profiles SET role = 'volunteer_leader' WHERE email = 'jt@mailinator.com';

