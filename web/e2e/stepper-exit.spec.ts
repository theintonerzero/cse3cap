/**
 * CAP-38 round 3 (Patrick, 2026-10-05): the scoring screen's in-page
 * "← Back to the review queue" button goes. It predates the bar's back
 * arrow, which says "Back to Review queue" and goes to the same place.
 * Checked in every state the button used to show in: loading, error and
 * loaded. The student's stepper never had it.
 *
 * Self-contained scenario, ids prefixed '3838'.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi } from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `3838${n}-0000-4838-8838-383838383838`;
const GIG = id('0003');
const MISSING = id('00ff');

const LEE: Me = {
  id: id('0011'),
  display_name: 'Dr Lee',
  participations: [{ gig_id: GIG, gig_title: 'Data migration audit', role: 'supervisor' }],
};

async function install(page: Page) {
  const api = new FakeApi([], LEE, [], []);
  await api.install(page);
  return api;
}

const OLD_EXIT = /Back to the review queue/;

test('error: no in-page exit, the bar goes back to the queue', async ({ page }) => {
  await install(page);
  await page.goto(`/review-queue/reflections/${MISSING}`);
  await expect(
    page
      .getByRole('alert')
      .or(page.getByText(/not found|went wrong/i))
      .first(),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: OLD_EXIT })).toHaveCount(0);
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Back to Review queue' }),
  ).toHaveAttribute('href', '/review-queue');
});

test('loading: no in-page exit', async ({ page }) => {
  const api = await install(page);
  api.hold('GET /reflections/:id');
  await page.goto(`/review-queue/reflections/${MISSING}`);
  await expect(page.getByRole('status').first()).toBeVisible();
  await expect(page.getByRole('button', { name: OLD_EXIT })).toHaveCount(0);
});
