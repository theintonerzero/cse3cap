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

// CAP-38 round 3, Patrick: "page not found text should be centred on the
// screen". Centred both ways in the viewport, at a phone and a desktop
// width, and its link still takes a click.
for (const { width, height } of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`${width}: the page's text is centred on the screen, and its link still works`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/no-such-page');

    const heading = page.getByRole('heading', { name: 'Page not found' });
    const link = page.getByRole('link', { name: 'Back to the diary' });
    await expect(heading).toBeVisible();

    // Where the words are, not the element: a block heading's box spans the
    // column whatever the text alignment. All three in one frame, once the
    // web font is in: measured in three calls, a late layout under the full
    // suite's load moved the middle by 1.4 px between them (2026-10-05).
    const [top, note, bottom] = await page.evaluate(async () => {
      await document.fonts.ready;
      const box = (node: Element) => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const { x, y, width, height } = range.getBoundingClientRect();
        return { x, y, width, height };
      };
      const section = document.querySelector('h1')!.closest('section')!;
      // The way back is a button since CAP-57: what the eye sees at the
      // bottom is its box, not the words inside its padding.
      const button = section.querySelector('a')!.getBoundingClientRect();
      return [
        box(section.querySelector('h1')!),
        box(section.querySelector('p')!),
        { x: button.x, y: button.y, width: button.width, height: button.height },
      ];
    });
    for (const box of [top, note, bottom]) {
      expect(
        Math.abs(box.x + box.width / 2 - width / 2),
        'horizontal centre',
      ).toBeLessThanOrEqual(1);
    }
    const middle = (top.y + bottom.y + bottom.height) / 2;
    expect(Math.abs(middle - height / 2), 'vertical centre').toBeLessThanOrEqual(1);

    // The layer passes clicks through to the words: following the link
    // leaves the page (where to is Home's business, per user).
    await link.click();
    await expect(heading).toHaveCount(0);
  });
}

test('the bar stays usable over the centred page: its back arrow and ⋮ take a click', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

  await page.getByRole('button', { name: 'More options' }).click();
  await expect(page.getByRole('menuitem', { name: 'Switch user' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page
    .getByRole('banner')
    .getByRole('link', { name: 'Back to Reflection Diary' })
    .click();
  await expect(page.getByRole('heading', { name: 'Page not found' })).toHaveCount(0);
});
