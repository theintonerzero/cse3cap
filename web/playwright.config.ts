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
 * One file, e2e/firefox.spec.ts, runs in Firefox instead (ADR #51).
 *
 * The product suite runs with VITE_DEMO_SHELL unset, which is exactly how the
 * app ships, so it also proves the demo shell (CAP-51) stays invisible by
 * default. The demo shell has its own two servers and projects, under
 * e2e/demo/: `demo` carries VITE_DEMO_TOKENS so a persona signs in on one
 * click; `demo-paste` carries none, to prove the skinned-paste fallback.
 * Both are reached only by e2e/demo/**, which the product projects ignore.
 *
 *   ./run e2e                  from the repository root
 *   npx playwright test        from web/
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 5175;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const PORT_DEMO = 5176;
const ORIGIN_DEMO = `http://127.0.0.1:${PORT_DEMO}`;

const PORT_DEMO_PASTE = 5177;
const ORIGIN_DEMO_PASTE = `http://127.0.0.1:${PORT_DEMO_PASTE}`;

// Placeholder tokens the fake backend never checks: the demo welcome only
// needs a non-null value per persona to call sign_in_with and GET /auth/me.
const DEMO_TOKENS = JSON.stringify([
  { id: 'jane', name: 'Jane N', role_hint: 'Student', slot: 'student', token: 'demo-jane' },
  { id: 'noor', name: 'Noor A', role_hint: 'Student', slot: 'student', token: 'demo-noor' },
  { id: 'sam', name: 'Sam O', role_hint: 'Assessor', slot: 'assessor', token: 'demo-sam' },
  {
    id: 'lee',
    name: 'Dr Lee',
    role_hint: 'Supervisor',
    slot: 'supervisor',
    token: 'demo-lee',
  },
]);

const PRODUCT_IGNORE = ['**/shots/**', '**/demo/**'];

export default defineConfig({
  testDir: './e2e',
  // HO-6's screenshot pipeline (playwright.shots.config.ts) owns this
  // subtree: a separate config, run only by ./run shots, never by CI.
  testIgnore: ['**/shots/**'],
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
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // The Firefox file runs once, in Firefox, not twice; the demo shell has
      // its own servers below.
      testIgnore: [...PRODUCT_IGNORE, '**/firefox.spec.ts'],
    },
    // ADR #51: one Firefox file for the layout and pointer behaviour Chromium
    // hides (a <table>'s caption escaping its clip was the first). The rest of
    // the suite stays Chromium-only so CI time does not double.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: ['**/firefox.spec.ts'],
    },
    // CAP-51: the demo shell, flag on, with one-click personas.
    {
      name: 'demo',
      use: { ...devices['Desktop Chrome'], baseURL: ORIGIN_DEMO },
      testMatch: ['**/demo/**'],
      testIgnore: ['**/demo/welcome-paste.spec.ts'],
    },
    // CAP-51: the demo shell, flag on, no persona tokens, so the welcome
    // falls back to the skinned paste.
    {
      name: 'demo-paste',
      use: { ...devices['Desktop Chrome'], baseURL: ORIGIN_DEMO_PASTE },
      testMatch: ['**/demo/welcome-paste.spec.ts'],
    },
  ],
  webServer: [
    {
      command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
      url: ORIGIN,
      reuseExistingServer: false,
      env: {
        VITE_API_BASE_URL: `${ORIGIN}/api/v1`,
        VITE_API_TOKEN: '',
        // Blanked like the token: a developer's web/.env.local or .env.development.local set up for the
        // demo (docs/Demo-Script.md) must not turn the product suite into it.
        VITE_DEMO_SHELL: '',
        VITE_DEMO_TOKENS: '',
      },
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${PORT_DEMO} --strictPort`,
      url: ORIGIN_DEMO,
      reuseExistingServer: false,
      env: {
        VITE_API_BASE_URL: `${ORIGIN_DEMO}/api/v1`,
        VITE_API_TOKEN: '',
        VITE_DEMO_SHELL: '1',
        VITE_DEMO_TOKENS: DEMO_TOKENS,
      },
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${PORT_DEMO_PASTE} --strictPort`,
      url: ORIGIN_DEMO_PASTE,
      reuseExistingServer: false,
      env: {
        VITE_API_BASE_URL: `${ORIGIN_DEMO_PASTE}/api/v1`,
        VITE_API_TOKEN: '',
        VITE_DEMO_SHELL: '1',
        // Blank, not absent: absent, Vite would take a developer's demo personas.
        VITE_DEMO_TOKENS: '',
      },
    },
  ],
});
