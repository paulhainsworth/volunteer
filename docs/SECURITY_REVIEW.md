# Security & Privacy Review

**Role:** Security / DevOps perspective  
**Scope:** Architecture, PII handling, auth, Edge Functions, RLS, and abuse vectors.  
**Date:** 2026-02 (reference only; re-validate after changes.)

---

## 1. Architecture Summary

| Layer | Technology | Notes |
|-------|------------|--------|
| Frontend | Svelte SPA, Vite | Deployed on Vercel (static). No server-side app code. |
| Auth | Supabase Auth | Passwordless magic link only. Session in `sessionStorage`, JWT in cookie/header. |
| Database | Supabase Postgres | RLS on all main tables. Anon key used from browser. |
| Serverless | Supabase Edge Functions (Deno) | send-magic-link, send-email, send-welcome-with-magic-link, create-volunteer-and-signup, create-leader. |
| Email | Resend | API key in Edge Function env only; not in client. |
| Secrets | Vercel env / Supabase secrets | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in client; service role and Resend only in Edge. |

PII lives in: **auth.users**, **profiles** (email, name, phone, role), **signups** (phone), **waivers** (signature, IP), **volunteer_contacts**.

---

## 2. Security Risks (by severity)

### Critical

| Risk | Description | Impact |
|------|-------------|--------|
| **C1. Unauthenticated send-email** | Edge Function `send-email` accepts `{ to, subject, html }` and does **no auth check**. Anyone who knows the project URL can call `POST .../functions/v1/send-email` (with anon key) and send arbitrary email from `notifications@berkeleyomnium.com`. | **Phishing, spam, domain abuse, Resend quota burn, reputational and legal harm.** |
| **C2. Profiles readable by everyone** | RLS on `profiles` has `SELECT` with `USING (true)`. **Anonymous** users can list all rows: email, first_name, last_name, phone, role. | **Full PII disclosure** to unauthenticated parties (scraping, enumeration). |

### High

| Risk | Description | Impact |
|------|-------------|--------|
| **H1. send-magic-link / send-welcome unauthenticated** | Both functions are callable without a JWT. An attacker can trigger magic-link emails to arbitrary addresses (e.g. target’s email) or abuse welcome emails. | **Harassment, account enumeration, Resend quota exhaustion.** |
| **H2. No rate limiting on Edge Functions** | Beyond Resend/Supabase platform limits, there is no per-IP or per-identifier throttling on magic-link or send-email. | **Amplifies C1/H1:** easier to automate abuse. |

### Medium

| Risk | Description | Impact |
|------|-------------|--------|
| **M1. CORS `*` on Edge Functions** | All functions use `Access-Control-Allow-Origin: *`. Any website can call them from the browser (with anon key). | **Makes C1/H1 exploitable from any malicious page** (e.g. “click to get a login link” that actually triggers many requests). |
| **M2. Session in sessionStorage** | Session stored in `sessionStorage` (no httpOnly). If XSS exists, tokens can be stolen. | **Account takeover** if XSS is introduced. Svelte’s default escaping reduces but does not eliminate risk. |
| **M3. get_confirmed_signup_counts(role_ids)** | RPC is `SECURITY DEFINER`, callable by anon. Accepts arbitrary `role_ids` array. | **Info disclosure:** probe which role IDs exist. **Minor DoS:** very large array could stress DB. |

### Lower

| Risk | Description | Impact |
|------|-------------|--------|
| **L1. volunteer_roles / volunteer_leader_domains SELECT public** | Role and domain metadata (names, leader names) are visible to all. | **Low:** likely intentional for “browse roles”; leader names are low-sensitivity. |
| **L2. Waivers table** | Contains signature and IP. RLS limits to own row + admin. | **Controlled;** ensure no anon read. |
| **L3. HTML in emails** | Leader/admin compose HTML (or plain text rendered as HTML). | **Stored content in email;** risk is limited if no unsanitized user HTML in subject/body. |

---

## 3. Proposed Solutions

### C1. Restrict send-email to authenticated callers

