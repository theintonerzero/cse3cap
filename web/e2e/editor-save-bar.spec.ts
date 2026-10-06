/**
 * CAP-38 round 3 E17 (Patrick, 2026-10-05): "the bottom button once
 * scrolled down completely floats off the bottom of the screen, we've had a
 * similar issue before and it was fixed." On a phone the editor's Save bar
 * was sticky, and a sticky bar rises off the bottom edge once the page ends.
 * The stepper had the same thing and was fixed (round 2b) by fixing the bar
 * to the bottom and keeping room for it under the last field. Same here.
 */
import type { Page } from '@playwright/test';

import { LATROBE, expect, test } from './fixtures.ts';

const footer = (page: Page) =>
  page.getByRole('button', { name: 'Save as a new copy' }).locator('xpath=..');

async function bottom_of(page: Page) {
  const box = (await footer(page).boundingBox())!;
  return box.y + box.height;
}

test('390: the Save bar sits on the bottom edge at the top of the form and at its end', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/frameworks/${LATROBE}/edit`);
  await expect(page.getByLabel('Name of your copy')).toBeVisible();

  expect(Math.abs((await bottom_of(page)) - 844)).toBeLessThanOrEqual(1);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  expect(Math.abs((await bottom_of(page)) - 844)).toBeLessThanOrEqual(1);

  // Nothing ends up behind it: the last field clears the bar's top edge.
  const last = (await page.locator('textarea').last().boundingBox())!;
  const bar = (await footer(page).boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(bar.y);
});

test('1440: the Save bar stays in the page, under the form', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/frameworks/${LATROBE}/edit`);
  await expect(page.getByLabel('Name of your copy')).toBeVisible();
  expect(await footer(page).evaluate((el) => getComputedStyle(el).position)).toBe('static');
});

test('390: a failed save makes the bar taller, and the last field still clears it', async ({
  page,
  api,
}) => {
  api.fail('POST /frameworks', {
    kind: 'error',
    status: 403,
    code: 'ROLE_FORBIDDEN',
    message: 'Only a supervisor can create a framework copy.',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/frameworks/${LATROBE}/edit`);
  await page.getByRole('button', { name: 'Save as a new copy' }).click();
  await expect(page.getByText('Nothing was saved.')).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  const last = (await page.locator('textarea').last().boundingBox())!;
  const bar = (await footer(page).boundingBox())!;
  expect(Math.abs(bar.y + bar.height - 844)).toBeLessThanOrEqual(1);
  expect(last.y + last.height).toBeLessThanOrEqual(bar.y);
});
