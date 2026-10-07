/**
 * CAP-38 round 3 F2: Frameworks laid out like the gig page. One muted line
 * under the heading, small uppercase section labels, one row per rubric
 * with its version and "In use". Round 3 E6/E2 (2026-10-05): the row is one
 * whole-row button that opens a sheet with "Edit a copy" and the gigs as
 * radio rows. The product rules still read: copy-then-edit (ADR #16), in
 * use is read-only.
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
  name: 'Copy of La Trobe six-competency, revised for the 2027 cohort',
  created_by: LEE.id,
  in_use: false,
  assigned: false,
};

async function install(page: Page, frameworks: FrameworkDetail[]) {
  const api = new FakeApi(frameworks, LEE, [], []);
  await api.install(page);
  return api;
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

// Round 3 E6 + E2 (Patrick, 2026-10-05): each framework is one compact
// whole-row card, like every other list in the app, and tapping it opens a
// sheet with "Edit a copy" and the gigs to assign it to, as radio rows.
const row_button = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name.replace(/[()]/g, '\\$&')}`) });

test('a row: name, then version and In use, a chevron, and nothing else to press', async ({
  page,
}) => {
  await install(page, [TEMPLATE, COPY]);
  await page.goto('/frameworks');
  const row = page
    .getByRole('listitem')
    .filter({ hasText: new RegExp(`^${TEMPLATE.name}`) });
  await expect(row.getByText(`${TEMPLATE.version} · In use`)).toBeVisible();
  await expect(row.getByText(TEMPLATE.fw_key, { exact: true })).toHaveCount(0);
  await expect(row.getByRole('button')).toHaveCount(1);
  await expect(row.getByRole('link')).toHaveCount(0);
  await expect(row.getByRole('button')).toHaveAttribute('aria-haspopup', 'dialog');
});

for (const width of [390, 1440]) {
  test(`${width}: a row is compact, about half its old height`, async ({ page }) => {
    await install(page, [TEMPLATE, COPY]);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/frameworks');
    const row = page
      .getByRole('listitem')
      .filter({ hasText: new RegExp(`^${TEMPLATE.name}`) });
    expect((await row.boundingBox())!.height).toBeLessThanOrEqual(90);
  });
}

test('tapping a row opens its sheet: Edit a copy, then the gigs to pick from', async ({
  page,
}) => {
  await install(page, [TEMPLATE, COPY]);
  await page.goto('/frameworks');
  await row_button(page, TEMPLATE.name).click();
  const sheet = page.getByRole('dialog', { name: TEMPLATE.name });
  await expect(sheet.getByText(`${TEMPLATE.version} · In use`)).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Edit a copy' })).toHaveAttribute(
    'href',
    `/frameworks/${TEMPLATE.id}/edit`,
  );
  const group = sheet.getByRole('group', { name: 'Assign to a gig' });
  await expect(group.getByRole('radio')).toHaveCount(2);
  await expect(group.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Assign', exact: true })).toBeDisabled();
});

test('pick a gig, Assign, and the sheet says so; one POST however often it is pressed', async ({
  page,
}) => {
  const api = await install(page, [TEMPLATE, COPY]);
  await page.goto('/frameworks');
  await row_button(page, COPY.name).click();
  const sheet = page.getByRole('dialog', { name: COPY.name });
  await sheet.getByRole('radio', { name: 'Data migration audit' }).check();
  const release = api.hold('POST /framework-assignments');
  await sheet.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Assigning…' })).toBeDisabled();
  release();
  await expect(sheet.getByRole('status')).toHaveText('Assigned to Data migration audit.');
  expect(api.writes()).toHaveLength(1);
  expect(api.writes()[0].body).toEqual({ framework_id: COPY.id, gig_id: GIG_TWO });
});

test('a refusal is said in the sheet, in the server’s words', async ({ page }) => {
  const api = await install(page, [TEMPLATE, COPY]);
  api.fail('POST /framework-assignments', {
    kind: 'error',
    status: 409,
    code: 'DUPLICATE_ASSIGNMENT',
    message: 'That gig already has a rubric.',
  });
  await page.goto('/frameworks');
  await row_button(page, TEMPLATE.name).click();
  const sheet = page.getByRole('dialog', { name: TEMPLATE.name });
  await sheet.getByRole('radio', { name: 'Develop AI use cases' }).check();
  await sheet.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(sheet.getByRole('status')).toHaveText('That gig already has a rubric.');
});

test('another framework opens fresh: nothing picked, no outcome', async ({ page }) => {
  await install(page, [TEMPLATE, COPY]);
  await page.goto('/frameworks');
  await row_button(page, COPY.name).click();
  let sheet = page.getByRole('dialog', { name: COPY.name });
  await sheet.getByRole('radio', { name: 'Data migration audit' }).check();
  await sheet.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(sheet.getByRole('status')).toBeVisible();
  await page.keyboard.press('Escape');
  await row_button(page, TEMPLATE.name).click();
  sheet = page.getByRole('dialog', { name: TEMPLATE.name });
  await expect(sheet.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(sheet.getByRole('status')).toHaveCount(0);
});

test('keyboard: Enter opens the sheet, Escape closes it, focus returns to the row', async ({
  page,
}) => {
  await install(page, [TEMPLATE, COPY]);
  await page.goto('/frameworks');
  const row = row_button(page, TEMPLATE.name);
  await row.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: TEMPLATE.name })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(row).toBeFocused();
});

test('390: a long name in the open sheet never scrolls sideways', async ({ page }) => {
  await install(page, [TEMPLATE, COPY]);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/frameworks');
  await row_button(page, COPY.name).click();
  await expect(page.getByRole('dialog', { name: COPY.name })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBe(0);
});

// Round 3 E1 (Patrick, 2026-10-05): "Templates and its buttons could be
// moved a little higher so the gap between the frameworks subheadings isn't
// as large." The groups keep the gig page's 24 between them.
for (const width of [390, 1440]) {
  test(`${width}: TEMPLATES sits 16 under the sub line, its first row 12 under it`, async ({
    page,
  }) => {
    await install(page, [TEMPLATE, COPY]);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/frameworks');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Saved copies' }),
    ).toBeVisible();
    const gaps = await page.evaluate(async () => {
      await document.fonts.ready;
      const box = (el: Element | null) => el!.getBoundingClientRect();
      const labels = document.querySelectorAll('main section section h2');
      const lists = document.querySelectorAll('main section section ul');
      return {
        sub_to_label:
          box(labels[0]).top - box(document.querySelector('main h1 + p')).bottom,
        label_to_row: box(lists[0].querySelector('li')).top - box(labels[0]).bottom,
        between_groups: box(labels[1]).top - box(lists[0]).bottom,
      };
    });
    expect(Math.round(gaps.sub_to_label)).toBe(16);
    expect(Math.round(gaps.label_to_row)).toBe(12);
    expect(Math.round(gaps.between_groups)).toBe(24);
  });
}
