/**
 * CAP-38 R7: every BottomSheet has a grab handle, follows a downward drag,
 * closes past a quarter of its height (or on a flick) and springs back
 * otherwise, and slides up when it opens unless reduced motion is asked
 * for. One component, so the Leave sheet stands in for all of them, and
 * History stands in for a sheet whose content scrolls.
 *
 * Self-contained scenario, ids prefixed '3807'.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import {
  FakeApi,
  type GigDetail,
  type ReflectionEvent,
  type ReflectionSummary,
} from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `3807${n}-0000-4807-8807-380738073807`;
const PERSON = id('0001');
const FRAMEWORK = id('0002');
const GIG = id('0003');
const SPRINT = id('0004');
const REFLECTION = id('00a0');

const ME: Me = {
  id: PERSON,
  display_name: 'Ash',
  participations: [{ gig_id: GIG, gig_title: 'Gig one', role: 'student' }],
};

const GIG_ONE: GigDetail = {
  id: GIG,
  title: 'Gig one',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [{ id: SPRINT, ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' }],
  framework: { id: FRAMEWORK, fw_key: 'e2e-sheet', name: 'E2E rubric', version: 'v1' },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [{ id: PERSON, display_name: 'Ash', role: 'student' }],
};

const ROW: ReflectionSummary = {
  id: REFLECTION,
  status: 'submitted',
  gig_id: GIG,
  sprint_id: SPRINT,
  sprint_ordinal: 1,
  framework_id: FRAMEWORK,
  framework_version: 'v1',
  submitted_at: '2026-08-14T10:00:00.000000Z',
  created_at: '2026-08-10T10:00:00.000000Z',
  updated_at: '2026-08-14T10:00:00.000000Z',
};

// Enough history that the sheet's content scrolls on a phone.
const EVENTS: ReflectionEvent[] = Array.from({ length: 30 }, (_, n) => ({
  id: id(`0e${String(n).padStart(2, '0')}`),
  event_type: 'entry_updated',
  actor_display_name: 'Ash',
  occurred_at: `2026-08-${String(10 + (n % 18)).padStart(2, '0')}T10:00:00.000000Z`,
  metadata: {},
}));

async function install(page: Page) {
  const api = new FakeApi([], ME, [GIG_ONE], [ROW], { [REFLECTION]: EVENTS });
  await api.install(page);
  await page.route('**/api/v1/me/radar**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"error":{"code":"NOT_FOUND","message":"x","details":{}}}',
    }),
  );
}

async function open_leave(page: Page) {
  await install(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Leave the Reflection Diary' }).click();
  const sheet = page.getByRole('dialog', { name: 'Leave the Reflection Diary?' });
  await expect(sheet).toBeVisible();
  // Let the entry animation finish so positions are at rest.
  await expect.poll(() => sheet.evaluate((n) => n.getAnimations().length)).toBe(0);
  return sheet;
}

const handle = (page: Page) => page.getByRole('dialog').locator('[data-sheet-grab]');

async function drag(page: Page, from: { x: number; y: number }, dy: number) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(from.x, from.y + (dy * step) / 10);
  }
  await page.mouse.up();
}

async function centre(page: Page) {
  const box = (await handle(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The sheet's bottom edge against the viewport's, on the first frame after opening. */
async function first_frame_offset(page: Page) {
  return page.evaluate(async () => {
    const trigger = document.querySelector<HTMLElement>(
      '[aria-label="Leave the Reflection Diary"]',
    )!;
    trigger.click();
    await new Promise(requestAnimationFrame);
    const sheet = document.querySelector('[role="dialog"]')!;
    return sheet.getBoundingClientRect().bottom - window.innerHeight;
  });
}

test('dragging the handle down 60% closes the sheet', async ({ page }) => {
  const sheet = await open_leave(page);
  const height = (await sheet.boundingBox())!.height;
  await drag(page, await centre(page), height * 0.6);
  await expect(sheet).toHaveCount(0);
});

test('dragging 10% springs back and stays open', async ({ page }) => {
  const sheet = await open_leave(page);
  const before = (await sheet.boundingBox())!;
  await drag(page, await centre(page), before.height * 0.1);
  await expect(sheet).toBeVisible();
  await expect.poll(async () => (await sheet.boundingBox())!.y).toBeCloseTo(before.y, 0);
});

test('reduced motion: the sheet is fully in place on the first frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await install(page);
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Leave the Reflection Diary' }),
  ).toBeVisible();
  expect(Math.abs(await first_frame_offset(page))).toBeLessThanOrEqual(1);
});

test('without reduced motion the sheet slides up from below', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await install(page);
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Leave the Reflection Diary' }),
  ).toBeVisible();
  expect(await first_frame_offset(page), 'still below its resting place').toBeGreaterThan(
    1,
  );
});

