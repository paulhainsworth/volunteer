BEGIN;
INSERT INTO volunteer_roles (name, event_date, start_time, end_time, positions_total)
VALUES ('Clown mime', '2099-04-18', '08:00', '09:00', 1),
       ('Course Marshal', '2099-04-18', '08:00', '09:00', 1);
INSERT INTO signups (volunteer_id, role_id)
SELECT '00000000-0000-4000-8000-000000000001', id FROM volunteer_roles WHERE name IN ('Clown mime', 'Course Marshal');
\ir ../../scripts/sql/REMOVE_CLOWN_ROLES.sql
DO $$
BEGIN
  IF (SELECT count(*) FROM signups) <> 1 OR
     NOT EXISTS (SELECT FROM volunteer_roles WHERE name = 'Course Marshal') THEN
    RAISE EXCEPTION 'Cleanup deleted a roster entry outside its selected scope';
  END IF;
END
$$;
ROLLBACK;
