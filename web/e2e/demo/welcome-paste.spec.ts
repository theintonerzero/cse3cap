/**
 * CAP-51: the Alumable demo welcome with NO persona tokens.
 *
 * Runs on the `demo-paste` project (VITE_DEMO_SHELL=1, no VITE_DEMO_TOKENS).
 * With no personas to one-click, the welcome falls back to the existing
 * seeded-token paste, dressed in the Alumable brand, so a fresh checkout
 * without the token env still works.
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
  await page.goto('/welcome');

  await expect(page.getByRole('img', { name: /alumable/i })).toBeVisible();
  await expect(page.getByText(/paste one of the three seeded tokens/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Jane N/ })).toHaveCount(0);
});
