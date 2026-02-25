-- Minor volunteer / parent consent (Option 1): add parent fields to waivers table.
-- Run this migration if your waivers table does not yet have these columns.

ALTER TABLE waivers
  ADD COLUMN IF NOT EXISTS parent_guardian_name text,
  ADD COLUMN IF NOT EXISTS parent_guardian_email text,
  ADD COLUMN IF NOT EXISTS parent_guardian_phone text,
  ADD COLUMN IF NOT EXISTS parent_signature_name text,
  ADD COLUMN IF NOT EXISTS parent_signed_at timestamptz;

COMMENT ON COLUMN waivers.parent_guardian_name IS 'For minors: parent/legal guardian full name';
COMMENT ON COLUMN waivers.parent_guardian_email IS 'For minors: parent/legal guardian email';
COMMENT ON COLUMN waivers.parent_signed_at IS 'When parent/guardian signed on behalf of minor';
