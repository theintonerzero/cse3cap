/**
 * CAP-51: in the demo shell the app navigates exactly as the product does
 * (ADR #61). Patrick, 8 Oct: My Gigs made the same back-arrow go to
 * different places depending on who was signed in. It is gone, and so are
 * its routes.
 */
import { test, expect } from '@playwright/test';

import { GIG_ID, shell } from './people.ts';

async function as_jane(page: import('@playwright/test').Page) {
  await shell(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Jane N/ }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reflection Diary' }),
  ).toBeVisible();
}

for (const path of ['/home', '/welcome']) {
  test(`${path} is not a page in the shell`, async ({ page }) => {
    await as_jane(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'My gigs' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Reflection Diary demo' })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeVisible();
  });
}

test("a gig's back-arrow goes up to the diary home, as in the product", async ({
  page,
}) => {
  await as_jane(page);
  await page.goto(`/gigs/${GIG_ID}`);

  await page.getByRole('link', { name: 'Back to Reflection Diary' }).click();

  await expect(page).toHaveURL(/\/(\?.*)?$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reflection Diary' }),
  ).toBeVisible();
});

test("the diary home's back is the product's Leave, not a demo page", async ({ page }) => {
  await as_jane(page);
  await expect(
    page.getByRole('button', { name: 'Leave the Reflection Diary' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to My Gigs' })).toHaveCount(0);
});
