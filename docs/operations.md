# Volunteer hub operations

Use the [production readiness roadmap](../PRODUCTION_READINESS_ROADMAP.md) for release gates. Use synthetic records and approved test recipients for rehearsals.

## Sign-in mail rollout

Apply the [auth mail rate limit migration](../supabase/migrations/20261118000600_limit_auth_email_requests.sql) before deploying the two sign-in mail functions. The default mail destination is `https://volunteer.berkeleyomnium.com`. For a separately approved environment, set `AUTH_MAIL_ALLOWED_ORIGINS` to the comma-separated origins approved for that Supabase environment and mirror those destinations in Supabase Auth redirect settings. Production should use HTTPS origins. The organizer waiver link also needs the approved root URL with `?post_login=waiver`. Deploy both functions together. The limit allows three requests per recipient and 120 per channel per 15-minute window. Rehearse public login, self-signup welcome mail, and organizer invitations.

## Race-day workflow checks

| Role | Rehearsal |
| --- | --- |
| Organizer | Import a representative roles CSV, review the public list and fill counts, assign a leader to a domain, and verify the intended notification arrives. See the [CSV format](../CSV_FORMAT.md) and [domain guide](../DOMAINS_USAGE_GUIDE.md). |
| Volunteer | Open the volunteer list, request a magic link, complete emergency-contact and waiver steps when prompted, sign up, reload My Signups, and cancel a test assignment. Check both roster and capacity after cancellation. |
| Volunteer leader | Open My Roles, verify the expected roster, and exercise an approved test assignment. Confirm that records outside the leader’s scope are inaccessible. |
| Clinic and NICA organizer | Submit a clinic fixture with guardian consent, check registration and delivery status, and generate a team roster PDF. Confirm the intended NICA digest configuration with its owner. |

The browser uses hash routes such as `/#/volunteer`, `/#/auth/login`, `/#/my-signups`, and `/#/kids`. Review the route table for exact paths. Keep volunteer and guardian information out of screenshots and issue reports. See [App.svelte](../src/App.svelte) and the [test plan](../TEST_PLAN.md).

## Release verification

Automatic Vercel Git deployments are paused for `main` and preview branches in [vercel.json](../vercel.json). Resume production auto-deploy after the required Supabase migrations and Edge Functions are ready for the frontend rollout.

1. Identify the exact commit and the Vercel and Supabase targets. The frontend build, database migrations, Edge Functions, and scheduled jobs have separate deployment paths.
2. Run `npm test` and `npm run test:release` locally. The latter builds the production bundle and exercises the browser flows with synthetic data in a local preview. Review test results and expected failures before promoting the release.
3. For database or function changes, record the migration baseline, affected functions and policy changes, and recovery plan. Apply and verify them in an approved test environment first.
4. Confirm the intended Auth redirects, mail and Slack settings, and active scheduler. Record configuration names and deployment versions in the release notes. Keep credential values in the designated secret store.
5. After promotion, verify the approved release targets with an authorized smoke check and record the outcome. Use the previous frontend deployment for frontend recovery. For database and function changes, follow the separately reviewed recovery plan.

Apply the [optional assent migration](../supabase/migrations/20261118000200_allow_optional_minor_assent.sql) before promoting its frontend. The updated role form can submit a blank minor signature when guardian consent is complete.

Coordinate the [shared waiver migration](../supabase/migrations/20261118000300_enforce_shared_volunteer_waiver_policy.sql) and frontend promotion in one release window. The old standalone form requires direct writes that the migration removes. Rehearse adult and minor waiver renewal with fixture accounts, including an account with a waiver that predates the new age declaration. Older records remain in the database for reference.

For the [profile role migration](../supabase/migrations/20261118000400_protect_profile_role_writes.sql), release the updated leader creation function and role-management frontend with the migration. Verify named admin access and rehearse a leader invitation on staging.

