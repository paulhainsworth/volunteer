# Coding guide

The Berkeley Bicycle Club volunteer hub uses Svelte and Vite for the browser app, Supabase for authentication and PostgreSQL data, and TypeScript Edge Functions for server-side operations. Vercel hosts the frontend. See the [codebase map](../CODEBASE_MAP.md) for entry points, services, and configuration.

## Where code belongs

| Path | Responsibility |
| --- | --- |
| [src/App.svelte](../src/App.svelte) | Hash routes and application startup |
| [src/routes/](../src/routes/) | Page components and workflow-specific UI |
| [src/lib/components/](../src/lib/components/) | Shared UI and form components |
| [src/lib/stores/](../src/lib/stores/) | Shared application state and data access |
| [src/lib/utils/](../src/lib/utils/) | Reusable formatting, parsing, and validation |
| [supabase/functions/](../supabase/functions/) | Privileged operations and outbound integrations |
| [supabase/migrations/](../supabase/migrations/) | Versioned schema, data, and policy changes |
| [tests/](../tests/) | Playwright browser and database tests, plus Deno handler tests |

Use PascalCase for Svelte route and component files and camelCase for JavaScript variables and functions. Keep existing database column names when reading and writing Supabase records. Use domain terms consistently, including role, signup, waiver, affiliation, and leader domain. Keep global styles and theme tokens in [src/app.css](../src/app.css) and use scoped styles for component details.

## Data and workflow rules

- Enforce authorization, signup capacity, and required waivers at the server or database boundary. Browser validation gives immediate feedback.
- Keep stable record IDs across display name, schedule, and affiliation changes. Reuse existing queries and transitions where they express the same rule.
- Design related writes to preserve a consistent result on failure or retry. Signup confirmation should reflect a recorded assignment and any required waiver. Add a concurrent last-seat test when changing capacity enforcement.
- Use the existing schedule helpers for Pacific dates, optional times, and completion months. Preserve the difference between a date-only value and a timestamp.
- Handle loading, empty results, rejected writes, and provider failures explicitly. Keep delivery status separate from whether a signup or registration was saved. Use idempotency when a retried request could duplicate a record or notification.

## Authorization, privacy, and configuration

- Check the operation and its scope for anonymous visitors, volunteers, volunteer leaders, and admins. Route visibility and navigation controls are UI behavior. Supabase policies and function-side checks enforce access.
- Keep volunteer contact details, emergency contacts, minor and guardian information, and waiver signatures within authorized workflows. Exclude personal data, sign-in links, and provider response bodies from logs and user-facing errors.
- Keep service-role and provider credentials on the server. Client-side `VITE_*` values are included in the browser build. Keep local environment files and live credentials out of Git. Document variable names and where they are read.
- Put schema and policy changes in timestamped migrations and document any baseline prerequisites. Use disposable databases for migration and policy tests. Before any approved manual cleanup, confirm the project, preview the affected rows, and understand cascading deletes. See the [migration guide](../supabase/migrations/README.md).

## Accessibility and mobile

- Build forms that work with a keyboard and on narrow screens. Use visible labels and focus indicators, and place validation messages near the affected field.
- Announce submission errors and success states when they update dynamically. Use text to convey status, including when color or an icon also appears.
- Check the affected flow in both themes and at phone width when changing layout or shared styles.

## Test and review

Write a test plan before every change. Include affected behavior, commands, and pass criteria. For documentation, verify link targets, paths, commands, and factual claims. For behavior changes, exercise the normal entry point and the important failure paths.

| Command | Use |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm test` | Run the offline browser, database, and Edge Function suite |
| `npx --no-install playwright test tests/auth tests/integration` | Run targeted browser auth tests |
| `npm run test:report` | View the last Playwright HTML report |
| `npm run build` | Create the production frontend build |
| `npm run preview` | Serve the build locally for smoke checks |

Install dependencies and prepare Chromium, Deno, and Docker as documented in the [test setup](../tests/README.md). Use synthetic accounts and fixtures. Stub Supabase, Resend, Slack, and other external providers in automated tests. Exercise database behavior through a disposable local instance. Add or update a focused regression test when behavior changes. Use the full suite for changes to shared auth, database policies, signups, or waivers. Run the build and preview checks when changing frontend build or routing behavior.

Use expected failures for confirmed regressions, with an issue or source reference. Remove the marker when the fix passes. In a PR, report the commands and results, expected failures, and checks that remain open. Review authorization, waiver, capacity, and personal-data changes with particular attention to denial paths and partial writes.

## Keep documentation current

Review the [roadmap](../PRODUCTION_READINESS_ROADMAP.md), [features](../features.md), and [affected documentation](README.md) with each change. Update the roadmap for changes to priorities, blockers, or verified status and update the feature list when supported behavior or limitations change. Update the [codebase map](../CODEBASE_MAP.md) when routes, architecture, or deployment change. Update the [test plan](../TEST_PLAN.md) when coverage or expected failures change. During audit follow-up, update [AUDIT.md](../AUDIT.md) when verified evidence changes a finding or its status. Use the repository’s `bug` or `security` issue labels as appropriate, along with the affected `feature:` or `area:` label. Keep credentials and private volunteer information out of issues and PRs.

### Role workflow recordings

For changes to a volunteer, leader, or administrator workflow, update the [recorded role review matrix](../TEST_PLAN.md#recorded-role-review) and the corresponding Playwright check in the same PR. Run `npm run test:roles` when recording is useful, then link the GitHub artifact in the PR along with the tested commit. Record synthetic accounts and data only.
