# Staging Environment: Design and Build Plan

This mini-project sets up a **separate staging environment** so you can test backend and feature work without affecting production users, data, or volunteer leaders.

---

## 1. Problem summary

| Problem | Impact |
|--------|--------|
| Backend changes (RLS, schema, Edge Functions) hit production before you can test them | Risk of breakage or security regressions for real users |
| Adding test domains, test volunteers, test leaders | Production is cluttered; real leaders see test accounts |
| Filling role slots with test signups | Real volunteers can’t sign up; fill counts are wrong |
| Volunteer leaders get notified when you add/remove test volunteers | Noisy and unprofessional; erodes trust |
| Can’t iterate on new features online without affecting production | Either you don’t test fully, or you accept impacting prod |

---

## 2. Goals

- **Staging mimics production** – Same app code, same schema, same behavior. The only difference is *which* Supabase project (and thus which data) the app talks to.
- **You control when they diverge** – You deploy a change to **staging first** (new branch → Vercel Preview → staging Supabase). Staging diverges; production is unchanged.
- **After testing in staging, you promote to production** – Deploy the same code (and apply the same schema/RLS/Edge Function changes) to production. Prod and staging are aligned again.
- **Production doesn’t break** – Because the exact same change was already tested in staging, promoting to prod is low risk.

---

## 3. Design principles (solo dev, minimal complexity)

- **One codebase** – No separate “staging app” repo. Same repo; environment is decided by **which Supabase project** the build talks to (via env vars).
- **Two Supabase projects** – **Production** (current) and **Staging** (new). Each has its own database, Auth, and Edge Functions. No shared data.
- **Promote code and schema, not data** – You do *not* copy staging’s database to production. You run the same SQL migrations and deploy the same Edge Functions to prod after testing in staging. Staging data stays in staging.
- **Branch → environment mapping** – `main` deploys to **production** (prod Supabase). A dedicated branch (e.g. `omnium2026` or `staging`) deploys to **staging** (staging Supabase) via Vercel Preview. Optional: localhost can point at staging so you test against the same backend as the staging URL.
- **Schema as code** – All schema and RLS changes live in the repo (e.g. `ADD_*.sql`, `FIX_*.sql`). You run them on **staging first**, then on production when you’re ready. No “prod-only” manual SQL that isn’t in the repo.

---

## 4. Proposed design

### 4.1 Environments

| Environment | Supabase project | When it’s used |
|-------------|------------------|------------------|
| **Production** | Current project (e.g. `hxlmpyqmerqsjtczhard`) | Live users; `main` branch → berkeleyomnium.com (or your prod URL). |
| **Staging** | New project (e.g. `volunteer-staging`) | Testing; preview deployments (e.g. omnium2026) and optionally localhost. |

You do **not** need a third “dev” project unless you want localhost to have its own DB. For simplicity, **localhost can point at the same staging project** so local and the staging URL share one backend.

### 4.2 Data

- **Production** – Real users, real volunteers, real leaders, real signups. No test accounts here.
- **Staging** – Empty or lightly seeded (e.g. one admin, one domain, one role). You create test volunteers, test leaders, and test signups here. No sync from prod; no copy of prod PII required. If you ever want a one-time anonymized copy of prod for load testing, that can be a separate, manual step.

### 4.3 Code and config

- **Single repo** – No forks. Branch `main` = production build; branch `omnium2026` (or `staging`) = staging build.
- **Vercel** – Production deployment uses **Production** env vars (prod Supabase URL + anon key). Preview deployments (e.g. from `omnium2026`) use **Preview** env vars (staging Supabase URL + anon key).
- **Local** – `.env` (or `.env.local`) holds either staging or prod Supabase URL + anon key. For day-to-day feature work, point at **staging** so local and staging URL behave identically.

### 4.4 Auth redirects

- Supabase Auth **Redirect URLs** must include the exact origins that will call it. For the **staging** project, add:
  - `https://<your-staging-preview-url>.vercel.app/` (and `.../#/auth/callback` if you use hash-based callback)
  - `http://localhost:5173/` if you run local against staging.
- Production project already has prod and any existing preview URLs; leave as-is or tighten to prod-only when staging is live.

### 4.5 Edge Functions and secrets

- Each Supabase project has its **own** Edge Functions and secrets. Deploy the same function code to **staging** first, test (magic link, send-email, create-volunteer-and-signup, etc.), then deploy the **same** code to **production**.
- **RESEND_API_KEY** – Can be the same key in both projects (staging will send real emails from your domain) or a separate key for staging if you prefer. Same key is simpler; be aware staging tests can send real email.

### 4.6 What “mimics production” means

