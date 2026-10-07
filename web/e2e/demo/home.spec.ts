/**
 * CAP-51: the Alumable "My Gigs" home, from GET /gigs.
 *
 * Runs on the `demo` project. The home renders the caller's real gigs as
 * Alumable cards, each linking into that gig's existing diary flow, and ships
 * the four states. The card's link target is asserted rather than followed:
 * the diary screen it opens has its own specs, and this one should not depend
 * on GigDetail's data fixture.
 *
 * Self-contained ids prefixed '5152' so they collide with no other spec's.
 */
import { test as base, expect } from '@playwright/test';

import type { components } from '../../src/api/schema.ts';
import { FakeApi, type GigDetail } from '../fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `5152${n}-0000-4515-8515-515151515151`;
const JANE = id('0001');
const FRAMEWORK = id('0002');
const GIG = id('0003');

const gig: GigDetail = {
  id: GIG,
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [{ id: id('0004'), ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' }],
  framework: { id: FRAMEWORK, fw_key: 'e2e-demo', name: 'E2E rubric', version: 'v1' },
  reflection_summary: { draft: 1, submitted: 1, assessed: 1 },
  participants: [{ id: JANE, display_name: 'Jane N', role: 'student' }],
};

function janeOn(gigs: GigDetail[]): Me {
  return {
    id: JANE,
    display_name: 'Jane N',
    participations: gigs.map((g) => ({ gig_id: g.id, gig_title: g.title, role: g.my_role })),
  };
}

const test = base;

test('home lists the gigs as Alumable cards that link into the diary', async ({ page }) => {
  const api = new FakeApi([], janeOn([gig]), [gig]);
  await api.install(page);

  await page.goto('/home');

  const card = page.getByRole('link', { name: /Develop AI use cases/ });
  await expect(card).toBeVisible();
  await expect(page.getByText('Alumable')).toBeVisible();
  await expect(card).toHaveAttribute('href', new RegExp(`/gigs/${GIG}`));

  expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
});

test('home shows the empty state for a persona on no gigs', async ({ page }) => {
  const api = new FakeApi([], janeOn([]), []);
  await api.install(page);

  await page.goto('/home');

  await expect(page.getByText(/no gigs yet/i)).toBeVisible();
  expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
});

test('home redirects to the sign-in when signed out, without fetching gigs', async ({
  page,
}) => {
  const api = new FakeApi([], janeOn([gig]), [gig]);
  await api.install(page); // seeds a token...
  await page.addInitScript(() => sessionStorage.clear()); // ...then clear it: signed out.

  await page.goto('/home');

  await expect(page).toHaveURL(/\/welcome$/);
  // The gate must stop the fetch before any token is set, or a refresh on the
  // real backend 401s and drops the persona.
  expect(api.calls.some((call) => call.route === 'GET /gigs')).toBe(false);
});

test('home errors with a retry when gigs cannot be fetched', async ({ page }) => {
  const api = new FakeApi([], janeOn([gig]), [gig]);
  api.fail('GET /gigs', { kind: 'network' });
  await api.install(page);

  await page.goto('/home');

  await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
});
