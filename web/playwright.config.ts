/**
 * Browser checks for web/, per ADR #42.
 *
 * Each spec drives the real screens in Chromium against a FAKE backend: every
 * request to /api/v1 is answered by e2e/fake-api.ts, from fixtures typed
 * against the generated schema.ts. Nothing reaches Laravel, no database is
 * touched, and no seeded token is involved -- the token in the page is a
 * placeholder the fake never checks. The backend half of each behaviour is
 * proved where it lives, in api/tests/.
 *
 * The API base is this server's own origin, so every call is same-origin and
 * interceptable, and a request the fake does not serve fails the test rather
 * than leaking anywhere. VITE_API_TOKEN is blanked so a developer's web/.env
 * token never ends up in the page under test.
 *
 *   ./run e2e                  from the repository root
 *   npx playwright test        from web/
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 5175;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries. A check that passes on its second attempt is a flaky check,
  // and retrying hides exactly that.
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: ORIGIN,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: false,
    env: {
      VITE_API_BASE_URL: `${ORIGIN}/api/v1`,
      VITE_API_TOKEN: '',
    },
  },
});
