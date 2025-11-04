-- Add Emergency Contact Fields to Profiles
-- Run this in Supabase SQL Editor

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Verify columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
  AND column_name LIKE 'emergency%'
ORDER BY column_name;

SELECT 'Emergency contact fields added successfully!' as status;

