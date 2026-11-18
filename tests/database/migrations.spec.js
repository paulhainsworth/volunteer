import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { test, expect } from '@playwright/test';

const name = `volunteer-test-${randomUUID()}`;
const image = 'postgres:17-alpine';
const migrationDirectory = 'supabase/migrations';
const migrations = readdirSync(migrationDirectory).filter((file) => file.endsWith('.sql')).sort();
const baselinePatches = [
  'ADD_EMERGENCY_CONTACT.sql',
  'ADD_VOLUNTEER_LEADER_ROLE.sql',
  'ADD_LEADER_DOMAINS_SAFE.sql',
  'ADD_TEAM_CLUB_AFFILIATION.sql',
];

function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 15000 });
  if (result.error) throw result.error;
  return result;
}

function sql(database, options) {
  return docker(['exec', name, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-U', 'postgres', '-d', database, ...options]);
}

function apply(database, path) {
  const result = sql(database, ['-f', `/repo/${path}`]);
  expect(result.status, result.stderr).toBe(0);
}

function bootstrap(database) {
  const creation = sql('postgres', ['-c', `CREATE DATABASE ${database}`]);
  expect(creation.status, creation.stderr).toBe(0);
  apply(database, 'tests/database/auth-baseline.sql');
  apply(database, 'SUPABASE_SCHEMA.sql');
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

test('documented bootstrap supports all timestamped migrations', () => {
  bootstrap('documented');
  const inputs = migrations.flatMap((file) => ['-f', `/repo/${migrationDirectory}/${file}`]);
  const migration = sql('documented', inputs);
  if (migration.status !== 0) {
    expect(migration.stderr).toMatch(/volunteer_leader_domains|team_club_affiliations|(?:column|attribute).*leader_id/);
  }
  // DEP-01: the signup-policy migration requires leader columns and domains defined in root patches.
  test.fail();
  expect(migration.status, migration.stderr).toBe(0);
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
  apply('patched', 'tests/database/cleanup-scope.sql');
  const schema = sql('patched', ['-Atc', "SELECT to_regclass('public.nica_coaches'), to_regclass('public.kids_clinic_signups'), (SELECT count(*) FROM volunteer_roles WHERE name = 'Existing shift')"]);
  expect(schema.stdout.trim()).toBe('nica_coaches|kids_clinic_signups|1');
});
