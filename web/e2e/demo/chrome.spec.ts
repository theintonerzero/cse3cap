/**
 * CAP-51: the Alumable chrome and the demo-mode entry.
 *
 * Runs on the `demo` project. The chrome frames the home and says it is a
 * demo. How the diary is entered from it, and left back to it, is
 * diary-entry.spec.ts.
 *
 * Self-contained ids prefixed '5153' so they collide with no other spec's.
 */
import { test, expect } from '@playwright/test';

import type { components } from '../../src/api/schema.ts';
import { FakeApi, type GigDetail } from '../fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `5153${n}-0000-4515-8515-515151515151`;
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
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [{ id: JANE, display_name: 'Jane N', role: 'student' }],
};

const me: Me = {
  id: JANE,
  display_name: 'Jane N',
  participations: [{ gig_id: GIG, gig_title: gig.title, role: 'student' }],
};

async function sign_in(page: import('@playwright/test').Page) {
  const api = new FakeApi([], me, [gig]);
  await api.install(page);
  return api;
}

test('the Alumable chrome frames the home', async ({ page }) => {
  await sign_in(page);
  await page.goto('/home');

  await expect(page.getByRole('navigation', { name: /alumable/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /chat/i })).toBeDisabled();
});

test('the chrome says it is a demo', async ({ page }) => {
  // Labelled plainly (8 Oct): nobody should take the surround for live Alumable.
  await sign_in(page);
  await page.goto('/home');

  await expect(page.getByRole('banner')).toContainText('Demo');
});

test('at phone width the Demo badge leaves the signed-in name whole', async ({ page }) => {
  // Jane and Noor share a token slot, so the name is how a presenter knows
  // who is signed in. The badge must not squeeze it to "Jan…".
  await page.setViewportSize({ width: 390, height: 844 });
  await sign_in(page);
  await page.goto('/home');

  const name = page.getByRole('banner').getByText('Jane N', { exact: true });
  await expect(name).toBeVisible();
  const clipped = await name.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(clipped).toBe(false);
});
