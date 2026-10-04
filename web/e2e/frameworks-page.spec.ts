/**
 * CAP-38 round 3 F2: Frameworks laid out like the gig page. One muted line
 * under the heading, small uppercase section labels, one row per rubric
 * with its version and "In use", and two small secondary actions. The
 * product rules still read: copy-then-edit (ADR #16), in use is read-only.
 *
 * Self-contained scenario, ids prefixed '3833'. Dr Lee only: Sam gets Page
 * not found here (CAP-46), which framework-access.spec.ts covers.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi, type FrameworkDetail } from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `3833${n}-0000-4833-8833-383338333833`;
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

// A template in use and a saved copy that isn't, shaped like
// framework-access.spec.ts's RUBRIC. The copy's long name is the 390 test.
const TEMPLATE: FrameworkDetail = {
  id: id('0020'),
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
  name: 'Copy of La Trobe six-competency, revised for the 2027 cohort',
  created_by: LEE.id,
  in_use: false,
};

async function install(page: Page, frameworks: FrameworkDetail[]) {
  const api = new FakeApi(frameworks, LEE, [], []);
  await api.install(page);
}

test('one line under the heading, and no per-group hints', async ({ page }) => {
  await install(page, [TEMPLATE, COPY]);
  await page.goto('/frameworks');
  await expect(page.getByRole('heading', { level: 1, name: 'Frameworks' })).toBeVisible();
  await expect(page.getByText('Shipped with the product.')).toHaveCount(0);
  await expect(page.getByText('Copies made by a supervisor.')).toHaveCount(0);
  await expect(page.getByText(/Copy one to change it/)).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Templates' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Saved copies' })).toBeVisible();
});

test('a row: name, then version and In use, and two small actions', async ({ page }) => {
  await install(page, [TEMPLATE, COPY]);
  await page.goto('/frameworks');
  const row = page
    .getByRole('listitem')
    .filter({ hasText: new RegExp(`^${TEMPLATE.name}`) });
  await expect(row.getByText(`${TEMPLATE.version} · In use`)).toBeVisible();
  await expect(row.getByText(TEMPLATE.fw_key, { exact: true })).toHaveCount(0);
  await expect(row.getByRole('link', { name: 'Copy and edit' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Assign to a gig' })).toBeVisible();
});

test('390: a long name and the open picker never scroll sideways', async ({ page }) => {
  await install(page, [TEMPLATE, COPY]);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/frameworks');
  const row = page.getByRole('listitem').filter({ hasText: COPY.name });
  await row.getByRole('button', { name: 'Assign to a gig' }).click();
  await expect(row.getByRole('button', { name: 'Data migration audit' })).toBeVisible();
  await expect(row.getByRole('button', { name: 'Cancel' })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
});

test('390: every row puts its buttons under the name, short name or long', async ({
  page,
}) => {
  const SHORT: FrameworkDetail = {
    ...TEMPLATE,
    id: id('0022'),
    name: 'SFIA 9',
    in_use: true,
  };
  await install(page, [TEMPLATE, COPY, SHORT]);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/frameworks');
  for (const name of [TEMPLATE.name, COPY.name, SHORT.name]) {
    const row = page.getByRole('listitem').filter({ hasText: new RegExp(`^${name}`) });
    const title = await row.getByText(name, { exact: true }).boundingBox();
    const copy = await row.getByRole('link', { name: 'Copy and edit' }).boundingBox();
    expect(copy!.y, name).toBeGreaterThan(title!.y + title!.height);
  }
});