Apply the [authenticated profile read migration](../supabase/migrations/20261118000800_scope_authenticated_profile_reads.sql) after the frontend switches to server-owned volunteer notifications. Legacy cancellation emails depend on client-side administrator profile reads. Verify own-profile editing and contact with an assigned leader during staging smoke checks.

After the existing profile-read rollout, apply [the authorized emergency-contact read migration](../supabase/migrations/20261118000900_add_authorized_emergency_contact_reads.sql) before promoting the frontend that uses it. Apply [the direct-read restriction](../supabase/migrations/20261118001000_restrict_direct_emergency_contact_reads.sql) after the new frontend is live. Rehearse own-profile editing, administrator roster access, and the leader roster’s emergency-contact action, then verify another volunteer cannot read those fields.

See [Vercel rewrites](../vercel.json), [Supabase function configuration](../supabase/config.toml), [migrations](../supabase/migrations/README.md), and the [codebase map](../CODEBASE_MAP.md#configuration).

## Triage by symptom

| Symptom | First checks |
| --- | --- |
| Sign-in email fails or the callback goes to the wrong place | Confirm the frontend origin, Supabase Auth redirect configuration, and magic-link function status. Use redacted logs and timestamps. See [the login route](../src/routes/auth/Login.svelte) and [magic-link function](../supabase/functions/send-magic-link/index.ts). |
| Public counts differ from the roster | Confirm both views use the intended project and event. Check confirmed versus cancelled signups and the public fill-count RPC. See [the roles store](../src/lib/stores/roles.js). |
| A clinic registration appears saved but email is missing | Check the saved registration and delivery outcome separately before retrying. See [the clinic page](../src/routes/KidsClinic.svelte) and [clinic function](../supabase/functions/submit-kids-clinic-signup/index.ts). |
| Expected digest or Slack alert is missing | Check whether the appropriate digest setting is enabled, which scheduler is active, and the latest function status. Review the [GitHub NICA schedule](../.github/workflows/nica-coach-digest-cron.yml) and [admin summary cron source](../scripts/sql/SETUP_DAILY_ADMIN_SUMMARY_CRON.sql). |

When escalating, include the environment, release commit, affected flow, timestamp with time zone, and a redacted description of the observed outcome.

## Notification monitoring

Assign the NICA scheduler alert to a repository maintainer who receives failed workflow notifications. The scheduled job flags gaps longer than 45 minutes on the next run and keeps delivery results separate from scheduler freshness. Confirm notification routing using an approved environment. Run this check from a separate scheduler with read access to the repository's Actions metadata. Route a nonzero exit to the maintainer. The check also works from an authenticated terminal.

```sh
set -o pipefail
gh run list --repo paulhainsworth/volunteer --workflow nica-coach-digest-cron.yml \
  --branch main --event schedule --limit 1 --json databaseId,createdAt \
  | python3 scripts/check-nica-schedule.py --latest
```

The check fails when scheduled history is missing or the most recent run is more than 45 minutes old. Use it during periods when the digest is expected to run.

Assign delivery follow-up to the event's communications owner. Check NICA workflow delivery counts and the admin summary job history. For clinic receipts, use the [24-hour confirmation count](../scripts/sql/CHECK_CLINIC_CONFIRMATION_DELIVERY.sql) in the approved database and correlate unrecorded confirmations with the function's redacted delivery errors. The query excludes the latest five minutes while delivery may still be in progress. Review counts and timestamps in any escalation.

## Generic email rollout

Apply the [volunteer notification migration](../supabase/migrations/20261118000700_bind_volunteer_mail_to_activity.sql) before deploying `send-email`. The function verifies the sender, chooses templates and recipients from recent signup or waiver activity, and claims each notification once. Generic organizer mail requires an administrator or volunteer-leader session.

Coordinate the frontend and Edge Function release. An operator can set `SEND_EMAIL_STAFF_ONLY=false` temporarily while old frontend clients switch to the typed requests. Clear the override once staff messages and all four volunteer notifications are verified on the new frontend.
