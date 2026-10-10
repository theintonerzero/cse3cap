/**
 * CAP-38 round 3 E7(a) (Patrick, 2026-10-05): "we need distinctions between
 * duplicate names for the user to navigate the app easier". Where two or
 * more rubrics share a name, the list shows "(2)", "(3)" … after it, the
 * way Windows numbers files, and the stored name never changes. The first
 * stays bare. Numbers follow fw_key (the server makes keys slug, slug-2,
 * slug-3 …, and smoke copies carry a timestamp), so they don't move with
 * the order the API sends. The editor's "Based on" picker reads the same.
 *
 * Self-contained scenario, ids prefixed '3863'. Dr Lee only: Sam gets Page
 * not found on Frameworks (CAP-46).
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi, type FrameworkDetail, type GigDetail } from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `3863${n}-0000-4863-8863-386338633863`;
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

const copy = (n: string, fw_key: string, name: string): FrameworkDetail => ({
  ...TEMPLATE,
  id: id(n),
  fw_key,
  name,
  created_by: LEE.id,
  in_use: false,
  assigned: false,
});

// The shared database's shape: one copy per run of scripts/smoke.sh, each
// renamed to the same fixed name. Sent out of key order on purpose.
const SMOKE = 'Renamed by smoke test';
const FIRST = copy('0041', 'smoke-test-copy-1759000001', SMOKE);
const SECOND = copy('0042', 'smoke-test-copy-1759000002', SMOKE);
const THIRD = copy('0043', 'smoke-test-copy-1759000003', SMOKE);
const SCRAMBLED = [TEMPLATE, THIRD, FIRST, SECOND];

async function install(page: Page, frameworks: FrameworkDetail[], gigs: GigDetail[] = []) {
  const api = new FakeApi(frameworks, LEE, gigs, []);
  await api.install(page);
  return api;
}

const escape = (text: string) => text.replace(/[()]/g, '\\$&');

// The row's name is its button's name up to the meta line. A bare name is
// one not followed by " (".
const labelled = (label: string) => new RegExp(`^${escape(label)}(?! \\()`);
const copies = (page: Page) => page.getByRole('list').nth(1).getByRole('button');

test('same-named copies read (2), (3) in key order, whatever order the API sent', async ({
  page,
}) => {
  await install(page, SCRAMBLED);
  await page.goto('/frameworks');
  await expect(copies(page)).toHaveCount(3);
  await expect(copies(page).nth(0)).toHaveAccessibleName(labelled(SMOKE));
  await expect(copies(page).nth(1)).toHaveAccessibleName(labelled(`${SMOKE} (2)`));
  await expect(copies(page).nth(2)).toHaveAccessibleName(labelled(`${SMOKE} (3)`));
});

test('each number belongs to one rubric: its sheet is titled with it and edits that one', async ({
  page,
}) => {
  await install(page, SCRAMBLED);
  await page.goto('/frameworks');
  for (const [label, framework] of [
    [SMOKE, FIRST],
    [`${SMOKE} (2)`, SECOND],
    [`${SMOKE} (3)`, THIRD],
  ] as const) {
    await page.getByRole('button', { name: labelled(label) }).click();
    const sheet = page.getByRole('dialog', { name: label, exact: true });
    await expect(sheet.getByRole('link', { name: 'Edit a copy' })).toHaveAttribute(
      'href',
      `/frameworks/${framework.id}/edit`,
    );
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  }
});

test('a name nobody else has is left alone: no "(1)"', async ({ page }) => {
  await install(page, SCRAMBLED);
  await page.goto('/frameworks');
  const templates = page.getByRole('list').nth(0).getByRole('button');
  await expect(templates).toHaveCount(1);
  await expect(templates).toHaveAccessibleName(labelled(TEMPLATE.name));
  await expect(page.getByText(/\(1\)/)).toHaveCount(0);
});

test('a copy named like a template is the one numbered; the template stays bare', async ({
  page,
}) => {
  const twin = copy('0044', 'la-trobe-six-competency', TEMPLATE.name);
  await install(page, [twin, TEMPLATE]);
  await page.goto('/frameworks');
  await expect(page.getByRole('list').nth(0).getByRole('button')).toHaveAccessibleName(
    labelled(TEMPLATE.name),
  );
  await expect(copies(page)).toHaveAccessibleName(labelled(`${TEMPLATE.name} (2)`));
});

test('a number never repeats a name somebody typed: "Foo (2)" exists, so the next Foo is (3)', async ({
  page,
}) => {
  const typed = copy('0045', 'foo-2', 'Foo (2)');
  const foo = copy('0046', 'foo', 'Foo');
  const foo_again = copy('0047', 'foo-3', 'Foo');
  await install(page, [TEMPLATE, typed, foo_again, foo]);
  await page.goto('/frameworks');
  await expect(copies(page)).toHaveCount(3);
  await expect(page.getByRole('button', { name: labelled('Foo') })).toHaveCount(1);
  await expect(page.getByRole('button', { name: labelled('Foo (2)') })).toHaveCount(1);
  await expect(page.getByRole('button', { name: labelled('Foo (3)') })).toHaveCount(1);
  await page.getByRole('button', { name: labelled('Foo (2)') }).click();
  await expect(
    page.getByRole('dialog', { name: 'Foo (2)', exact: true }).getByRole('link'),
  ).toHaveAttribute('href', `/frameworks/${typed.id}/edit`);
});

test('the editor’s "Based on" picker numbers them the same way, and shows no keys', async ({
  page,
}) => {
  await install(page, SCRAMBLED);
  await page.goto(`/frameworks/${TEMPLATE.id}/edit`);
  const options = page.locator('#based-on option');
  await expect(options).toHaveText([TEMPLATE.name, SMOKE, `${SMOKE} (2)`, `${SMOKE} (3)`]);
  await expect(options.nth(2)).toHaveAttribute('value', SECOND.id);
  await expect(page.locator('#based-on')).not.toContainText('smoke-test-copy-');
});

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

test('a gig on a numbered copy says which one: "Uses Renamed by smoke test (2)"', async ({
  page,
}) => {
  await install(page, SCRAMBLED, [
    gig(GIG_ONE, 'Develop AI use cases', SECOND),
    gig(GIG_TWO, 'Data migration audit', null),
  ]);
  await page.goto('/frameworks');
  await page.getByRole('button', { name: labelled(TEMPLATE.name) }).click();
  const sheet = page.getByRole('dialog', { name: TEMPLATE.name, exact: true });
  await expect(sheet.getByText(`Uses ${SMOKE} (2)`, { exact: true })).toBeVisible();
});

test('390: the number is on screen, not cut off', async ({ page }) => {
  await install(page, SCRAMBLED);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/frameworks');
  const row = copies(page).nth(2);
  await expect(row).toHaveAccessibleName(labelled(`${SMOKE} (3)`));
  const name = row.locator('span > span').first();
  await expect(name).toHaveText(`${SMOKE} (3)`);
  expect(await name.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  const box = (await name.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
});
