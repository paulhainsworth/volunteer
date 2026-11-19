# Codebase Map

Berkeley Bicycle Club uses this app to staff bicycle races, collect waivers, and manage volunteer assignments. It also handles kids’ clinic registration, NICA coach coordination, and volunteer contacts.

### Stack and commands

| Area | Source and locked versions |
| --- | --- |
| Frontend | Svelte 5.43.2, JavaScript ES modules, svelte-spa-router 4.0.1 |
| Build | Vite 7.1.12 and Svelte Vite plugin 6.2.1. The locked Vite package requires Node.js `^20.19.0 \|\| >=22.12.0`. |
| Backend | Supabase Auth and PostgreSQL with row-level security (RLS), Supabase JS and PostgREST JS 2.78.0, and TypeScript Edge Functions on Deno |
| Utilities | date-fns 4.1.0, jsPDF 3.0.4, jsPDF-AutoTable 5.0.7 |
| Browser tests | Playwright 1.56.1 in the lockfile |

- Install with `npm install`, start with `npm run dev`, build with `npm run build`, and serve the build locally with `npm run preview`. See [package.json](package.json) and [package-lock.json](package-lock.json).
- Run Chromium tests with `npm test`. The other scripts are `npm run test:ui`, `npm run test:headed`, `npm run test:debug`, and `npm run test:report`. [playwright.config.js](playwright.config.js) starts Vite and uses one worker to avoid conflicts in Supabase.
- The frontend targets Vercel. [vercel.json](vercel.json) defines the `/volunteer` rewrites, SPA fallback, and asset caching. Supabase is deployed separately. The repository documents `supabase db push` and `supabase migration up` in the [migration guide](supabase/migrations/README.md), and individual deploys such as `supabase functions deploy send-email` in the [email setup guide](EMAIL_SETUP_GUIDE.md). Confirm the database baseline and migration history before applying SQL.

### Directory layout

```text
.
├── .github/workflows/       # Scheduled NICA coach digest invocation
├── google-sheets-apps-script/ # Apps Script and HTML for the board view
├── public/                 # Images and volunteer-role CSV template
├── scripts/
│   └── sql/                # Manual SQL for cron, diagnostics, and cleanup
├── src/
│   ├── lib/
│   │   ├── components/     # Layout, role forms, bulk upload, and admin controls
│   │   ├── data/           # Kids’ clinic waiver content
│   │   ├── stores/         # Auth, roles, signups, waivers, domains, and other state
│   │   └── utils/          # CSV parsing, time display, timeouts, and other helpers
│   └── routes/
│       ├── admin/          # Roles, volunteers, domains, dashboard, email
│       ├── auth/           # Magic-link login
│       ├── invite/         # Domain invitation flow
│       ├── leader/         # Volunteer leader dashboard
│       └── volunteer/      # Browse, sign up, sign waiver, manage signups
├── supabase/
│   ├── bootstrap/          # Base schema and prerequisite patches exercised in tests
│   ├── functions/          # Signup, clinic registration, email, and digests
│   ├── manual/             # Historical patches and repair SQL
│   └── migrations/         # Timestamped database and policy changes
└── tests/
    ├── auth/               # Magic-link request tests
    ├── database/           # Disposable PostgreSQL migration and policy checks
    ├── edge/               # Deno handler tests with local provider stubs
    ├── helpers/            # Shared browser fixtures
    ├── integration/        # Auth callback, session, and onboarding
    ├── organizer/          # Assignment, leader roster, and PDF export
    └── volunteer/          # Browse, signup, cancellation, and clinic
```

[supabase/bootstrap/SUPABASE_SCHEMA.sql](supabase/bootstrap/SUPABASE_SCHEMA.sql) is the bootstrap schema. Bootstrap and manual SQL add or repair features such as leader domains and RLS. For example, [supabase/manual/ADD_LEADER_DOMAINS.sql](supabase/manual/ADD_LEADER_DOMAINS.sql) and [supabase/bootstrap/ADD_LEADER_DOMAINS_SAFE.sql](supabase/bootstrap/ADD_LEADER_DOMAINS_SAFE.sql) both address leader-domain setup.

### Entry points and data flow

