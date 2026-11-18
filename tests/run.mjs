import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const playwright = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const suites = [
  [process.execPath, [playwright, 'test', ...process.argv.slice(2)]],
  ['deno', [
    'test', '--no-config', '--no-check', '--cached-only',
    '--import-map', 'tests/edge/imports.json',
    '--allow-env=SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,RESEND_API_KEY,DAILY_ADMIN_SUMMARY_SLACK_WEBHOOK_URL,AUTH_MAIL_ALLOWED_ORIGINS,SEND_EMAIL_STAFF_ONLY',
    'tests/edge',
  ]],
];

for (const [command, args] of suites) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exitCode = 1;
}
