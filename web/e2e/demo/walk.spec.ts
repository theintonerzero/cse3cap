/**
 * CAP-51: the shell's whole walk, end to end (ADR #61).
 *
 * Signed out → the demo picker → Jane in one click → her diary home → a gig
 * → back up to the diary home. Past the picker, every step is the product's.
 */
import { test, expect } from '@playwright/test';

import { GIG_ID, go, shell } from './people.ts';

test('signed out → the demo picker → Jane → her diary → a gig → back', async ({ page }) => {
  const api = await shell(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Reflection Diary demo' })).toBeVisible();

  await page.getByRole('button', { name: /Jane N/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reflection Diary', exact: true }),
  ).toBeVisible();

  await go(page, `/gigs/${GIG_ID}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Develop AI use cases' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Back to Reflection Diary' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reflection Diary', exact: true }),
  ).toBeVisible();

  expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
});
