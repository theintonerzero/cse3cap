/**
 * CAP-38 round 3 E13 (Patrick, 2026-10-05): "Now that all pages have the
 * dedicated back button, the top left "< Frameworks" button can be
 * removed." The bar's back arrow on the editor already goes to Frameworks
 * (sections.ts, frameworks_deep), so the page's own back button was a
 * second way to do the same thing, as the scoring screen's was (16f03a9).
 */
import { LATROBE, expect, test } from './fixtures.ts';

test('the editor has no back button of its own; the bar’s arrow goes to Frameworks', async ({
  page,
}) => {
  await page.goto(`/frameworks/${LATROBE}/edit`);
  await expect(page.getByLabel('Name of your copy')).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('link', { name: /Frameworks/ }),
  ).toHaveCount(0);

  await page.getByRole('link', { name: 'Back to Frameworks' }).click();
  await expect(page).toHaveURL('/frameworks');
});
