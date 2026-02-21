# Separate Databases for Localhost, Staging, and Production

Right now localhost, staging (omnium2026), and production all use the **same** Supabase project, so test data appears in production. This doc proposes how to use **separate Supabase projects** (and thus separate databases) per environment.

**→ For the concrete staging design and step-by-step build/deploy plan, see [STAGING_ENVIRONMENT_DESIGN_AND_PLAN.md](./STAGING_ENVIRONMENT_DESIGN_AND_PLAN.md).**

---

## Overview

| Environment | Branch / URL | Database (Supabase project) |
|-------------|--------------|-----------------------------|
| **Production** | `main` → www.berkeleyomnium.com | **Production** project (current one) |
| **Staging** | `omnium2026` → volunteer-git-omnium2026-…vercel.app | **Staging** project (new) |
| **Local** | `npm run dev` → localhost:5173 | **Development** project (new) |

Each Supabase project has its own PostgreSQL database, Auth users, Storage, and Edge Functions. No shared data.

---

## Option A: Three projects (recommended)

- **Production** – existing project (e.g. `hxlmpyqmerqsjtczhard`).
- **Staging** – new project for preview deployments and QA.
- **Development** – new project for local development.

**Pros:** Staging and local are fully isolated; you can point local at staging instead of dev if you prefer.  
**Cons:** Two extra Supabase projects (free tier allows multiple projects).

---

## Option B: Two projects (staging + production)

- **Production** – existing project.
- **Staging** – new project used for **both** localhost and Vercel preview (omnium2026).

**Pros:** Only one extra project; simpler.  
**Cons:** Local and staging share the same data (might be fine for your workflow).

---

## Setup (Option A – three projects)

### 1. Create the new Supabase projects

1. [Supabase Dashboard](https://supabase.com/dashboard) → **New project**.
2. **Staging:** e.g. name `volunteer-staging`, region same as prod, set a DB password (store it).
3. **Development:** e.g. name `volunteer-dev`, same region, set a DB password.

### 2. Apply schema and seed data

For **each** new project (staging and dev):

1. **SQL Editor** → run in this order (adjust if you have migrations):
   - `SUPABASE_SCHEMA.sql`
   - Any `ADD_*.sql` / `FIX_*.sql` you use in prod (e.g. `ADD_FEATURED_ROLES.sql`, `ADD_VOLUNTEER_LEADER_ROLE.sql`, `ADD_LEADER_DOMAINS_SAFE.sql`, `FIX_SIGNUP_FK_PROFILE_TRIGGER.sql`, etc.)
2. **Authentication → URL Configuration:**
   - Add **Redirect URLs** (and Site URL if you use it):
     - Staging: `https://volunteer-git-omnium2026-paul-hainsworths-projects.vercel.app/` (and `/` if needed)
     - Dev: `http://localhost:5173/`
3. **Edge Functions:** Deploy the same functions to each project (see below).
4. **Secrets:** In each project, **Settings → Edge Functions → Secrets**, add:
   - `RESEND_API_KEY` (can use same key or a test key for dev/staging).

### 3. Local development (localhost → dev project)

Create or edit `.env` in the repo root (do not commit real keys if the repo is public; use `.env.local` and add it to `.gitignore` if needed):

```env
VITE_SUPABASE_URL=https://<YOUR-DEV-PROJECT-REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<dev-project-anon-key>
```

Get the URL and anon key from the **Development** Supabase project: **Settings → API**.

Run:

```bash
npm run dev
```

Localhost will use the dev database and dev Edge Functions.

### 4. Vercel – different env per environment

Use Vercel’s **Environment** scoping so Production and Preview use different Supabase projects.

1. **Vercel** → your repo → **Settings → Environment Variables**.
2. **Production (main branch):**
   - `VITE_SUPABASE_URL` = production Supabase URL (current project).
   - `VITE_SUPABASE_ANON_KEY` = production anon key.
   - Scope: **Production** only.
3. **Preview (e.g. omnium2026):**
   - `VITE_SUPABASE_URL` = **staging** Supabase URL.
   - `VITE_SUPABASE_ANON_KEY` = **staging** anon key.
   - Scope: **Preview** only (so all preview deployments, including omnium2026, use staging).

If you need different values per branch (e.g. only omnium2026 → staging, other branches → dev), you can add separate variables and use Vercel’s branch-specific overrides, or use one “Preview” scope so all previews share staging.

Redeploy after changing env vars so the build gets the right values.

### 5. Edge Functions per project

Deploy functions to each project that needs them:

```bash
# Link to staging project (do once per project)
supabase link --project-ref <STAGING-PROJECT-REF>

# Deploy all functions (or the ones you use)
supabase functions deploy send-magic-link
supabase functions deploy send-welcome-with-magic-link
supabase functions deploy send-email
supabase functions deploy create-leader
# ... etc.

# Repeat for development project
supabase link --project-ref <DEV-PROJECT-REF>
supabase functions deploy send-magic-link
# ...
```

Or use the Supabase Dashboard to deploy. Each project has its own function URLs; the app uses whichever Supabase URL is in `VITE_SUPABASE_URL` for that environment.

### 6. Keeping schema in sync

- **Manual:** When you add a migration (e.g. new `ADD_*.sql`), run it in **staging** and **dev** (and prod) as needed.
- **Supabase Migrations (optional):** Use `supabase migration new <name>` and `supabase db push` so each linked project gets the same migrations. Then run migrations after linking to staging/dev.

---

## Option B (two projects) in short

- Create only **one** new project: **Staging**.
- **Local:** In `.env`, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the **staging** project. Local and preview share the same DB.
- **Vercel Production:** Keep current production env vars (Production scope).
- **Vercel Preview:** Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the staging project (Preview scope).

---

## Checklist

- [ ] Create Staging (and optionally Dev) Supabase project(s).
- [ ] Run schema + any ADD/FIX SQL in the new project(s).
- [ ] Add redirect URLs (and Site URL) for staging and localhost in each project.
- [ ] Deploy Edge Functions to the new project(s); set RESEND_API_KEY (and any other secrets).
- [ ] Local: `.env` with dev (or staging) URL and anon key.
- [ ] Vercel: Production env vars → Production only; Staging env vars → Preview only.
- [ ] Redeploy main and omnium2026 so builds pick up the right env.

After this, local and staging use separate databases from production, and new volunteers/leaders/roles/domains created locally or on staging stay out of production.
