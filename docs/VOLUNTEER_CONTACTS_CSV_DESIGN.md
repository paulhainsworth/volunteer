# Volunteer Contacts CSV & Autocomplete — Design Issues

Uploading a CSV of past volunteers (name, email, phone) so leaders and admins can **autocomplete** when adding volunteers or volunteer leaders. Data would be loaded into Supabase via scripts (like roles/domains). This doc identifies technical issues and design choices.

---

## 1. Data model

**Need a separate table** — not `profiles`.

- `profiles` is 1:1 with `auth.users`; you can’t have a profile without an account.
- CSV rows are people who **may not have accounts yet**. They are a contact list for autocomplete and prefill.

**Proposed table: `volunteer_contacts`**

| Column        | Type      | Notes |
|---------------|-----------|--------|
| id            | uuid      | PK, default uuid_generate_v4() |
| first_name    | text      | |
| last_name     | text      | |
| email         | text      | NOT NULL, unique (or unique per source) |
| phone         | text      | optional |
| profile_id    | uuid      | NULL; set when they later sign up (FK to profiles) |
| source        | text      | optional, e.g. "2024_omnium", "2025_bhrr" |
| created_at    | timestamptz | default now() |

- **Deduplication on import:** one row per email (e.g. take latest year, or merge name/phone). Unique constraint on `email` (or composite if you allow same email from different sources).
- **Linking to accounts:** when someone signs up, set `profile_id` so autocomplete can show “has account” and avoid duplicate suggestions.

---

## 2. Account creation (no structural change)

**Current behavior:**

- **Leader adds volunteer to role:** Look up by email in `profiles`. If found → use that profile and create signup. If not found → `auth.signUp()` (temp password) → create profile → create signup → send “you’ve been added” email.
- **Admin adds volunteer:** Same idea: create auth user + profile, optionally add to a role, send sign-in link.
- **Admin/leader adds volunteer leader:** Invoke `create-leader` (creates auth + profile, assigns domain, sends invite).

**With CSV:**

- **No new “account type”.** CSV only adds a **source of suggestions**.
- When user selects a **contact-only** row (no `profile_id`): prefill first name, last name, email, phone; then run the **same** flow as today (create auth + profile, then signup or assign leader). So account-creation logic stays as-is; only the UX (autocomplete + prefill) changes.
- Optional improvement: when we create the profile, set `volunteer_contacts.profile_id = profiles.id` for the matching email so future autocomplete shows “has account”.

---

## 3. Login

- **No change.** CSV people don’t have accounts until we create them (or they self-sign-up). No new login flows.
- Invite/welcome emails continue to point to existing login/signup and `/#/volunteer` (or magic link). No impact from the contacts table.

---

## 4. Notifications / welcome emails

- **Current:** When a leader adds a volunteer → “You’ve been added to role X, please log in…”. When admin creates volunteer → “Sign-in link sent”. When adding a leader → leader-invite email.
- **With CSV:** Same emails; we’re just **selecting** the recipient from autocomplete (contact or profile) instead of typing from scratch. No new notification type required.
- **Optional:** When a user signs up and we match by email to `volunteer_contacts`, we could skip or tailor a “first time here?” message (e.g. “Welcome back to the Omnium”) — design choice, not required for MVP.

---

## 5. Autocomplete: where and how

**Places that need autocomplete from contacts + profiles:**

| Screen | Current behavior | Change |
|--------|------------------|--------|
| **Leader dashboard** — “Add volunteer” to a role | Queries `profiles` by name/email; suggests existing users only | Merge results from `profiles` and `volunteer_contacts`; show “Existing volunteer” vs “Past volunteer (no account yet)” and prefill on select. |
| **Admin — Add volunteer** (VolunteersList) | Manual form only | Add same typeahead: search `profiles` + `volunteer_contacts`, prefill form. |
| **Admin — Add volunteer leader** (Domains, RolesList) | Manual form / create-leader | Add typeahead from `profiles` + `volunteer_contacts` so leaders can be chosen from past volunteers. |

**Implementation options:**

- **A. Two queries, merge in UI:**  
  - Query 1: `profiles` (as now).  
  - Query 2: `volunteer_contacts` where `profile_id IS NULL` and name/email match.  
  - Merge, dedupe by email (prefer profile if both exist), show in one list with a small “Account” / “No account” badge.
- **B. Single RPC/view:**  
  - DB function or view that unions profiles (id, first_name, last_name, email, phone, source='profile') with contacts (id, first_name, last_name, email, phone, source='contact', profile_id NULL).  
  - One query from the app; same merge/dedupe by email in app or in SQL.

