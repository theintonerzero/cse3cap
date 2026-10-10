/**
 * Checks that run in Firefox rather than Chromium (ADR #51). Only behaviour
 * Firefox lays out or dispatches differently belongs here; everything else
 * stays in the Chromium suite.
 *
 * Self-contained scenario, ids prefixed '4545' so they collide with no
 * other spec's.
 */
import { test as base, expect } from '@playwright/test';

import type { components, paths } from '../src/api/schema.ts';
import { FakeApi, type GigDetail, type ReflectionSummary } from './fake-api.ts';

type Me = components['schemas']['Me'];
type Radar = paths['/me/radar']['get']['responses']['200']['content']['application/json'];

const id = (n: string) => `4545${n}-0000-4545-8545-454545454545`;
const STUDENT = id('0001');
const FRAMEWORK = id('0002');
const GIG = id('0003');
const SPRINT = id('0004');

const ME: Me = {
  id: STUDENT,
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
  framework: { id: FRAMEWORK, fw_key: 'e2e-ff', name: 'E2E rubric', version: 'v1' },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [{ id: STUDENT, display_name: 'Ash', role: 'student' }],
};

const ROW: ReflectionSummary = {
  id: id('00a0'),
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

const RADAR: Radar = {
  scope: { gig_id: null, sprint_id: null },
  framework: { id: FRAMEWORK, fw_key: 'e2e-ff', scale_min: 1, scale_max: 4 },
  axes: ['a', 'b', 'c'].map((code, n) => ({
    code,
    short_label: code.toUpperCase(),
    position: n + 1,
    self: 3,
    counter: 2,
    counter_role: 'assessor',
  })),
};

const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi([], ME, [GIG_ONE], [ROW]);
      await api.install(page);
      await page.route('**/api/v1/me/radar**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(RADAR),
        }),
      );
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

test('phone: the radar-as-numbers caption is hidden, not drawn over the chart', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const caption = page.locator('table caption');
  await expect(caption).toHaveCount(1);

  // A bounding box ignores an ancestor's clip, so ask what is painted there.
  const painted_is_caption = await caption.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const x = Math.min(Math.max(box.left + box.width / 2, 0), window.innerWidth - 1);
    const y = Math.min(Math.max(box.top + box.height / 2, 0), window.innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    return hit !== null && node.contains(hit);
  });
  expect(painted_is_caption, 'the caption is painted on screen').toBe(false);
});

test('phone: the bar keeps back, title and name on one row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const banner = page.getByRole('banner');
  const back = (await banner
    .getByRole('button', { name: 'Leave the Reflection Diary' })
    .boundingBox())!;
  const title = (await banner.getByRole('heading', { level: 1 }).boundingBox())!;
  const name = (await banner.getByText('Ash', { exact: true }).boundingBox())!;
  const middle = back.y + back.height / 2;
  for (const box of [title, name]) {
    expect(Math.abs(box.y + box.height / 2 - middle)).toBeLessThan(12);
  }
});

test('phone: the floating Export button is fixed at the bottom right', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const box = (await page.getByRole('button', { name: 'Export record' }).boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(box.y + box.height).toBeGreaterThan(844 - 80);
});

test('phone: dragging a sheet by its handle closes it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Leave the Reflection Diary' }).click();
  const sheet = page.getByRole('dialog', { name: 'Leave the Reflection Diary?' });
  await expect(sheet).toBeVisible();
  await expect.poll(() => sheet.evaluate((n) => n.getAnimations().length)).toBe(0);
  const height = (await sheet.boundingBox())!.height;
  const grab = (await sheet.locator('[data-sheet-grab]').boundingBox())!;
  const x = grab.x + grab.width / 2;
  const y = grab.y + grab.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 10; step++)
    await page.mouse.move(x, y + (height * 0.6 * step) / 10);
  await page.mouse.up();
  await expect(sheet).toHaveCount(0);
});
