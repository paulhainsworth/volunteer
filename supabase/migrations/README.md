# Database migrations

Run migrations against your Supabase database so the app schema is up to date.

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
