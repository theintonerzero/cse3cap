/**
 * CAP-39: a student starts a reflection from the gig page.
 *
 * Until this, nothing in web/ called POST /reflections, so a student without
 * a seeded draft had no way in. The button sits on every sprint row with no
 * reflection. Which sprints may be started is not decided here: the server
 * allows any sprint and GigPolicy::createReflection decides who. Refusals are
 * injected with fail(), never computed by the fake (ADR #42).
 */
import { test as base, expect } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionSummary,
} from './fake-api.ts';

const STUDENT_GIG = '39390001-0000-4339-8339-393939393939';
const ASSESSOR_GIG = '39390002-0000-4339-8339-393939393939';
const FRAMEWORK = '39390003-0000-4339-8339-393939393939';
const SPRINT = (n: number) => `3939001${n}-0000-4339-8339-393939393939`;
const OTHER_SPRINT = '39390021-0000-4339-8339-393939393939';
const EXISTING = '39390031-0000-4339-8339-393939393939';
const COMPETENCY = (n: number) => `3939004${n}-0000-4339-8339-393939393939`;

const JANE: components['schemas']['Me'] = {
  id: '39390051-0000-4339-8339-393939393939',
  display_name: 'Jane D',
  participations: [
    { gig_id: STUDENT_GIG, gig_title: 'Develop AI use cases', role: 'student' },
    { gig_id: ASSESSOR_GIG, gig_title: 'Data migration audit', role: 'assessor' },
  ],
};

const RUBRIC: FrameworkDetail = {
  id: FRAMEWORK,
  fw_key: 'latrobe6',
  version: 'v1',
  name: 'La Trobe six-competency',
  created_by: null,
  in_use: true,
  comment_required: true,
  evidence_required: false,
  accepted_file_types: ['pdf'],
  max_file_bytes: 10485760,
  scale: { min: 1, max: 2 },
  competencies: [1, 2].map((n) => ({
    id: COMPETENCY(n),
    code: `c${n}`,
    name: n === 1 ? 'Collaboration' : 'Communication',
    short_label: null,
    category: null,
    position: n,
    levels: [1, 2].map((value) => ({
      id: `393900${n}${value}-0000-4339-8339-393939393939`,
      level_value: value,
      descriptor: `Level ${value}.`,
    })),
  })),
};

function gig(id: string, role: 'student' | 'assessor', sprint_ids: string[]): GigDetail {
  return {
    id,
    title: role === 'student' ? 'Develop AI use cases' : 'Data migration audit',
    org_name: 'Alumable',
    starts_on: '2026-08-01',
    ends_on: '2026-11-01',
    my_role: role,
    sprints: sprint_ids.map((sprint_id, i) => ({
      id: sprint_id,
      ordinal: i + 1,
      opens_on: '2026-08-01',
      due_on: '2026-08-14',
    })),
    framework: { id: FRAMEWORK, fw_key: 'latrobe6', name: RUBRIC.name, version: 'v1' },
    reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
    participants: [{ id: JANE.id, display_name: JANE.display_name, role }],
  };
}

/** Sprint 1 already has a reflection; sprints 2 and 3 have none. */
const SUBMITTED: ReflectionSummary = {
  id: EXISTING,
  status: 'submitted',
  gig_id: STUDENT_GIG,
  sprint_id: SPRINT(1),
  sprint_ordinal: 1,
  framework_id: FRAMEWORK,
  framework_version: 'v1',
  submitted_at: '2026-08-14T10:00:00.000000Z',
  created_at: '2026-08-02T10:00:00.000000Z',
  updated_at: '2026-08-14T10:00:00.000000Z',
};

const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi(
        [RUBRIC],
        JANE,
        [
          gig(STUDENT_GIG, 'student', [SPRINT(1), SPRINT(2), SPRINT(3)]),
          gig(ASSESSOR_GIG, 'assessor', [OTHER_SPRINT]),
        ],
        [SUBMITTED],
      );
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

const row = (page: import('@playwright/test').Page, ordinal: number) =>
  page.getByRole('listitem').filter({ hasText: `Sprint ${ordinal}` });

test('a sprint with no reflection offers Start reflection; one with a reflection is a link', async ({
  page,
}) => {
  await page.goto(`/gigs/${STUDENT_GIG}`);

  await expect(
    row(page, 2).getByRole('button', { name: 'Start reflection' }),
  ).toBeVisible();
  await expect(
    row(page, 3).getByRole('button', { name: 'Start reflection' }),
  ).toBeVisible();
  await expect(row(page, 1).getByRole('button', { name: 'Start reflection' })).toHaveCount(
    0,
  );
  await expect(row(page, 1).getByRole('link')).toHaveAttribute(
    'href',
    `/reflections/${EXISTING}`,
  );
});

