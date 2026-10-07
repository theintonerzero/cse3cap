/**
 * CAP-51: the Alumable chrome and the demo-mode entry.
 *
 * Runs on the `demo` project. The chrome frames the home; the index redirects
 * into it; and leaving a gig lands back on it, so the diary reads as a section
 * of Alumable rather than a separate app.
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

test('the index redirects to /home in demo mode', async ({ page }) => {
  await sign_in(page);
  await page.goto('/');

  await expect(page).toHaveURL(/\/home$/);
});

test('the diary back-arrow inside a gig returns to the Alumable home', async ({ page }) => {
  await sign_in(page);
  await page.goto('/home');

  await page.getByRole('link', { name: /Develop AI use cases/ }).click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${GIG}`));

  // The diary's own "up one level" goes to "/", which the demo index redirects
  // to the Alumable home rather than the diary.
  await page.getByRole('link', { name: /Back to Reflection Diary/i }).click();
  await expect(page).toHaveURL(/\/home$/);
});
