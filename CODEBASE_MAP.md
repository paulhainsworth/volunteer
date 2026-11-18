# Codebase Map

Berkeley Bicycle Club uses this app to staff bicycle races, collect waivers, and manage volunteer assignments. It also handles kids’ clinic registration, NICA coach coordination, and volunteer contacts.

### Stack and commands

| Area | Source and locked versions |
| --- | --- |
| Frontend | Svelte 5.43.2, JavaScript ES modules, svelte-spa-router 4.0.1 |
| Build | Vite 7.1.12 and Svelte Vite plugin 6.2.1. The locked Vite package requires Node.js `^20.19.0 \|\| >=22.12.0`. |
| Backend | Supabase Auth and PostgreSQL with row-level security (RLS), Supabase JS and PostgREST JS 2.78.0, and TypeScript Edge Functions on Deno |
| Utilities | date-fns 4.1.0, jsPDF 3.0.4, jsPDF-AutoTable 5.0.7 |
| Browser tests | Playwright 1.56.1 and axe-core Playwright integration 4.11.0 in the lockfile |

- Install with `npm install`, start with `npm run dev`, build with `npm run build`, and serve the build locally with `npm run preview`. See [package.json](package.json) and [package-lock.json](package-lock.json).
- Run Chromium tests with `npm test`. The other scripts are `npm run test:ui`, `npm run test:headed`, `npm run test:debug`, and `npm run test:report`. [playwright.config.js](playwright.config.js) starts Vite and uses one worker to avoid conflicts in Supabase.
- The frontend targets Vercel. [vercel.json](vercel.json) defines the `/volunteer` rewrites, SPA fallback, and asset caching. Supabase is deployed separately. The repository documents `supabase db push` and `supabase migration up` in the [migration guide](supabase/migrations/README.md), and individual deploys such as `supabase functions deploy send-email` in the [email setup guide](EMAIL_SETUP_GUIDE.md). Confirm the database baseline and migration history before applying SQL.

### Directory layout