**UX detail:** When selection is from a **contact** (no account), the “Add” flow is unchanged: create auth + profile (+ signup or leader), then send email. When selection is from a **profile**, use existing profile (and only create signup or assign leader as today).

---

## 6. Signups table and “pending” signups

- **Current:** `signups.volunteer_id` is NOT NULL and references `profiles(id)`. Every signup is tied to an existing user.
- **With CSV:** We do **not** need to allow signups without an account. The flow stays: “pick from autocomplete (contact or profile) → if contact, create account first, then create signup.” So **no schema change** to `signups` for “pending” or “invite-only” rows.
- If you ever wanted “invited but not yet signed up” as a first-class concept, that would be a separate design (e.g. `invitations` table); not required for CSV autocomplete.

---

## 7. RLS and access control

- **Who can read `volunteer_contacts`?**  
  - Admins: yes (for all flows).  
  - Volunteer leaders: yes (for adding volunteers to their roles and for any “add leader” flow you expose to them).  
  - Volunteers: no (they shouldn’t see the full contact list).
- **Who can write?**  
  - Normal app users: no. Inserts/updates only via **import script** (service role or a dedicated “import” path). Optionally allow admin to fix a row (e.g. merge duplicate).
- **Policies:**  
  - `SELECT`: allow if `auth.jwt() ->> 'role' = 'admin'` or if user is a volunteer_leader (same pattern as other leader-readable tables).  
  - `INSERT`/`UPDATE`/`DELETE`: admin only, or restrict to service role for imports.

---

## 8. Import scripting (like roles/domains)

- **Input:** CSV with columns e.g. `first_name`, `last_name`, `email`, `phone`, optionally `source` or `year`.
- **Process:**  
  - Parse CSV, normalize (trim, lowercase email).  
  - Dedupe by `email` (keep one row per email: e.g. latest by year, or merge name/phone).  
  - Generate `INSERT ... ON CONFLICT (email) DO UPDATE SET first_name=..., last_name=..., phone=..., updated_at=now()` (or skip duplicates).  
- **Output:** SQL file to run in Supabase (e.g. `generated_contacts_import.sql`) or a small Node script using Supabase service-role client.
- **Idempotency:** Re-running import should not create duplicate emails; update existing rows if you want to refresh names/phone from a newer CSV.

---

## 9. Matching after sign-up (linking contact → profile)

- When a user **registers** (or first logs in), match `auth.users.email` / `profiles.email` to `volunteer_contacts.email`.  
- If match and `volunteer_contacts.profile_id IS NULL`, set `volunteer_contacts.profile_id = profiles.id`.  
- **Where to do it:**  
  - **Option A:** Auth trigger or DB trigger on `profiles` insert: after insert, `UPDATE volunteer_contacts SET profile_id = NEW.id WHERE email = NEW.email AND profile_id IS NULL`.  
  - **Option B:** In app, after `auth.signUp()` or in `onAuthStateChange` when profile is created: call an RPC or direct update (with RLS allowing the service or the user’s own profile).  
- **Benefit:** Autocomplete can show “Already has account” and avoid suggesting the same person twice; also enables future “welcome back” logic.

---

## 10. Privacy and PII

- Storing name, email, phone for people who haven’t necessarily consented to this app.  
- **Mitigations:**  
  - Restrict read access (admins + volunteer leaders only).  
  - Don’t expose the table in public APIs.  
  - Optional: add `source` and retention (e.g. only keep last N years).  
- **Compliance:** Rely on “past volunteer” relationship and event-related use; document in privacy notice if required.

---

## 11. Summary checklist

| Area | Action |
|------|--------|
| **Data model** | Add `volunteer_contacts` (id, first_name, last_name, email, phone, profile_id, source, created_at); unique on email. |
| **Import** | Script: CSV → normalize → dedupe by email → SQL or Supabase client inserts/upserts. |
| **Autocomplete** | Leader dashboard + Admin add-volunteer + Admin add-leader: query profiles + volunteer_contacts (profile_id IS NULL); merge by email; prefill form on select. |
| **Account creation** | Unchanged: contact selection only prefills; still create auth + profile when adding someone without an account. |
| **Login** | No change. |
| **Notifications** | No change; same invite/welcome emails. |
| **Signups** | No change; volunteer_id remains required. |
| **RLS** | SELECT for admin + volunteer_leader; INSERT/UPDATE only for import or admin. |
| **After sign-up** | Optional: set volunteer_contacts.profile_id when profile is created (trigger or app). |

This keeps the current account and signup model intact and uses the CSV purely to improve discovery and data entry via autocomplete and prefill.
