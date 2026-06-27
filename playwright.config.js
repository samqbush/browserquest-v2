import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;
const PREVIEW_PORT = 4173;
const SERVER_PORT = 8000;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: 1,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PREVIEW_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      // BrowserQuest game/WebSocket server (Phase 1). Readiness is detected by
      // a TCP connection to the port (the server only speaks WebSocket, no HTTP
      // health endpoint).
      command: 'node server/js/main.js',
      port: SERVER_PORT,
      reuseExistingServer: !CI,
      timeout: 60_000,
    },
    {
      // Build the client and serve the production dist/ via vite preview.
      command: `npm run build:client && npx vite preview --port ${PREVIEW_PORT} --strictPort`,
      port: PREVIEW_PORT,
      reuseExistingServer: !CI,
      timeout: 120_000,
    },
  ],
});
