/**
 * CAP-51: reviewers in the demo shell (ADR #61).
 *
 * Picking Sam or Dr Lee leaves them where the product would: "/" sends
 * someone who only reviews to the review queue, and the queue's way out is
 * the product's own, not a demo page.
 */
import { test, expect } from '@playwright/test';

import { shell } from './people.ts';

for (const name of ['Sam O', 'Dr Lee']) {
  test(`picking ${name} opens the review queue, with the product's way out`, async ({
    page,
  }) => {
    await shell(page);
    await page.goto('/');

    await page.getByRole('button', { name: new RegExp(name) }).click();

    await expect(page).toHaveURL(/\/review-queue$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Review queue' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Leave the Reflection Diary' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to My Gigs' })).toHaveCount(0);
  });
}
