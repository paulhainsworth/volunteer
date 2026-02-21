# Team/Club Affiliation Field – Dependency Investigation

This doc summarizes what must change to add a **mandatory** "Team/Club affiliations" dropdown to volunteer signup and to all flows where volunteers are created (PII modal, leader add, admin add).

---

## 1. Data model

**Where to store it**

- **Recommended:** Add a single column on **`profiles`**, e.g. `team_club_affiliation TEXT` (store the selected option’s label or a code).
- **Alternative:** New lookup table `team_club_affiliations (id, name, sort_order)` and `profiles.team_club_affiliation_id UUID REFERENCES team_club_affiliations(id)`. Use this if you want admins to manage the list in the DB and have stable IDs.

**Options for the dropdown**

- **Option A – Hardcoded list:** Array of strings in the app (e.g. in a shared constant or config file). No DB table. Easiest; list changes require a code deploy.
- **Option B – Lookup table:** Table `team_club_affiliations` with rows like "Berkeley High", "El Cerrito Composite", etc. Admin UI (or SQL) to add/edit. Profile stores `affiliation_id` or the name. Better if the list will grow or be edited by non-devs.

**Schema change (minimal)**

- Add to `profiles`:  
  `team_club_affiliation TEXT` (nullable for existing rows; can be `NOT NULL` for new signups if you enforce it in app and trigger).  
  Or add `team_club_affiliation_id UUID` + new table if using Option B.

---

## 2. Auth trigger (`handle_new_user`)

**File / location:** Supabase trigger on `auth.users` – defined in SQL (e.g. `FIX_SIGNUP_FK_PROFILE_TRIGGER.sql` or `FIX_VOLUNTEER_SIGNUP_RLS.sql`). The trigger inserts one row into `profiles` using `NEW.raw_user_meta_data`.

**Changes**

- Add a column to the `INSERT` list (e.g. `team_club_affiliation`).
- Set it from metadata:  
  `NULLIF(TRIM(COALESCE(new.raw_user_meta_data->>'team_club_affiliation', '')), '')`  
  so that when we pass `team_club_affiliation` in `options.data` on signUp, the profile gets it.

**Deployment:** Run a one-off migration (e.g. `ADD_TEAM_CLUB_AFFILIATION.sql`) that:

1. `ALTER TABLE profiles ADD COLUMN team_club_affiliation TEXT;`
2. Recreate `handle_new_user()` to include the new column in the INSERT and in the VALUES from `raw_user_meta_data`.

---

## 3. PII modal (Browse Roles → “Sign up” for a role)

**Files**

- **`src/routes/volunteer/BrowseRoles.svelte`**
  - `piiForm`: add `team_club_affiliation: ''` (or selected value).
  - Add a **dropdown** (e.g. `<select>` or custom) bound to `piiForm.team_club_affiliation`. Options from a constant or from an API/store if you use a lookup table.
  - Validation in `submitPiiModal`: if mandatory, require `piiForm.team_club_affiliation` before calling `createVolunteerAndSignup`.
  - Pass `team_club_affiliation` in the `pii` object to `createVolunteerAndSignup`.
- **`src/lib/volunteerSignup.js`**
  - `createVolunteerAndSignup(pii, roleId)`: destructure `team_club_affiliation` from `pii`.
  - In `supabase.auth.signUp(..., options: { data: { ..., team_club_affiliation } })` so the trigger can read it.
  - No direct profile upsert here (trigger creates the profile); trigger change above is enough for new users.

**Optional:** If you ever upsert or update profile in this flow, include `team_club_affiliation` there too.

---

## 4. Volunteer leader – add volunteer to role

**File:** `src/routes/leader/Dashboard.svelte`

**Current behavior:** Leader fills first name, last name, email, phone. Either finds existing profile by email (and updates name/phone) or creates new user via `signUp` and then upserts profile. No emergency contact or affiliation today.

**Changes**

- **Form state:** Extend the per-role add form (e.g. `volunteerForms[roleId]`) to include `team_club_affiliation`. Same dropdown options as PII modal (shared constant or store).
- **Validation:** In `addVolunteerToRole`, require `team_club_affiliation` (e.g. non-empty) before proceeding.
- **Existing profile:** When updating profile by email, set `team_club_affiliation` (and optionally only if currently empty, or always overwrite – product decision).
- **New user:** In `signUp` options.data include `team_club_affiliation`. In the `.from('profiles').upsert(...)` that runs for new users, include `team_club_affiliation`. The trigger will also set it from metadata for the new user; the upsert will redundantly set it (keeps profile correct if trigger runs first with the same value).

