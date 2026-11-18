-- Remove "Clown car driver" and "Clown mime" volunteer roles from production.
-- Run in Supabase SQL Editor. Safe: signups for these roles are CASCADE-deleted.

-- 1. Optional: see what will be removed (signups for these roles)
-- SELECT s.id, s.volunteer_id, s.status, vr.name
-- FROM signups s
-- JOIN volunteer_roles vr ON vr.id = s.role_id
-- WHERE vr.name IN ('Clown car driver', 'Clown mime');

-- 2. Delete the roles (CASCADE removes any signups for these roles)
DELETE FROM volunteer_roles
WHERE name IN ('Clown car driver', 'Clown mime');

-- 3. Verify
SELECT name FROM volunteer_roles WHERE name IN ('Clown car driver', 'Clown mime');
-- Should return 0 rows.
