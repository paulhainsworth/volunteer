# Clean-slate scripts for Omnium 2026

Use these before importing roles and domains from CSV.

**Run order (full reset):**

1. **`CLEAN_VOLUNTEER_DOMAINS_AND_ROLES.sql`**  
   Removes all signups, volunteer_roles, and volunteer_leader_domains.

2. **`CLEAN_PROFILES_KEEP_ADMIN.sql`**  
   Removes all waivers, then all profiles except `paulhainsworth@gmail.com`, and sets that user to `admin`.

Run each in the Supabase SQL Editor. After that you can load roles/domains from the Omnium CSV (see below).

---

## Remove all users (clean test users)

**`REMOVE_ALL_PROFILES.sql`** deletes every profile and every auth user. Use this to wipe test users and start clean.

Run the script in the Supabase SQL Editor. It unlinks leaders from `volunteer_leader_domains`, deletes all profiles (CASCADE removes signups and waivers), then deletes all `auth.users`. Volunteer roles and domains stay; their leader/created_by are set to NULL.

---

## Remove specific volunteers by email

**`REMOVE_VOLUNTEERS_BY_EMAIL.sql`** removes only the users you list by email. Safer than a full wipe when you share one DB across dev/staging/production.

1. Edit the email list in the script (in both the PREVIEW and the DELETE block so they match).
2. Run the script once: it only **previews** who would be removed and impact (signups, domains led, roles created).
3. If the preview looks correct, uncomment the DELETE block and run the script again to remove those users.

Dependencies are handled by the DB: signups and waivers are CASCADE-deleted; roles and domains stay with `created_by`/`leader_id` set to NULL (reassign leaders in the app if needed).

---

## Omnium 2026 CSV import

1. **Run clean scripts** (above) if you want a fresh slate.
2. **Run `ADD_OMNIUM2026_ROLE_COLUMNS.sql`** in Supabase SQL Editor (adds `estimate_duration_hours`, `event`, nullable date/time, default `positions_total`).
3. **Generate import SQL** from the CSV:
   ```bash
   node scripts/import-omnium-roles.js "path/to/2026 Berkeley Omnium volunteer jobs - volunteer-roles-template (4).csv"
   ```
   This writes `scripts/generated_omnium_import.sql`.
4. **Run `generated_omnium_import.sql`** in Supabase SQL Editor.
5. Assign volunteer leaders to domains in the app admin UI.

---

## Volunteer contacts (past volunteers for autocomplete)

1. **Run `ADD_VOLUNTEER_CONTACTS.sql`** in Supabase SQL Editor (creates `volunteer_contacts` table, RLS, and triggers to link contacts to profiles when they sign up).
2. **Generate import SQL** from the cleaned CSV. From the project root:
   ```bash
   node scripts/import-volunteer-contacts.js
   ```
   This reads `scripts/volunteer_contacts_cleaned.csv` and writes `scripts/generated_volunteer_contacts_import.sql`. To use a different CSV:
   ```bash
   node scripts/import-volunteer-contacts.js scripts/volunteer_contacts_cleaned.csv
   ```
3. **Run `generated_volunteer_contacts_import.sql`** in Supabase SQL Editor.

To clean a new CSV first: `node scripts/clean-volunteer-contacts-csv.js "path/to/your.csv"` → produces `volunteer_contacts_cleaned.csv` and `volunteer_contacts_report.txt`.

---

## Adding another source (e.g. BBC membership) to volunteer_contacts

Use this when you have a second CSV (e.g. current members) and want to add only **new** people—no duplicates of anyone already in `volunteer_contacts_cleaned.csv` or already in the table.

1. **Merge and dedupe** (from project root):
   ```bash
   node scripts/merge-volunteer-contacts.js "/path/to/new-file.csv"
   ```
   - Compares the new CSV to `scripts/volunteer_contacts_cleaned.csv` by email.
   - Outputs **only new rows** to `scripts/volunteer_contacts_bbc_additions.csv`.
   - The script expects columns like `Firstname`, `Lastname`, `email`, `Phone` (or `first_name`, `last_name`, `email`, `phone`). It skips invalid emails and dedupes within the new file.

2. **Generate SQL** for the additions (optional second arg = source label in the DB):
   ```bash
   node scripts/import-volunteer-contacts.js scripts/volunteer_contacts_bbc_additions.csv "BBC 2025"
   ```
   This overwrites `scripts/generated_volunteer_contacts_import.sql` with just the new rows (source = `BBC 2025`).

3. **Run the generated SQL** in the Supabase SQL Editor. Existing emails in the table are updated (e.g. phone/name); new emails are inserted.
