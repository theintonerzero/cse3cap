/**
 * CAP-38 round 2e: a student on exactly one gig starts on that gig (ADR #42).
 *
 * Patrick: with one gig, "All gigs" is that gig under another name, and it
 * left Gig details greyed out and the sprint chips hidden for no reason. So
 * the diary's scope defaults to the one gig, and the picker drops "All gigs".
 * Two or more gigs still start on All gigs; no gig as a student is
 * NotAStudent, unchanged.
 *
 * Self-contained scenario, ids prefixed '6363' so they collide with no other
 * spec's.
 */
import { test as base, expect } from '@playwright/test';

import type { components, paths } from '../src/api/schema.ts';
import { FakeApi, type GigDetail, type ReflectionSummary } from './fake-api.ts';

type Me = components['schemas']['Me'];
type Radar = paths['/me/radar']['get']['responses']['200']['content']['application/json'];

const id = (n: string) => `6363${n}-0000-4636-8636-636363636363`;
const STUDENT = id('0001');
const FRAMEWORK = id('0002');
const ONLY = id('0003');
const OTHER = id('0004');
const SPRINT = (gig: string, n: number) => id(`${gig.slice(6, 8)}1${n}`);

function gig(gig_id: string, title: string, my_role: GigDetail['my_role']): GigDetail {
  return {
    id: gig_id,
    title,
    org_name: 'Alumable',
    starts_on: '2026-08-01',
    ends_on: '2026-11-01',
    my_role,
    sprints: [1, 2].map((n) => ({
      id: SPRINT(gig_id, n),
      ordinal: n,
      opens_on: '2026-08-01',
      due_on: '2026-08-14',
    })),
    framework: { id: FRAMEWORK, fw_key: 'e2e-one', name: 'E2E rubric', version: 'v1' },
    reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
    participants: [{ id: STUDENT, display_name: 'Ash', role: my_role }],
  };
}

const reflection = (g: GigDetail): ReflectionSummary => ({
  id: id(`${g.id.slice(6, 8)}21`),
  status: 'submitted',
  gig_id: g.id,
  sprint_id: g.sprints[0].id,
  sprint_ordinal: 1,
  framework_id: FRAMEWORK,
  framework_version: 'v1',
  submitted_at: '2026-08-14T10:00:00.000000Z',
  created_at: '2026-08-10T10:00:00.000000Z',
  updated_at: '2026-08-14T10:00:00.000000Z',
});

const RADAR: Radar = {
  scope: { gig_id: null, sprint_id: null },
  framework: { id: FRAMEWORK, fw_key: 'e2e-one', scale_min: 1, scale_max: 4 },
  axes: ['a', 'b', 'c'].map((code, n) => ({
    code,
    short_label: code.toUpperCase(),
    position: n + 1,
    self: 3,
    counter: 2,
    counter_role: 'assessor',
  })),
};

const ONE_GIG = [gig(ONLY, 'La Trobe capstone', 'student')];
/** One gig as a student, one as an assessor: still one gig for the diary. */
const ONE_AS_STUDENT = [...ONE_GIG, gig(OTHER, 'Data migration audit', 'assessor')];
const TWO_GIGS = [...ONE_GIG, gig(OTHER, 'Data migration audit', 'student')];

const test = base.extend<{ gigs: GigDetail[]; radar_queries: string[] }>({
  gigs: [ONE_GIG, { option: true }],
  radar_queries: [
    async ({ page, gigs }, provide) => {
      const queries: string[] = [];
      const me: Me = {
        id: STUDENT,
        display_name: 'Ash',
        participations: gigs.map((g) => ({
          gig_id: g.id,
          gig_title: g.title,
          role: g.my_role,
        })),
      };
      const mine = gigs.filter((g) => g.my_role === 'student');
      const api = new FakeApi([], me, gigs, mine.map(reflection));
      await api.install(page);
      await page.route('**/api/v1/me/radar**', (route) => {
        queries.push(new URL(route.request().url()).search);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(RADAR),
        });
      });
      await provide(queries);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

const picker = (page: import('@playwright/test').Page) =>
  page.getByRole('combobox', { name: 'Select a gig' });

for (const [name, gigs] of [
  ['one gig', ONE_GIG],
  ['one gig as a student and another as an assessor', ONE_AS_STUDENT],
] as const) {
  test.describe(`a student on ${name}`, () => {
    // [value, options]: a bare two-gig array would be read as that tuple.
    test.use({ gigs: [[...gigs], { scope: 'test' }] });

    test('starts on that gig: picker, sprint chips, Gig details and radar', async ({
      page,
      radar_queries,
    }) => {
      await page.goto('/');

      await expect(picker(page)).toHaveValue(ONLY);
      await expect(picker(page).locator('option')).toHaveText(['La Trobe capstone']);
      await expect(page.getByRole('button', { name: 'Sprint 1' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Gig details ›' })).toBeEnabled();
      await expect(page.getByText('Pick a gig to filter by sprint')).toHaveCount(0);
      await expect.poll(() => radar_queries.at(-1)).toContain(`gig_id=${ONLY}`);
    });

    test('Gig details opens the gig, and back returns to it', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Gig details ›' }).click();
      await expect(page).toHaveURL(`/gigs/${ONLY}`);

      await page.getByRole('link', { name: 'Back to Reflection Diary' }).click();
      await expect(picker(page)).toHaveValue(ONLY);
    });

    test('a stale gig id in a link still lands on the one gig', async ({ page }) => {
      await page.goto(`/?gig_id=${id('9999')}`);
      await expect(picker(page)).toHaveValue(ONLY);
    });
  });
}

test.describe('a student on two gigs', () => {
  test.use({ gigs: [TWO_GIGS, { scope: 'test' }] });

  test('still starts on All gigs', async ({ page }) => {
    await page.goto('/');
    await expect(picker(page)).toHaveValue('');
    await expect(picker(page).locator('option').first()).toHaveText('All gigs');
    await expect(page.getByRole('button', { name: 'Gig details ›' })).toBeDisabled();
  });
});
