# Local development

Use Node 22.12 or later on the Node 22 line. The current lockfile records Vite’s supported Node range. The offline suite also uses Chromium, Deno 2, and a running Docker engine. See the [lockfile](../package-lock.json) and [test setup](../tests/README.md).

## Run the browser app

From the repository root, install dependencies with `npm ci`. Create an ignored `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for an approved local or development Supabase project. Start Vite with `npm run dev` and use the URL printed by Vite. The browser app sends requests to the configured project, so confirm the target before exercising a write, login email, or notification. See the [client configuration](../src/lib/supabaseClient.js) and [ignored files](../.gitignore).

A fresh database needs the bootstrap schema, applicable prerequisite bootstrap patches, and versioned migrations. Confirm the baseline and migration order before applying SQL. The audit tracks the missing documented prerequisites under [issue #6](https://github.com/paulhainsworth/volunteer/issues/6). See the [SQL layout](../supabase/README.md), [migration guide](../supabase/migrations/README.md), and [database tests](../tests/database/migrations.spec.js).

## Run tests without a shared backend

Prepare tools and dependencies using the [test setup](../tests/README.md), then run `npm test`. The suite starts its own Vite server, supplies synthetic browser credentials, stubs external providers, and creates disposable PostgreSQL data. It needs no Supabase account or mail credentials.

| Command | Purpose |
| --- | --- |
| `npm test` | Playwright browser and database checks, followed by Deno handler tests |
| `npx --no-install playwright test tests/auth tests/integration` | Targeted browser login, session, and onboarding checks |
| `npm run test:report` | Open the last Playwright report |
| `npm run build` | Build the frontend with the configured environment |
| `npm run preview` | Serve the built frontend locally |

Use [TEST_PLAN.md](../TEST_PLAN.md) to see covered cases and known expected failures. For manual preview checks, verify the build used the intended Supabase project before following a link or submitting a form.
