/**
 * CAP-38 round 3 Q3: a queue row reads like the diary's and the gig page's
 * rows. The whole row is one link, the student's name first, a muted meta
 * line, the progress bar, and a chevron at the right edge, centred. No
 * "Score this" pill. Run as Sam and Dr Lee.
 *
 * Self-contained scenario, ids prefixed '3832'.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components, paths } from '../src/api/schema.ts';
import { FakeApi } from './fake-api.ts';

type Me = components['schemas']['Me'];
type QueueEntry =
  paths['/review-queue']['get']['responses']['200']['content']['application/json'][number];

const id = (n: string) => `3832${n}-0000-4832-8832-383238323832`;
const GIG = id('0003');
const SPRINT = id('0004');

const SAM: Me = {
  id: id('0010'),
  display_name: 'Sam O',
  participations: [{ gig_id: GIG, gig_title: 'Develop AI use cases', role: 'assessor' }],
};
const LEE: Me = {
  id: id('0011'),
  display_name: 'Dr Lee',
  participations: [{ gig_id: GIG, gig_title: 'Data migration audit', role: 'supervisor' }],
};

function entry(n: string, name: string, gig_title: string, scored: number): QueueEntry {
  return {
    reflection_id: id(`00a${n}`),
    student: { id: id(`000${n}`), display_name: name },
    gig_id: GIG,
    gig_title,
    sprint_id: SPRINT,
    sprint_ordinal: 2,
    submitted_at: '2026-08-14T10:00:00.000000Z',
    progress: { scored_by_me: scored, entries: 6 },
  };
}

const QUEUE = [
  entry('1', 'Jane N', 'Data migration audit', 1),
  entry('2', 'Priya Kumar', 'Develop AI use cases', 0),
];

async function install(page: Page, me: Me) {
  const api = new FakeApi([], me, [], []);
  await api.install(page);
  await page.route('**/api/v1/review-queue', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(QUEUE),
    }),
  );
}

for (const me of [SAM, LEE]) {
  test.describe(me.display_name, () => {
    test('each row is one link, named from the student first', async ({ page }) => {
      await install(page, me);
      await page.goto('/review-queue');
      const row = page.getByRole('link', {
        name: 'Jane N, Data migration audit, Sprint 2: 1 of 6 entries scored',
        exact: true,
      });
      await expect(row).toBeVisible();
      await expect(page.getByText('Score this')).toHaveCount(0);
      await row.click();
      await expect(page).toHaveURL(new RegExp(`/review-queue/reflections/${id('00a1')}$`));
    });

    for (const width of [390, 1440]) {
      test(`${width}: the chevron sits at the right edge, centred on the row`, async ({
        page,
      }) => {
        await install(page, me);
        await page.setViewportSize({ width, height: 800 });
        await page.goto('/review-queue');
        const row = page.getByRole('link', { name: /^Jane N,/ });
        await expect(row).toBeVisible();
        const { row_box, chevron_box } = await row.evaluate(async (link) => {
          await document.fonts.ready;
          const chevron = [...link.querySelectorAll('[aria-hidden="true"]')].find(
            (el) => el.textContent === '›',
          )!;
          return {
            row_box: link.getBoundingClientRect().toJSON(),
            chevron_box: chevron.getBoundingClientRect().toJSON(),
          };
        });
        const row_mid = row_box.top + row_box.height / 2;
        const chevron_mid = chevron_box.top + chevron_box.height / 2;
        expect(Math.abs(row_mid - chevron_mid)).toBeLessThanOrEqual(1.5);
        // Inside the row's right padding, so nothing sits right of it.
        expect(row_box.right - chevron_box.right).toBeLessThanOrEqual(24);
        expect(
          await page.evaluate(
            () =>
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
        ).toBe(0);
      });
    }
  });
}
