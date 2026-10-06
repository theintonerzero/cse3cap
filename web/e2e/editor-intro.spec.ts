/**
 * CAP-38 round 3 E18 (Patrick, 2026-10-05: make the editor "more stylised
 * to our other updated screens"). Its intro ran six lines at 390: three for
 * the line under the heading and three for the shape. The other screens say
 * one short line under a heading (Frameworks: two at 390). So: two short
 * lines each at 390, one each at 1440, saying the same things: saving makes
 * a copy and the original never changes (ADR #16), and the shape is fixed.
 */
import type { Locator, Page } from '@playwright/test';

import { LATROBE, expect, test } from './fixtures.ts';

const SUB = 'Saving makes a new framework of your own. The original never changes.';
const SHAPE =
  '2 competencies, scored 1 to 4. Names and wording can change; the shape can’t.';

async function lines(locator: Locator) {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el);
    return Math.round(el.getBoundingClientRect().height / parseFloat(style.lineHeight));
  });
}

async function open(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/frameworks/${LATROBE}/edit`);
  await expect(page.getByLabel('Name of your copy')).toBeVisible();
}

test('the intro says the same things in fewer words', async ({ page }) => {
  await open(page, 390);
  await expect(page.getByText(SUB, { exact: true })).toBeVisible();
  await expect(page.getByText(SHAPE, { exact: true })).toBeVisible();
});

for (const [width, most] of [
  [390, 2],
  [1440, 1],
] as const) {
  test(`${width}: the line under the heading and the shape are ${most} line${most > 1 ? 's' : ''} each at most`, async ({
    page,
  }) => {
    await open(page, width);
    expect(await lines(page.getByText(SUB, { exact: true }))).toBeLessThanOrEqual(most);
    expect(await lines(page.getByText(SHAPE, { exact: true }))).toBeLessThanOrEqual(most);
  });
}
