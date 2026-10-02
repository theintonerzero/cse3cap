/**
 * CAP-38: a sticky bar at the foot of a phone screen never sits on top of
 * the field the keyboard is in.
 *
 * The stepper's Back/Next sticks to the bottom of the viewport below 40rem.
 * Without room kept for it (index.css, scroll-padding-bottom), focusing a
 * field low on the page scrolls that field to the window's edge -- behind
 * the bar. Every focusable control on the card is visited in turn and its
 * bottom edge must clear the bar's top edge.
 *
 * Ids prefixed '3840' (CAP-38, third scenario).
 */
import { test as base, expect, type Locator } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionDetail,
} from './fake-api.ts';
import { LATROBE, test as dr_lee_test } from './fixtures.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `3840${n}-0000-4840-8840-384038403840`;
const GIG = id('0001');
const FRAMEWORK = id('0002');
const SPRINT = id('0003');
const COMPETENCY = id('0004');
const DRAFT = id('0005');
const ENTRY = id('0006');

const JANE: Me = {
  id: id('0007'),
  display_name: 'Jane D',
  participations: [{ gig_id: GIG, gig_title: 'Develop AI use cases', role: 'student' }],
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
  scale: { min: 1, max: 4 },
  competencies: [
    {
      id: COMPETENCY,
      code: 'collaboration',
      name: 'Collaboration',
      short_label: null,
      category: null,
      position: 1,
      levels: [1, 2, 3, 4].map((value) => ({
        id: id(`001${value}`),
        level_value: value,
        descriptor: `Collaboration at level ${value}, written long enough to wrap on a phone.`,
      })),
    },
  ],
};

const GIG_DETAIL: GigDetail = {
  id: GIG,
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [{ id: SPRINT, ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' }],
  framework: { id: FRAMEWORK, fw_key: 'latrobe6', name: RUBRIC.name, version: 'v1' },
  reflection_summary: { draft: 1, submitted: 0, assessed: 0 },
  participants: [{ id: JANE.id, display_name: JANE.display_name, role: 'student' }],
};

const REFLECTION: ReflectionDetail = {
  id: DRAFT,
  status: 'draft',
  gig_id: GIG,
  sprint_id: SPRINT,
  sprint_ordinal: 1,
  framework_id: FRAMEWORK,
  framework_version: 'v1',
  submitted_at: null,
  created_at: '2026-08-10T10:00:00.000000Z',
  updated_at: '2026-08-12T10:00:00.000000Z',
  owner: { id: JANE.id, display_name: JANE.display_name },
  entries: [
    {
      id: ENTRY,
      competency_id: COMPETENCY,
      competency_code: 'collaboration',
      competency_name: 'Collaboration',
      short_label: null,
      position: 1,
      narrative: 'Paired with Priya on the import script.',
      evidence: [],
      scores: [],
    },
  ],
};

const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi([RUBRIC], JANE, [GIG_DETAIL], [REFLECTION]);
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

/** How far `field` runs under the top of the bar holding `bar_button`. */
async function overlap(field: Locator, bar_button: Locator): Promise<number> {
  await field.focus();
  const box = await field.boundingBox();
  const bar_top = await bar_button.evaluate(
    (b) => b.parentElement!.getBoundingClientRect().top,
  );
  return box ? box.y + box.height - bar_top : 0;
}

test('phone: the stepper bar never covers the focused field', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto(`/reflections/${DRAFT}`);
  await expect(page.getByText('Collaboration').first()).toBeVisible();

  // One competency, so the bar's forward button is Submit rather than Next.
  const submit = page.getByRole('button', { name: 'Submit' });
  const fields = await page
    .getByRole('main')
    .locator('textarea, input:not([type=file]), button:not([disabled])')
    .all();
  expect(fields.length).toBeGreaterThan(3);

  for (const field of fields) {
    const in_bar = await field.evaluate(
      (el, bar) => bar !== null && bar.parentElement!.contains(el),
      await submit.elementHandle(),
    );
    if (in_bar) continue;
    expect(
      await overlap(field, submit),
      await field.evaluate((e) => e.outerHTML.slice(0, 80)),
    ).toBeLessThanOrEqual(0);
  }
});

dr_lee_test(
  'phone: the edit-framework save bar never covers the focused field',
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto(`/frameworks/${LATROBE}/edit`);
    await expect(
      page.getByRole('heading', { name: 'Copy and edit a rubric' }),
    ).toBeVisible();

    const save = page.getByRole('button', { name: 'Save as a new copy' });
    const fields = await page.getByRole('main').locator('textarea, input, select').all();
    expect(fields.length).toBeGreaterThan(3);

    for (const field of fields) {
      expect(
        await overlap(field, save),
        await field.evaluate((e) => e.id || e.outerHTML.slice(0, 80)),
      ).toBeLessThanOrEqual(0);
    }
  },
);

test('phone: walking backwards, no focused field hides under the sticky header', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto(`/reflections/${DRAFT}`);
  await expect(page.getByText('Collaboration').first()).toBeVisible();

  const fields = await page
    .getByRole('main')
    .locator('textarea, input:not([type=file]), button:not([disabled])')
    .all();
  // Start at the bottom, then move up one field at a time, as Shift+Tab does.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const header = page.getByRole('banner');

  for (const field of fields.reverse()) {
    await field.focus();
    const box = await field.boundingBox();
    const header_bottom =
      (await header.boundingBox())!.y + (await header.boundingBox())!.height;
    expect(
      box ? box.y - header_bottom : 0,
      await field.evaluate((e) => e.id || e.outerHTML.slice(0, 80)),
    ).toBeGreaterThanOrEqual(0);
  }
});
