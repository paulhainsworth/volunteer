-- Create Default Admin Account
-- Run this AFTER running SUPABASE_SCHEMA.sql
-- This creates a default admin account for initial setup

-- Default Credentials:
-- Email: admin@admin.com
-- Password: admin
-- 
-- ⚠️ IMPORTANT: Change this password immediately after first login!

-- Note: This uses Supabase's auth.signup function
-- The profile will be created automatically by the trigger

SELECT extensions.pgcrypto_version(); -- Ensure pgcrypto is loaded

-- The actual user creation needs to be done via Supabase Dashboard or Admin API
-- Follow these steps instead:

-- MANUAL STEPS (30 seconds):
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Click "Add user" → "Create new user"
-- 3. Email: admin@admin.com
-- 4. Password: admin
-- 5. Check "Auto Confirm User" (skip email verification)
-- 6. Click "Create user"
-- 7. The trigger will automatically create the profile
-- 8. Update the profile to admin role with this SQL:

UPDATE profiles 
SET role = 'admin',
    first_name = 'Default',
    last_name = 'Admin'
WHERE email = 'admin@admin.com';

-- That's it! You can now login with admin@admin.com / admin

