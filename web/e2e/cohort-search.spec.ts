/**
 * Cohort search and recurring themes (ADR #64), at the top of the review
 * queue for assessors and supervisors. Search runs on submit, never per
 * keystroke; a result opens the reviewer's stepper at the competency it
 * matched. With the field empty, theme chips per reviewed gig run as
 * searches. Refusals are injected, never re-ruled.
 */
import { test as base, expect } from '@playwright/test';

import {
  GIG,
  GIG_FOR_TESTS,
  RUBRIC_FOR_TESTS,
  SUBMITTED,
  id,
  reflection_for_tests,
} from './ai-fixtures.ts';
import { FakeApi } from './fake-api.ts';

const SEARCH = 'GET /search';
const THEMES = 'GET /gigs/:id/themes';
const OTHER_GIG = id('0b02');
const STUDY_GIG = id('0b03');

const SAM = {
  id: 'sam-the-assessor',
  display_name: 'Sam O',
  participations: [
    { gig_id: GIG, gig_title: 'Develop AI use cases', role: 'assessor' as const },
    { gig_id: OTHER_GIG, gig_title: 'Data migration audit', role: 'supervisor' as const },
    // A gig Sam studies on as well as assesses: a student there, and no chips for it.
    { gig_id: STUDY_GIG, gig_title: 'Capstone', role: 'assessor' as const },
    { gig_id: STUDY_GIG, gig_title: 'Capstone', role: 'student' as const },
  ],
};

const RESULTS = {
  results: [
    {
      reflection_id: SUBMITTED,
      entry_id: id('00e1'),
      student_name: 'Jane N',
      gig_title: 'Develop AI use cases',
      sprint_ordinal: 2,
      competency_name: 'Contribution',
      excerpt: 'I raised the blocker at standup before lunch.',
    },
  ],
};
const THEMED = {
  themes: ['Blockers raised late', 'Unclear task ownership', 'Import step'],
};

const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi(
        [RUBRIC_FOR_TESTS],
        SAM,
        [GIG_FOR_TESTS],
        [reflection_for_tests(SUBMITTED, 'submitted')],
      );
      api.ai_status(['search', 'themes']);
      api.ai_reply(SEARCH, RESULTS);
      api.ai_reply(THEMES, THEMED);
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

const field = (page: import('@playwright/test').Page) =>
  page.getByRole('searchbox', { name: 'Search reflections by meaning' });

test('typing asks nothing; submitting searches, and a row opens at the competency', async ({
  page,
  api,
}) => {
  await page.goto('/review-queue');
  await field(page).fill('blockers at standup');
  await page.waitForLoadState('networkidle');
  expect(api.ai_calls.filter((c) => c.route === SEARCH)).toHaveLength(0);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const row = page.getByRole('link', { name: /Jane N/ });
  await expect(row).toContainText('Develop AI use cases');
  await expect(row).toContainText('Sprint 2');
  await expect(row).toContainText('Contribution');
  await expect(row).toContainText('I raised the blocker at standup before lunch.');
  await expect(row).not.toContainText('%');
  await expect(row).toHaveAttribute(
    'href',
    `/review-queue/reflections/${SUBMITTED}?entry=${id('00e1')}`,
  );
  expect(api.ai_calls.find((c) => c.route === SEARCH)?.path).toBe('/search');
  // The queue is still there under it.
  await expect(page.getByText('Nothing is waiting on you right now.')).toBeVisible();
});

test('loading: skeleton rows while the search is out', async ({ page, api }) => {
  const release = api.ai_hold(SEARCH);
  await page.goto('/review-queue');
  await field(page).fill('blockers');
  await field(page).press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: 'Searching reflections' }),
  ).toBeVisible();
  release();
  await expect(page.getByRole('link', { name: /Jane N/ })).toBeVisible();
});

test('empty: says nothing matches, and how to try again', async ({ page, api }) => {
  api.ai_reply(SEARCH, { results: [] });
  await page.goto('/review-queue');
  await field(page).fill('quantum');
  await field(page).press('Enter');
  await expect(page.getByText('Nothing matches that yet. Try other words.')).toBeVisible();
});

