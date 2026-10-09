/**
 * The live demo's picker (CAP-54): people come from /demo/personas.json at
 * runtime, never from the build. Runs under the `demo-live` project, whose
 * server sets VITE_DEMO_PERSONAS_URL and no VITE_DEMO_SHELL or VITE_DEMO_TOKENS.
 */
import { expect, test } from '@playwright/test';

const PERSONAS = [
  {
    id: 'jane',
    name: 'Jane N',
    role_hint: 'Student',
    slot: 'student',
    token: '1|live-jane',
  },
  {
    id: 'sam',
    name: 'Sam O',
    role_hint: 'Assessor',
    slot: 'assessor',
    token: '2|live-sam',
  },
];

const UNAUTHENTICATED = {
  status: 401,
  json: { error: { code: 'UNAUTHENTICATED', message: 'x', details: {} } },
};

test('shows a card per person from the runtime file', async ({ page }) => {
  await page.route('**/demo/personas.json', (route) => route.fulfill({ json: PERSONAS }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Reflection Diary demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Jane N/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sam O/ })).toBeVisible();
});

test('signs in with the token from the file', async ({ page }) => {
  let bearer = '';
  await page.route('**/demo/personas.json', (route) => route.fulfill({ json: PERSONAS }));
  await page.route('**/api/v1/auth/me', (route) => {
    bearer = route.request().headers()['authorization'] ?? '';
    return route.fulfill(UNAUTHENTICATED);
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Jane N/ }).click();
  await expect.poll(() => bearer).toBe('Bearer 1|live-jane');
});

test('a rejected token after a reset says to reload, not to edit an env file', async ({
  page,
}) => {
  await page.route('**/demo/personas.json', (route) => route.fulfill({ json: PERSONAS }));
  await page.route('**/api/v1/auth/me', (route) => route.fulfill(UNAUTHENTICATED));
  await page.goto('/');
  await page.getByRole('button', { name: /Jane N/ }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText(/the demo may have been reset\. Reload the page/i);
  await expect(alert).not.toContainText('.env');
});

test('a missing file falls back to the paste gate', async ({ page }) => {
  await page.route('**/demo/personas.json', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
  await page.goto('/');
  await expect(page.getByText('Paste a seeded token to continue')).toBeVisible();
});

test('while the file loads, the picker shows skeletons, not the paste gate', async ({
  page,
}) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/demo/personas.json', async (route) => {
    await held;
    await route.fulfill({ json: PERSONAS });
  });
  await page.goto('/');
  await expect(page.getByTestId('personas-loading')).toBeVisible();
  await expect(page.getByText('Paste a seeded token to continue')).toHaveCount(0);
  release();
  await expect(page.getByRole('button', { name: /Jane N/ })).toBeVisible();
});
