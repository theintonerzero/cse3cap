/**
 * CAP-38 round 3 (Patrick, 2026-10-05; ADR #57): a finished pick kept on
 * this device moves the queue's "Entries" bar as it moves the scoring
 * screen's "you have scored X of N", though nothing has been sent yet.
 * Only finished ones count, only this person's, and never past the total.
 *
 * Self-contained scenario, ids prefixed '3852'.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components, paths } from '../src/api/schema.ts';
import { FakeApi } from './fake-api.ts';

type Me = components['schemas']['Me'];
type QueueEntry =
  paths['/review-queue']['get']['responses']['200']['content']['application/json'][number];

const id = (n: string) => `3852${n}-0000-4852-8852-385238523852`;
const GIG = id('0003');
const REFLECTION = id('00a1');

const SAM: Me = {
  id: id('0010'),
  display_name: 'Sam O',
  participations: [{ gig_id: GIG, gig_title: 'Develop AI use cases', role: 'assessor' }],
};

const ROW: QueueEntry = {
  reflection_id: REFLECTION,
  student: { id: id('0001'), display_name: 'Tom H' },
  gig_id: GIG,
  gig_title: 'Develop AI use cases',
  sprint_id: id('00b1'),
  sprint_ordinal: 2,
  submitted_at: '2026-09-14T10:00:00.000000Z',
  progress: { scored_by_me: 1, entries: 6 },
};

async function install(page: Page, kept: Record<string, Record<string, unknown>>) {
  const api = new FakeApi([], SAM, [], []);
  await api.install(page);
  await page.route('**/api/v1/review-queue', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([ROW]),
    }),
  );
  await page.addInitScript((stores) => {
    for (const [key, value] of Object.entries(stores)) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }, kept);
}

const mine = `reflection-diary-counter-drafts:${SAM.id}:${REFLECTION}`;

test('finished picks on this device add to the sent ones; unfinished ones do not', async ({
  page,
}) => {
  await install(page, {
    [mine]: {
      [id('00e1')]: { level_id: id('0l13'), comment: '', done: true },
      [id('00e2')]: { level_id: id('0l23'), comment: 'Why', done: true },
      [id('00e3')]: { level_id: null, comment: 'Half a thought', done: false },
    },
  });
  await page.goto('/review-queue');
  await expect(page.getByRole('link', { name: /^Tom H,/ })).toContainText('Entries 3 of 6');
});

test("someone else's kept work does not move Sam's bar", async ({ page }) => {
  await install(page, {
    [`reflection-diary-counter-drafts:someone-else:${REFLECTION}`]: {
      [id('00e1')]: { level_id: id('0l13'), comment: '', done: true },
    },
  });
  await page.goto('/review-queue');
  await expect(page.getByRole('link', { name: /^Tom H,/ })).toContainText('Entries 1 of 6');
});
