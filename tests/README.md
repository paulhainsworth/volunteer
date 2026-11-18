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
npx --no-install playwright test tests/auth tests/integration tests/volunteer tests/organizer
npm run test:report
```

Run `npm run test:release` to build and preview the production bundle with synthetic Supabase settings on `127.0.0.1:4180`. It repeats the browser flows against that build, including login, organizer routing, signup, and clinic registration. It runs locally and needs Chromium, without Docker or Deno. Run `npm test` separately for PostgreSQL and Edge Function checks.

Keep fixtures per test. Use an expected-failure marker only around a confirmed regression and cite its source. The suite reports a fixed expected failure as an unexpected pass so the marker can be removed.
