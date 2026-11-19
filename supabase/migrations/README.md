# Database migrations

See the [SQL layout](../README.md) for bootstrap prerequisites, historical patches, and operational scripts.

Run migrations against your Supabase database so the app schema is up to date.

Apply [the team and club affiliation migration](20261118001100_allow_admins_to_create_team_club_affiliations.sql) before deploying the admin **Add team or club** form. It uses the existing affiliation lookup table from the [bootstrap patch](../bootstrap/ADD_TEAM_CLUB_AFFILIATION.sql), checks the signed-in account’s admin role, and rejects duplicate names without changing existing affiliations.

Apply [the NICA beneficiary migration](20261118001200_manage_nica_beneficiaries.sql), then deploy `send-nica-coach-digest` and the new frontend before editing beneficiary settings. The migration seeds the six existing teams and links any of their known affiliation names already in the database. Admins can link additional affiliations from the Users screen.

## Option A: Supabase Dashboard (SQL Editor)

1. Open your project in [Supabase Dashboard](https://supabase.com/dashboard) → **SQL Editor**.
2. Paste and run the contents of the migration file(s) you need (e.g. `20260125000000_add_waiver_parent_columns.sql`).

## Option B: Supabase CLI

From the project root:

```bash
supabase db push
```

or, if you use migration history:

```bash
supabase migration up
```

## Required migration: parent/guardian columns on `waivers`

If you see **"Could not find the 'parent_guardian_email' column of 'waivers'"** when a minor signs the waiver, run the migration that adds parent consent columns:

**File:** `20260125000000_add_waiver_parent_columns.sql`

You can copy its contents into the SQL Editor and run it once per project (e.g. local, staging, production).
