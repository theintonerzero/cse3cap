/**
 * CAP-38 round 3 E2 (Patrick, 2026-10-05): in the Frameworks sheet, each gig
 * says which rubric it already uses ("Uses SFIA 9", "Uses this rubric",
 * "No rubric yet"), and a gig that has one can't be picked: a gig keeps its
 * rubric for good (ADR #35). GET /gigs carries the fact; no backend change.
 * Without it (loading, or failed) the radios are plain and the server's 409
 * still answers.
 *
 * Self-contained scenario, ids prefixed '3853'. Dr Lee only: Sam gets Page
 * not found on Frameworks (CAP-46).
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi, type FrameworkDetail, type GigDetail } from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `3853${n}-0000-4853-8853-385338533853`;
const GIG_ONE = id('0003');
const GIG_TWO = id('0004');

const LEE: Me = {
  id: id('0011'),
  display_name: 'Dr Lee',
  participations: [
    { gig_id: GIG_ONE, gig_title: 'Develop AI use cases', role: 'supervisor' },
    { gig_id: GIG_TWO, gig_title: 'Data migration audit', role: 'supervisor' },
  ],
};

const TEMPLATE: FrameworkDetail = {
  id: id('0020'),
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
  scale: { min: 1, max: 2 },
  competencies: [
    {
      id: id('0030'),
      code: 'collaboration',
      name: 'Collaboration',
      short_label: null,
      category: null,
      position: 1,
      levels: [1, 2].map((value) => ({
        id: id(`003${value}`),
        level_value: value,
        descriptor: `Level ${value}.`,
      })),
    },
  ],
};
const COPY: FrameworkDetail = {
  ...TEMPLATE,
  id: id('0021'),
  fw_key: 'copy-of-la-trobe-six-competency',
  name: 'Copy of La Trobe six-competency',
  created_by: LEE.id,
  in_use: false,
  assigned: false,
};

async function install(page: Page, frameworks: FrameworkDetail[], gigs: GigDetail[]) {
  const api = new FakeApi(frameworks, LEE, gigs, []);
  await api.install(page);
  return api;
}

const row_button = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name}`) });

// Round 3 E2 (Patrick, 2026-10-05): each gig in the sheet says which rubric
// it already uses. A gig keeps its rubric for good (ADR #35), so one that
// has a rubric can't be picked. GET /gigs carries it; no backend change.
function gig(gig_id: string, title: string, rubric: FrameworkDetail | null): GigDetail {
  return {
    id: gig_id,
    title,
    org_name: 'Alumable',
    starts_on: '2026-08-01',
    ends_on: '2026-11-01',
    my_role: 'supervisor',
    sprints: [],
    framework: rubric && {
      id: rubric.id,
      fw_key: rubric.fw_key,
      name: rubric.name,
      version: rubric.version,
    },
    reflection_summary: { draft: 0, submitted: 0, assessed: 0 },
    participants: [{ id: LEE.id, display_name: LEE.display_name, role: 'supervisor' }],
  };
}

const ONE_TAKEN = [
  gig(GIG_ONE, 'Develop AI use cases', TEMPLATE),
  gig(GIG_TWO, 'Data migration audit', null),
];

test('each gig says which rubric it uses, and a gig that has one can’t be picked', async ({
  page,
}) => {
  await install(page, [TEMPLATE, COPY], ONE_TAKEN);
  await page.goto('/frameworks');
  await row_button(page, COPY.name).click();
  const sheet = page.getByRole('dialog', { name: COPY.name });
  await expect(sheet.getByRole('radio', { name: /Develop AI use cases/ })).toBeDisabled();
  await expect(sheet.getByText(`Uses ${TEMPLATE.name}`)).toBeVisible();
  await expect(sheet.getByRole('radio', { name: /Data migration audit/ })).toBeEnabled();
  await expect(sheet.getByText('No framework yet')).toBeVisible();
});

test('the rubric a gig already uses reads "Uses this framework"', async ({ page }) => {
  await install(page, [TEMPLATE, COPY], ONE_TAKEN);
  await page.goto('/frameworks');
  await row_button(page, TEMPLATE.name).click();
  const sheet = page.getByRole('dialog', { name: TEMPLATE.name });
  await expect(sheet.getByText('Uses this framework')).toBeVisible();
  await expect(sheet.getByRole('radio', { name: /Develop AI use cases/ })).toBeDisabled();
});

test('every gig taken: the sheet says so and nothing can be picked', async ({ page }) => {
  await install(
    page,
    [TEMPLATE, COPY],
    [
      gig(GIG_ONE, 'Develop AI use cases', TEMPLATE),
      gig(GIG_TWO, 'Data migration audit', TEMPLATE),
    ],
  );
  await page.goto('/frameworks');
  await row_button(page, COPY.name).click();
  const sheet = page.getByRole('dialog', { name: COPY.name });
  await expect(
    sheet.getByText('Every gig you supervise already has a framework.'),
  ).toBeVisible();
  for (const radio of await sheet.getByRole('radio').all())
    await expect(radio).toBeDisabled();
  await expect(sheet.getByRole('button', { name: 'Assign', exact: true })).toBeDisabled();
});

test('after assigning, that gig reads "Uses this framework" and can’t be picked again', async ({
  page,
}) => {
  await install(page, [TEMPLATE, COPY], ONE_TAKEN);
  await page.goto('/frameworks');
  await row_button(page, COPY.name).click();
  const sheet = page.getByRole('dialog', { name: COPY.name });
  await sheet.getByRole('radio', { name: /Data migration audit/ }).check();
  await sheet.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText('Assigned to Data migration audit.');
  await expect(sheet.getByRole('radio', { name: /Data migration audit/ })).toBeDisabled();
  await expect(sheet.getByText('Uses this framework')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Assign', exact: true })).toBeDisabled();
});

test('another rubric opened after an assign sees that gig as taken', async ({ page }) => {
  await install(page, [TEMPLATE, COPY], ONE_TAKEN);
  await page.goto('/frameworks');
  await row_button(page, COPY.name).click();
  let sheet = page.getByRole('dialog', { name: COPY.name });
  await sheet.getByRole('radio', { name: /Data migration audit/ }).check();
  await sheet.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(sheet.getByRole('status')).toBeVisible();
  await page.keyboard.press('Escape');
  await row_button(page, TEMPLATE.name).click();
  sheet = page.getByRole('dialog', { name: TEMPLATE.name });
  await expect(sheet.getByText(`Uses ${COPY.name}`)).toBeVisible();
  await expect(sheet.getByRole('radio', { name: /Data migration audit/ })).toBeDisabled();
});

test('/gigs failing never blocks assigning: plain radios, and the assign still goes', async ({
  page,
}) => {
  const api = await install(page, [TEMPLATE, COPY], ONE_TAKEN);
  api.fail(
    'GET /gigs',
    {
      kind: 'error',
      status: 500,
      code: 'VALIDATION_FAILED',
      message: 'Something went wrong.',
    },
    // Every call: in development StrictMode mounts twice, and the first,
    // aborted request would use up a single fault.
    5,
  );
  await page.goto('/frameworks');
  await row_button(page, COPY.name).click();
  const sheet = page.getByRole('dialog', { name: COPY.name });
  await expect(sheet.getByRole('radio', { name: /Develop AI use cases/ })).toBeEnabled();
  await expect(sheet.getByText(/^Uses |No framework yet/)).toHaveCount(0);
  await sheet.getByRole('radio', { name: /Data migration audit/ }).check();
  await sheet.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText('Assigned to Data migration audit.');
});

test('/gigs still loading: plain radios that can be picked', async ({ page }) => {
  const api = await install(page, [TEMPLATE, COPY], ONE_TAKEN);
  const release = api.hold('GET /gigs');
  await page.goto('/frameworks');
  await row_button(page, COPY.name).click();
  const sheet = page.getByRole('dialog', { name: COPY.name });
  await expect(sheet.getByRole('radio', { name: /Develop AI use cases/ })).toBeEnabled();
  release();
  await expect(sheet.getByRole('radio', { name: /Develop AI use cases/ })).toBeDisabled();
});