test('error: says so, and the queue is untouched', async ({ page, api }) => {
  api.ai_fail(SEARCH, {
    kind: 'error',
    status: 503,
    code: 'AI_UNAVAILABLE',
    message: 'x',
    details: { reason: 'upstream' },
  });
  await page.goto('/review-queue');
  await field(page).fill('blockers');
  await field(page).press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: 'Search isn’t available right now' }),
  ).toBeVisible();
  await expect(page.getByText('Nothing is waiting on you right now.')).toBeVisible();
});

test('rate-limited: says when to try again', async ({ page, api }) => {
  api.ai_fail(SEARCH, {
    kind: 'error',
    status: 429,
    code: 'AI_RATE_LIMITED',
    message: 'x',
    details: { retry_after: 30 },
  });
  await page.goto('/review-queue');
  await field(page).fill('blockers');
  await field(page).press('Enter');
  await expect(
    page.getByText('You’ve searched a lot just now. Try again in a minute.'),
  ).toBeVisible();
});

test('Clear goes back to the themes', async ({ page }) => {
  await page.goto('/review-queue');
  await field(page).fill('blockers');
  await field(page).press('Enter');
  await expect(page.getByRole('link', { name: /Jane N/ })).toBeVisible();
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(field(page)).toHaveValue('');
  await expect(page.getByRole('link', { name: /Jane N/ })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Blockers raised late' }).first(),
  ).toBeVisible();
});

test('themes: a chip row per reviewed gig, by gig, and none for a gig Sam studies on', async ({
  page,
  api,
}) => {
  await page.goto('/review-queue');
  await expect(
    page.getByRole('group', { name: 'Recurring themes, Develop AI use cases' }),
  ).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Recurring themes, Data migration audit' }),
  ).toBeVisible();
  await expect(page.getByRole('group', { name: /Capstone/ })).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  // Once per reviewed gig (the dev server's double mount aborts and repeats one).
  const asked = new Set(api.ai_calls.filter((c) => c.route === THEMES).map((c) => c.path));
  expect([...asked].sort()).toEqual(
    [`/gigs/${GIG}/themes`, `/gigs/${OTHER_GIG}/themes`].sort(),
  );
});

test('a chip fills the field and runs the search', async ({ page, api }) => {
  await page.goto('/review-queue');
  await page
    .getByRole('group', { name: 'Recurring themes, Develop AI use cases' })
    .getByRole('button', { name: 'Unclear task ownership' })
    .click();
  await expect(field(page)).toHaveValue('Unclear task ownership');
  await expect(page.getByRole('link', { name: /Jane N/ })).toBeVisible();
  expect(api.ai_calls.filter((c) => c.route === SEARCH)).toHaveLength(1);
});

test('themes loading: chip-shaped skeletons', async ({ page, api }) => {
  const release = api.ai_hold(THEMES);
  await page.goto('/review-queue');
  await expect(
    page.getByRole('status').filter({ hasText: 'Finding themes' }).first(),
  ).toBeVisible();
  release();
  await expect(page.getByRole('button', { name: 'Import step' }).first()).toBeVisible();
});

test('no themes, or a themes error: no themes row at all', async ({ page, api }) => {
  api.ai_reply(THEMES, { themes: [] });
  await page.goto('/review-queue');
  await expect(field(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('group', { name: /Recurring themes/ })).toHaveCount(0);
});

test('a themes error leaves no themes row, and search still works', async ({
  page,
  api,
}) => {
  api.ai_fail(
    THEMES,
    {
      kind: 'error',
      status: 503,
      code: 'AI_UNAVAILABLE',
      message: 'x',
      details: { reason: 'upstream' },
    },
    10,
  );
  await page.goto('/review-queue');
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('group', { name: /Recurring themes/ })).toHaveCount(0);
  await field(page).fill('blockers');
  await field(page).press('Enter');
  await expect(page.getByRole('link', { name: /Jane N/ })).toBeVisible();
});