- **Change:** In `send-email` Edge Function, require a valid JWT (e.g. `Authorization: Bearer <token>`). Verify the user is **admin** or **volunteer_leader** (or another role you allow to send mail). Reject unauthenticated or unauthorized requests with 401/403.
- **Effect:** Only your app (with a logged-in admin/leader) can send email; arbitrary third parties cannot.
- **Caveat:** All current callers (leader dashboard, admin flows, volunteer signup) already send the user’s JWT with `invoke`. Ensure they use the same Supabase client that has the session.

### C2. Restrict profile SELECT (PII)

- **Change:** Replace “profiles viewable by everyone” with a policy that allows:
  - **Authenticated:** Read own row; admins can read all; volunteer_leaders can read profiles for volunteers in roles they lead (e.g. via signups join), if needed for UI.
  - **Anonymous:** No SELECT on `profiles`, or a **separate public view** that exposes only non-PII (e.g. `id`, `role`, or leader display name) for browse/UI.
- **Effect:** PII (email, name, phone) no longer exposed to unauthenticated users. Adjust any anon flows (e.g. volunteer browse) to use the RPC for counts and the minimal view for display.

### H1. Protect magic-link and welcome flows

- **Option A (recommended):** Require JWT for **send-welcome-with-magic-link** (only your signup flow should call it; use a short-lived token or session). For **send-magic-link**, consider:
  - Requiring a valid JWT (then only logged-out users on your login page are a problem), or
  - **Rate limit by IP and/or email** inside the function (e.g. in-memory or Supabase table: “max N magic links per email per hour, max M per IP per hour”).
- **Option B:** Keep anon call but add **strong rate limiting** (per email + per IP) and optional CAPTCHA on the login page before calling the function.

### H2. Rate limiting

- **Edge:** Use Supabase Edge middleware or a small wrapper: per IP (and optionally per email for magic-link) rate limit; return 429 when exceeded.
- **Resend:** You already have plan limits; consider Resend’s rate limits and back off when you get 429.
- **Application:** On the login page, disable “Send sign-in link” for 60–90 seconds after submit or after error to reduce burst abuse.

### M1. CORS

- **Change:** Set `Access-Control-Allow-Origin` to your actual origins (e.g. `https://volunteer-git-omnium2026-....vercel.app`, `https://your-production-domain.com`, `http://localhost:5173`) instead of `*`.
- **Effect:** Only your frontends can call the functions from the browser; same-origin policy plus auth checks limit abuse.

### M2. Session storage

- **Keep:** sessionStorage is acceptable if you rely on Supabase’s short-lived tokens and refresh. Prefer **no** `localStorage` for tokens if you can avoid it.
- **Harden:** Ensure every user-controlled output is escaped (Svelte default). Avoid `{@html}` with unsanitized input. Add a Content-Security-Policy header on Vercel if not already.

### M3. get_confirmed_signup_counts

- **Optional:** Cap the `role_ids` array size (e.g. max 500) inside the RPC and return error if exceeded.
- **Optional:** Restrict to `authenticated` only if the public volunteer page can work with cached counts or a different path; otherwise keep anon but limit input size.

---

## 4. Implementation Priority

1. **C1** – Add auth check to **send-email** (and optionally restrict to admin/leader). Stops unauthenticated email abuse immediately.
2. **C2** – Tighten **profiles** SELECT so anon cannot read PII; add a minimal public view if needed.
3. **H1** – Add rate limiting (and optionally JWT) for **send-magic-link** and **send-welcome-with-magic-link**.
4. **M1** – Restrict CORS to known origins.
5. **H2 / M2 / M3** – Rate limiting, CSP, and RPC cap as above.

---

## 5. Checklist (post-fix)

- [ ] send-email: only callable with valid JWT and role admin or volunteer_leader.
- [ ] profiles: no anon SELECT on PII; authenticated and role-based read only.
- [ ] send-magic-link / send-welcome-with-magic-link: rate limited by IP and/or email; optional JWT.
- [ ] Edge Functions: CORS set to allowed origins, not `*`.
- [ ] No secrets (service role, Resend key) in client or in repo.
- [ ] Session in sessionStorage; no sensitive tokens in localStorage; CSP considered.

---

## 6. Fix proposal for the two critical issues

### C1. send-email: require JWT and restrict to admin or volunteer_leader

