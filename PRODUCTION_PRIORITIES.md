# Production Priorities — Implementation Roadmap

Original organizer priorities from January 2026. Use the [production readiness roadmap](PRODUCTION_READINESS_ROADMAP.md) for current implementation status and sequencing.

---

## 1. Admin uploads a sheet of all volunteer jobs

**Fields:** names, descriptions, domain, start/end date and time.

### Current state
- **Bulk upload exists:** Admin uses **Roles → Bulk Upload** (BulkUpload.svelte).
- **CSV format:** `name`, `description`, `event_date`, `start_time`, `end_time`, `location`, `positions_total`, `domain_name`, `leader_email`.
- **Parser:** `csvParser.js` validates and parses; RolesList creates roles and resolves `domain_name` → `domain_id`, `leader_email` → `leader_id`.

### Gaps / changes
- [ ] **Document** that the upload flow fully supports your preferred sheet format (names, descriptions, domain, start/end date and time).
- [ ] **Template:** Ensure the download template and CSV_FORMAT.md clearly show `domain_name` and `description`. Template already includes them; add a short “production checklist” note in CSV_FORMAT.
- [ ] **Optional:** Support **multiple dates per role** (e.g. same role on several days) if you need that. Right now one row = one `event_date`; multiple days = multiple rows.

### Verdict
**Mostly done.** Small doc/template tweaks; no major code changes unless you add multi-date roles.

---

## 2. Admin sanity-checks the volunteer site after upload

**Goal:** Admin uses the **volunteer-facing** browse experience to verify the upload.

### Current state
- **Browse page:** `/volunteer` (BrowseRoles) shows roles grouped by domain, with filters (search, race day, status, date).
- **Auth:** Layout does not block `/volunteer`; unauthenticated users can open it. BrowseRoles redirects **only** logged-in users without `emergency_contact_name` to `/onboarding`.
- **Admins:** Typically have profiles; if they have `emergency_contact_name`, they are not redirected. They can use `/volunteer` to sanity-check.

### Gaps / changes
- [ ] **Admin access:** Confirm admins are never forced to onboarding when sanity-checking. If any admin hits onboarding, add an explicit **skip for admins** when visiting `/volunteer` (or when `role === 'admin'`).
- [ ] **Discovery:** Add a **“View as volunteer”** or **“Preview volunteer site”** link from the admin dashboard (or Roles) → `/volunteer`, so admins know to use it for sanity-checking.
- [ ] **Optional:** Add a subtle “Admin preview” banner on `/volunteer` when `isAdmin` so it’s clear they’re checking the volunteer view.

### Verdict
**Mostly done.** Clarify admin onboarding behavior and add an explicit “sanity-check” entry point from admin UI.

---

## 3. Admin can easily add/remove jobs via the volunteer site tools

**Goal:** Add and remove jobs through the **same** “volunteer site” tooling, not a separate admin-only UI.

### Current state
- **Add/edit/delete roles:** Done in **Admin → Roles** (RolesList). Uses RoleForm, create/edit/delete, bulk upload.
- **“Volunteer site”:** Usually means `/volunteer` (browse). Today, **adding/removing jobs** is in the **admin** area, not on the browse page.

### Clarification
- **Option A:** “Volunteer site tools” = **admin** tools that **manage** what volunteers see (Roles, Domains, etc.).  
  → **Already done:** Admin uses Roles + Domains. No change.
- **Option B:** You want **add/remove jobs** to be possible **on the browse page** itself (e.g. when an admin views `/volunteer`).  
  → **New work:** Add “Add role” / “Edit” / “Delete” on `/volunteer` for admins only (e.g. when `isAdmin`).

### Recommended
- [ ] **Treat “volunteer site tools” as admin tools** that affect the volunteer experience. Keep add/remove in **Admin → Roles**.
- [ ] **Improve discoverability:** Ensure admin nav clearly links “Roles” and “Bulk Upload,” and that **Roles** is the obvious place to add/remove jobs.
- [ ] **If you prefer Option B:** Add a small “Manage roles” (or similar) section or buttons on `/volunteer` for admins that link to `/admin/roles` or open create/edit modals.

### Verdict
**Largely done** if we interpret “volunteer site tools” as the admin tooling. Optional: surface “add/remove” from the volunteer browse view for admins.

---

## 4. Admin adds volunteer bosses to domains (no self‑invite to domain)