test('search not served: no field; themes not served: no chips', async ({ page, api }) => {
  api.ai_status(['themes']);
  await page.goto('/review-queue');
  await expect(page.getByText('Nothing is waiting on you right now.')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(field(page)).toHaveCount(0);
  await expect(page.getByRole('group', { name: /Recurring themes/ })).toHaveCount(0);
});

test('themes not served: the field, and no chips', async ({ page, api }) => {
  api.ai_status(['search']);
  await page.goto('/review-queue');
  await expect(field(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('group', { name: /Recurring themes/ })).toHaveCount(0);
  expect(api.ai_calls.filter((c) => c.route === THEMES)).toHaveLength(0);
});

const OFF: [string, (api: FakeApi) => void][] = [
  ['off (404 AI_DISABLED)', (api) => api.ai_status(null)],
  ['unreachable', (api) => api.ai_fail('GET /status', { kind: 'network' })],
];

for (const [name, setup] of OFF) {
  test(`AI ${name}: the review queue is today's, with only the status asked`, async ({
    page,
    api,
  }) => {
    setup(api);
    await page.goto('/review-queue');
    await expect(page.getByText('Nothing is waiting on you right now.')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByRole('group', { name: /Recurring themes/ })).toHaveCount(0);
    expect(api.ai_calls.map((c) => c.route)).toEqual(['GET /status']);
  });
}

test('a theme chip is a plain button that searches, not a toggle', async ({ page }) => {
  await page.goto('/review-queue');
  const chip = page
    .getByRole('group', { name: 'Recurring themes, Develop AI use cases' })
    .getByRole('button', { name: 'Import step' });
  await expect(chip).toBeVisible();
  await expect(chip).not.toHaveAttribute('aria-pressed');
});

test('results are announced as they arrive, and so is nothing found', async ({
  page,
  api,
}) => {
  await page.goto('/review-queue');
  await field(page).fill('blockers');
  await field(page).press('Enter');
  await expect(
    page.getByRole('status').filter({ hasText: '1 entry for “blockers”' }),
  ).toBeVisible();
  api.ai_reply(SEARCH, { results: [] });
  await field(page).fill('quantum');
  await field(page).press('Enter');
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Nothing matches that yet. Try other words.' }),
  ).toBeVisible();
});

// An employer reaches the queue too (RoleResolver::REVIEWER_ROLES), but search
// is for assessors and supervisors (ADR #64), so the sidecar would refuse them.
const as_employer = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const employer = {
        id: 'erin-the-employer',
        display_name: 'Erin E',
        participations: [
          { gig_id: GIG, gig_title: 'Develop AI use cases', role: 'employer' as const },
        ],
      };
      const api = new FakeApi([RUBRIC_FOR_TESTS], employer, [GIG_FOR_TESTS], []);
      api.ai_status(['search', 'themes']);
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

as_employer('an employer gets no search field it could never use', async ({ page }) => {
  await page.goto('/review-queue');
  await expect(page.getByText('Nothing is waiting on you right now.')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('searchbox')).toHaveCount(0);
});

test.describe('at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('themes start folded under one toggle, so the queue stays near the top', async ({
    page,
  }) => {
    await page.goto('/review-queue');
    const toggle = page.getByRole('button', { name: 'Recurring themes' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('group', { name: /Recurring themes,/ })).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByRole('group', { name: 'Recurring themes, Develop AI use cases' }),
    ).toBeVisible();
  });
});

test('wider than a phone, themes start open under the same toggle', async ({ page }) => {
  await page.goto('/review-queue');
  await expect(page.getByRole('button', { name: 'Recurring themes' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

test('no gig has themes: no toggle either', async ({ page, api }) => {
  api.ai_reply(THEMES, { themes: [] });
  await page.goto('/review-queue');
  await expect(field(page)).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Recurring themes' })).toHaveCount(0);
});
