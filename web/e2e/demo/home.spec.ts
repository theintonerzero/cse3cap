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
    participations: gigs.map((g) => ({
      gig_id: g.id,
      gig_title: g.title,
      role: g.my_role,
    })),
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

test('a new gig with no reflections, org or dates reads as new, never "null" or "0 of 1"', async ({
  page,
}) => {
  const bare: GigDetail = {
    ...gig,
    id: id('0009'),
    title: 'New gig',
    org_name: null,
    starts_on: null,
    ends_on: null,
    reflection_summary: { draft: 0, submitted: 0, assessed: 0 },
  };
  const api = new FakeApi([], janeOn([bare]), [bare]);
  await api.install(page);

  await page.goto('/home');

  await expect(page.getByRole('link', { name: /New gig/ })).toBeVisible();
  await expect(page.getByText('No reflections yet')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText('null');
  expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
});

test("a gig's dates read as the diary writes them, not a bare year range", async ({
  page,
}) => {
  const api = new FakeApi([], janeOn([gig]), [gig]);
  await api.install(page);

  await page.goto('/home');

  const card = page.getByRole('link', { name: /Develop AI use cases/ });
  // gig_dates, the diary's own: "1 Aug – 1 Nov" or "Aug 1 – Nov 1" by locale.
  await expect(card).toContainText('Aug');
  await expect(card).not.toContainText('2026–2026');
});

test('My Gigs fits a phone: no sideways scroll at 390 wide', async ({ page }) => {
  const api = new FakeApi([], janeOn([gig]), [gig]);
  await api.install(page);
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/home');
  await expect(page.getByRole('link', { name: /Develop AI use cases/ })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
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
