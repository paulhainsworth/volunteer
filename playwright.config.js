import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: false, // Run tests sequentially to avoid conflicts
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Keep local integration fixtures sequential
  reporter: [
    ['list'],
    ['json', { outputFile: 'node_modules/.cache/volunteer-tests/results.json' }],
    ['html', { outputFolder: 'node_modules/.cache/volunteer-tests/report', open: 'never' }],
  ],
  outputDir: 'node_modules/.cache/volunteer-tests/results',
  
  use: {
    baseURL: 'http://127.0.0.1:4179',
    trace: 'on-first-retry',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4179 --strictPort',
    env: {
      VITE_SUPABASE_URL: 'https://volunteer-test.invalid',
      VITE_SUPABASE_ANON_KEY: 'synthetic-anon-key',
    },
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: false,
  },
});