| Path | Responsibility and callers |
| --- | --- |
| [index.html](index.html), [src/main.js](src/main.js), [src/App.svelte](src/App.svelte) | Mount the Svelte app, load global styles, initialize auth, and define hash routes. The route table includes `/volunteer`, `/signup/:id`, `/leader`, `/admin/*`, `/invite/:domainId`, `/board`, `/kids`, and `/contacts`. |
| [src/lib/stores/auth.js](src/lib/stores/auth.js), [src/lib/components/Layout.svelte](src/lib/components/Layout.svelte) | The app and pages consume session and profile state. Layout renders role-specific navigation. Database access is governed by Supabase policies and function-side checks. |
| [src/lib/supabaseClient.js](src/lib/supabaseClient.js), [src/lib/supabasePublic.js](src/lib/supabasePublic.js), [src/lib/supabaseUserRest.js](src/lib/supabaseUserRest.js) | The shared client handles Auth and data access. The public client serves anonymous PostgREST requests, and the user REST helper can use the persisted session token independently of Auth refresh. |
| [Website messages](src/lib/websiteMessages.js), [admin editor](src/routes/admin/WebsiteMessages.svelte) | Home, Volunteer Opportunities, and onboarding read published plain text and the active event year. Admin Communications links to the editor. [Database policies](supabase/migrations/20261118001400_add_website_messages.sql) allow public reads and admin edits. |
| [Season rollover](src/routes/admin/SeasonRollover.svelte), [season queries](src/lib/volunteerSeason.js), [rollover migration](supabase/migrations/20261118001500_add_volunteer_season_rollover.sql) | Admins control the first year of the active roster. Database policies filter public shifts and prevent archived shifts from accepting new confirmations. The volunteer store separates archived users from the active roster and mailing lists and keeps confirmed signup history for the Users shift filter and roster export. |
| [src/lib/stores/roles.js](src/lib/stores/roles.js), [src/lib/stores/signups.js](src/lib/stores/signups.js), [src/lib/volunteerSignup.js](src/lib/volunteerSignup.js) | Browse and roster views read roles and signup state. Roles fetch public fill counts through `get_confirmed_signup_counts`. Signed-in signup uses `confirm_volunteer_signup` to record capacity and consent in one transaction. Guest signup waits for account verification when Auth returns no session. |
| [src/routes/admin/RolesList.svelte](src/routes/admin/RolesList.svelte), [src/routes/admin/VolunteersList.svelte](src/routes/admin/VolunteersList.svelte), [src/routes/leader/Dashboard.svelte](src/routes/leader/Dashboard.svelte) | Own roster management, including adding volunteers to roles through database writes and Edge Function calls. The two admin pages share [adminVolunteerSignup.js](src/lib/adminVolunteerSignup.js) for session validation, assignment requests, and welcome email. |
| [Profile access](src/lib/profileAccess.js) | Reads the current account’s profile and requests emergency-contact details through authorized operations. Staff use these reads separately from ordinary roster queries. |
| [src/lib/stores/waiver.js](src/lib/stores/waiver.js), [waiver migration](supabase/migrations/20261118000300_enforce_shared_volunteer_waiver_policy.sql) | The browser reads waiver status and signs through authenticated RPCs. Standalone signing uses age at signing. Role signup uses the role date when set. Both share guardian checks and require renewal when a previous record lacks an age declaration. |
| [src/lib/organizerVolunteerSignup.js](src/lib/organizerVolunteerSignup.js) | Shares the new-volunteer assignment request across admin and leader screens. Owns the leader flow for assigning an existing volunteer and reactivating a cancelled assignment. |
| [Generic and volunteer mail](supabase/functions/send-email/index.ts) | Verifies the caller, restricts custom email to staff, and builds volunteer mail from claimed signup or waiver activity. |
| [src/routes/KidsClinic.svelte](src/routes/KidsClinic.svelte), [src/lib/submitKidsClinicSignup.js](src/lib/submitKidsClinicSignup.js) | Submit public clinic registration and waiver information to the `submit-kids-clinic-signup` function, which reserves one registration through `reserve_clinic_registration` and records optional email delivery separately. |
| [src/routes/Contacts.svelte](src/routes/Contacts.svelte), [src/routes/Board.svelte](src/routes/Board.svelte) | Contacts calls `search_volunteer_contacts`. The board route presents the external board view. See the [Apps Script setup](google-sheets-apps-script/README.md). |
| [supabase/functions/](supabase/functions/), [.github/workflows/nica-coach-digest-cron.yml](.github/workflows/nica-coach-digest-cron.yml), [scripts/sql/](scripts/sql/) | Edge Functions integrate with Resend and Slack. GitHub Actions invokes the NICA digest. SQL scripts document Supabase cron for the daily admin summary and an alternate NICA digest scheduler. |

