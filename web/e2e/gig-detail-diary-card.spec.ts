/**
 * CAP-38 round 2d: the gig page's diary card ends at its sprints (ADR #42).
 *
 * Patrick dropped "Open your diary for this gig" as redundant: the gig page
 * is only reached from the diary, and the bar's back arrow returns to the
 * diary as it was left (round 2b's diary-return.ts), which is that gig. This
 * replaces CAP-8's criterion 3 link, by its owner's call.
 *
 * Without the button the card must still close neatly: the space under the
 * last thing in it equals the space above the first.
 *
 * Self-contained scenario, ids prefixed '6262' so they collide with no other
 * spec's.
 */
import { test as base, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi, type GigDetail, type ReflectionSummary } from './fake-api.ts';

const id = (n: string) => `6262${n}-0000-4626-8626-626262626262`;
const STUDENT = id('0001');
const GIG = id('0002');
const SPRINT = (n: number) => id(`001${n}`);

const ME: components['schemas']['Me'] = {
  id: STUDENT,
  display_name: 'Ash',
  participations: [{ gig_id: GIG, gig_title: 'La Trobe capstone', role: 'student' }],
};

const GIG_DETAIL: GigDetail = {
  id: GIG,
  title: 'La Trobe capstone',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [1, 2].map((n) => ({
    id: SPRINT(n),
    ordinal: n,
    opens_on: '2026-08-01',
    due_on: '2026-08-14',
  })),
  framework: { id: id('0003'), fw_key: 'e2e-card', name: 'E2E rubric', version: 'v1' },
  reflection_summary: { draft: 0, submitted: 2, assessed: 0 },
  participants: [{ id: STUDENT, display_name: 'Ash', role: 'student' }],
};

const reflection = (n: number): ReflectionSummary => ({
  id: id(`002${n}`),
  status: 'submitted',
  gig_id: GIG,
  sprint_id: SPRINT(n),
  sprint_ordinal: n,
  framework_id: id('0003'),
  framework_version: 'v1',
  submitted_at: '2026-08-14T10:00:00.000000Z',
  created_at: '2026-08-02T10:00:00.000000Z',
  updated_at: '2026-08-14T10:00:00.000000Z',
});

/** Both sprints written (last row a link), or only the first (last row Start). */
const test = base.extend<{ written: number[]; api: FakeApi }>({
  written: [[1, 2], { option: true }],
  api: [
    async ({ page, written }, provide) => {
      const api = new FakeApi([], ME, [GIG_DETAIL], written.map(reflection));
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

async function gaps(page: Page) {
  const card = page
    .getByRole('heading', { level: 2, name: 'Reflection diary' })
    .locator('..');
  await expect(card.getByText('Sprint 2')).toBeVisible();
  return card.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const first = node.firstElementChild!.getBoundingClientRect();
    const last = node.lastElementChild!.getBoundingClientRect();
    return { top: first.top - box.top, bottom: box.bottom - last.bottom };
  });
}

test('the diary card offers no link back to the diary it came from', async ({ page }) => {
  await page.goto(`/gigs/${GIG}`);
  await expect(page.getByText('Sprint 2')).toBeVisible();

  await expect(
    page.getByRole('link', { name: 'Open your diary for this gig' }),
  ).toHaveCount(0);
  await expect(page.locator('a[href^="/?gig_id="]')).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`the card closes as evenly as it opens at ${width}, last row a link`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/gigs/${GIG}`);
    const { top, bottom } = await gaps(page);
    expect(Math.abs(bottom - top)).toBeLessThanOrEqual(1);
  });

  test.describe(() => {
    test.use({ written: [1] });

    test(`the card closes as evenly as it opens at ${width}, last row Start reflection`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/gigs/${GIG}`);
      const { top, bottom } = await gaps(page);
      expect(Math.abs(bottom - top)).toBeLessThanOrEqual(1);
    });
  });
}
