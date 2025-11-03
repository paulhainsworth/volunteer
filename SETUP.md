# Race Volunteer Management System - Setup Guide

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- A Supabase account (free tier is fine)
- A Vercel account (for deployment)

## 1. Supabase Setup

### Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click "New Project"
3. Choose an organization and give your project a name (e.g., "volunteer-manager")
4. Set a strong database password (save this!)
5. Choose a region close to you
6. Wait for the project to be created (~2 minutes)

### Run the Database Schema

1. In your Supabase project, navigate to the SQL Editor (left sidebar)
2. Copy the entire contents of `SUPABASE_SCHEMA.sql` from this project
3. Paste it into the SQL Editor
4. Click "Run" to execute the schema
5. Verify no errors appeared

### Get Your Supabase Credentials

1. In your Supabase project, click on the Settings icon (⚙️) in the left sidebar
2. Click on "API" under Project Settings
3. Copy the following values:
   - **Project URL** (looks like: `https://xxxxxxxxxxxxx.supabase.co`)
   - **Anon/Public Key** (a long JWT token starting with `eyJ...`)

## 2. Local Development Setup

### Clone and Install Dependencies

```bash
cd my-website
npm install
```

### Create Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Run the Development Server

```bash
npm run dev
```

Open your browser to [http://localhost:5173](http://localhost:5173)

## 3. Create Your First Admin User

Since this is a new system, you'll need to manually create an admin user in Supabase:

1. Go to your Supabase project dashboard
2. Click on "Authentication" in the left sidebar
3. Click "Add user" → "Create new user"
4. Enter an email and password
5. Click "Create user"
6. Now go to "Table Editor" → "profiles" table
7. Find the user you just created (by email)
8. Click on the row to edit it
9. Change the `role` field from `volunteer` to `admin`
10. Click "Save"

Now you can log in with this email/password and access the admin dashboard!

## 4. Deploy to Vercel

### Initial Deployment

1. Push your code to a GitHub repository
2. Go to [vercel.com](https://vercel.com) and sign in
3. Click "Add New Project"
4. Import your GitHub repository
5. Vercel will auto-detect it's a Vite app
6. Add your environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
7. Click "Deploy"

### Configure Custom Domain (Optional)

1. In your Vercel project, go to Settings → Domains
2. Add your custom domain
3. Follow the DNS configuration instructions

## 5. Testing the System

### Test as Volunteer

1. Go to `/auth/signup` and create a volunteer account
2. Sign up for a test role
3. Check the waiver signing flow
4. View "My Signups"

### Test as Admin

1. Log in with your admin account
2. Create a few volunteer roles
3. View the dashboard
4. Check the volunteers list
5. Try exporting to CSV

## 6. Supabase Authentication Configuration

### Email Templates (Optional)

Customize the auth email templates in Supabase:

1. Go to Authentication → Email Templates
2. Edit:
   - Confirm signup
   - Magic link
   - Change email address
   - Reset password

### URL Configuration

In Supabase Authentication settings:

1. Set Site URL to your production domain (e.g., `https://volunteers.yourdomain.com`)
2. Add Redirect URLs:
   - `http://localhost:5173/*` (for development)
   - `https://yourdomain.com/*` (for production)

## 7. Email Integration (Future Enhancement)

This MVP does not actually send emails. The Communications page is a UI mockup.

To enable real email sending, you would:

1. Choose an email service (SendGrid, Resend, AWS SES, etc.)
2. Create Supabase Edge Functions or API routes
3. Integrate the email service API
4. Update the Communications component to call your API

Example services:
- **Resend** (recommended for simplicity): [resend.com](https://resend.com)
- **SendGrid**: [sendgrid.com](https://sendgrid.com)
- **AWS SES**: More complex but very affordable at scale

## 8. Database Backup

### Enable Point-in-Time Recovery

1. In Supabase, go to Database → Backups
2. Consider upgrading to Pro plan for daily backups
3. Or manually export your database periodically

### Manual Backup

```bash
# Download your schema and data
pg_dump -h db.xxxxx.supabase.co -U postgres volunteer_db > backup.sql
```

## 9. Security Best Practices

✅ **Implemented**:
- Row Level Security (RLS) policies on all tables
- Authentication required for all sensitive operations
- Admin-only routes protected
- Waiver signing required before volunteer signups

⚠️ **Recommendations**:
- Enable Supabase's email confirmation (currently disabled for ease of testing)
- Set up rate limiting on Supabase APIs
- Enable CAPTCHA on signup forms in production
- Review and audit RLS policies regularly

## 10. Monitoring and Analytics

### Supabase Monitoring

- Check Database → Usage for query performance
- Monitor Authentication → Users for signup trends
- Review Logs for errors

### Vercel Analytics

- Enable Vercel Analytics in your project settings
- Monitor page views and performance

## Common Issues

### "Invalid API key" error
- Double-check your `.env` file has the correct Supabase credentials
- Make sure to restart the dev server after changing `.env`

### "Failed to fetch" errors
- Check Supabase project status
- Verify your network connection
- Check browser console for CORS errors

### Supabase returns empty arrays
- Check that your database schema was created successfully
- Verify RLS policies are set up correctly
- Check that you're authenticated

### Can't sign up as volunteer
- Make sure the waiver_settings table has a default waiver
- Check browser console for errors
- Verify Supabase auth is enabled

## Support

For issues specific to:
- **Supabase**: [supabase.com/docs](https://supabase.com/docs)
- **Vercel**: [vercel.com/docs](https://vercel.com/docs)
- **Svelte**: [svelte.dev/docs](https://svelte.dev/docs)

## Next Steps

Once your system is running:

1. Create volunteer roles for your first event
2. Share the signup link with your community
3. Monitor the dashboard for fill rates
4. Send reminder emails before events (manual for now)
5. Gather feedback from volunteers
6. Iterate on the design and features

Happy volunteering! 🚴‍♂️

