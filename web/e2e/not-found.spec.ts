/**
 * An unknown address gets a page that says so, and a way back.
 *
 * It used to render the build-time Placeholder, which told a user "Not built
 * yet. No ticket replaces this." -- wording for the team, not for anyone
 * using the product.
 */
import { expect, test } from './fixtures.ts';

test('an unknown address says the page does not exist and links home', async ({ page }) => {
  await page.goto('/no-such-page');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the diary' })).toHaveAttribute(
    'href',
    '/',
  );
  await expect(page.getByText('Not built yet')).toHaveCount(0);
});

test('the retired entries/:entry_id address is not found, not a placeholder', async ({
  page,
}) => {
  await page.goto('/entries/aaaa1111-0e01-4aaa-8aaa-aaaaaaaaaaaa');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByText('Not built yet')).toHaveCount(0);
});
