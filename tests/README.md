# Offline regression tests

Use Node 22.12 or later on the Node 22 line, Deno 2, and a running local Docker engine. From the repository root, prepare dependencies once and run the suite.

```sh
npm ci
npx --no-install playwright install chromium
docker pull postgres:17-alpine
npm test
```

`npm test` runs the Playwright browser and PostgreSQL specs, followed by Deno handler tests. Playwright starts its own Vite server on `127.0.0.1:4179`. The browser fixtures intercept provider requests, block unknown destinations, and use synthetic accounts. Database tests launch a fresh PostgreSQL container with networking disabled and remove it after the run. Deno maps remote imports to test stubs and runs without network permission.

To debug the browser flows or view the last browser and database report, run:

```sh
npx --no-install playwright test tests/auth tests/integration tests/volunteer tests/organizer tests/roles
npm run test:report
```

Run `npm run test:release` to build and preview the production bundle with synthetic Supabase settings on `127.0.0.1:4180`. It repeats the browser flows against that build, including login, organizer routing, signup, and clinic registration. It runs locally and needs Chromium, without Docker or Deno. Run `npm test` separately for PostgreSQL and Edge Function checks.

Keep fixtures per test. Use an expected-failure marker only around a confirmed regression and cite its source. The suite reports a fixed expected failure as an unexpected pass so the marker can be removed.

## Record a role review

Run the browser workflows against a local production preview with synthetic accounts:

```sh
npm ci
npx --no-install playwright install chromium
npm run test:roles
npx --no-install playwright show-report artifacts/role-review/report
```

Use `npm run test:roles -- tests/roles/leader.spec.js` for the leader review cases. Use the admin or volunteer spec to focus the same way. The full recording run includes existing browser tests across the volunteer and organizer suites. It writes WebM recordings for each browser test and retains traces and screenshots on failure. The HTML report links to the recordings. Run `npm test` separately for the disposable database and offline Edge Function checks.

To save a recording on GitHub, run **Playwright role review videos** from the Actions tab. On a same-repository PR, apply the `record-role-videos` label to request a recording. Remove and reapply the label to record again. The artifact contains the HTML and JSON reports, WebM recordings, and failure evidence for 14 days. Ordinary pushes and PR opens do not start recording. Use fixture data for every recording because the repository is public.

Update the role coverage matrix in [TEST_PLAN.md](../TEST_PLAN.md#recorded-role-review) whenever a feature is added, removed, or changed. Put any new uncovered behavior in the matrix with its consequence and planned check.
