# Slack signup notifications (free Slack)

When a volunteer signs up for a role, a message is posted to a Slack channel on [bbccommunity.slack.com](https://bbccommunity.slack.com/). This uses the **Slack Web API** with a **bot token**, which works on **free-tier** workspaces (no paid Incoming Webhooks required).

## Setup (free Slack)

### 1. Create a Slack App and get a bot token

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**.
2. Name the app (e.g. “Volunteer Signup Bot”) and select the **bbccommunity** workspace.
3. In the app: **OAuth & Permissions** (left sidebar).
4. Under **Bot Token Scopes**, click **Add an OAuth Scope** and add **`chat:write`**.
5. At the top of the same page, click **Install to Workspace** and allow the app.
6. Copy the **Bot User OAuth Token** (starts with `xoxb-`). You’ll store this as `SLACK_BOT_TOKEN`.

### 2. Get the channel ID for your private channel

- **Option A:** In Slack, open the private channel → click the channel name at the top → scroll to the bottom of the details; the **Channel ID** is there (e.g. `C01234ABCD`).
- **Option B:** For a **public** channel you can use the channel name without `#` (e.g. `volunteer-signups`) instead of the ID.

### 3. Invite the bot to the channel

In the Slack channel where you want notifications, type:

```text
/invite @Volunteer Signup Bot
```

(Use the name you gave the app in step 1.) The bot must be in the channel to post.

### 4. Add secrets to Supabase

For **staging** and **production** (use the right project ref for each):

```bash
supabase secrets set SLACK_BOT_TOKEN="xoxb-your-bot-token" --project-ref <project-ref>
supabase secrets set SLACK_SIGNUP_CHANNEL_ID="C01234ABCD" --project-ref <project-ref>
```

- Use the **channel ID** (e.g. `C01234ABCD`) for private channels.
- For a **public** channel you can use the channel name without `#`, e.g. `volunteer-signups`.

### 5. Deploy the Edge Functions

```bash
supabase functions deploy notify-slack-signup --project-ref <project-ref>
supabase functions deploy create-volunteer-and-signup --project-ref <project-ref>
```

## When messages are sent

- **Volunteer self-signup** (signup page)
- **Leader adds volunteer** (existing or new) from leader dashboard
- **Admin assigns user to role** or **admin creates new volunteer with role** from Users page

Message format: `New volunteer signup: *Name* (email) signed up for *Role name*.`

## If Slack isn’t configured

If `SLACK_BOT_TOKEN` or `SLACK_SIGNUP_CHANNEL_ID` is not set, the Edge Function returns 500 and the client logs a warning; signup creation still succeeds.
