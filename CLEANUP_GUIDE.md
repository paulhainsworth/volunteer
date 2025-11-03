# 🧹 Test User Cleanup Guide

## Quick Cleanup (Recommended)

### Method 1: Using SQL Editor (Fastest)

1. Go to **Supabase** → **SQL Editor**
2. Copy and paste the contents of `CLEANUP_TEST_USERS.sql`
3. Click **Run**
4. This will delete profiles for test users

### Method 2: Using Authentication Dashboard

Since test users are in the auth system, you also need to delete them from Authentication:

1. Go to **Supabase** → **Authentication** → **Users**
2. Look for users with emails like `test-1762156xxx@mailinator.com`
3. Click the **three dots** (•••) on each test user row
4. Select **"Delete user"**
5. Confirm deletion
6. Repeat for all test users

---

## Detailed Cleanup Process

### Step 1: Check How Many Test Users Exist

Run this SQL to see the count:

```sql
SELECT COUNT(*) as test_user_count
FROM profiles
WHERE email LIKE 'test-%@mailinator.com';
```

### Step 2: Delete from Profiles Table

```sql
DELETE FROM profiles
WHERE email LIKE 'test-%@mailinator.com';
```

### Step 3: Delete from Authentication

You have two options:

**Option A: One by one in UI**
- Authentication → Users → Delete each test user

**Option B: Bulk delete via SQL (requires admin service role key)**
```sql
-- This requires using the service_role key, not the anon key
-- Only run this if you know what you're doing!
DELETE FROM auth.users
WHERE email LIKE 'test-%@mailinator.com';
```

⚠️ **Warning:** Option B requires elevated privileges. Stick with Option A (UI) for safety.

---

## Filter Test Users

To see only test users in the Authentication panel:

1. Go to **Authentication** → **Users**
2. In the search box, type: `test-`
3. All test users will appear (emails starting with "test-")

---

## Prevent Future Test User Accumulation

### Option 1: Add Cleanup Script to Tests

Add this to your test suite (future enhancement):

```javascript
// tests/cleanup.spec.js
import { test } from '@playwright/test';

test.afterAll(async () => {
  // Call Supabase admin API to delete test users
  // Requires service_role key
});
```

### Option 2: Use Supabase Edge Functions

Create an edge function that cleans up old test users:

```sql
-- Delete test users older than 1 day
DELETE FROM profiles
WHERE email LIKE 'test-%@mailinator.com'
  AND created_at < NOW() - INTERVAL '1 day';
```

Run this as a cron job in Supabase.

### Option 3: Periodic Manual Cleanup

Run `CLEANUP_TEST_USERS.sql` once a week during development.

---

## How to Identify Test vs Real Users

**Test users have emails like:**
- `test-1762156261168-5314@mailinator.com`
- Pattern: `test-{timestamp}-{random}@mailinator.com`

**Real users have emails like:**
- `paul@hainsworth.com`
- `paulhainsworth@gmail.com`
- `volunteers@bikeclu.com`

---

## Quick Commands

### Count test users:
```sql
SELECT COUNT(*) FROM profiles WHERE email LIKE 'test-%@mailinator.com';
```

### List all test users:
```sql
SELECT id, email, role, created_at
FROM profiles
WHERE email LIKE 'test-%@mailinator.com'
ORDER BY created_at DESC;
```

### Delete all test user profiles:
```sql
DELETE FROM profiles WHERE email LIKE 'test-%@mailinator.com';
```

### See most recent test users:
```sql
SELECT email, created_at
FROM profiles
WHERE email LIKE 'test-%@mailinator.com'
ORDER BY created_at DESC
LIMIT 10;
```

---

## After Cleanup

Verify cleanup was successful:

1. Check profiles table: Should have 0-2 real users only
2. Check Authentication → Users: No test-* users
3. Your app should still work normally with real accounts

---

## Estimated Cleanup Time

- **SQL cleanup**: 10 seconds
- **Manual UI cleanup** (10 users): ~2 minutes
- **Manual UI cleanup** (30 users): ~5 minutes

**Recommendation:** Run the SQL script first, then manually delete any remaining auth users from the UI.

---

*Note: Test users don't count against your Supabase quota significantly, but cleanup keeps your database tidy!*

