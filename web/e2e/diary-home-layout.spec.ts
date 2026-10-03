/**
 * CAP-38 R5: the Export record floating button on Diary Home (ADR #42).
 *
 * Full label at the top of the page, icon only once scrolled, never covering
 * the last row, and under an open sheet. Task 6's checks on this screen's
 * layout share the file and its `MANY` fixture (one gig, eight opened sprints,
 * eight reflections) and `TWO` (a second gig, one sprint, one reflection).
 *
 * Self-contained scenario, ids prefixed '3839' so they collide with no
 * other spec's (aaaa/bbbb/cccc/ffff, 9999, 2323, 3636, 3838, 4545).
 */
import { test as base, expect, type Page } from '@playwright/test';

import type { components, paths } from '../src/api/schema.ts';
import { FakeApi, type GigDetail, type ReflectionSummary } from './fake-api.ts';

type Me = components['schemas']['Me'];
type Radar = paths['/me/radar']['get']['responses']['200']['content']['application/json'];

const id = (n: string) => `3839${n}-0000-4839-8839-383938393839`;
const STUDENT = id('0001');
const FRAMEWORK = id('0002');
const GIG_ONE = id('0003');
const GIG_TWO = id('0004');
const GIG_THREE = id('0005');
const GIG_FOUR = id('0006');

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
const TWO: GigDetail = gig(GIG_TWO, 'Gig two');
/** A second eight-sprint gig, so switching gigs keeps the sprint count. */
const MANY_TOO: GigDetail = {
  ...gig(GIG_FOUR, 'Gig four'),
  sprints: EIGHT.map((sprint, n) => ({ ...sprint, id: id(`02${n}0`) })),
};
/** One reflection, on a sprint that has not opened: no chips to offer. */
const FUTURE: GigDetail = {
  ...gig(GIG_THREE, 'Gig three'),
  sprints: [{ id: id('00051'), ordinal: 1, opens_on: '2099-01-01', due_on: '2099-01-14' }],
};

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

const radar_top = (page: Page) =>
  page
    .locator('[class*="radar_block"]')
    .first()
    .evaluate((n) => n.getBoundingClientRect().top);

