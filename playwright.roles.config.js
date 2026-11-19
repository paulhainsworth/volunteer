import { defineConfig } from '@playwright/test';
import previewConfig from './playwright.release.config.js';

const artifacts = 'artifacts/role-review';

export default defineConfig({
  ...previewConfig,
  testIgnore: '**/database/**',
  retries: 0,
  outputDir: `${artifacts}/results`,
  reporter: [
    ['list'],
    ['json', { outputFile: `${artifacts}/results.json` }],
    ['html', { outputFolder: `${artifacts}/report`, open: 'never' }],
  ],
  use: {
    ...previewConfig.use,
    video: { mode: 'on', size: { width: 960, height: 540 } },
    trace: 'retain-on-failure',
  },
});
