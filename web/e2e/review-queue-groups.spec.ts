/**
 * CAP-38 round 3 (Patrick, 2026-10-05): someone who reviews on more than one
 * gig sees the queue listed by gig, each gig's rows under its name, the way
 * Frameworks lists TEMPLATES and SAVED COPIES. The row then drops the gig
 * from its meta line, since the label says it. Someone with one gig (Sam)
 * keeps the single list. Built on the rows the queue already loads; no new
 * request.
 *
 * Self-contained scenario, ids prefixed '3836'.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components, paths } from '../src/api/schema.ts';
import { FakeApi } from './fake-api.ts';

type Me = components['schemas']['Me'];
type QueueEntry =
  paths['/review-queue']['get']['responses']['200']['content']['application/json'][number];

const id = (n: string) => `3836${n}-0000-4836-8836-383638363836`;
const AI = id('0003');
const AUDIT = id('0004');

const SAM: Me = {
  id: id('0010'),
  display_name: 'Sam O',
  participations: [{ gig_id: AI, gig_title: 'Develop AI use cases', role: 'assessor' }],
};
const LEE: Me = {
  id: id('0011'),
  display_name: 'Dr Lee',
  participations: [
    { gig_id: AI, gig_title: 'Develop AI use cases', role: 'supervisor' },
    { gig_id: AUDIT, gig_title: 'Data migration audit', role: 'supervisor' },
  ],
};

function entry(n: string, name: string, gig_id: string, gig_title: string, sprint: number) {
  return {
    reflection_id: id(`00a${n}`),
    student: { id: id(`000${n}`), display_name: name },
    gig_id,
    gig_title,
    sprint_id: id(`00b${n}`),
    sprint_ordinal: sprint,
    submitted_at: '2026-09-14T10:00:00.000000Z',
    progress: { scored_by_me: 1, entries: 6 },
  } satisfies QueueEntry;
}

// Server order (oldest waiting first), with the gigs interleaved.
const QUEUE = [
  entry('1', 'Jane N', AUDIT, 'Data migration audit', 2),
  entry('2', 'Tom H', AI, 'Develop AI use cases', 2),
  entry('3', 'Priya R', AUDIT, 'Data migration audit', 1),
];

async function install(page: Page, me: Me, queue: QueueEntry[] = QUEUE) {
  const api = new FakeApi([], me, [], []);
  await api.install(page);
  await page.route('**/api/v1/review-queue', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(queue),
    }),
  );
}

test('Dr Lee: each gig is a labelled group, in the order its first row arrived', async ({
  page,
}) => {
  await install(page, LEE);
  await page.goto('/review-queue');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Data migration audit',
    'Develop AI use cases',
  ]);
  const audit = page.getByRole('region', { name: 'Data migration audit' });
  await expect(audit.getByRole('link')).toHaveCount(2);
  await expect(audit.getByRole('link').first()).toHaveAccessibleName(/^Jane N,/);
  await expect(audit.getByRole('link').last()).toHaveAccessibleName(/^Priya R,/);
  const ai = page.getByRole('region', { name: 'Develop AI use cases' });
  await expect(ai.getByRole('link')).toHaveCount(1);
});

test('Dr Lee: a grouped row says its sprint, not the gig again', async ({ page }) => {
  await install(page, LEE);
  await page.goto('/review-queue');
  const row = page.getByRole('link', { name: /^Jane N,/ });
  await expect(row).toContainText('Sprint 2');
  await expect(row).not.toContainText('Data migration audit');
  // The name still carries the gig, for anyone not reading the label.
  await expect(row).toHaveAccessibleName(/^Jane N, Data migration audit, Sprint 2:/);
});

test('Dr Lee: one gig with rows waiting still gets its label', async ({ page }) => {
  await install(page, LEE, [QUEUE[0]]);
  await page.goto('/review-queue');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Data migration audit',
  ]);
});

test('Sam: one gig, one list, no gig labels, the gig still on each row', async ({
  page,
}) => {
  await install(page, SAM, [QUEUE[1]]);
  await page.goto('/review-queue');
  await expect(page.getByRole('link', { name: /^Tom H,/ })).toContainText(
    'Develop AI use cases · Sprint 2',
  );
  await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
});