**Current behaviour:** The function accepts any request with `to`, `subject`, `html` and sends via Resend. No check of who is calling.

**Proposed change:**

1. **Require Authorization header**  
   If `Authorization: Bearer <token>` is missing or invalid, return `401` with a clear message (e.g. "Authentication required").

2. **Resolve caller identity**  
   Use the same pattern as `create-volunteer-and-signup` and `create-leader`:
   - Call `GET ${SUPABASE_URL}/auth/v1/user` with the request’s `Authorization` header to get the user id.
   - If that fails or returns no user, return 401.

3. **Load caller role**  
   Query `profiles` (with the service-role client) for `id = auth.uid()` and read `role`.

4. **Allow only admin or volunteer_leader**  
   If `role` is not `admin` and not `volunteer_leader`, return `403 Forbidden` (e.g. "Not allowed to send email").

5. **Then send email**  
   Keep the existing Resend call and response shape so current callers don’t need to change.

**Call sites (all in-app, with session):**

- Leader dashboard: leader sends to volunteers (leader is `volunteer_leader`).
- Admin Roles list: “Email this domain’s volunteers” (admin).
- Admin Domains: invite leader (admin).
- Volunteer MySignups: cancel/notify leader (volunteer; **not** admin/leader) – **see production risk below**.
- volunteerSignup.js: post–signup confirmation (likely unauthenticated or volunteer) – **see production risk below**.

So the only design choice is: do we allow **volunteers** to call `send-email` (e.g. for “notify leader when I cancel”)? If yes, allow `role === 'volunteer'` as well; if no, restrict to admin + volunteer_leader and move volunteer-triggered emails to another path (e.g. a dedicated “notify-leader” function that only sends a fixed template). **Recommendation:** Allow **admin** and **volunteer_leader** only for the generic `send-email`; if volunteers need to notify leaders, use a separate Edge Function that only sends a single, server-defined template (no arbitrary `to`/`subject`/`html` from the client).

**Files to change:**  
- `supabase/functions/send-email/index.ts`: add auth block at the top (read JWT → get user → get role → reject if not admin/volunteer_leader).

---

### C2. profiles: stop world-readable PII

**Current behaviour:** RLS on `profiles` has a SELECT policy with `USING (true)`, so anonymous and authenticated users can read every row (email, first_name, last_name, phone, role).

**Proposed change:**

1. **Drop the “everyone can read” policy**  
   Remove the policy that allows `USING (true)` for SELECT on `profiles`.

2. **Add a new SELECT policy** that allows:
   - **Own row:** `auth.uid() = id`
   - **Admin:** `EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')` (admins can read all profiles).
   - **Volunteer leaders (only for volunteers in their roles):**  
     “Profile P is visible if the current user is a volunteer_leader and P is the volunteer on a signup for a role they lead.”  
     In SQL:  
     `EXISTS (  
       SELECT 1 FROM signups s  
       JOIN volunteer_roles vr ON s.role_id = vr.id  
       LEFT JOIN volunteer_leader_domains vld ON vr.domain_id = vld.id  
       WHERE s.volunteer_id = profiles.id  
         AND (vr.leader_id = auth.uid() OR vld.leader_id = auth.uid())  
     )`  
     So leaders only see profiles of volunteers who are signed up for roles they lead (or for domains they lead).

3. **Anonymous users**  
   With the above, anon has no SELECT on `profiles`. So:
   - **Public volunteer browse** today uses `roles.fetchRoles()`, which does a nested select on `volunteer_roles` including `domain.leader:profiles!leader_id(...)` and `created_by:profiles!(...)`. With RLS applied, anon will get no profile rows back for those nested reads, so `role.domain.leader` and `role.direct_leader` (and `created_by`) will be null.
   - **Acceptable outcome (minimal change):** The browse page already handles missing leader with “Volunteer Leader TBD”. So we can ship with anon seeing no leader names; the UI will show “Led by Volunteer Leader TBD” for every role when not logged in.
   - **Optional improvement later:** Add a SECURITY DEFINER RPC, e.g. `get_roles_public()`, that returns role metadata plus only `leader_first_name` and `leader_last_name` (no email, no profile id), and have the public browse page call that when not authenticated so “Led by Jane Doe” still works without exposing PII.

