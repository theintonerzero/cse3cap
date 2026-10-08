/**
 * CAP-51: the Alumable demo welcome with NO persona tokens.
 *
 * Runs on the `demo-paste` project (VITE_DEMO_SHELL=1, no VITE_DEMO_TOKENS).
 * With no personas to one-click, the welcome falls back to the existing
 * seeded-token paste under the same demo heading and logo, so a fresh
 * checkout without the token env still works. It signs in in place, exactly
 * as the product's own gate does (ADR #61).
 */
import { test as base, expect } from '@playwright/test';

import type { components } from '../../src/api/schema.ts';
import { FakeApi } from '../fake-api.ts';

type Me = components['schemas']['Me'];

const me: Me = {
  id: '51510009-0000-4515-8515-515151515151',
  display_name: 'Jane N',
  participations: [],
};

const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi([], me, []);
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

test('with no demo tokens the welcome falls back to the seeded-token paste', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByRole('img', { name: /alumable/i })).toBeVisible();
  // The shell's own words, not the diary's "Reflection Diary / This demo has
  // no login screen", which contradicted the Alumable sign-in above it.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reflection Diary demo');
  await expect(page.getByText('No profiles are set up on this computer.')).toBeVisible();
  await expect(page.getByText(/no login screen/i)).toHaveCount(0);
  // The paste itself still works the way the diary's does.
  await expect(page.getByRole('button', { name: /Student/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Jane N/ })).toHaveCount(0);
});

test('a pasted token signs in in place, as the product gate does', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.clear());
  await page.goto('/');
  await page.getByRole('button', { name: /Student/ }).click();
  await page.getByRole('textbox', { name: 'Paste the student token' }).fill('1|demo-paste');
  await page.getByRole('button', { name: 'Use this token' }).click();

  await expect(page.getByRole('heading', { name: 'Reflection Diary demo' })).toHaveCount(0);
  await expect(page.getByRole('banner')).toContainText('Jane N');
  await expect(page).toHaveURL(/\/$/);
});
