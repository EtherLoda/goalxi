/**
 * Override the global webServer config — the smoke test only hits
 * the api, not the web UI, so we don't need to start a Next.js server.
 */
import { defineConfig } from '@playwright/test';

const config = defineConfig({
  testDir: './test',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { baseURL: 'http://localhost:8001' },
    },
  ],
});

export default config;