---

## 5. Admin – Add Volunteer modal

**File:** `src/routes/admin/VolunteersList.svelte`

**Current behavior:** `addVolunteerForm` has email, first_name, last_name, phone, role_id. Creates user with `signUp`, then upserts profile (and optionally creates signup). Sends welcome email.

**Changes**

- **Form:** Add `team_club_affiliation` to `addVolunteerForm`. Add dropdown to the modal (same options source as above).
- **Validation:** In `createVolunteer`, require `team_club_affiliation` (mandatory).
- **signUp:** Pass `team_club_affiliation` in `options.data`.
- **Profile upsert:** Include `team_club_affiliation` in the `.upsert({ ... })` so the profile row has it (trigger will also set it for new users; upsert ensures it’s set).

---

## 6. Other places that read or write profile

- **`src/routes/Profile.svelte`**  
  If volunteers can edit their own profile, add a field to view/edit `team_club_affiliation` (e.g. same dropdown). Optional if you only collect it at signup.

- **`src/routes/Onboarding.svelte`**  
  Currently collects emergency contact. If onboarding is required for new volunteers, you could add affiliation here too; otherwise not required if it’s always collected in PII/leader/admin flows.

- **`src/lib/stores/volunteers.js`**  
  Uses `select('*')` on profiles, so any new column on `profiles` is automatically returned. No code change unless you rename or join to a lookup table.

- **`src/lib/stores/auth.js`**  
  Profile is loaded from `profiles`; no change needed for a new column.

- **Admin/Leader tables that show volunteers**  
  If you want to show “Team/Club” in admin or leader UIs, add the column to the relevant selects (or rely on `*`). VolunteersList and Leader Dashboard can display it if desired.

---

## 7. Shared dropdown options

**Recommendation:** Put the list of options in one place so PII modal, leader form, and admin form stay in sync.

- **If hardcoded:** e.g. `src/lib/constants/affiliations.js` or inside a shared component that exports the options array.
- **If from DB:** Create a small store or API (e.g. `affiliations` store) that fetches from `team_club_affiliations`; use it in all three UIs. Then the dropdown is driven by the DB.

---

## 8. Summary checklist (mandatory affiliation)

| Layer | Change |
|-------|--------|
| **DB** | Add `profiles.team_club_affiliation` (or `*_id` + lookup table). Optional: create `team_club_affiliations` table. |
| **Trigger** | Update `handle_new_user()` to insert `team_club_affiliation` from `raw_user_meta_data`. |
| **PII modal** | Add dropdown to form; add to `piiForm`; validate; pass in `pii` to `createVolunteerAndSignup`. |
| **volunteerSignup.js** | In `createVolunteerAndSignup`, read `team_club_affiliation` from `pii` and pass in `signUp` options.data. |
| **Leader Dashboard** | Add affiliation to add-volunteer form; validate; pass in signUp options.data and in profile update/upsert. |
| **Admin Add Volunteer** | Add affiliation to modal form; validate; pass in signUp options.data and in profile upsert. |
| **Options source** | Define shared list (constant or store) and use in all three UIs. |
| **Profile/Onboarding** | Optionally show/edit affiliation in Profile; optional in Onboarding. |

---

## 9. Order of implementation

1. **Schema + trigger** – Add column and new migration that recreates `handle_new_user` including `team_club_affiliation`. Run in Supabase.
2. **Shared options** – Add constant or store for dropdown options.
3. **PII modal** – Add dropdown, validation, and pass-through in BrowseRoles and volunteerSignup.js.
4. **Leader add-volunteer** – Add field, validation, and pass-through in Dashboard.
5. **Admin Add Volunteer** – Add field, validation, and pass-through in VolunteersList.
6. **Display (optional)** – Show affiliation in Profile and in admin/leader volunteer lists if needed.

Making the field mandatory everywhere (PII, leader add, admin add) means validation in all three flows and ensuring the trigger and profile upserts always set it for new users.