test('a tap on a button inside the sheet still clicks it', async ({ page }) => {
  const sheet = await open_leave(page);
  await sheet.getByRole('button', { name: 'Stay' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reflection Diary' }),
  ).toBeVisible();
});

test('dragging content that is scrolled down does not close the sheet', async ({
  page,
}) => {
  await install(page);
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto(`/gigs/${GIG}`);
  await page.getByRole('button', { name: 'History' }).click();
  const sheet = page.getByRole('dialog', { name: 'History' });
  await expect(sheet.getByRole('listitem').nth(20)).toBeAttached();
  const scrolled = await sheet.evaluate((node) => {
    node.scrollTop = 200;
    return node.scrollTop;
  });
  expect(scrolled, 'the History content must scroll for this test to mean anything').toBe(
    200,
  );
  const box = (await sheet.boundingBox())!;
  await drag(
    page,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    box.height * 0.6,
  );
  await expect(sheet).toBeVisible();
});

test('a fast flick inside one frame closes the sheet', async ({ page }) => {
  const sheet = await open_leave(page);
  // Down, one 40px move and up in a single task: React has no chance to
  // render between them, which is what a quick real flick looks like.
  await page.evaluate(() => {
    const grab = document.querySelector<HTMLElement>('[data-sheet-grab]')!;
    const box = grab.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const fire = (type: string, at: number) =>
      grab.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 7,
          pointerType: 'touch',
          isPrimary: true,
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: x,
          clientY: at,
        }),
      );
    fire('pointerdown', y);
    fire('pointermove', y + 40);
    fire('pointerup', y + 40);
  });
  await expect(sheet).toHaveCount(0);
});

test('a mouse drag on the content, not the handle, leaves the sheet alone', async ({
  page,
}) => {
  const sheet = await open_leave(page);
  const height = (await sheet.boundingBox())!.height;
  const text = (await sheet
    .getByText('This takes you back to the switch user screen.')
    .boundingBox())!;
  // A mouse pressed in the content is selecting text, not moving the sheet.
  await drag(page, { x: text.x + 10, y: text.y + text.height / 2 }, height * 0.6);
  await expect(sheet).toBeVisible();
});

test('the sheet still lets a reader pinch-zoom', async ({ page }) => {
  const sheet = await open_leave(page);
  expect(await sheet.evaluate((node) => getComputedStyle(node).touchAction)).toContain(
    'pinch-zoom',
  );
});

test.describe('touch', () => {
  test.use({ hasTouch: true });

  test('a finger swiping down on the content at the top closes the sheet', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'real touch input goes through Chromium CDP');
    const sheet = await open_leave(page);
    const height = (await sheet.boundingBox())!.height;
    const text = (await sheet
      .getByText('This takes you back to the switch user screen.')
      .boundingBox())!;
    const x = text.x + 10;
    const y = text.y + text.height / 2;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: string, at?: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type: type as 'touchStart' | 'touchMove' | 'touchEnd',
        touchPoints: at === undefined ? [] : [{ x, y: at }],
      });
    await touch('touchStart', y);
    for (let step = 1; step <= 10; step++)
      await touch('touchMove', y + (height * 0.6 * step) / 10);
    await touch('touchEnd');
    await expect(sheet).toHaveCount(0);
  });
});
