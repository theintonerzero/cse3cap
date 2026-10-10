/**
 * The screenshot-capture config for HO-6, separate from playwright.config.ts
 * (ADR #42) on purpose: this one is never run by CI or by ./run check, only
 * by ./run shots. See web/e2e/shots/README.md for when to run it and how the
 * figure numbering works.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 5176;
const ORIGIN = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e/shots',
  fullyParallel: false, // real-API shots share one signed-in session per test; keep runs predictable
  retries: 0,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: ORIGIN,
  },
  projects: [
    {
      // deviceScaleFactor must come AFTER the devices['Desktop Chrome']
      // spread, not in the top-level `use` block above: that preset carries
      // its own deviceScaleFactor: 1, which silently overrides a top-level
      // value set before it is spread in (final-review finding, HO-6). A
      // test-side guard in capture.spec.ts (window.devicePixelRatio) fails
      // loudly if this regresses again.
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 800 },
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: false,
    env: {
      // web/vite.config.ts proxies nothing -- client.ts's baseUrl() reads
      // VITE_API_BASE_URL directly and throws if it is unset (there is no
      // web/.env in a fresh checkout to fall back on). Fake-API shots don't
      // care what this points at: FakeApi.install() intercepts by
      // **/api/v1/** glob, which matches regardless of origin. Real-API
      // shots need the actual backend, so this is the same value ./run dev
      // writes into web/.env (web/README.md), making shots behave exactly
      // like a developer's own npm run dev rather than inventing a second
      // convention.
      VITE_API_BASE_URL: 'http://localhost:8000/api/v1',
      // No VITE_API_TOKEN: fake-API shots sign themselves in via
      // sessionStorage (FakeApi.install / sign_in_real), and real-API shots
      // read their token from SHOTS_<SLOT>_TOKEN at test time instead
      // (helpers.ts's token_env_var).
      VITE_API_TOKEN: '',
      // The User Manual shows the product, never the demo sign-in (CAP-51,
      // ADR #61). A presenter's machine keeps the shell on in
      // web/.env.development.local, which the dev server reads; a set-but-
      // empty value here beats it, as the e2e product server does.
      VITE_DEMO_SHELL: '',
      VITE_DEMO_TOKENS: '',
    },
  },
});