test('starting one posts the sprint and opens the new draft in the stepper', async ({
  page,
  api,
}) => {
  await page.goto(`/gigs/${STUDENT_GIG}`);
  await row(page, 2).getByRole('button', { name: 'Start reflection' }).click();

  await expect(page).toHaveURL(/\/reflections\/e2e00000-/);
  // CAP-38: the stepper is headed "<gig> · Sprint N" once it has loaded.
  await expect(page.getByRole('heading', { level: 1, name: /Sprint 2$/ })).toBeVisible();
  await expect(page.getByLabel('Your reflection')).toBeEditable();

  const posts = api.writes().filter((call) => call.route === 'POST /reflections');
  expect(posts.map((call) => call.body)).toEqual([{ sprint_id: SPRINT(2) }]);
});

test('while the request is in flight the button is disabled, and a second press sends nothing', async ({
  page,
  api,
}) => {
  const release = api.hold('POST /reflections');
  await page.goto(`/gigs/${STUDENT_GIG}`);
  const button = row(page, 2).getByRole('button', { name: /Start/ });

  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveText('Starting…');
  await button.click({ force: true });

  release();
  await expect(page).toHaveURL(/\/reflections\//);
  expect(api.writes().filter((call) => call.route === 'POST /reflections')).toHaveLength(1);
});

test('409: started elsewhere, so the page reloads and the row becomes the link', async ({
  page,
  api,
}) => {
  await page.goto(`/gigs/${STUDENT_GIG}`);
  // Staged only once the page has read its reflections, or the first read
  // would already include it and the button would never be drawn.
  await expect(
    row(page, 2).getByRole('button', { name: 'Start reflection' }),
  ).toBeVisible();
  api.fail('POST /reflections', {
    kind: 'error',
    status: 409,
    code: 'DUPLICATE_REFLECTION',
    message: 'A reflection already exists for that context.',
  });
  // What the other tab created, visible on the page's next read.
  api.add_reflection({
    ...SUBMITTED,
    id: '39390032-0000-4339-8339-393939393939',
    status: 'draft',
    sprint_id: SPRINT(2),
    sprint_ordinal: 2,
    submitted_at: null,
  });

  await row(page, 2).getByRole('button', { name: 'Start reflection' }).click();

  await expect(row(page, 2).getByRole('link')).toHaveAttribute(
    'href',
    '/reflections/39390032-0000-4339-8339-393939393939',
  );
  await expect(row(page, 2).getByRole('button', { name: 'Start reflection' })).toHaveCount(
    0,
  );
});

test('400 FRAMEWORK_NOT_ASSIGNED: the row says to ask the supervisor', async ({
  page,
  api,
}) => {
  await page.goto(`/gigs/${STUDENT_GIG}`);
  api.fail('POST /reflections', {
    kind: 'error',
    status: 400,
    code: 'FRAMEWORK_NOT_ASSIGNED',
    message: 'This gig has no rubric yet.',
  });

  await row(page, 2).getByRole('button', { name: 'Start reflection' }).click();

  await expect(row(page, 2).getByRole('alert')).toHaveText(
    'This gig has no rubric yet. Ask your supervisor to assign one.',
  );
  await expect(page).toHaveURL(`/gigs/${STUDENT_GIG}`);
});

test('any other error shows its message on that row, and the rest of the page keeps working', async ({
  page,
  api,
}) => {
  await page.goto(`/gigs/${STUDENT_GIG}`);
  api.fail('POST /reflections', {
    kind: 'error',
    status: 403,
    code: 'ROLE_FORBIDDEN',
    message: 'Only a student on this gig can write a reflection on it.',
  });

  await row(page, 2).getByRole('button', { name: 'Start reflection' }).click();

  await expect(row(page, 2).getByRole('alert')).toHaveText(
    'Only a student on this gig can write a reflection on it.',
  );
  await expect(
    row(page, 3).getByRole('button', { name: 'Start reflection' }),
  ).toBeEnabled();
  await expect(row(page, 1).getByRole('link')).toBeVisible();
});

test('an assessor sees the sprint calendar, with no Start reflection', async ({ page }) => {
  await page.goto(`/gigs/${ASSESSOR_GIG}`);

  await expect(page.getByText('Sprint 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start reflection' })).toHaveCount(0);
});
