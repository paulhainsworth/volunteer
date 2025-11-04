-- Add Volunteer Leader Domains
-- This creates organizational groupings for roles with assigned leaders

-- Step 1: Create domains table
CREATE TABLE IF NOT EXISTS volunteer_leader_domains (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  leader_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 2: Add domain_id to volunteer_roles
ALTER TABLE volunteer_roles
ADD COLUMN IF NOT EXISTS domain_id UUID REFERENCES volunteer_leader_domains(id) ON DELETE SET NULL;

-- Step 3: Remove the old leader_id column (replaced by domain assignment)
-- We'll keep it for now for backward compatibility, but domain takes precedence

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS idx_volunteer_roles_domain_id ON volunteer_roles(domain_id);
CREATE INDEX IF NOT EXISTS idx_domains_leader_id ON volunteer_leader_domains(leader_id);

-- Step 5: Enable RLS on domains table
ALTER TABLE volunteer_leader_domains ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies for domains

-- Everyone can view domains
CREATE POLICY "Domains are viewable by everyone"
  ON volunteer_leader_domains FOR SELECT
  USING (true);

-- Only admins can create/update/delete domains
CREATE POLICY "Admins can insert domains"
  ON volunteer_leader_domains FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update domains"
  ON volunteer_leader_domains FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete domains"
  ON volunteer_leader_domains FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Step 7: Create trigger for updated_at
CREATE TRIGGER update_domains_updated_at BEFORE UPDATE
  ON volunteer_leader_domains FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Step 8: Insert some default domains
INSERT INTO volunteer_leader_domains (name, description)
VALUES 
  ('Registration & Check-in', 'Handling rider registration, number pickup, and check-in'),
  ('Course Marshals', 'Directing riders and monitoring the race course'),
  ('Water Stations & Aid', 'Providing water, snacks, and support along the course'),
  ('Finish Line & Timing', 'Managing finish line operations and race timing'),
  ('Loading & Logistics', 'Equipment setup, teardown, and transportation'),
  ('Food & Hospitality', 'Post-race food service and volunteer meals'),
  ('Parking & Traffic', 'Directing parking and managing traffic flow'),
  ('Medical & Safety', 'First aid and emergency response support')
ON CONFLICT (name) DO NOTHING;

-- Step 9: Verification
SELECT 'Volunteer Leader Domains setup complete!' as status;

-- Show created domains
SELECT id, name, description
FROM volunteer_leader_domains
ORDER BY name;

-- Show counts
SELECT 
  'Domains created' as metric,
  COUNT(*) as count
FROM volunteer_leader_domains;