- **Schema** – Tables, RLS, triggers, RPCs in staging are the same as (or a superset of) production. You achieve this by running the same migration SQL in both, with staging first.
- **Code** – The app is the same; only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` differ per environment. So staging “mimics” prod until you deploy a **new** version to staging only; then staging diverges until you deploy that version to prod too.

### 4.7 What we’re *not* doing

- **No continuous DB sync** – We don’t copy production DB to staging on a schedule. Staging has its own data; you create test data there.
- **No “promote staging DB to prod”** – We don’t overwrite prod’s database with staging’s. We promote **code** and **schema** (migrations + Edge Functions).
- **No separate staging “brand” or feature flags** – Same app; only the backend (Supabase project) changes. Optional: later you could add a small env indicator (e.g. “Staging” in the header) when `import.meta.env.VITE_SUPABASE_URL` contains “staging”, but it’s not required for this mini-project.

---

## 5. Workflow (after setup)

### 5.1 Normal flow: new feature or backend change

1. **Branch** – Work on `omnium2026` (or your staging branch).
2. **Schema / RLS / SQL** – Write or update SQL in the repo. Run it in the **staging** Supabase project (SQL Editor or migrations). Confirm behavior in staging (and locally if pointed at staging).
3. **Edge Functions** – Change function code in the repo. Deploy to **staging** only:  
   `supabase link --project-ref <staging-ref>` then `supabase functions deploy <name>`. Test (magic link, emails, create-volunteer, etc.).
4. **Frontend** – Push to `omnium2026`. Vercel builds and deploys to Preview using **staging** env vars. Test on the staging URL (and localhost if it uses staging).
5. **When satisfied** – Merge `omnium2026` into `main` (or open a PR and merge). Run the **same** SQL on the **production** Supabase project if you haven’t already. Deploy the **same** Edge Functions to the **production** project. Vercel will deploy `main` to production with prod env vars. Production and staging now match again; production doesn’t break because you already validated the change in staging.

### 5.2 Production-only hotfix (rare)

- If you must fix prod without testing in staging first: make the change (e.g. RLS or function), apply to **production**, then apply the **same** change to **staging** and repo so the two stay in sync.

### 5.3 Day-to-day testing

- Use **staging** (and/or localhost pointed at staging) for: adding domains, creating test volunteers, assigning leaders, filling role slots, testing emails. Real production users and leaders are unaffected; no test notifications; no stolen role slots.

---

## 6. Build and deploy plan (checklist)

Use this as a one-time setup plus a short “go-live” checklist.

### Phase 1: Create and configure the staging Supabase project

- [ ] **6.1** In [Supabase Dashboard](https://supabase.com/dashboard), create a **new project** (e.g. name: `volunteer-staging`), same region as prod, set and store the DB password.
- [ ] **6.2** In the **staging** project, run your schema and RLS in order. **Easiest:** run the single combined file **`scripts/STAGING_APPLY_ALL.sql`** once in the SQL Editor. Alternatively, run the 23 files below in order.
- [ ] **6.3** In **Authentication → URL Configuration** for the staging project, add **Redirect URLs**:
  - Your Vercel preview URL for the staging branch, e.g. `https://volunteer-git-omnium2026-paul-hainsworths-projects.vercel.app/`
  - `http://localhost:5173/` if you will run local against staging.
- [ ] **6.4** In **Settings → API** for the staging project, copy the **Project URL** and **anon public** key. You’ll use these in Vercel and optionally in `.env`.

**Phase 1 – SQL run order (run these in the staging project SQL Editor, in this order):**

| # | File |
|---|------|
| 1 | `SUPABASE_SCHEMA.sql` |
| 2 | `FIX_PROFILE_INSERT_RLS.sql` |
| 3 | `FIX_PROFILES_UPDATED_AT.sql` |
| 4 | `FIX_UPDATE_POLICY.sql` |
| 5 | `ADD_EMERGENCY_CONTACT.sql` |
| 6 | `FIX_SIGNUP_FK_PROFILE_TRIGGER.sql` |
| 7 | `ADD_VOLUNTEER_LEADER_ROLE.sql` |
| 8 | `FIX_PROFILES_ROLE_CONSTRAINT_FOR_LEADER.sql` |
| 9 | `ADD_LEADER_DOMAINS_SAFE.sql` |
| 10 | `FIX_SIGNUPS_RLS_DOMAIN_LEADER.sql` |
| 11 | `FIX_SIGNUPS_RLS_LEADER_VIEW.sql` |
| 12 | `FIX_VOLUNTEER_ROLES_UPDATE_RLS.sql` |
| 13 | `FIX_ROLE_UPDATE_POLICY.sql` |
| 14 | `FIX_ADMIN_UPDATE_ROLES.sql` |
| 15 | `FIX_ADMIN_SIGNUP_RLS.sql` |
| 16 | `ADD_FEATURED_ROLES.sql` |
| 17 | `ADD_TEAM_CLUB_AFFILIATION.sql` |
| 18 | `ADD_PUBLIC_SIGNUP_COUNTS_RLS.sql` |
| 19 | `scripts/ADD_OMNIUM2026_ROLE_COLUMNS.sql` |
| 20 | `scripts/ADD_VOLUNTEER_CONTACTS.sql` |
| 21 | `FIX_CREATE_LEADER_LINK_TRIGGER.sql` |
| 22 | `FIX_CREATE_LEADER_DB_ERROR.sql` |
| 23 | `FIX_RLS_COMPLETE.sql` |

