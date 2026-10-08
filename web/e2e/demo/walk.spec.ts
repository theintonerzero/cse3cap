/**
 * CAP-51: the demo's opening, walked end to end in one spec (acceptance
 * criterion 6): signed out → the demo sign-in → a persona → My Gigs →
 * that gig's page in the diary.
 *
 * The other demo specs pin each step on its own. This one proves they join
 * up: a step that works alone but hands the next one the wrong state (a
 * session not yet resolved, a card pointing somewhere else) fails here.
 *
 * Self-contained ids prefixed '5157' so they collide with no other spec's.
 */
import { test, expect } from '@playwright/test';

import type { components } from '../../src/api/schema.ts';
import { FakeApi, type GigDetail } from '../fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `5157${n}-0000-4515-8515-515151515151`;
const JANE = id('0001');
const GIG = id('0003');

const gig: GigDetail = {
  id: GIG,
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-03',
  ends_on: '2026-10-26',
  my_role: 'student',
  sprints: [{ id: id('0004'), ordinal: 1, opens_on: '2026-08-03', due_on: '2026-08-16' }],
  framework: { id: id('0002'), fw_key: 'e2e-demo', name: 'E2E rubric', version: 'v1' },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [{ id: JANE, display_name: 'Jane N', role: 'student' }],
};

const me: Me = {
  id: JANE,
  display_name: 'Jane N',
  participations: [{ gig_id: GIG, gig_title: gig.title, role: 'student' }],
};

test('signed out → the demo sign-in → Jane → My Gigs → her gig in the diary', async ({
  page,
}) => {
  const api = new FakeApi([], me, [gig]);
  await api.install(page);
  await page.addInitScript(() => sessionStorage.clear());

  // 1. A fresh tab: the demo profile picker, in place at "/".
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Reflection Diary demo' })).toBeVisible();

  // 2. One click as Jane: My Gigs, with her gig on it.
  await page.getByRole('button', { name: /Jane N/ }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { name: 'My gigs' })).toBeVisible();

  // 3. Her gig opens in the diary: the diary's own bar, and its gig page.
  await page.getByRole('link', { name: /Develop AI use cases/ }).click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${GIG}$`));
  await expect(page.getByRole('banner')).toContainText('Reflection Diary');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Develop AI use cases' }),
  ).toBeVisible();

  expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
});
