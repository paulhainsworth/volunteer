# Volunteer hub operations

Use the [production readiness roadmap](../PRODUCTION_READINESS_ROADMAP.md) for release gates. Use synthetic records and approved test recipients for rehearsals.

## Race-day workflow checks

| Role | Rehearsal |
| --- | --- |
| Organizer | Import a representative roles CSV, review the public list and fill counts, assign a leader to a domain, and verify the intended notification arrives. See the [CSV format](../CSV_FORMAT.md) and [domain guide](../DOMAINS_USAGE_GUIDE.md). |
| Volunteer | Open the volunteer list, request a magic link, complete emergency-contact and waiver steps when prompted, sign up, reload My Signups, and cancel a test assignment. Check both roster and capacity after cancellation. |
| Volunteer leader | Open My Roles, verify the expected roster, and exercise an approved test assignment. Confirm that records outside the leader’s scope are inaccessible. |
| Clinic and NICA organizer | Submit a clinic fixture with guardian consent, check registration and delivery status, and generate a team roster PDF. Confirm the intended NICA digest configuration with its owner. |

The browser uses hash routes such as `/#/volunteer`, `/#/auth/login`, `/#/my-signups`, and `/#/kids`. Review the route table for exact paths. Keep volunteer and guardian information out of screenshots and issue reports. See [App.svelte](../src/App.svelte) and the [test plan](../TEST_PLAN.md).

## Release verification

Automatic Vercel Git deployments are enabled for `main`. Non-main branches, including pull request branches, skip automatic deployment while the preview pause is in effect. Review the rule in [vercel.json](../vercel.json) before resuming previews.

1. Identify the exact commit and the Vercel and Supabase targets. The frontend build, database migrations, Edge Functions, and scheduled jobs have separate deployment paths.
2. Run the planned checks and a local production build. Confirm the key routes render in a preview. Review test results and expected failures before promoting the release.
3. For database or function changes, record the migration baseline, affected functions and policy changes, and recovery plan. Apply and verify them in an approved test environment first.
4. Confirm the intended Auth redirects, mail and Slack settings, and active scheduler. Record configuration names and deployment versions in the release notes. Keep credential values in the designated secret store.
5. After promotion, verify the approved release targets with an authorized smoke check and record the outcome. Use the previous frontend deployment for frontend recovery. For database and function changes, follow the separately reviewed recovery plan.

Apply the [optional assent migration](../supabase/migrations/20261118000200_allow_optional_minor_assent.sql) before promoting its frontend. The updated role form can submit a blank minor signature when guardian consent is complete.

Coordinate the [shared waiver migration](../supabase/migrations/20261118000300_enforce_shared_volunteer_waiver_policy.sql) and frontend promotion in one release window. The old standalone form requires direct writes that the migration removes. Rehearse adult and minor waiver renewal with fixture accounts, including an account with a waiver that predates the new age declaration. Older records remain in the database for reference.

See [Vercel rewrites](../vercel.json), [Supabase function configuration](../supabase/config.toml), [migrations](../supabase/migrations/README.md), and the [codebase map](../CODEBASE_MAP.md#configuration).

## Triage by symptom

| Symptom | First checks |
| --- | --- |
| Sign-in email fails or the callback goes to the wrong place | Confirm the frontend origin, Supabase Auth redirect configuration, and magic-link function status. Use redacted logs and timestamps. See [the login route](../src/routes/auth/Login.svelte) and [magic-link function](../supabase/functions/send-magic-link/index.ts). |
| Public counts differ from the roster | Confirm both views use the intended project and event. Check confirmed versus cancelled signups and the public fill-count RPC. See [the roles store](../src/lib/stores/roles.js). |
| A clinic registration appears saved but email is missing | Check the saved registration and delivery outcome separately before retrying. See [the clinic page](../src/routes/KidsClinic.svelte) and [clinic function](../supabase/functions/submit-kids-clinic-signup/index.ts). |
| Expected digest or Slack alert is missing | Check whether the appropriate digest setting is enabled, which scheduler is active, and the latest function status. Review the [GitHub NICA schedule](../.github/workflows/nica-coach-digest-cron.yml) and [admin summary cron source](../scripts/sql/SETUP_DAILY_ADMIN_SUMMARY_CRON.sql). |

When escalating, include the environment, release commit, affected flow, timestamp with time zone, and a redacted description of the observed outcome.
