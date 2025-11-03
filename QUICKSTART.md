# 🚀 Quick Start Guide

Get your Race Volunteer Management System up and running in 10 minutes!

## Step 1: Create a Supabase Project (5 minutes)

1. Go to [supabase.com](https://supabase.com) and sign up for free
2. Click "New Project"
3. Name it "volunteer-manager" and set a strong password
4. Wait for project creation (~2 min)
5. Go to SQL Editor and paste the entire contents of `SUPABASE_SCHEMA.sql`
6. Click "Run" to create all tables

## Step 2: Get Your Credentials (1 minute)

In your Supabase project:
1. Click Settings → API
2. Copy **Project URL** and **anon public** key

## Step 3: Configure Your App (1 minute)

Create a `.env` file in the project root:

```bash
VITE_SUPABASE_URL=paste_your_project_url_here
VITE_SUPABASE_ANON_KEY=paste_your_anon_key_here
```

## Step 4: Start the Dev Server (30 seconds)

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser!

## Step 5: Create Your Admin Account (2 minutes)

1. In your browser, click "Sign Up"
2. Create an account with your email
3. Go to Supabase → Authentication → Users
4. Find your user → Table Editor → profiles table
5. Change `role` from `volunteer` to `admin`
6. Log out and log back in

🎉 **You're done!** You now have full admin access.

## Next Steps

1. Create your first volunteer role
2. Test the volunteer signup flow (create a second account)
3. Explore the dashboard
4. Try exporting to CSV

## Deploy to Production

When ready, deploy to Vercel:

```bash
git add .
git commit -m "Initial setup"
git push
```

Then:
1. Go to [vercel.com](https://vercel.com)
2. Import your repo
3. Add the same environment variables
4. Deploy!

---

Need help? See [SETUP.md](./SETUP.md) for detailed instructions.