**Goal:** Admin **assigns** bosses to domains. Bosses do **not** “invite themselves” to a domain; they are **added** by admin.

### Current state
- **Domains:** `volunteer_leader_domains` with `leader_id` → `profiles`.
- **Admin UI:** Domains.svelte → create/edit domain → “Assign Volunteer Leader” dropdown. Only **existing** users with `volunteer_leader` role can be chosen.
- **Flow:** You must first **create** a leader (e.g. promote a user to `volunteer_leader` in Users), **then** assign them to a domain. There is no “add by email and invite” flow.

### Gaps / changes
- [ ] **Add boss by email:** New flow: Admin enters **email** (and optionally name) for a domain leader who may **not** have an account yet. System stores “pending leader” for that domain (new table or `volunteer_leader_domains` extended with `invite_email`, `invite_sent_at`, etc.).
- [ ] **No self-invite:** Remove or hide any “invite yourself to this domain” / “claim domain” flow for non-admins. Domain assignment is **admin-only**.
- [ ] **Invite sending:** When admin “adds” a boss by email, we send an **invite** (see #5). Until they accept, domain can show “Leader: pending (email)” or similar.

### Verdict
**Partially done.** Assignment of **existing** leaders works. Need **“add by email” + invite** and **no self-invite** for domains.

---

## 5. Boss receives an invite when manually added by admin

**Goal:** When admin adds a boss to a domain (#4), that person receives an **invite** to join the tool.

### Current state
- **No invite flow** for domain leaders. RolesList has some “invite” wording for **creating** leaders (e.g. new user + assign to domain), but there is no standardized “you’ve been added as leader of X” email with sign-up/login link.

### Gaps / changes
- [ ] **Invite content:** Email: “You’ve been added as volunteer leader for [Domain]. Sign up or log in here: [link].” Link = app login/signup (or magic-link sign-in, see #7–8).
- [ ] **Trigger:** Sent when admin “adds” a boss (by email) to a domain. Use Resend (or existing `send-email` edge function); store `invite_sent_at` / `invite_email` to avoid duplicates and for debugging.
- [ ] **Accept flow:** Link goes to login/signup. After auth, user is **promoted to `volunteer_leader`** (if not already) and **linked to the domain** (e.g. `leader_id` or domain–leader table). Token or query param can encode `domain_id` + optional `invite_id` so we know which domain they’re accepting.
- [ ] **Idempotency:** If admin re-adds same email, you can either skip sending again or send a “reminder” invite, depending on product choice.

### Verdict
**New feature.** Implement “add boss by email” + “send invite” + “accept invite” (link → login/signup → promote + assign to domain).

---

## 6. Volunteers can browse jobs without signing in

**Goal:** Browse opportunities **fully** without creating an account or logging in.

### Current state
- **Route:** `/volunteer` is **not** behind auth. Anyone can open it.
- **Data:** Roles are public (RLS allows read for everyone). BrowseRoles fetches roles and shows filters, domains, role cards.
- **Redirect:** **Only** logged-in users **without** `emergency_contact_name` are redirected to `/onboarding`. Logged-out users are **not** redirected; they can browse.
- **Nav:** For **anonymous** users, Layout shows “Login” and “Sign Up”. Home has “Browse Opportunities” → `#/volunteer`. So they **can** browse, but “Browse” is not in the main nav when logged out.

### Gaps / changes
- [ ] **Nav:** Add a “Browse” (or “Opportunities”) link in the **anonymous** nav that goes to `#/volunteer`, so browsing without sign-in is obvious.
- [ ] **Redirect / onboarding:** Keep redirect **only** for logged-in users missing emergency contact. Ensure **admins** (and optionally leaders) can skip onboarding when checking the volunteer view (see #2).
- [ ] **Sign-up CTA:** When browsing unauthenticated, “Sign up” on a role should lead to the **role-specific sign-up flow** (enter email → magic link → confirm; see #7), not the generic “Sign Up” page, or at least make the path clear.

### Verdict
**Mostly done.** Add “Browse” for anon users and tighten onboarding skip for admins. Optional: better “Sign up for this role” entry from browse.

---

## 7. Volunteer signs up with email only; magic link; no verification required; confirmation email

**Goal:**
- Volunteer **chooses a job** → we ask for **email only**.
- We use **magic link** for sign-in (no password).
- **Email verification is not required** to complete the sign-up (they’re “signed up” as soon as we record it).
- We send a **confirmation email** with a short **role summary** after sign-up.

### Current state
- **Sign-up:** VolunteerSignup (`/signup/:id`) requires **logged-in** user. If not logged in, we redirect to login. We also use **waiver** and **emergency contact** (onboarding).
- **Auth:** Email/password sign-up and login. **No** magic link ( Supabase `signInWithOtp` ) yet.
- **Confirmation email:** Not sent when signing up for a role.

### Gaps / changes (large)

- [ ] **Sign-up flow (no login first):**
  - Allow **unauthenticated** users to open `/signup/:id` (role page).
  - **Step 1:** “Sign up for this role” → single field: **email**.
  - **Step 2:** We **create the sign-up** immediately (see below). **Do not** require magic-link click to consider them “signed up.”
  - **Step 3:** Send **confirmation email** with role name, date, time, location, and link to “view my signups” (magic-link sign-in URL or app URL).

- [ ] **Magic link (passwordless):**
  - Use **Supabase `signInWithOtp`** for “Email me a sign-in link” both on **login** and in the **sign-up** flow (e.g. “We’ve sent you a link to manage your signups”).
  - **Optional:** Also send magic link **in** the confirmation email so they can “sign in and see my signups” in one click.

- [ ] **“Verification not required”:**
  - We **do not** wait for the user to click the magic link to **record** the sign-up. Sign-up is stored as soon as they submit email.
  - **Schema:** Today `signups.volunteer_id` references `profiles`. We need a way to store sign-ups **before** a user exists. Options:
    - **A)** Add `signups.guest_email` (nullable). Allow `(volunteer_id, guest_email)` with `volunteer_id IS NULL` when guest signs up. When they later sign in via magic link, we **create** `profiles` from auth, then **link** those sign-ups (`UPDATE signups SET volunteer_id = :id WHERE guest_email = :email`).
    - **B)** Create a **minimal** Supabase user + profile **at sign-up time** (e.g. invite by email), then create sign-up with `volunteer_id`. They “verify” only when they use magic link to log in. Simpler for queries but creates many users who may never log in.
  - **Recommended:** **A)** `guest_email` + nullable `volunteer_id`, plus **claim** logic when they first sign in via magic link.

- [ ] **Waiver / onboarding:**
  - You didn’t mention waiver or emergency contact. Decide:
    - **Option 1:** Keep waiver **after** they’ve “signed up” (e.g. on first magic-link login, before they can see “My signups”).
    - **Option 2:** Waiver optional or removed for this flow.
    - **Option 3:** Single “I agree” checkbox on the email-only sign-up form (no full waiver).
  - Same for **emergency contact:** keep only for logged-in dashboard, or collect later, or drop for volunteers.

- [ ] **Confirmation email:**
  - **Trigger:** Right after we create the sign-up (with `guest_email` or `volunteer_id`).
  - **Content:** Role name, date, time, location, “View my signups” link (magic-link or app URL).
  - Use existing `send-email` edge function + Resend (or equivalent).

### Verdict
**New flow.** Needs: schema change (`guest_email` + claim flow), magic-link auth, new sign-up UX (email-only → immediate sign-up → confirmation email), and product call on waiver/onboarding.

---

## 8. Volunteers return to see role details; sign in via email + magic link

**Goal:** Volunteers can **come back later**, sign in with **email + magic link**, and see **what they signed up for** (role details).

### Current state
- **My signups:** `MySignups` at `/my-signups` shows roles the user is signed up for. **Requires** logged-in user. Redirects to `/onboarding` if no `emergency_contact_name`.
- **Login:** Email + **password**. No magic link.

### Gaps / changes
- [ ] **Magic-link sign-in:** Add “Email me a sign-in link” on **Login** page. Use `signInWithOtp`. User enters email → we send link → they click → Supabase signs them in → redirect to `/my-signups` (or “last intended” URL).
- [ ] **Volunteer flow:** For volunteers, **emphasize** magic link over password (or make magic link the **default**). Optional: keep password as fallback for those who set one.
- [ ] **Claim guest sign-ups:** When user signs in via magic link **for the first time**, run **claim** logic: `UPDATE signups SET volunteer_id = :id WHERE guest_email = :email`. Then they see those roles under “My signups.”
- [ ] **Onboarding:** Avoid blocking “My signups” for **volunteers** who only use magic link. Either:
    - Skip emergency-contact redirect for “magic-link-only” volunteers, or
    - Collect emergency contact **after** first magic-link login (e.g. on “My signups” or a lightweight onboarding step).
- [ ] **Role details:** Ensure “My signups” (and any role-detail view) shows **full** role info: name, description, domain, date, time, location. Enrich from `volunteer_roles` + `volunteer_leader_domains` as needed.

### Verdict
**Partially done.** “My signups” exists. Need **magic-link login**, **claim** of `guest_email` sign-ups, and **no blocking** of “My signups” for magic-link-only volunteers.

---

## 9. Bosses email their volunteers; admins email all or by domain

**Goal:**
- **Bosses:** Can send **messages** to **their** volunteers (by domain/team). Messages are delivered by **email**.
- **Admins:** Can send email to **all** volunteers **or** to **one or more domains** (not only “all” or “by role/date”).

### Current state
- **Communications:** Admin-only. `Communications.svelte` has recipient types: **all**, **role**, **date**. **No “by domain”** option. Sending is **placeholder** (simulated).
- **Leader dashboard:** Leaders see their roles and volunteers. **No “Email my volunteers”** flow that actually sends email.

### Gaps / changes
- [ ] **Admin – “By domain”:** Add recipient type **“By domain”**. Multiselect domains. Resolve to all volunteers who have **sign-ups** in roles belonging to those domains. Reuse existing email composer (subject, body, merge fields).
- [ ] **Admin – real email:** Replace placeholder with **real** sending (Resend + `send-email` edge function). Store `emails_sent` (or equivalent) for auditing.
- [ ] **Boss – “Email my volunteers”:** New UI on **Leader dashboard**: “Email my volunteers” (or “Message my team”). Composer: subject, body. Recipients = volunteers signed up for **any** role in **this leader’s** domain(s). Send via same email infra.
- [ ] **Permissions:** Only leaders can email **their** volunteers. Admins can email **all** or **by domain**. Enforce in backend (e.g. edge function or RLS) when resolving recipient lists.

### Verdict
**Partially done.** Admin composer exists but no “by domain” and no real sending. Leader “email my volunteers” is **new**. Both need wiring to real email.

---

## Summary: what to build (in your order)

| # | Priority | Status | Main work |
|---|----------|--------|-----------|
| 1 | Upload sheet of jobs | ✅ Mostly done | Doc/template tweaks; optional multi-date |
| 2 | Admin sanity-check on volunteer site | ✅ Mostly done | Admin skip onboarding; “View as volunteer” link |
| 3 | Add/remove jobs via volunteer site tools | ✅ Done | Use Admin → Roles; optional links from /volunteer |
| 4 | Add bosses to domains (no self-invite) | 🟡 Partial | “Add by email”; remove self-invite |
| 5 | Boss invite when added | ❌ New | Invite email + accept flow |
| 6 | Browse without sign-in | ✅ Mostly done | “Browse” in anon nav; confirm no anon redirect |
| 7 | Sign up with email; magic link; confirmation | ❌ New | `guest_email`; magic link; confirmation email; UX |
| 8 | Return to see signups; magic-link sign-in | 🟡 Partial | Magic-link login; claim guest sign-ups; no block |
| 9 | Boss ↔ volunteers; Admin → all/domain | 🟡 Partial | “By domain”; real email; leader “email my volunteers” |

---

## Suggested implementation order

1. **#6 + #2** – Browse without sign-in + admin sanity-check (small).
2. **#1** – Doc/template updates for upload (tiny).
3. **#3** – Confirm add/remove is clear; optional “Manage” from /volunteer (small).
4. **#4 + #5** – Add boss by email, invite, accept flow (medium).
5. **#7 + #8** – Guest sign-up, magic link, confirmation, claim (large).
6. **#9** – “By domain” + real email + leader “email my volunteers” (medium).

---

## Schema changes to plan

- **`signups`:** `guest_email` (nullable), `volunteer_id` nullable, `CHECK (volunteer_id IS NOT NULL OR guest_email IS NOT NULL)`. Index on `guest_email` for claim.
- **`volunteer_leader_domains` (or new table):** Support “pending” leaders: e.g. `invite_email`, `invite_sent_at`, `invite_token` (optional), until they accept and we set `leader_id`.

---

## Config / infra

- **Auth:** Supabase `signInWithOtp` enabled; magic-link redirect URL configured.
- **Email:** Resend (or current provider) + `send-email` edge function for: confirmation (#7), invite (#5), boss messages, admin “all” / “by domain” (#9).

---

*Last updated: Jan 2026*
