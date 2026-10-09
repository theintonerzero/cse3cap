/**
 * CAP-53: the diary home names the sprints that need a reflection (Figma
 * 66:34, "2 sprints need your reflection").
 *
 * Which sprints is gig-timing.ts's sprints_needing_reflection, checked in
 * scripts/verify-gig-detail.sh. This drives the screen: the sentence per
 * scope, the button that starts the earliest, and that a reviewer's
 * reflections on another gig never count as the student's.
 *
 * Self-contained, ids prefixed '5353' (CAP-53).
 */
import { test as base, expect } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionSummary,
} from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `5353${n}-0000-4353-8353-535353535353`;
const FRAMEWORK = id('0001');
const GIG_A = id('0a00');
const GIG_B = id('0b00');
const GIG_C = id('0c00');
const REVIEWED_GIG = id('0d00');
const A = (n: number) => id(`0a0${n}`);
const B = (n: number) => id(`0b0${n}`);
const C1 = id('0c01');
const D1 = id('0d01');

const RUBRIC: FrameworkDetail = {
  id: FRAMEWORK,
  fw_key: 'latrobe6',
  version: 'v1',
  name: 'La Trobe six-competency',
  created_by: null,
  in_use: true,
  assigned: true,
  comment_required: true,
  evidence_required: false,
  accepted_file_types: ['pdf'],
  max_file_bytes: 10485760,
  scale: { min: 1, max: 4 },
  competencies: [1, 2].map((n) => ({
    id: id(`00c${n}`),
    code: `c${n}`,
    name: n === 1 ? 'Collaboration' : 'Communication',
    short_label: null,
    category: null,
    position: n,
    levels: [1, 2, 3, 4].map((value) => ({
      id: id(`0d${n}${value}`),
      level_value: value,
      descriptor: `Level ${value}.`,
    })),
  })),
};

const PAST = { opens_on: '2026-08-01', due_on: '2026-08-14' };
const LATER = { opens_on: '2099-01-01', due_on: '2099-01-14' };

function gig(
  gig_id: string,
  title: string,
  role: 'student' | 'assessor',
  sprints: { id: string; dates: typeof PAST }[],
): GigDetail {
  return {
    id: gig_id,
    title,
    org_name: 'Alumable',
    starts_on: '2026-08-01',
    ends_on: '2026-11-01',
    my_role: role,
    sprints: sprints.map((sprint, i) => ({
      id: sprint.id,
      ordinal: i + 1,
      ...sprint.dates,
    })),
    framework: {
      id: FRAMEWORK,
      fw_key: 'latrobe6',
      name: RUBRIC.name,
      version: 'v1',
    },
    reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
    participants: [{ id: id('0e01'), display_name: 'Ash', role }],
  };
}

// A: sprint 1 written, sprint 2 needs one, sprint 3 not open yet.
// B: both sprints need one. C: only a sprint that has not opened.
// D: Ash reviews it; someone else's reflection there must not count.
const GIGS: GigDetail[] = [
  gig(GIG_A, 'Develop AI use cases', 'student', [
    { id: A(1), dates: PAST },
    { id: A(2), dates: PAST },
    { id: A(3), dates: LATER },
  ]),
  gig(GIG_B, 'Data migration audit', 'student', [
    { id: B(1), dates: PAST },
    { id: B(2), dates: PAST },
  ]),
  gig(GIG_C, 'Policy chatbot', 'student', [{ id: C1, dates: LATER }]),
  gig(REVIEWED_GIG, 'Cohort review', 'assessor', [{ id: D1, dates: PAST }]),
];

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

const WRITTEN = [
  reflection(id('f001'), GIG_A, A(1)),
  // Returned to Ash as a reviewer, not written by Ash.
  reflection(id('f002'), REVIEWED_GIG, D1),
];

const ME: Me = {
  id: id('0e01'),
  display_name: 'Ash',
  participations: GIGS.map((g) => ({
    gig_id: g.id,
    gig_title: g.title,
    role: g.my_role,
  })),
};

const test = base.extend<{ reflections: ReflectionSummary[]; api: FakeApi }>({
  reflections: [WRITTEN, { option: true }],
  api: [
    async ({ page, reflections }, provide) => {
      const api = new FakeApi([RUBRIC], ME, GIGS, reflections);
      await api.install(page);
      // Nothing scored in any scope: the radar's own empty state.
      await page.route('**/api/v1/me/radar**', (route) =>
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'NOT_FOUND', message: 'Nothing yet.', details: {} },
          }),
        }),
      );
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

const nudge = (page: import('@playwright/test').Page) =>
  page.getByTestId('reflection-nudge');

test('one gig with one sprint to write: names it and offers Start reflection', async ({
  page,
}) => {
  await page.goto(`/?gig_id=${GIG_A}`);

  await expect(nudge(page)).toContainText('Sprint 2 needs your reflection.');
  await expect(nudge(page).getByRole('button', { name: 'Start reflection' })).toBeVisible();
  // Sprint 3 has not opened, so it is not counted.
  await expect(nudge(page)).not.toContainText('Sprint 3');
});

test('one gig with two: counts them and offers the earliest by name', async ({ page }) => {
  await page.goto(`/?gig_id=${GIG_B}`);

  await expect(nudge(page)).toContainText('2 sprints need your reflection.');
  await expect(nudge(page).getByRole('button', { name: 'Start Sprint 1' })).toBeVisible();
});

test('pressing it starts the earliest and opens it in the stepper', async ({
  page,
  api,
}) => {
  await page.goto(`/?gig_id=${GIG_B}`);
  await nudge(page).getByRole('button', { name: 'Start Sprint 1' }).click();

  await expect(page).toHaveURL(/\/reflections\/e2e00000-/);
  const posts = api.writes().filter((call) => call.route === 'POST /reflections');
  expect(posts.map((call) => call.body)).toEqual([{ sprint_id: B(1) }]);
});

test('a gig with nothing to write shows no nudge', async ({ page }) => {
  await page.goto(`/?gig_id=${GIG_C}`);

  await expect(page.getByRole('button', { name: 'Gig details ›' })).toBeEnabled();
  await expect(nudge(page)).toHaveCount(0);
});

test('all gigs: counts across the student gigs only, with no button', async ({ page }) => {
  await page.goto('/');

  // A2 + B1 + B2. Not D1: Ash only reviews that gig.
  await expect(nudge(page)).toContainText(
    '3 sprints need your reflection. Pick a gig to start.',
  );
  await expect(nudge(page).getByRole('button')).toHaveCount(0);
});

test.describe('a student who has written nothing', () => {
  test.use({ reflections: [] });

  test('the nudge sits above the empty diary', async ({ page }) => {
    await page.goto(`/?gig_id=${GIG_A}`);

    await expect(nudge(page)).toContainText('2 sprints need your reflection.');
    await expect(page.getByText('Nothing in your diary yet.')).toBeVisible();
  });
});

test('the gig page keeps its own Start reflection', async ({ page }) => {
  await page.goto(`/gigs/${GIG_A}`);

  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'Sprint 2' })
      .getByRole('button', { name: 'Start reflection' }),
  ).toBeVisible();
});