**Files / artifacts to change:**  
- **SQL (run in Supabase):**  
  - `DROP POLICY "Public profiles are viewable by everyone" ON profiles;` (or whatever the exact policy name is).  
  - `CREATE POLICY "Profiles readable by self, admin, or leader for own-role volunteers" ON profiles FOR SELECT USING (...)` with the three conditions above.  
- **Frontend:** No change required if you accept “Volunteer Leader TBD” for anon. If you add `get_roles_public()`, then in `roles.js` (or the browse route) use that RPC when the user is not authenticated instead of the current `fetchRoles()` that joins to profiles.

---

## 7. Production risks of applying these fixes

### C1 (send-email) – production risks

| Risk | What could go wrong | Mitigation |
|------|---------------------|------------|
| **Caller doesn’t send JWT** | A legitimate in-app flow uses a Supabase client that doesn’t attach the session (e.g. server-side or a different client). The function returns 401 and the feature breaks (e.g. “Email this domain’s volunteers” fails). | All current call sites use the same `supabase` client from the browser, which auto-attaches the session. Verify in code that every `invoke('send-email', …)` is from a page where the user is logged in and the same client is used. |
| **Volunteer-triggered email breaks** | MySignups or volunteerSignup.js calls `send-email` as a volunteer. If we allow only admin/volunteer_leader, that call starts returning 403 and “notify leader on cancel” (or similar) stops working. | Before deploy: identify every call to `send-email`. If any are as volunteer, either (a) add `volunteer` to the allowed roles for the generic function (weaker: volunteers can still only send what the app sends), or (b) create a dedicated “notify-leader” function that only sends a fixed template and allow volunteers to invoke that. |
| **Rollback** | After deploy, something breaks and you need to restore email quickly. | Keep a one-line revert: remove the auth block from `send-email` and redeploy the function so it again allows unauthenticated calls. Re-enable the auth fix once the bug is fixed. |

### C2 (profiles RLS) – production risks

| Risk | What could go wrong | Mitigation |
|------|---------------------|------------|
| **Anonymous browse breaks** | The volunteer browse page or homepage assumes `role.domain.leader` / `role.direct_leader` / `created_by` are present. After locking profiles, anon gets nulls and the UI could throw (e.g. “cannot read first_name of null”) or show broken layout. | The existing UI already uses “Volunteer Leader TBD” when leader is missing, so nulls should be handled. Before deploy: test the public volunteer page and homepage **while logged out** and confirm no JS errors and that “Led by Volunteer Leader TBD” (or similar) appears. |
| **Authenticated flows miss profiles** | A query used by a leader or admin assumes they can read some profile that the new policy doesn’t allow (e.g. a profile not in “volunteers in my roles”). Then that screen breaks or shows empty data. | The proposed policy gives leaders access only to profiles that appear in signups for roles they lead. That matches “Email my volunteers” and “view signups.” Admins can read all. Test as a volunteer_leader: open leader dashboard, expand roles, confirm volunteer names/emails still load. Test as admin: open Users and Roles, confirm all profile data still loads. |
| **RLS policy error** | A typo or logic error in the new USING clause (e.g. wrong table alias) causes Postgres to reject the policy or to deny legitimate reads. | Test in a staging/dev environment first. Run: as anon, `SELECT * FROM profiles` → expect 0 rows. As a volunteer (own profile only), as leader (own + volunteers in their roles), as admin (all). Fix policy and re-run until correct. |
| **Rollback** | After deploy, something breaks and you need to restore profile read access. | Re-create the old policy: `CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);` and drop the new one. That restores the old (insecure) behaviour until you can fix the new policy. |

### General

- **Order of deploy:** Fix C1 first (send-email), then C2 (profiles). That way you don’t leave unauthenticated email open while changing RLS.
- **Staging:** Apply both changes on staging (omnium2026) and run through: login, leader dashboard, admin roles/domains/volunteers, public browse (logged out), volunteer signup and cancel. Then deploy to production.

---

*This document is a point-in-time review. Re-run and update after major changes or before production go-live.*
