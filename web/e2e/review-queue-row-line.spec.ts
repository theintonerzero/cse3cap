/**
 * CAP-38 round 3 (Patrick, 2026-10-05): a queue row uses its width rather
 * than its height. "Jane N · Sprint 2" on one line, the entries bar under
 * it, the chevron centred between the two. The gig is never on the row: it
 * is the label above the rows, for one gig as for several, so Sam's single
 * list says which gig it is too.
 *
 * Self-contained scenario, ids prefixed '3837'.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components, paths } from '../src/api/schema.ts';
import { FakeApi } from './fake-api.ts';

type Me = components['schemas']['Me'];
type QueueEntry =
  paths['/review-queue']['get']['responses']['200']['content']['application/json'][number];

const id = (n: string) => `3837${n}-0000-4837-8837-383738373837`;
const AI = id('0003');

const SAM: Me = {
  id: id('0010'),
  display_name: 'Sam O',
  participations: [{ gig_id: AI, gig_title: 'Develop AI use cases', role: 'assessor' }],
};

const ROW: QueueEntry = {
  reflection_id: id('00a1'),
  student: { id: id('0001'), display_name: 'Tom H' },
  gig_id: AI,
  gig_title: 'Develop AI use cases',
  sprint_id: id('00b1'),
  sprint_ordinal: 2,
  submitted_at: '2026-09-14T10:00:00.000000Z',
  progress: { scored_by_me: 2, entries: 6 },
};

async function install(page: Page) {
  const api = new FakeApi([], SAM, [], []);
  await api.install(page);
  await page.route('**/api/v1/review-queue', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([ROW]),
    }),
  );
}

test('Sam: his one gig is the label; the row reads "Tom H · Sprint 2"', async ({
  page,
}) => {
  await install(page);
  await page.goto('/review-queue');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Develop AI use cases',
  ]);
  const row = page.getByRole('link', { name: /^Tom H,/ });
  await expect(row).toContainText('Tom H · Sprint 2');
  await expect(row).not.toContainText('Develop AI use cases');
});

for (const width of [390, 1440]) {
  test(`${width}: name and sprint share one line`, async ({ page }) => {
    await install(page);
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/review-queue');
    const row = page.getByRole('link', { name: /^Tom H,/ });
    const name = await row.getByText('Tom H', { exact: true }).boundingBox();
    const sprint = await row.getByText('Sprint 2', { exact: false }).boundingBox();
    expect(Math.abs(name!.y - sprint!.y)).toBeLessThanOrEqual(2);
  });
}
