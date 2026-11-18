import { defineConfig } from '@playwright/test';
import config from './playwright.config.js';

const baseURL = 'http://127.0.0.1:4180';

export default defineConfig({
  ...config,
  reporter: 'list',
  outputDir: 'node_modules/.cache/volunteer-tests/release',
  use: { ...config.use, baseURL },
  webServer: {
    ...config.webServer,
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4180 --strictPort',
    url: baseURL,
    timeout: 120000,
  },
});
