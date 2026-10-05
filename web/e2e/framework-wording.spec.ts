/**
 * CAP-38 round 3 E15 (Patrick, 2026-10-05): "this edit a copy of a rubric
 * (weird because is it not called a framework everywhere else?)". The page
 * and the bar say Frameworks, and the project's own vocabulary defines a
 * framework as "a competency rubric" (PROJECT-CONTEXT.md §2), so the
 * reviewer screens say framework throughout: Frameworks, its sheet, the
 * editor, and the queue's way into Frameworks. Student screens are frozen
 * and keep their wording.
 */
import type { Page } from '@playwright/test';

import { EMPTY, LATROBE, expect, test } from './fixtures.ts';

// A framework's own name is data, and the fixtures include one called
// "Hollow rubric"; only the screen's own words are checked.
const own_words = (text: string) => text.replaceAll('Hollow rubric', '');

async function says_framework_not_rubric(page: Page) {
  expect(own_words(await page.getByRole('main').innerText())).not.toMatch(/rubric/i);
  await expect(page.getByRole('link', { name: /(?<!Hollow )rubric/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /(?<!Hollow )rubric/i })).toHaveCount(0);
}

test('Frameworks says framework: its sub line, and every sheet', async ({ page }) => {
  await page.goto('/frameworks');
  await expect(
    page.getByText('The frameworks a gig is scored against.', { exact: false }),
  ).toBeVisible();
  await says_framework_not_rubric(page);

  for (const name of ['La Trobe six-competency', 'SFIA 9']) {
    await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
    const sheet = page.getByRole('dialog', { name, exact: true });
    await expect(sheet).toBeVisible();
    expect(own_words(await sheet.innerText())).not.toMatch(/rubric/i);
    await expect(sheet.getByRole('radio', { name: /(?<!Hollow )rubric/i })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  }
});

test('the editor says framework: its heading, the line under it, and the shape', async ({
  page,
}) => {
  await page.goto(`/frameworks/${LATROBE}/edit`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Edit a copy of a framework' }),
  ).toBeVisible();
  await says_framework_not_rubric(page);

  await page.getByLabel('Competency name').first().fill('Teamwork');
  await expect(
    page.getByText(/Choosing a different framework discards your edits/),
  ).toBeVisible();
  await says_framework_not_rubric(page);
});

test('an empty framework in the editor says framework', async ({ page }) => {
  await page.goto(`/frameworks/${EMPTY}/edit`);
  await expect(page.getByText('Nothing to rename.')).toBeVisible();
  await says_framework_not_rubric(page);
});

test('the queue’s way into Frameworks says framework', async ({ page }) => {
  await page.goto('/review-queue');
  await expect(
    page.getByRole('link', { name: 'Frameworks, copy a framework or assign one to a gig' }),
  ).toBeVisible();
  await says_framework_not_rubric(page);
});
