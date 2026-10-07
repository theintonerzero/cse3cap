/**
 * CAP-51: reviewers in the demo shell.
 *
 * In the product, "/" sends someone who only reviews straight to the review
 * queue. In the demo shell "/" is My Gigs for everyone, so My Gigs has to
 * offer the way in: the same places the app's own nav would give that person
 * (nav_items_for), and the queue's back arrow returns to My Gigs rather than
 * leaving for the sign-in.
 *
 * Self-contained ids prefixed '5154' so they collide with no other spec's.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../../src/api/schema.ts';
import { FakeApi, type GigDetail } from '../fake-api.ts';

type Me = components['schemas']['Me'];
type Role = GigDetail['my_role'];

const id = (n: string) => `5154${n}-0000-4515-8515-515151515151`;
const FRAMEWORK = id('0002');
const GIG = id('0003');

function gig_as(role: Role): GigDetail {
  return {
    id: GIG,
    title: 'Develop AI use cases',
    org_name: 'Alumable',
    starts_on: '2026-08-01',
    ends_on: '2026-11-01',
    my_role: role,
    sprints: [{ id: id('0004'), ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' }],
    framework: { id: FRAMEWORK, fw_key: 'e2e-demo', name: 'E2E rubric', version: 'v1' },
    reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
    participants: [],
  };
}

function person(name: string, n: string, role: Role): Me {
  return {
    id: id(n),
    display_name: name,
    participations: [{ gig_id: GIG, gig_title: 'Develop AI use cases', role }],
  };
}

async function sign_in(page: Page, me: Me, role: Role) {
  const api = new FakeApi([], me, [gig_as(role)]);
  await api.install(page);
  return api;
}

test('an assessor reaches the Review queue from My Gigs, and its back returns there', async ({
  page,
}) => {
  await sign_in(page, person('Sam O', '0010', 'assessor'), 'assessor');
  await page.goto('/home');

  await page.getByRole('main').getByRole('link', { name: 'Review queue' }).click();
  await expect(page).toHaveURL(/\/review-queue$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible();

  await page.getByRole('banner').getByRole('link', { name: 'Back to My Gigs' }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test('a supervisor reaches Frameworks from My Gigs', async ({ page }) => {
  await sign_in(page, person('Dr Lee', '0011', 'supervisor'), 'supervisor');
  await page.goto('/home');

  await expect(
    page.getByRole('main').getByRole('link', { name: 'Review queue' }),
  ).toBeVisible();
  await page.getByRole('main').getByRole('link', { name: 'Frameworks' }).click();
  await expect(page).toHaveURL(/\/frameworks$/);
});

test('a student gets no reviewer shortcuts on My Gigs', async ({ page }) => {
  await sign_in(page, person('Jane N', '0012', 'student'), 'student');
  await page.goto('/home');

  await expect(page.getByRole('link', { name: /Develop AI use cases/ })).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Review queue' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Frameworks' }),
  ).toHaveCount(0);
});