**Not run (one-off or diagnostic):** `CREATE_DEFAULT_ADMIN.sql` (optional: create an admin user in Auth then run its `UPDATE profiles` snippet), `SUPABASE_TRIGGER_FIX.sql` (older trigger), `COMPLETE_VOLUNTEER_LEADER_SETUP.sql` (overlaps with 7–15), `CLEANUP_TEST_USERS.sql`, `DEBUG_PERMISSIONS.sql`, `CHECK_ADMIN_AND_RLS.sql`, and any `scripts/REMOVE_*.sql`, `scripts/CLEAN_*.sql`, or `scripts/generated_*.sql`.

### Phase 2: Deploy Edge Functions to staging

- [ ] **6.5** In your repo: `supabase link --project-ref <staging-project-ref>` (get the ref from the staging project URL or dashboard).
- [ ] **6.6** Set Edge Function secrets for the staging project:  
  `supabase secrets set RESEND_API_KEY=<your-key> --project-ref <staging-ref>`  
  (Or set them in the dashboard under Edge Functions → Secrets.)
- [ ] **6.7** Deploy all Edge Functions to the staging project:  
  `supabase functions deploy send-magic-link`  
  `supabase functions deploy send-welcome-with-magic-link`  
  `supabase functions deploy send-email`  
  `supabase functions deploy create-leader`  
  `supabase functions deploy create-volunteer-and-signup`  
  (Include any others you use.)
- [ ] **6.8** Smoke-test: from a build that points at staging (or local with staging in `.env`), request a magic link and send a test email to confirm functions run against staging.

### Phase 3: Vercel environment variables

- [ ] **6.9** In Vercel → your repo → **Settings → Environment Variables**:
  - **Production:** Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set to the **production** Supabase project and scoped to **Production** only.
  - **Preview (staging):** Add (or update) `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` with the **staging** project URL and anon key. Scope them to **Preview** (so all preview deployments, including omnium2026, use staging).
- [ ] **6.10** Redeploy the **staging** branch (e.g. omnium2026) so the preview build picks up the new Preview env vars. Confirm the preview site uses staging (e.g. request a magic link and check it’s sent via the staging project).

### Phase 4: Local development (optional but recommended)

- [ ] **6.11** In the repo root, create or edit `.env` (or `.env.local`; ensure it’s in `.gitignore` if the repo is public). Set:
  - `VITE_SUPABASE_URL` = staging project URL  
  - `VITE_SUPABASE_ANON_KEY` = staging anon key  
  so that `npm run dev` talks to staging by default.
- [ ] **6.12** Run `npm run dev`, open localhost, and confirm you can sign in (magic link) and see empty or seeded data from staging—not production.

### Phase 5: Seed staging (optional)

- [ ] **6.13** Optionally create one admin user and one or two domains/roles in the staging project (via the app or SQL) so you have something to log in as and test with. No need to copy production data.

### Phase 6: Document and “go live”

- [ ] **6.14** In the repo, add a short note (e.g. in README or `docs/ENVIRONMENTS_AND_DATABASES.md`) that:
  - Production = `main` + prod Supabase; Staging = omnium2026 (or staging branch) + staging Supabase; local can point at staging via `.env`.
  - Schema and Edge Function changes should be applied to staging first, then to production after testing.
- [ ] **6.15** From here on: do all “risky” or iterative work (new features, RLS changes, new functions) on the staging branch and staging Supabase; only after testing, merge to `main` and apply the same SQL/functions to production.

---

## 7. Summary

- **Two Supabase projects** (prod + staging) give you a place to test without touching production data or notifying real leaders.
- **Same codebase**; environment is chosen by Vercel env (Production vs Preview) and local `.env`.
- **Staging mimics production** because it runs the same schema and app; it **diverges** only when you deploy new code/schema to staging first, and **converges** again when you promote the same changes to production.
- **Build and deploy plan** above is a linear checklist: create staging project → apply schema → configure Auth URLs → deploy functions and secrets → set Vercel env vars → point local at staging → optionally seed and document. After that, your day-to-day is: develop on staging branch, test on staging (and local), then merge to main and apply same SQL/functions to prod so nothing breaks in production.