### Configuration

Function names in the table refer to `supabase/functions/<name>/index.ts`.

| Names | Where read |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | The three Supabase client modules above, `src/lib/stores/auth.js`, and `src/lib/submitKidsClinicSignup.js`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `admin-add-role-volunteer`, `create-leader`, `create-volunteer-and-signup`, `send-daily-admin-summary`, `send-magic-link`, `send-nica-coach-digest`, `send-welcome-with-magic-link`, and `submit-kids-clinic-signup`. The GitHub workflow reads both names from repository secrets. |
| `SUPABASE_ANON_KEY` | `create-signup-for-new-user` forwards the authenticated caller for older clients. |
| `RESEND_API_KEY` | `send-email`, `send-daily-admin-summary`, `send-magic-link`, `send-nica-coach-digest`, `send-welcome-with-magic-link`, and `submit-kids-clinic-signup`. |
| `AUTH_MAIL_ALLOWED_ORIGINS` | Optional environment override for the server-owned sign-in destinations. |
| `SEND_EMAIL_STAFF_ONLY` | Temporary compatibility override during the generic email rollout. Staff-only mode is the default. |
| `DAILY_ADMIN_SUMMARY_SLACK_WEBHOOK_URL` | `send-daily-admin-summary`. |
| `SLACK_BOT_TOKEN`, `SLACK_SIGNUP_CHANNEL_ID` | `create-volunteer-and-signup`. |
| `CI` | `playwright.config.js` controls retries, exclusive tests, and dev-server reuse. |

### Conventions and maintenance

- Route and component files use PascalCase. State generally lives in Svelte stores. [src/app.css](src/app.css) defines global styles, and components use scoped CSS. [jsconfig.json](jsconfig.json) configures editor JavaScript checking. [package.json](package.json) defines no lint or format scripts.
- Supabase setup spans the bootstrap schema, manual SQL patches, and timestamped migrations. Which patches have already run in production needs confirmation. Use the tracked `.env.example` and Node 22 selector for local development.
- `npm audit --package-lock-only` reported 11 affected packages (one critical, eight high, two moderate), including jsPDF, Vite, and Svelte. Production reachability remains unverified.
- The largest pages are `src/routes/admin/RolesList.svelte` (3,066 lines), `src/routes/admin/VolunteersList.svelte` (2,570), and `src/routes/leader/Dashboard.svelte` (1,983). The two admin pages have parallel create-volunteer-and-signup flows.
- `src/routes/auth/Signup.svelte` and `src/routes/auth/ResetPassword.svelte` are absent from the current route table. Organizer-created signup notifications use the server-owned Slack sender.

## Testing

- Run all implemented checks with `npm test`. [tests/run.mjs](tests/run.mjs) runs Playwright and Deno. [tests/README.md](tests/README.md) documents Node, Chromium, Deno, and Docker prerequisites and report paths.
- Browser tests use a dedicated local Vite server and synthetic Auth, REST, RPC, and function responses. Database checks run in a fresh PostgreSQL container without networking. Edge handler tests use local imports and stub external providers.
- [TEST_PLAN.md](TEST_PLAN.md) tracks coverage, expected failures, and remaining P2 and P3 work. Run the suite locally before opening a pull request.
- Run `npm run test:roles` to build the app and record the volunteer, leader, and admin browser flows with fixture data. The [recording runbook](tests/README.md#record-a-role-review) explains how to save the report and videos as an opt-in GitHub Actions artifact.

- [Minor and guardian consent tests](tests/volunteer/minor-consent.spec.js) exercise both consent forms and both guest entry points. The test plan records the remaining policy decision and expected failures.

### Open questions

1. What schema baseline, bootstrap and manual patches, and RLS policies are applied in production, and how should a new environment reproduce them?
2. Which Vercel and Supabase projects serve production and staging, and which environment can engineers use to test signups and outbound notifications?
3. Which Edge Functions and schedulers are active in production, including the alternative NICA digest schedulers?
