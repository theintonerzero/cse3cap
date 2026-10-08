/**
 * CAP-51: switching person in the demo shell (ADR #61).
 *
 * Jane and Noor share the Student token slot, so the product's slot sheet
 * cannot tell them apart. In the shell, the ⋮ menu's Switch user signs out
 * instead, and the picker, whose cards name each person, appears in place.
 * Picking someone else lands on "/" (AppShell's hand-over); there is one
 * switch, by one name, in one place.
 */
import { test, expect } from '@playwright/test';

import { GIG_ID, go, shell } from './people.ts';

test('Switch user shows the picker in place, and Noor lands on her own diary', async ({
  page,
}) => {
  await shell(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Jane N/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reflection Diary' }),
  ).toBeVisible();

  await go(page, `/gigs/${GIG_ID}`);
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Switch user' }).click();

  await expect(page.getByRole('heading', { name: 'Reflection Diary demo' })).toBeVisible();
  await page.getByRole('button', { name: /Noor A/ }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('banner')).toContainText('Noor A');
});

test('the shell has no second switch button', async ({ page }) => {
  await shell(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Jane N/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reflection Diary' }),
  ).toBeVisible();

  await expect(page.getByRole('button', { name: 'Switch profile' })).toHaveCount(0);
  await page.getByRole('button', { name: 'More options' }).click();
  await expect(page.getByRole('menuitem', { name: 'Switch user' })).toBeVisible();
});
