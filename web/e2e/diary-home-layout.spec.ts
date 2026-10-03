/**
 * CAP-38 R5: the Export record floating button on Diary Home (ADR #42).
 *
 * Full label at the top of the page, icon only once scrolled, never covering
 * the last row, and under an open sheet. Task 6's checks on this screen's
 * layout share the file and its `MANY` fixture (one gig, eight opened sprints,
 * eight reflections); a two-gig fixture is Task 6's to add.
 *
 * Self-contained scenario, ids prefixed '3839' so they collide with no
 * other spec's (aaaa/bbbb/cccc/ffff, 9999, 2323, 3636, 3838, 4545).
 */
import { test as base, expect } from '@playwright/test';

import type { components, paths } from '../src/api/schema.ts';
import { FakeApi, type GigDetail, type ReflectionSummary } from './fake-api.ts';

type Me = components['schemas']['Me'];
type Radar = paths['/me/radar']['get']['responses']['200']['content']['application/json'];

const id = (n: string) => `3839${n}-0000-4839-8839-383938393839`;
const STUDENT = id('0001');
const FRAMEWORK = id('0002');
const GIG_ONE = id('0003');

function gig(gig_id: string, title: string): GigDetail {
  return {
    id: gig_id,
    title,
    org_name: 'Alumable',
    starts_on: '2026-08-01',
    ends_on: '2026-11-01',
    my_role: 'student',
    sprints: [
      {
        id: id(`${gig_id.slice(4, 8)}1`),
        ordinal: 1,
        opens_on: '2026-08-01',
        due_on: '2026-08-14',
      },
    ],
    framework: {
      id: FRAMEWORK,
      fw_key: 'e2e-layout',
      name: 'E2E layout rubric',
      version: 'v1',
    },
    reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
    participants: [{ id: STUDENT, display_name: 'Ash', role: 'student' }],
  };
}

function reflection(
  reflection_id: string,
  gig_id: string,
  sprint_id: string,
  ordinal: number,
): ReflectionSummary {
  return {
    id: reflection_id,
    status: 'submitted',
    gig_id,
    sprint_id,
    sprint_ordinal: ordinal,
    framework_id: FRAMEWORK,
    framework_version: 'v1',
    submitted_at: '2026-08-14T10:00:00.000000Z',
    created_at: '2026-08-10T10:00:00.000000Z',
    updated_at: '2026-08-14T10:00:00.000000Z',
  };
}

const EIGHT = Array.from({ length: 8 }, (_, n) => ({
  id: id(`01${n}0`),
  ordinal: n + 1,
  opens_on: '2026-08-01',
  due_on: '2026-08-14',
}));
const MANY: GigDetail = { ...gig(GIG_ONE, 'Gig one'), sprints: EIGHT };

function me(gigs: GigDetail[]): Me {
  return {
    id: STUDENT,
    display_name: 'Ash',
    participations: gigs.map((g) => ({
      gig_id: g.id,
      gig_title: g.title,
      role: 'student',
    })),
  };
}

/** One reflection per sprint on a gig with eight, one per gig otherwise. */
function rows_for(gigs: GigDetail[]): ReflectionSummary[] {
  return gigs.flatMap((g, gig_n) =>
    g.sprints.map((s, n) => reflection(id(`00a${gig_n}${n}`), g.id, s.id, s.ordinal)),
  );
}

const RADAR: Radar = {
  scope: { gig_id: null, sprint_id: null },
  framework: { id: FRAMEWORK, fw_key: 'e2e-layout', scale_min: 1, scale_max: 4 },
  axes: ['a', 'b', 'c'].map((code, n) => ({
    code,
    short_label: code.toUpperCase(),
    position: n + 1,
    self: 3,
    counter: 2,
    counter_role: 'assessor',
  })),
};

/** `gigs` picks the scenario; `rows_for` gives each sprint one reflection. */
const test = base.extend<{ gigs: GigDetail[] }>({
  gigs: [[MANY], { option: true }],
  page: async ({ page, gigs }, provide) => {
    const api = new FakeApi([], me(gigs), gigs, rows_for(gigs));
    await api.install(page);
    await page.route('**/api/v1/me/radar**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(RADAR),
      }),
    );
    await provide(page);
    expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
  },
});

test.describe('Export record button', () => {
  test.use({ gigs: [MANY] });

  test('full label at the top, narrower once scrolled, same name', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const fab = page.getByRole('button', { name: 'Export record' });
    await expect(fab).toBeVisible();
    await expect(fab).toContainText('Export record');
    const wide = (await fab.boundingBox())!.width;
    await page.mouse.wheel(0, 400);
    await expect.poll(async () => (await fab.boundingBox())!.width).toBeLessThan(wide);
    await expect(page.getByRole('button', { name: 'Export record' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(async () => (await fab.boundingBox())!.width).toBeCloseTo(wide, 0);
  });

  test('at the end of the page the last row sits above the button', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Export record' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const fab = page.getByRole('button', { name: 'Export record' });
    await expect.poll(async () => (await fab.boundingBox())!.width).toBeLessThan(80);
    const last = (await page.getByRole('listitem').last().boundingBox())!;
    const button = (await fab.boundingBox())!;
    expect(last.y + last.height, 'last row bottom above button top').toBeLessThanOrEqual(
      button.y,
    );
  });

  test('opens the Export record sheet and gets focus back on close', async ({ page }) => {
    await page.goto('/');
    const fab = page.getByRole('button', { name: 'Export record' });
    await fab.click();
    const sheet = page.getByRole('dialog', { name: 'Export record' });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(fab).toBeFocused();
  });

  test('an open sheet covers the floating button', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const fab = page.getByRole('button', { name: 'Export record' });
    const box = (await fab.boundingBox())!;
    await fab.click();
    await expect(page.getByRole('dialog', { name: 'Export record' })).toBeVisible();
    const covered = await fab.evaluate(
      (node, [x, y]) => !node.contains(document.elementFromPoint(x, y)),
      [box.x + box.width / 2, box.y + box.height / 2],
    );
    expect(covered, 'the floating button is clickable through the sheet').toBe(true);
  });

  test('no old page-head Export button', async ({ page }) => {
    await page.goto('/');
    // Wait for the loaded screen first: a count of 0 is also true while the
    // skeleton is up, which would make this pass before it checks anything.
    await expect(page.getByRole('link', { name: /Sprint 1/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export your record' })).toHaveCount(0);
  });
});
