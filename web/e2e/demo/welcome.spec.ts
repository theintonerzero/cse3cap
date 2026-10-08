/**
 * CAP-51: the demo sign-in, with persona tokens present (ADR #61).
 *
 * Runs on the `demo` project. With nobody signed in, the token gate is
 * replaced in place by a one-click picker of named people, labelled plainly
 * as a demo. Picking one signs in and leaves the app where the product would
 * be: at "/", which for a student is the diary home.
 */
import { test, expect } from '@playwright/test';

import { shell } from './people.ts';

test('the picker is plainly a demo, with the Alumable logo', async ({ page }) => {
  await shell(page);
  await page.goto('/');

  await expect(page.getByRole('img', { name: /alumable/i })).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reflection Diary demo' }),
  ).toBeVisible();
  await expect(page.getByText(/not a real Alumable sign-in/)).toBeVisible();
  for (const name of ['Jane N', 'Noor A', 'Sam O', 'Dr Lee']) {
    await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  }
});

test('one click as Jane opens her diary home, and it stays', async ({ page }) => {
  const api = await shell(page);
  await page.goto('/');

  await page.getByRole('button', { name: /Jane N/ }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Reflection Diary' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Reflection Diary demo' })).toHaveCount(0);
  expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
});
