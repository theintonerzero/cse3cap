/**
 * CAP-38 round 3 E12 and E7(b) (Patrick, 2026-10-05): "The title of the new
 * copy always has "Copy of" in front of it, why do we even need this? … I
 * ended up getting "copy of copy of {framework}" and it looks so dumb."
 * Patrick chose "(2)". A copy now starts with the framework's name and the
 * first free number, the way Windows names a second copy: free of every
 * stored name and of every on-screen label (E7a numbers repeats), and a copy
 * of "X (2)" is "X (3)", never "X (2) (2)". The heading and the Saved copies
 * group still say it's a copy (ADR #16). The person can type any name.
 *
 * Self-contained scenario, ids prefixed '3883'.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi, type FrameworkDetail } from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `3883${n}-0000-4883-8883-388338833883`;

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

const copy = (n: string, fw_key: string, name: string): FrameworkDetail => ({
  ...TEMPLATE,
  id: id(n),
  fw_key,
  name,
  created_by: LEE.id,
  in_use: false,
});

async function open(page: Page, frameworks: FrameworkDetail[], base: FrameworkDetail) {
  const api = new FakeApi(frameworks, LEE, [], []);
  await api.install(page);
  await page.goto(`/frameworks/${base.id}/edit`);
  await expect(page.getByLabel('Name of your copy')).toBeVisible();
  return api;
}

const name_box = (page: Page) => page.getByLabel('Name of your copy');

test('a copy starts as "<name> (2)", not "Copy of …"', async ({ page }) => {
  await open(page, [TEMPLATE], TEMPLATE);
  await expect(name_box(page)).toHaveValue('La Trobe six-competency (2)');
});

test('a number already stored is skipped', async ({ page }) => {
  const two = copy('0041', 'la-trobe-six-competency-2', 'La Trobe six-competency (2)');
  await open(page, [TEMPLATE, two], TEMPLATE);
  await expect(name_box(page)).toHaveValue('La Trobe six-competency (3)');
});

test('a number already shown on screen for a repeat is skipped', async ({ page }) => {
  // Stored as the same name, so Frameworks shows it as "(2)" (E7a).
  const twin = copy('0042', 'la-trobe-six-competency', 'La Trobe six-competency');
  await open(page, [TEMPLATE, twin], TEMPLATE);
  await expect(name_box(page)).toHaveValue('La Trobe six-competency (3)');
});

test('a copy of "X (2)" is "X (3)", never "X (2) (2)"', async ({ page }) => {
  const two = copy('0043', 'la-trobe-six-competency-2', 'La Trobe six-competency (2)');
  await open(page, [TEMPLATE, two], two);
  await expect(name_box(page)).toHaveValue('La Trobe six-competency (3)');
});

test('a long name is cut to make room for the number', async ({ page }) => {
  const long = copy('0044', 'long', `A${'b'.repeat(190)}`);
  await open(page, [TEMPLATE, long], long);
  const value = await name_box(page).inputValue();
  expect(value.length).toBeLessThanOrEqual(191);
  expect(value.endsWith(' (2)')).toBe(true);
});

test('the suggestion is not an edit: nothing warns about discarding, and Save sends it', async ({
  page,
}) => {
  const api = await open(page, [TEMPLATE], TEMPLATE);
  await expect(page.getByText(/discards your edits/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Save as a new copy' }).click();
  await expect(page.getByText('Saved as La Trobe six-competency (2).')).toBeVisible();
  expect(api.writes()[0].body).toMatchObject({ name: 'La Trobe six-competency (2)' });
});
