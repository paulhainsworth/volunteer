import { execFile, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { test, expect } from '@playwright/test';

const name = `volunteer-test-${randomUUID()}`;
const image = 'postgres:17-alpine';
const migrationDirectory = 'supabase/migrations';
const migrations = readdirSync(migrationDirectory).filter((file) => file.endsWith('.sql')).sort();
const baselinePatches = [
  'supabase/bootstrap/ADD_EMERGENCY_CONTACT.sql',
  'supabase/bootstrap/ADD_VOLUNTEER_LEADER_ROLE.sql',
  'supabase/bootstrap/ADD_LEADER_DOMAINS_SAFE.sql',
  'supabase/bootstrap/ADD_TEAM_CLUB_AFFILIATION.sql',
];

function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 15000 });
  if (result.error) throw result.error;
  return result;
}

function sqlArgs(database, options) {
  return ['exec', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-U', 'postgres', '-d', database, ...options];
}

function sql(database, options) {
  return docker(sqlArgs(database, options));
}

function apply(database, path) {
  const result = sql(database, ['-f', `/repo/${path}`]);
  expect(result.status, result.stderr).toBe(0);
}

function bootstrap(database) {
  const creation = sql('postgres', ['-c', `CREATE DATABASE ${database}`]);
  expect(creation.status, creation.stderr).toBe(0);
  apply(database, 'tests/database/auth-baseline.sql');
  apply(database, 'supabase/bootstrap/SUPABASE_SCHEMA.sql');
}

test.describe.configure({ mode: 'serial', timeout: 60000 });

test.beforeAll(async () => {
  const result = docker(['run', '--rm', '-d', '--pull=never', '--network=none', '--name', name,
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-v', `${process.cwd()}:/repo:ro`, image]);
  expect(result.status, `Docker and the local ${image} image are required. ${result.stderr}`).toBe(0);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = sql('postgres', ['-Atc', 'SELECT 1']);
    if (ready.stdout.trim() === '1') return;
    await setTimeout(500);
  }
  throw new Error('Disposable PostgreSQL server did not start');
});

test.afterAll(() => {
  docker(['rm', '-f', name]);
});

test('canonical bootstrap provisions a fresh local Supabase database', () => {
  const created = sql('postgres', ['-c', 'CREATE DATABASE fresh']);
  expect(created.status, created.stderr).toBe(0);
  apply('fresh', 'tests/database/auth-baseline.sql');
  const setup = docker(['exec', '-e', 'PGDATABASE=fresh', '-e', 'PGUSER=postgres', name,
    'sh', '/repo/scripts/bootstrap-local-db.sh']);
  expect(setup.status, setup.stderr).toBe(0);
  const objects = sql('fresh', ['-Atc', `SELECT
    to_regclass('public.nica_coaches'),
    to_regprocedure('public.get_confirmed_signup_counts(uuid[])') IS NOT NULL,
    to_regprocedure('public.volunteer_waiver_is_current(uuid)') IS NOT NULL`]);
  expect(objects.stdout.trim()).toBe('nica_coaches|t|t');

  const repeated = docker(['exec', '-e', 'PGDATABASE=fresh', '-e', 'PGUSER=postgres', name,
    'sh', '/repo/scripts/bootstrap-local-db.sh']);
  expect(repeated.status).not.toBe(0);
  expect(repeated.stderr).toContain('Bootstrap requires an empty volunteer schema');
});

test('the read-only baseline report handles absent and present migration history', () => {
  const report = '/repo/scripts/sql/CHECK_DATABASE_BASELINE.sql';
  const withoutHistory = sql('fresh', ['-Atf', report]);
  expect(withoutHistory.status, withoutHistory.stderr).toBe(0);
  expect(withoutHistory.stdout).toContain('public.waivers.declared_minor|t');
  expect(withoutHistory.stdout).toContain('public.sign_volunteer_waiver(jsonb)|t');
  expect(withoutHistory.stdout).toContain('Supabase migration history table is missing.');

  const seeded = sql('fresh', ['-c', `
    CREATE SCHEMA supabase_migrations;
    CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY);
    INSERT INTO supabase_migrations.schema_migrations VALUES ('20261118000300');
  `]);
  expect(seeded.status, seeded.stderr).toBe(0);

  const withHistory = sql('fresh', ['-Atf', report]);
  expect(withHistory.status, withHistory.stderr).toBe(0);
  expect(withHistory.stdout).toContain('20261118000300');
  expect(withHistory.stdout).not.toContain('migration history table is missing');
});

test('explicit baseline patches support migrations, profile editing, and scoped cleanup', () => {
  bootstrap('patched');
  for (const patch of baselinePatches) apply('patched', patch);
  const seed = sql('patched', ['-c', `INSERT INTO volunteer_roles
    (name, event_date, start_time, end_time, positions_total)
    VALUES ('Existing shift', '2099-04-18', '08:00', '09:00', 1)`]);
  expect(seed.status, seed.stderr).toBe(0);
  for (const file of migrations) apply('patched', `${migrationDirectory}/${file}`);
  apply('patched', 'tests/database/profile-access.sql');
  apply('patched', 'tests/database/emergency-contact-access.sql');
  apply('patched', 'tests/database/cleanup-scope.sql');
  apply('patched', 'tests/database/auth-mail-rate-limit.sql');
  apply('patched', 'tests/database/volunteer-mail-notifications.sql');
  const schema = sql('patched', ['-Atc', "SELECT to_regclass('public.nica_coaches'), to_regclass('public.kids_clinic_signups'), (SELECT count(*) FROM volunteer_roles WHERE name = 'Existing shift')"]);
  expect(schema.stdout.trim()).toBe('nica_coaches|kids_clinic_signups|1');
});

test('concurrent voluntary signup allocates the last seat once and rolls back rejected consent', async () => {
  const first = '00000000-0000-4000-8000-000000000011';
  const second = '00000000-0000-4000-8000-000000000012';
  const third = '00000000-0000-4000-8000-000000000013';
  const roleId = '00000000-0000-4000-8000-000000000021';
  const secondRole = '00000000-0000-4000-8000-000000000022';
  const setup = sql('patched', ['-c', `
    INSERT INTO auth.users (id, email) VALUES
      ('${first}', 'first@example.invalid'), ('${second}', 'second@example.invalid'), ('${third}', 'third@example.invalid');
    INSERT INTO volunteer_roles (id, name, event_date, start_time, end_time, positions_total) VALUES
      ('${roleId}', 'Last seat', '2099-04-18', '08:00', '09:00', 1),
      ('${secondRole}', 'Second shift', '2099-04-18', '08:00', '09:00', 2);
    ALTER TABLE waivers ADD CONSTRAINT fixture_reject_signature CHECK (signature_name <> 'Fixture rejected') NOT VALID;
  `]);
  expect(setup.status, setup.stderr).toBe(0);

  function confirm(id, role, signature, delay = 0) {
    return ['-Atc', `BEGIN; SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${id}', true);
      SELECT confirm_volunteer_signup('${role}', NULL, '{"version":1,"is_minor":false,"signature_name":"${signature}"}')->>'created';
      SELECT pg_sleep(${delay}); COMMIT;`];
  }

  const run = promisify(execFile);
  const outcomes = await Promise.allSettled([first, second].map((id) =>
    run('docker', sqlArgs('patched', confirm(id, roleId, 'Fixture signed', 0.25)), { timeout: 10000 })
  ));
  expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
  const loser = outcomes.find(({ status }) => status === 'rejected');
  expect(loser.reason.stderr).toContain('This role is already full');
  const winner = outcomes[0].status === 'fulfilled' ? first : second;

  const retry = sql('patched', confirm(winner, roleId, 'Fixture signed'));
  expect(retry.status, retry.stderr).toBe(0);
  expect(retry.stdout).toContain('\nfalse\n');

  const failed = sql('patched', confirm(third, secondRole, 'Fixture rejected'));
  expect(failed.status).not.toBe(0);
  expect(failed.stderr).toContain('fixture_reject_signature');

  const counts = sql('patched', ['-Atc', `SELECT
    (SELECT count(*) FROM signups WHERE role_id = '${roleId}' AND waiver_signed),
    (SELECT count(*) FROM waivers WHERE volunteer_id IN ('${first}', '${second}', '${third}')),
    (SELECT count(*) FROM signups WHERE role_id = '${secondRole}'),
    has_function_privilege('anon', 'public.confirm_volunteer_signup(uuid,text,jsonb)', 'EXECUTE');`]);
  expect(counts.stdout.trim()).toBe('1|1|0|f');

  const cancelled = sql('patched', ['-Atc', `INSERT INTO signups (role_id, volunteer_id, status)
    VALUES ('${roleId}', '${third}', 'cancelled') RETURNING id;`]);
  expect(cancelled.status, cancelled.stderr).toBe(0);
  const signupId = cancelled.stdout.split('\n')[0];
  const rejectedReactivation = sql('patched', confirm(third, roleId, 'Fixture signed'));
  expect(rejectedReactivation.stderr).toContain('This role is already full');
  expect(sql('patched', ['-Atc', `SELECT status FROM signups WHERE id = '${signupId}'`]).stdout.trim()).toBe('cancelled');

  const released = sql('patched', ['-c', `UPDATE signups SET status = 'cancelled' WHERE role_id = '${roleId}' AND volunteer_id = '${winner}'`]);
  expect(released.status, released.stderr).toBe(0);
  const reactivated = sql('patched', confirm(third, roleId, 'Fixture signed'));
  expect(reactivated.status, reactivated.stderr).toBe(0);
  expect(sql('patched', ['-Atc', `SELECT status FROM signups WHERE id = '${signupId}'`]).stdout.trim()).toBe('confirmed');
});

test('clinic retries reserve one registration and enforce request limits per parent', async () => {
  const payload = (name) => JSON.stringify({
    parent_first_name: 'Test', parent_last_name: 'Parent', parent_email: 'parent@example.invalid',
    child_name: name, child_gender: 'prefer_not_to_say', child_age: 10,
    waiver_version: 'fixture', waiver_consent: true,
  });
  const reserve = (name) => ['-qAtc', `SET ROLE service_role; SELECT reserve_clinic_registration('${payload(name)}');`];
  const run = promisify(execFile);
  const outcomes = await Promise.all(['First Child', ' first   child '].map((name) =>
    run('docker', sqlArgs('patched', reserve(name)), { timeout: 10000 })
  ));
  const registrations = outcomes.map(({ stdout }) => JSON.parse(stdout));
  expect(registrations.filter(({ created }) => created)).toHaveLength(1);
  expect(new Set(registrations.map(({ id }) => id)).size).toBe(1);

  for (let index = 2; index <= 5; index += 1) {
    const outcome = sql('patched', reserve(`Child ${index}`));
    expect(outcome.status, outcome.stderr).toBe(0);
    expect(JSON.parse(outcome.stdout).created).toBe(true);
  }
  const blocked = sql('patched', reserve('One more child'));
  expect(blocked.status, blocked.stderr).toBe(0);
  expect(JSON.parse(blocked.stdout)).toEqual({ limited: true });

  const grants = sql('patched', ['-Atc', `SELECT
    has_function_privilege('anon','public.reserve_clinic_registration(jsonb)','EXECUTE'),
    has_function_privilege('service_role','public.reserve_clinic_registration(jsonb)','EXECUTE');`]);
  expect(grants.stdout.trim()).toBe('f|t');
});

test('MG-07 signup requires complete guardian consent and stores it once', () => {
  const minor = '00000000-0000-4000-8000-000000000031';
  const adult = '00000000-0000-4000-8000-000000000032';
  const roleId = '00000000-0000-4000-8000-000000000033';
  const minorWithoutAssent = '00000000-0000-4000-8000-000000000034';
  const fixture = sql('patched', ['-c', `
    INSERT INTO auth.users (id, email) VALUES
      ('${minor}', 'minor@example.invalid'), ('${adult}', 'adult@example.invalid'),
      ('${minorWithoutAssent}', 'no-assent@example.invalid');
    INSERT INTO volunteer_roles (id, name, event_date, start_time, end_time, positions_total)
    VALUES ('${roleId}', 'Guardian fixture', '2099-04-18', '08:00', '09:00', 3);
  `]);
  expect(fixture.status, fixture.stderr).toBe(0);

  const consent = {
    version: 1, signature_name: 'Fixture Volunteer', is_minor: true,
    parent_guardian_name: ' Fixture Guardian ', parent_guardian_email: ' guardian@example.invalid ',
    parent_signature_name: ' Fixture Signature ', parent_guardian_phone: ' ',
  };
  function confirm(volunteer, fields) {
    return sql('patched', ['-qAtc', `BEGIN; SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${volunteer}', true);
      SELECT confirm_volunteer_signup('${roleId}', NULL, '${JSON.stringify(fields)}')->>'created';
      COMMIT;`]);
  }

  for (const field of ['parent_guardian_name', 'parent_guardian_email', 'parent_signature_name']) {
    for (const value of [undefined, '   ']) {
      const rejected = confirm(minor, { ...consent, [field]: value });
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain('Parent or guardian consent is required');
    }
  }
  const blankSignature = confirm(adult, { version: 1, is_minor: false, signature_name: '' });
  expect(blankSignature.status).not.toBe(0);
  expect(blankSignature.stderr).toContain('Review and sign the current waiver');
  const before = sql('patched', ['-Atc', `SELECT
    (SELECT count(*) FROM waivers WHERE volunteer_id = '${minor}'),
    (SELECT count(*) FROM signups WHERE volunteer_id = '${minor}')`]);
  expect(before.stdout.trim()).toBe('0|0');

  for (const [volunteer, fields, created] of [
    [minor, consent, 'true'],
    [minor, consent, 'false'],
    [minorWithoutAssent, { ...consent, signature_name: '   ' }, 'true'],
    [adult, { version: 1, signature_name: 'Fixture Adult', is_minor: false }, 'true'],
  ]) {
    const saved = confirm(volunteer, fields);
    expect(saved.status, saved.stderr).toBe(0);
    expect(saved.stdout.trim().split('\n').at(-1)).toBe(created);
  }

  const stored = sql('patched', ['-Atc', `SELECT signature_name, parent_guardian_name, parent_guardian_email,
    parent_signature_name, parent_guardian_phone IS NULL, parent_signed_at IS NOT NULL
    FROM waivers WHERE volunteer_id = '${minor}'`]);
  expect(stored.stdout.trim()).toBe('Fixture Volunteer|Fixture Guardian|guardian@example.invalid|Fixture Signature|t|t');
  const absentAssent = sql('patched', ['-Atc', `SELECT signature_name IS NULL, parent_signature_name
    FROM waivers WHERE volunteer_id = '${minorWithoutAssent}'`]);
  expect(absentAssent.stdout.trim()).toBe('t|Fixture Signature');
  const adultStored = sql('patched', ['-Atc', `SELECT count(*) FROM waivers WHERE volunteer_id = '${adult}'
    AND parent_guardian_name IS NULL AND parent_guardian_email IS NULL
    AND parent_guardian_phone IS NULL AND parent_signature_name IS NULL AND parent_signed_at IS NULL`]);
  expect(adultStored.stdout.trim()).toBe('1');
  const adultDateScope = sql('patched', ['-qAtc', `BEGIN; SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub', '${adult}', true);
    SELECT volunteer_waiver_is_current(), volunteer_waiver_is_current('${roleId}');
    ROLLBACK;`]);
  expect(adultDateScope.status, adultDateScope.stderr).toBe(0);
  expect(adultDateScope.stdout.trim().split('\n').at(-1)).toBe('f|t');
});

test('MG-08 standalone consent replaces legacy eligibility and is reusable for roles', () => {
  const adult = '00000000-0000-4000-8000-000000000041';
  const minor = '00000000-0000-4000-8000-000000000042';
  const role = '00000000-0000-4000-8000-000000000043';
  const fixture = sql('patched', ['-c', `
    INSERT INTO auth.users (id, email) VALUES
      ('${adult}', 'legacy-adult@example.invalid'), ('${minor}', 'standalone-minor@example.invalid');
    INSERT INTO volunteer_roles (id, name, event_date, start_time, end_time, positions_total)
    VALUES ('${role}', 'Waiver fixture', CURRENT_DATE + 5, '08:00', '09:00', 2);
    INSERT INTO waivers (volunteer_id, signature_name, waiver_version, waiver_text)
    VALUES ('${adult}', 'Legacy signature', 1, 'Fixture waiver');
  `]);
  expect(fixture.status, fixture.stderr).toBe(0);

  function asVolunteer(volunteer, query) {
    return sql('patched', ['-qAtc', `BEGIN; SET LOCAL ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '${volunteer}', true);
      ${query}; COMMIT;`]);
  }
  const adultBefore = asVolunteer(adult, `SELECT volunteer_waiver_is_current(),
    volunteer_waiver_is_current('${role}')`);
  expect(adultBefore.status, adultBefore.stderr).toBe(0);
  expect(adultBefore.stdout.trim().split('\n').at(-1)).toBe('f|f');

  const missingDeclaration = asVolunteer(adult,
    `SELECT sign_volunteer_waiver('{"version":1,"signature_name":"Fixture Adult"}')`);
  expect(missingDeclaration.stderr).toContain('Declare whether the volunteer will be under 18');
  const missingGuardian = asVolunteer(minor, `SELECT sign_volunteer_waiver('{"version":1,"is_minor":true}')`);
  expect(missingGuardian.stderr).toContain('Parent or guardian consent is required');

  const adultConsent = { version: 1, is_minor: false, signature_name: 'Fixture Adult' };
  const minorConsent = {
    version: 1, is_minor: true, parent_guardian_name: 'Fixture Guardian',
    parent_guardian_email: 'guardian@example.invalid', parent_signature_name: 'Fixture Signature',
  };
  for (const [volunteer, consent] of [[adult, adultConsent], [minor, minorConsent]]) {
    const saved = asVolunteer(volunteer, `
      SELECT sign_volunteer_waiver('${JSON.stringify(consent)}');
      SELECT volunteer_waiver_is_current(), volunteer_waiver_is_current('${role}');
      SELECT confirm_volunteer_signup('${role}')->>'created'`);
    expect(saved.status, saved.stderr).toBe(0);
    expect(saved.stdout.trim().split('\n').slice(-2)).toEqual(['t|t', 'true']);
  }

  const history = sql('patched', ['-Atc', `SELECT
    count(*) FILTER (WHERE age_assessment_date IS NULL AND declared_minor IS NULL),
    count(*) FILTER (WHERE age_assessment_date = CURRENT_DATE AND declared_minor IS FALSE
      AND signature_name = 'Fixture Adult' AND parent_signed_at IS NULL),
    count(*) FILTER (WHERE age_assessment_date = CURRENT_DATE AND declared_minor IS TRUE
      AND signature_name IS NULL AND parent_signed_at IS NOT NULL)
    FROM waivers WHERE volunteer_id IN ('${adult}', '${minor}')`]);
  expect(history.stdout.trim()).toBe('1|1|1');

  const access = sql('patched', ['-Atc', `SELECT
    has_table_privilege('authenticated', 'public.waivers', 'INSERT'),
    has_function_privilege('anon', 'public.sign_volunteer_waiver(jsonb)', 'EXECUTE'),
    has_function_privilege('authenticated', 'public.record_volunteer_waiver(uuid,date,jsonb)', 'EXECUTE')`]);
  expect(access.stdout.trim()).toBe('f|f|f');
});


test('administrator and volunteer-leader accounts can use the staff directory', () => {
  const fixture = sql('patched', ['-Atc', `
    BEGIN;
    INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES
      ('00000000-0000-4000-8000-000000000091', 'directory-admin@example.invalid', '{}'),
      ('00000000-0000-4000-8000-000000000092', 'directory-leader@example.invalid', '{}'),
      ('00000000-0000-4000-8000-000000000093', 'fixture-directory@example.invalid', '{}');
    UPDATE profiles SET role = 'admin' WHERE email = 'directory-admin@example.invalid';
    UPDATE profiles SET role = 'volunteer_leader' WHERE email = 'directory-leader@example.invalid';
    SELECT has_function_privilege('anon','public.search_volunteer_contacts(text)','EXECUTE');
    SET LOCAL ROLE authenticated;
    SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000091', true);
    SELECT 'admin|' || count(*) FROM search_volunteer_contacts('fixture-directory');
    SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000092', true);
    SELECT 'leader|' || count(*) FROM search_volunteer_contacts('fixture-directory');
    SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000093', true);
    SELECT 'volunteer|' || count(*) FROM search_volunteer_contacts('fixture-directory');
    ROLLBACK;
  `]);
  expect(fixture.status, fixture.stderr).toBe(0);
  expect(fixture.stdout.trim().split('\n')).toEqual(expect.arrayContaining(['f', 'admin|1', 'leader|1', 'volunteer|0']));
});