```text
.
├── .github/workflows/       # Scheduled NICA coach digest invocation
├── google-sheets-apps-script/ # Apps Script and HTML for the board view
├── public/                 # Images and volunteer-role CSV template
├── scripts/                # Manual SQL for cron setup, backfills, and cleanup
├── src/
│   ├── lib/
│   │   ├── components/     # Layout, role forms, bulk upload, and admin controls
│   │   ├── data/           # Kids’ clinic waiver content
│   │   ├── stores/         # Auth, roles, signups, waivers, domains, and other state
│   │   └── utils/          # CSV parsing, time display, timeouts, and other helpers
│   └── routes/
│       ├── admin/          # Roles, volunteers, domains, dashboard, email
│       ├── auth/           # Login and legacy auth page components
│       ├── invite/         # Domain invitation flow
│       ├── leader/         # Volunteer leader dashboard
│       └── volunteer/      # Browse, sign up, sign waiver, manage signups
├── supabase/
│   ├── functions/          # Signup, clinic registration, email, and digests
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

[SUPABASE_SCHEMA.sql](SUPABASE_SCHEMA.sql) is the bootstrap schema. Root-level SQL patches add and repair features such as leader domains and RLS. For example, [ADD_LEADER_DOMAINS.sql](ADD_LEADER_DOMAINS.sql) and [ADD_LEADER_DOMAINS_SAFE.sql](ADD_LEADER_DOMAINS_SAFE.sql) both address leader-domain setup.

### Entry points and data flow

| Path | Responsibility and callers |
| --- | --- |
| [index.html](index.html), [src/main.js](src/main.js), [src/App.svelte](src/App.svelte) | Mount the Svelte app, load global styles, initialize auth, and define hash routes. The route table includes `/volunteer`, `/signup/:id`, `/leader`, `/admin/*`, `/invite/:domainId`, `/board`, `/kids`, and `/contacts`. |
| [src/lib/stores/auth.js](src/lib/stores/auth.js), [src/lib/components/Layout.svelte](src/lib/components/Layout.svelte) | The app and pages consume session and profile state. Layout renders role-specific navigation. Database access is governed by Supabase policies and function-side checks. |
| [src/lib/supabaseClient.js](src/lib/supabaseClient.js), [src/lib/supabasePublic.js](src/lib/supabasePublic.js), [src/lib/supabaseUserRest.js](src/lib/supabaseUserRest.js) | The shared client handles Auth and data access. The public client serves anonymous PostgREST requests, and the user REST helper can use the persisted session token independently of Auth refresh. |
| [src/lib/stores/roles.js](src/lib/stores/roles.js), [src/lib/stores/signups.js](src/lib/stores/signups.js), [src/lib/volunteerSignup.js](src/lib/volunteerSignup.js) | Browse and roster views read roles and signup state. Roles fetch public fill counts through `get_confirmed_signup_counts`. Signed-in signup uses `confirm_volunteer_signup` to record capacity and consent in one transaction. Guest signup waits for account verification when Auth returns no session. |
| [src/routes/admin/RolesList.svelte](src/routes/admin/RolesList.svelte), [src/routes/admin/VolunteersList.svelte](src/routes/admin/VolunteersList.svelte), [src/routes/leader/Dashboard.svelte](src/routes/leader/Dashboard.svelte) | Own roster management, including adding volunteers to roles through database writes and Edge Function calls. |
| [src/routes/KidsClinic.svelte](src/routes/KidsClinic.svelte), [src/lib/submitKidsClinicSignup.js](src/lib/submitKidsClinicSignup.js) | Submit public clinic registration and waiver information to the `submit-kids-clinic-signup` function, which reserves one registration through `reserve_clinic_registration` and records optional email delivery separately. |
| [src/routes/Contacts.svelte](src/routes/Contacts.svelte), [src/routes/Board.svelte](src/routes/Board.svelte) | Contacts calls `search_volunteer_contacts`. The board route presents the external board view. See the [Apps Script setup](google-sheets-apps-script/README.md). |
| [supabase/functions/](supabase/functions/), [.github/workflows/nica-coach-digest-cron.yml](.github/workflows/nica-coach-digest-cron.yml), [scripts/](scripts/) | Edge Functions integrate with Resend and Slack. GitHub Actions invokes the NICA digest. SQL scripts document Supabase cron for the daily admin summary and an alternate NICA digest scheduler. |

### Configuration

Function names in the table refer to `supabase/functions/<name>/index.ts`.

| Names | Where read |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | The three Supabase client modules above, `src/lib/stores/auth.js`, `src/lib/submitKidsClinicSignup.js`, and `src/routes/auth/ResetPassword.svelte`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `admin-add-role-volunteer`, `create-leader`, `create-volunteer-and-signup`, `send-daily-admin-summary`, `send-magic-link`, `send-nica-coach-digest`, `send-welcome-with-magic-link`, and `submit-kids-clinic-signup`. The GitHub workflow reads both names from repository secrets. |
| `SUPABASE_ANON_KEY` | `create-signup-for-new-user` forwards the authenticated caller for older clients. |
| `RESEND_API_KEY` | `send-email`, `send-daily-admin-summary`, `send-magic-link`, `send-nica-coach-digest`, `send-welcome-with-magic-link`, and `submit-kids-clinic-signup`. |
| `DAILY_ADMIN_SUMMARY_SLACK_WEBHOOK_URL` | `send-daily-admin-summary`. |
| `SLACK_BOT_TOKEN`, `SLACK_SIGNUP_CHANNEL_ID` | `create-volunteer-and-signup`. |
| `CI` | `playwright.config.js` controls retries, exclusive tests, and dev-server reuse. |

### Conventions and maintenance

- Route and component files use PascalCase. State generally lives in Svelte stores. [src/app.css](src/app.css) defines global styles, and components use scoped CSS. [jsconfig.json](jsconfig.json) configures editor JavaScript checking. [package.json](package.json) defines no lint or format scripts.
- Supabase setup spans the bootstrap schema, manual root SQL patches, and timestamped migrations. Which patches have already run in production needs confirmation. The Quick Start references an untracked `.env.example` and lists Node 18, which falls below the locked Vite requirement.
- `npm audit --package-lock-only` reported 11 affected packages (one critical, eight high, two moderate), including jsPDF, Vite, and Svelte. Production reachability remains unverified.
- The largest pages are `src/routes/admin/RolesList.svelte` (3,066 lines), `src/routes/admin/VolunteersList.svelte` (2,570), and `src/routes/leader/Dashboard.svelte` (1,983). The two admin pages have parallel create-volunteer-and-signup flows.
- `src/routes/auth/Signup.svelte` and `src/routes/auth/ResetPassword.svelte` are absent from the current route table. Organizer-created signup notifications use the server-owned Slack sender.

## Testing

- Run all implemented checks with `npm test`. [tests/run.mjs](tests/run.mjs) runs Playwright and Deno. [tests/README.md](tests/README.md) documents Node, Chromium, Deno, and Docker prerequisites and report paths.
- Browser tests use a dedicated local Vite server and synthetic Auth, REST, RPC, and function responses. Database checks run in a fresh PostgreSQL container without networking. Edge handler tests use local imports and stub external providers.
- [TEST_PLAN.md](TEST_PLAN.md) tracks coverage, expected failures, and remaining P2 and P3 work. [The test workflow](.github/workflows/tests.yml) runs the same command in GitHub Actions.

### Open questions

1. What schema baseline, root SQL patches, and RLS policies are applied in production, and how should a new environment reproduce them?
2. Which Vercel and Supabase projects serve production and staging, and which environment can engineers use to test signups and outbound notifications?
3. Which Edge Functions and schedulers are active in production, including the alternative NICA digest schedulers?
