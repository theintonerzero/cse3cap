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

/**
 * Scroll to the very end, once there is an end to scroll to.
 *
 * The screen measures the bar into --footer-height with a ResizeObserver,
 * which runs in the browser's next rendering step, not when the bar changes.
 * A fixed 100ms sleep after the scroll did not cover it: on a busy CI runner
 * the test saw "Nothing was saved." and scrolled within one frame, before the
 * room under the last field had grown, so it scrolled to the old bottom and
 * measured the last field 128px behind the bar (#113's run, 2026-10-07). So
 * wait for the room to match the bar, scroll, then wait to be at the end.
 */
async function scroll_to_end(page: Page) {
  await expect
    .poll(() =>
      footer(page).evaluate((bar: HTMLElement) => {
        const form = bar.closest<HTMLElement>('[style*="--footer-height"]');
        return form?.style.getPropertyValue('--footer-height') === `${bar.offsetHeight}px`;
      }),
    )
    .toBe(true);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Math.ceil(window.scrollY + window.innerHeight) >=
          document.documentElement.scrollHeight,
      ),
    )
    .toBe(true);
}

test('390: the Save bar sits on the bottom edge at the top of the form and at its end', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/frameworks/${LATROBE}/edit`);
  await expect(page.getByLabel('Name of your copy')).toBeVisible();

  expect(Math.abs((await bottom_of(page)) - 844)).toBeLessThanOrEqual(1);

  await scroll_to_end(page);
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

  await scroll_to_end(page);
  const last = (await page.locator('textarea').last().boundingBox())!;
  const bar = (await footer(page).boundingBox())!;
  expect(Math.abs(bar.y + bar.height - 844)).toBeLessThanOrEqual(1);
  expect(last.y + last.height).toBeLessThanOrEqual(bar.y);
});
