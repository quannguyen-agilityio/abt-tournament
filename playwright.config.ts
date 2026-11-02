import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// The fixtures in e2e/support write to local Supabase as the seed BTC. Locally the URL and anon key
// come from .env.local; in CI the workflow exports them.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // In CI: annotate failures on the PR and write the HTML report without serving it (the workflow
  // uploads it as an artifact).
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm build && pnpm start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