test.describe('scope controls do not move the page', () => {
  // Playwright reads a two-element array whose second item has a `title` as a
  // [value, options] fixture tuple, and a gig has a `title`. So the pair is
  // written as an explicit tuple, not as [MANY, TWO].
  test.use({ gigs: [[MANY, TWO], { scope: 'test' }] });

  for (const width of [390, 1440]) {
    test(`${width}: the radar block starts at the same y for All gigs and for one gig`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.getByText('Pick a gig to see its radar.')).toBeVisible();
      const all = await radar_top(page);
      await page.getByLabel('Gig').selectOption({ label: 'Gig one' });
      await expect(page.getByText(/^Levels 1–4 on E2E layout rubric/)).toBeVisible();
      expect(Math.abs((await radar_top(page)) - all)).toBeLessThanOrEqual(1);
    });
  }

  test('eight sprints stay on one line', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?gig_id=${GIG_ONE}`);
    const chips = page.getByRole('group', { name: 'Sprint' }).getByRole('button');
    await expect(chips).toHaveCount(9);
    const ys = await chips.evaluateAll((nodes) =>
      nodes.map((n) => n.getBoundingClientRect().top),
    );
    expect(new Set(ys.map(Math.round)).size).toBe(1);
  });

  test('All gigs: a plain-text placeholder for the sprints', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Pick a gig to filter by sprint')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Sprint' })).toHaveCount(0);
  });

  // Round 2c (Patrick): Gig details stays on the row under "All gigs",
  // greyed out and unusable, so the row keeps its shape between scopes.
  test('All gigs: Gig details is there but greyed out and unusable', async ({ page }) => {
    await page.goto('/');
    const details = page.getByRole('button', { name: /Gig details/ });
    await expect(details).toBeVisible();
    await expect(details).toBeDisabled();
  });

  test('the gig select keeps its width between All gigs and one gig', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const all = (await page.getByLabel('Gig').boundingBox())!.width;
    await page.getByLabel('Gig').selectOption({ label: 'Gig one' });
    await expect(page.getByRole('button', { name: /Gig details/ })).toBeEnabled();
    const one = (await page.getByLabel('Gig').boundingBox())!.width;
    expect(Math.abs(one - all), 'select width').toBeLessThanOrEqual(1);
  });

  test('Gig details sits beside the picker and still navigates', async ({ page }) => {
    await page.goto(`/?gig_id=${GIG_ONE}`);
    const details = page.getByRole('button', { name: /Gig details/ });
    const select = (await page.getByLabel('Gig').boundingBox())!;
    const button = (await details.boundingBox())!;
    expect(
      Math.abs(button.y + button.height - (select.y + select.height)),
    ).toBeLessThanOrEqual(1);
    expect(Math.abs(button.height - select.height)).toBeLessThanOrEqual(1);
    await details.click();
    await expect(page).toHaveURL(new RegExp(`/gigs/${GIG_ONE}$`));
  });
});

const sprint_row = (page: Page) => page.getByRole('group', { name: 'Sprint' });
const has_fade = (page: Page) =>
  sprint_row(page).evaluate((n) => {
    const style = getComputedStyle(n);
    return (style.maskImage || style.webkitMaskImage || 'none') !== 'none';
  });

test.describe('the sprint chip row, one line', () => {
  test.use({ gigs: [[MANY, TWO], { scope: 'test' }] });

  test('a deep link to a late sprint opens with its chip in view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?gig_id=${GIG_ONE}&sprint_id=${EIGHT[7].id}`);
    const chip = page.getByRole('button', { name: 'Sprint 8', pressed: true });
    await expect(chip).toBeVisible();
    const row = (await sprint_row(page).boundingBox())!;
    await expect
      .poll(async () => {
        const box = (await chip.boundingBox())!;
        return box.x >= row.x - 1 && box.x + box.width <= row.x + row.width + 1;
      })
      .toBe(true);
    // Only the row scrolls: the page itself stays where it was.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('390: the fade shows at rest and goes at the end of the row', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?gig_id=${GIG_ONE}`);
    await expect(sprint_row(page)).toBeVisible();
    expect(await has_fade(page)).toBe(true);
    await sprint_row(page).evaluate((n) => (n.scrollLeft = n.scrollWidth));
    await expect.poll(() => has_fade(page)).toBe(false);
    await sprint_row(page).evaluate((n) => (n.scrollLeft = 0));
    await expect.poll(() => has_fade(page)).toBe(true);
  });

  test('1440: a row that fits has no fade', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?gig_id=${GIG_ONE}`);
    await expect(sprint_row(page)).toBeVisible();
    expect(await has_fade(page)).toBe(false);
  });

  test('the first chip lines up with the picker, at 390', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?gig_id=${GIG_ONE}`);
    const select = (await page.getByLabel('Gig').boundingBox())!;
    const first = (await page.getByRole('button', { name: 'All sprints' }).boundingBox())!;
    expect(Math.abs(first.x - select.x)).toBeLessThanOrEqual(1);
  });
});

test.describe('a gig with no opened sprint', () => {
  test.use({ gigs: [[MANY, FUTURE], { scope: 'test' }] });

  test('says so in the same one-line slot, and moves nothing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/');
    await expect(page.getByText('Pick a gig to see its radar.')).toBeVisible();
    const all = await radar_top(page);
    await page.getByLabel('Gig').selectOption({ label: 'Gig three' });
    await expect(page.getByText('No sprint has opened yet')).toBeVisible();
    await expect(page.getByText(/^Levels 1–4 on E2E layout rubric/)).toBeVisible();
    await expect(sprint_row(page)).toHaveCount(0);
    expect(Math.abs((await radar_top(page)) - all)).toBeLessThanOrEqual(1);
  });
});

test.describe('switching between two eight-sprint gigs', () => {
  test.use({ gigs: [[MANY, MANY_TOO], { scope: 'test' }] });

  test('the new gig starts its chip row at the start', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?gig_id=${GIG_ONE}`);
    const row = sprint_row(page);
    await expect(row.getByRole('button')).toHaveCount(9);
    await row.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
      node.dispatchEvent(new Event('scroll'));
    });
    await expect.poll(() => row.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);

    await page.getByLabel('Gig').selectOption({ label: 'Gig four' });
    await expect(page).toHaveURL(new RegExp(`gig_id=${GIG_FOUR}`));
    // "All sprints" is the selection on the new gig, so the row starts at it.
    await expect.poll(() => row.evaluate((node) => node.scrollLeft)).toBe(0);
  });
});
