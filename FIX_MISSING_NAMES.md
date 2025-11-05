# Fixing Missing First/Last Names for Existing Users

## Issue

Users created before the signup trigger was updated don't have first_name and last_name populated in their profiles. They show as "-" in the Users table.

## Solution Options

### Option 1: Users Update Their Own Profiles (Recommended)

Users can update their names via the Profile page:
1. Log in to the app
2. Click on their email in the top nav
3. Click "Profile" or navigate to `#/profile`
4. Enter their First Name and Last Name
5. Click "Update Profile"

### Option 2: Admin Updates via Database (Quick Fix)

If you want to manually fix specific users, run this SQL in Supabase:

```sql
-- Update a specific user by email
UPDATE profiles
SET 
  first_name = 'John',  -- Change this
  last_name = 'Doe'      -- Change this
WHERE email = 'user@example.com';  -- Change this
```

### Option 3: Bulk Update Based on Email (Auto-generate names)

This will auto-generate names from email addresses for all users missing names:

```sql
-- Auto-generate first/last names from email for users missing them
UPDATE profiles
SET 
  first_name = CASE 
    WHEN first_name IS NULL OR first_name = '' 
    THEN INITCAP(SPLIT_PART(SPLIT_PART(email, '@', 1), '.', 1))
    ELSE first_name
  END,
  last_name = CASE 
    WHEN last_name IS NULL OR last_name = ''
    THEN INITCAP(SPLIT_PART(SPLIT_PART(email, '@', 1), '.', 2))
    ELSE last_name
  END
WHERE 
  (first_name IS NULL OR first_name = '')
  OR (last_name IS NULL OR last_name = '');
```

**Example:** `john.doe@example.com` → First: "John", Last: "Doe"

**Note:** This only works well if emails follow the `firstname.lastname@domain` pattern.

### Option 4: Prompt Users on Next Login

You could add a check to redirect users to the Profile page if they're missing names:

1. Add this to `src/routes/Home.svelte` (or wherever users land after login):

```javascript
if (!$auth.profile?.first_name || !$auth.profile?.last_name) {
  push('/profile');
}
```

---

## Prevention

The database trigger is now set up correctly (see `SUPABASE_TRIGGER_FIX.sql`), so all new signups will automatically have first_name and last_name populated from the signup form.

No additional action needed for new users! ✅

