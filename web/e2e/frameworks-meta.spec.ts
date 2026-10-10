/**
 * CAP-38 round 3 E8 (Patrick, 2026-10-05): the line under each framework.
 * "v1" alone "just looks so out of place"; "Keep versioning then (middle
 * dot) Not in use. I don't think made by you is necessary". So every row,
 * and its sheet, reads "<version> · In use" or "<version> · Not in use",
 * from in_use (a reflection has been scored against it), whether it's a
 * template or a copy. Nothing else is added.
 *
 * Self-contained scenario, ids prefixed '3873'. Dr Lee only: Sam gets Page
 * not found on Frameworks (CAP-46).
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi, type FrameworkDetail } from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `3873${n}-0000-4873-8873-387338733873`;

const LEE: Me = {
  id: id('0011'),
  display_name: 'Dr Lee',
  participations: [
    { gig_id: id('0003'), gig_title: 'Develop AI use cases', role: 'supervisor' },
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
// A template nobody has scored against yet, a copy that has been, and one
// that hasn't: the line follows in_use, not template versus copy.
const UNUSED_TEMPLATE: FrameworkDetail = {
  ...TEMPLATE,
  id: id('0021'),
  fw_key: 'sfia9',
  version: '9.0',
  name: 'SFIA 9',
  in_use: false,
  assigned: false,
};
const USED_COPY: FrameworkDetail = {
  ...TEMPLATE,
  id: id('0022'),
  fw_key: 'capstone-team',
  version: 'v2',
  name: 'Capstone teamwork rubric',
  created_by: LEE.id,
  in_use: true,
  assigned: true,
};
const UNUSED_COPY: FrameworkDetail = {
  ...TEMPLATE,
  id: id('0023'),
  fw_key: 'copy-of-la-trobe-six-competency',
  name: 'Copy of La Trobe six-competency',
  created_by: LEE.id,
  in_use: false,
  assigned: false,
};

async function install(page: Page) {
  const api = new FakeApi([TEMPLATE, UNUSED_TEMPLATE, USED_COPY, UNUSED_COPY], LEE, [], []);
  await api.install(page);
  await page.goto('/frameworks');
}

const row = (page: Page, framework: FrameworkDetail) =>
  page.getByRole('listitem').filter({ hasText: new RegExp(`^${framework.name}`) });

for (const [framework, line] of [
  [TEMPLATE, 'v1 · In use'],
  [UNUSED_TEMPLATE, '9.0 · Not in use'],
  [USED_COPY, 'v2 · In use'],
  [UNUSED_COPY, 'v1 · Not in use'],
] as const) {
  test(`${framework.name}: the row says "${line}", and so does its sheet`, async ({
    page,
  }) => {
    await install(page);
    await expect(row(page, framework).getByText(line, { exact: true })).toBeVisible();
    await row(page, framework).getByRole('button').click();
    const sheet = page.getByRole('dialog', { name: framework.name, exact: true });
    await expect(sheet.getByText(line, { exact: true })).toBeVisible();
  });
}

test('nothing else is added: no "Made by you", no bare version line', async ({ page }) => {
  await install(page);
  await expect(page.getByText(/Made by|Yours/)).toHaveCount(0);
  await expect(page.getByText('v1', { exact: true })).toHaveCount(0);
});
