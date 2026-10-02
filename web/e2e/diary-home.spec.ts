/**
 * CAP-38: Diary Home's gig picker and the radar it scopes (ADR #42).
 *
 * "All gigs" over two or more gigs shows a prompt, not a radar. An unscoped
 * GET /me/radar answers with one rubric only -- the latest reflection's
 * (docs/openapi.yaml, /me/radar) -- so drawing it under "All gigs" would
 * show one gig and call it all of them. With a single gig, "all" and "that
 * gig" are the same thing and the radar shows as before.
 *
 * Self-contained scenario, ids prefixed '3838' (CAP-38) so they collide with
 * no other spec's (aaaa/bbbb/cccc/ffff, 9999, 2323, 3636).
 */
import { test as base, expect } from '@playwright/test';

import type { components, paths } from '../src/api/schema.ts';
import { FakeApi, type GigDetail, type ReflectionSummary } from './fake-api.ts';

type Me = components['schemas']['Me'];
type Radar = paths['/me/radar']['get']['responses']['200']['content']['application/json'];

const id = (n: string) => `3838${n}-0000-4838-8838-383838383838`;
const STUDENT = id('0001');
const FRAMEWORK = id('0002');
const GIG_ONE = id('0003');
const SPRINT_ONE = id('0004');
const GIG_TWO = id('0007');
const SPRINT_TWO = id('0008');

function gig(gig_id: string, title: string, sprint_id: string): GigDetail {
  return {
    id: gig_id,
    title,
    org_name: 'Alumable',
    starts_on: '2026-08-01',
    ends_on: '2026-11-01',
    my_role: 'student',
    sprints: [{ id: sprint_id, ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' }],
    framework: {
      id: FRAMEWORK,
      fw_key: 'e2e-diary',
      name: 'E2E diary rubric',
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
): ReflectionSummary {
  return {
    id: reflection_id,
    status: 'submitted',
    gig_id,
    sprint_id,
    sprint_ordinal: 1,
    framework_id: FRAMEWORK,
    framework_version: 'v1',
    submitted_at: '2026-08-14T10:00:00.000000Z',
    created_at: '2026-08-10T10:00:00.000000Z',
    updated_at: '2026-08-14T10:00:00.000000Z',
  };
}

const ONE = gig(GIG_ONE, 'Gig one', SPRINT_ONE);
const TWO = gig(GIG_TWO, 'Gig two', SPRINT_TWO);

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

const RADAR: Radar = {
  scope: { gig_id: null, sprint_id: null },
  framework: { id: FRAMEWORK, fw_key: 'e2e-diary', scale_min: 1, scale_max: 4 },
  axes: [
    {
      code: 'a',
      short_label: 'A',
      position: 1,
      self: 3,
      counter: 2,
      counter_role: 'assessor',
    },
    {
      code: 'b',
      short_label: 'B',
      position: 2,
      self: 2,
      counter: 3,
      counter_role: 'assessor',
    },
    {
      code: 'c',
      short_label: 'C',
      position: 3,
      self: 4,
      counter: 3,
      counter_role: 'assessor',
    },
  ],
};

/** `gigs` picks the scenario; `radar_calls` counts GET /me/radar. */
const test = base.extend<{ gigs: GigDetail[]; radar_calls: () => number }>({
  gigs: [[ONE, TWO], { option: true }],
  radar_calls: [
    async ({ page, gigs }, provide) => {
      const api = new FakeApi(
        [],
        me(gigs),
        gigs,
        gigs.map((g, n) => reflection(id(`00a${n}`), g.id, g.sprints[0].id)),
      );
      await api.install(page);

      let calls = 0;
      await page.route('**/api/v1/me/radar**', (route) => {
        calls += 1;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(RADAR),
        });
      });

      await provide(() => calls);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

test.describe('a student on two gigs', () => {
  test('All gigs: a prompt instead of a radar, and no radar request', async ({
    page,
    radar_calls,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Your diary' })).toBeVisible();
    await expect(page.getByText('Pick a gig to see its radar.')).toBeVisible();
    await expect(page.locator('table caption')).toHaveCount(0);
    // Both gigs' reflections are still listed: only the radar waits.
    await expect(page.getByRole('link', { name: /Gig one/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Gig two/ })).toBeVisible();
    expect(radar_calls()).toBe(0);
  });

  test('choosing a gig scopes the URL and draws its radar', async ({
    page,
    radar_calls,
  }) => {
    await page.goto('/');
    await page.getByLabel('Gig').selectOption({ label: 'Gig two' });

    await expect(page).toHaveURL(new RegExp(`gig_id=${GIG_TWO}`));
    await expect(page.locator('table caption')).toBeVisible();
    // At least one, not exactly one: dev StrictMode mounts effects twice
    // and aborts the first request.
    expect(radar_calls()).toBeGreaterThan(0);

    await page.getByLabel('Gig').selectOption({ label: 'All gigs' });
    await expect(page).not.toHaveURL(/gig_id=/);
    await expect(page.getByText('Pick a gig to see its radar.')).toBeVisible();
  });

  test('a scoped gig still offers its sprints', async ({ page }) => {
    await page.goto(`/?gig_id=${GIG_TWO}`);
    await page
      .getByRole('group', { name: 'Sprint' })
      .getByRole('button', { name: 'Sprint 1' })
      .click();
    await expect(page).toHaveURL(new RegExp(`sprint_id=${SPRINT_TWO}`));
  });
});

test.describe('a student on one gig', () => {
  test.use({ gigs: [ONE] });

  test('the radar shows unscoped, as it always has', async ({ page, radar_calls }) => {
    await page.goto('/');
    await expect(page.locator('table caption')).toBeVisible();
    await expect(page.getByText('Pick a gig to see its radar.')).toHaveCount(0);
    expect(radar_calls()).toBeGreaterThan(0);
  });
});
