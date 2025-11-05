# Email Functionality Setup Guide

Your volunteer management system needs an email service to send notifications. Follow these steps to set it up.

## Option 1: Using Resend (Recommended - Free & Easy)

### Step 1: Sign Up for Resend

1. Go to [https://resend.com](https://resend.com)
2. Sign up for a free account (100 emails/day free)
3. Verify your email address

### Step 2: Get Your API Key

1. Log into Resend dashboard
2. Go to **API Keys** section
3. Click **Create API Key**
4. Name it "Volunteer Manager"
5. Copy the API key (starts with `re_...`)

### Step 3: Add API Key to Supabase

1. Go to your Supabase project dashboard
2. Navigate to **Project Settings** → **Edge Functions** → **Secrets**
3. Add a new secret:
   - Name: `RESEND_API_KEY`
   - Value: `re_xxxxxxxxxxxxx` (paste your API key)
4. Click **Save**

### Step 4: Deploy the Email Function

You have two options:

#### Option A: Deploy via Supabase Dashboard (Easiest)

1. Go to **Database** → **Functions** in your Supabase dashboard
2. Click **Create a new function**
3. Name: `send-email`
4. Copy the code from `supabase/functions/send-email/index.ts`
5. Paste into the function editor
6. Click **Deploy**

#### Option B: Deploy via CLI (If you have Supabase CLI installed)

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Login to Supabase
supabase login

# Link your project (get your project ref from Supabase dashboard URL)
supabase link --project-ref YOUR_PROJECT_REF

# Deploy the function
supabase functions deploy send-email
```

### Step 5: Test the Email Function

1. Log in as a **Volunteer Leader**
2. Go to your dashboard
3. Click **📧 Email My Volunteers**
4. Enter a subject and message
5. Click **Send Email**
6. Check the volunteer's email inbox (including spam folder)

---

## Option 2: Using a Custom Email Domain (Advanced)

If you want to send emails from your own domain (e.g., `notifications@yourdomain.com`):

### Step 1: Verify Your Domain in Resend

1. In Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Enter your domain name
4. Add the DNS records shown to your domain's DNS settings
5. Wait for verification (usually 5-10 minutes)

### Step 2: Update the Edge Function

Edit `supabase/functions/send-email/index.ts` and change line 46:

```typescript
from: 'Volunteer Manager <notifications@yourdomain.com>',
```

Replace `yourdomain.com` with your actual domain.

### Step 3: Redeploy the Function

Follow Step 4 from Option 1 above to redeploy.

---

## Troubleshooting

### Emails not being received?

1. **Check spam folder** - Email might be filtered
2. **Check Resend dashboard** - Go to **Logs** to see if emails were sent
3. **Check browser console** - Look for error messages
4. **Verify API key** - Make sure `RESEND_API_KEY` is set correctly in Supabase

### Getting "Failed to send email" error?

1. Make sure the Edge Function is deployed
2. Verify the API key is correct
3. Check if you've exceeded Resend's daily limit (100 emails/day on free tier)

### Still not working?

1. Check Supabase Edge Function logs:
   - Go to **Database** → **Functions** → **send-email** → **Logs**
2. Look for error messages
3. Make sure CORS is enabled in Supabase settings

---

## Current Email Features

Once set up, emails will be sent for:

- ✅ **Volunteer Leader** can email all their volunteers
- ✅ **Cancellation notifications** to leaders and admins
- ✅ **Contact leader** messages from volunteers

---

## Next Steps After Setup

1. Test the email feature thoroughly
2. Consider upgrading Resend plan if you need more than 100 emails/day
3. Set up a custom domain for more professional emails
4. Add email templates for better formatting

Need help? Check the [Resend Documentation](https://resend.com/docs) or [Supabase Edge Functions Guide](https://supabase.com/docs/guides/functions).

