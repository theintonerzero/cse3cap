/**
 * CAP-46: the framework screens are the supervisor's (ADR #17, ADR #48).
 *
 * The nav already showed Frameworks to supervisors only, but the routes took
 * anyone who typed the address, and the picker offered an employer their own
 * gigs. The server is what refuses (GigPolicy::assignFramework, tested in
 * FrameworkMutationTest); these checks are that the screens stop offering
 * what the server will refuse.
 */
import { test as base, expect } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi, type FrameworkDetail } from './fake-api.ts';

type Me = components['schemas']['Me'];

const SUPERVISED = '46460001-0000-4446-8446-464646464646';
const EMPLOYED = '46460002-0000-4446-8446-464646464646';
const ASSESSED = '46460003-0000-4446-8446-464646464646';
const FRAMEWORK = '46460004-0000-4446-8446-464646464646';

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
  competencies: [
    {
      id: '46460011-0000-4446-8446-464646464646',
      code: 'collaboration',
      name: 'Collaboration',
      short_label: null,
      category: null,
      position: 1,
      levels: [1, 2].map((value) => ({
        id: `4646002${value}-0000-4446-8446-464646464646`,
        level_value: value,
        descriptor: `Level ${value}.`,
      })),
    },
  ],
};

function person(
  display_name: string,
  roles: [string, string, Me['participations'][number]['role']][],
): Me {
  return {
    id: '46460031-0000-4446-8446-464646464646',
    display_name,
    participations: roles.map(([gig_id, gig_title, role]) => ({ gig_id, gig_title, role })),
  };
}

const EMPLOYER = person('An Employer', [[EMPLOYED, 'Roster rebuild', 'employer']]);
const ASSESSOR = person('Sam O', [[ASSESSED, 'Data migration audit', 'assessor']]);
const SUPERVISOR_AND_EMPLOYER = person('Dr Lee', [
  [SUPERVISED, 'Develop AI use cases', 'supervisor'],
  [EMPLOYED, 'Roster rebuild', 'employer'],
]);

const test = base.extend<{ me: Me; api: FakeApi }>({
  me: [EMPLOYER, { option: true }],
  api: [
    async ({ page, me }, provide) => {
      const api = new FakeApi([RUBRIC], me);
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

for (const [who, me] of [
  ['an employer', EMPLOYER],
  ['an assessor', ASSESSOR],
] as const) {
  test.describe(`${who}, who supervises nothing`, () => {
    test.use({ me });

    test('is not found at /frameworks, and the rubrics are never asked for', async ({
      page,
      api,
    }) => {
      await page.goto('/frameworks');

      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Frameworks' })).toHaveCount(0);
      expect(api.calls.filter((call) => call.path.startsWith('/frameworks'))).toEqual([]);
    });

    test('is not found at the editor either', async ({ page, api }) => {
      await page.goto(`/frameworks/${FRAMEWORK}/edit`);

      await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
      expect(api.calls.filter((call) => call.path.startsWith('/frameworks'))).toEqual([]);
    });
  });
}

test.describe('a supervisor who is also an employer elsewhere', () => {
  test.use({ me: SUPERVISOR_AND_EMPLOYER });

  test('sees the rubrics, and is offered only the gig they supervise', async ({ page }) => {
    await page.goto('/frameworks');

    await expect(page.getByRole('heading', { name: 'Frameworks' })).toBeVisible();
    await page.getByRole('button', { name: /^La Trobe six-competency/ }).click();
    const sheet = page.getByRole('dialog', { name: 'La Trobe six-competency' });
    // One assignable gig is picked already (round 3 E2): the employer's gig
    // is never offered.
    const radios = sheet.getByRole('group', { name: 'Assign to a gig' }).getByRole('radio');
    await expect(radios).toHaveCount(1);
    await expect(sheet.getByRole('radio', { name: 'Develop AI use cases' })).toBeChecked();
    await expect(sheet.getByRole('button', { name: 'Assign', exact: true })).toBeEnabled();
  });

  test('can open the editor', async ({ page }) => {
    await page.goto(`/frameworks/${FRAMEWORK}/edit`);

    await expect(
      page.getByRole('heading', { name: 'Edit a copy of a framework' }),
    ).toBeVisible();
  });
});
