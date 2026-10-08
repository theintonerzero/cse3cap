/**
 * CAP-51: switching profile in the demo shell.
 *
 * The demo moves between Jane, Noor, Sam and Dr Lee. Jane and Noor share the
 * student token slot, so the diary's slot-based switcher cannot tell them
 * apart; in the demo shell every switch goes back to the profile picker,
 * whose cards name each person.
 *
 * Self-contained ids prefixed '5155' so they collide with no other spec's.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../../src/api/schema.ts';
import { FakeApi, type GigDetail } from '../fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `5155${n}-0000-4515-8515-515151515151`;
const JANE = id('0001');
const GIG = id('0003');

const gig: GigDetail = {
  id: GIG,
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [{ id: id('0004'), ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' }],
  framework: { id: id('0002'), fw_key: 'e2e-demo', name: 'E2E rubric', version: 'v1' },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [{ id: JANE, display_name: 'Jane N', role: 'student' }],
};

const me: Me = {
  id: JANE,
  display_name: 'Jane N',
  participations: [{ gig_id: GIG, gig_title: gig.title, role: 'student' }],
};

async function sign_in(page: Page) {
  const api = new FakeApi([], me, [gig]);
  await api.install(page);
  return api;
}

test('My Gigs names who is signed in, and Switch profile returns to the profile picker', async ({
  page,
}) => {
  await sign_in(page);
  await page.goto('/home');

  await expect(page.getByRole('banner')).toContainText('Jane N');
  await page.getByRole('button', { name: 'Switch profile' }).click();

  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('button', { name: /Noor A/ })).toBeVisible();
});

test("inside the diary, the menu's Switch user goes to the profile picker", async ({
  page,
}) => {
  await sign_in(page);
  await page.goto(`/gigs/${GIG}`);

  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Switch user' }).click();

  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('button', { name: /Noor A/ })).toBeVisible();
});
