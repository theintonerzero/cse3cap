/**
 * CAP-38 round 3 E18 (Patrick, 2026-10-05). Each competency's card was
 * headed by its internal code in capitals ("COLLABORATION", "PROG"), so a
 * renamed competency kept its old word on top. Now the card is headed by
 * the competency's name as it is being typed, in the card-title style the
 * other screens use; a blank name shows the name it started with. SFIA's
 * category stays, as a muted line under the name.
 */
import type { Page } from '@playwright/test';

import { LATROBE, SFIA, expect, test } from './fixtures.ts';

const card = (page: Page, name: string) => page.getByRole('group', { name, exact: true });

test('a card is headed by its competency’s name, not its code', async ({ page }) => {
  await page.goto(`/frameworks/${LATROBE}/edit`);
  await expect(card(page, 'Collaboration')).toBeVisible();
  await expect(card(page, 'collaboration')).toHaveCount(0);
  const legend = card(page, 'Collaboration').locator('legend');
  expect(await legend.evaluate((el) => getComputedStyle(el).textTransform)).toBe('none');
});

test('renaming a competency renames its card as you type; blank shows the old name', async ({
  page,
}) => {
  await page.goto(`/frameworks/${LATROBE}/edit`);
  await card(page, 'Collaboration').getByLabel('Competency name').fill('Teamwork');
  await expect(card(page, 'Teamwork')).toBeVisible();
  await card(page, 'Teamwork').getByLabel('Competency name').fill('');
  await expect(card(page, 'Collaboration')).toBeVisible();
});

test('SFIA: the name heads the card and the category sits under it', async ({ page }) => {
  await page.goto(`/frameworks/${SFIA}/edit`);
  const prog = card(page, 'Programming/software development');
  await expect(prog).toBeVisible();
  await expect(
    prog.getByText('Development and implementation', { exact: true }),
  ).toBeVisible();
});
