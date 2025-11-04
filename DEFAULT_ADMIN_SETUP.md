# 🔑 Default Admin Account Setup

## Default Credentials

For easy initial setup, use these default credentials:

**Email:** `admin@admin.com`  
**Password:** `admin`

⚠️ **CRITICAL SECURITY WARNING:** Change this password immediately after first login!

---

## How to Create the Default Admin

### One-Time Setup (30 seconds)

1. **Go to Supabase Dashboard**
   - Navigate to **Authentication** → **Users**

2. **Create the user**
   - Click **"Add user"** → **"Create new user"**
   - Email: `admin@admin.com`
   - Password: `admin`
   - ✅ Check **"Auto Confirm User"** (skip email verification)
   - Click **"Create user"**

3. **Promote to admin**
   - Go to **SQL Editor**
   - Run this SQL:

```sql
UPDATE profiles 
SET role = 'admin', 
    first_name = 'Default', 
    last_name = 'Admin'
WHERE email = 'admin@admin.com';
```

4. **Done!**
   - Go to http://localhost:5173
   - Click "Login"
   - Email: `admin@admin.com`
   - Password: `admin`

---

## First Steps After Login

### 1. Change the Default Password (Required!)

**Option A: Use Password Reset**
1. Log out
2. Click "Forgot password?"
3. Enter `admin@admin.com`
4. Check email for reset link
5. Set a strong password

**Option B: Change in Supabase**
1. Go to Supabase → Authentication → Users
2. Find `admin@admin.com`
3. Click three dots (•••) → "Send password recovery"
4. Or click "Edit user" → "Generate new password"

### 2. Create Your Personal Admin Account

1. While logged in as default admin
2. Go to **Users** page in the app
3. You'll see the default admin listed
4. Sign up a new account with YOUR email
5. In the Users page, click **"Promote to Admin"** on your account
6. Log out and log in with your account

### 3. (Optional) Disable Default Admin

Once you have your own admin account:

**Option A: Change password to something secure**
- In Supabase → Authentication → Users
- Edit admin@admin.com user
- Generate new secure password
- Save it in your password manager

**Option B: Delete the default admin**
- In Supabase → Authentication → Users
- Find admin@admin.com
- Click three dots (•••) → "Delete user"
- Confirm deletion

---

## Security Best Practices

### ✅ DO:
- Change the default password immediately
- Create personal admin accounts for each race coordinator
- Use strong, unique passwords
- Enable two-factor authentication (if available in Supabase)
- Regularly audit who has admin access

### ❌ DON'T:
- Share the default credentials publicly
- Leave the default password as "admin"
- Give admin access to volunteers who don't need it
- Use the default admin for production operations long-term

---

## Troubleshooting

### Can't log in with admin@admin.com?

**Check if the user exists:**
```sql
SELECT * FROM profiles WHERE email = 'admin@admin.com';
```

**If no results:**
- Follow the creation steps above
- Make sure you ran the UPDATE query to set role = 'admin'

**If it exists but can't login:**
- The auth.users entry might be missing
- Recreate the user in Authentication → Users
- Then run the UPDATE query again

### "Invalid login credentials" error?

- Make sure you typed `admin@admin.com` (not admin@admin.org or similar)
- Password is exactly `admin` (lowercase, no spaces)
- User was confirmed (check "Auto Confirm User" when creating)

### User shows as volunteer, not admin?

Run this SQL:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'admin@admin.com';
```

Then log out and log back in.

---

## For New Installations

Every time you set up the system on a new Supabase project:

1. Run `SUPABASE_SCHEMA.sql`
2. Run `SUPABASE_TRIGGER_FIX.sql`
3. Create default admin (this guide)
4. Login, create your real admin
5. Change/delete default admin

Takes about **5 minutes total**.

---

## Alternative: Use Your Own Email as Default Admin

If you don't want to use admin@admin.com, just:

1. Create user with YOUR email in Authentication
2. Run this SQL with your email:

```sql
UPDATE profiles 
SET role = 'admin', first_name = 'Your', last_name = 'Name'
WHERE email = 'your@email.com';
```

No default admin needed!

---

*Security Note: The default admin is for convenience during initial setup only. Always use personal accounts with strong passwords for production use.*

