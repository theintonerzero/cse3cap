/**
 * CAP-38 round 3 D2: no pills in the bar. Frameworks is a whole-row card
 * on the queue, for supervisors, and Frameworks' back arrow returns to the
 * queue. Run as Dr Lee (who had pills) and Sam (who never did).
 *
 * Self-contained scenario, ids prefixed '3834'.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi } from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `3834${n}-0000-4834-8834-383438343834`;
const GIG_ONE = id('0003');
const GIG_TWO = id('0004');

const SAM: Me = {
  id: id('0010'),
  display_name: 'Sam O',
  participations: [
    { gig_id: GIG_ONE, gig_title: 'Develop AI use cases', role: 'assessor' },
  ],
};
const LEE: Me = {
  id: id('0011'),
  display_name: 'Dr Lee',
  participations: [
    { gig_id: GIG_ONE, gig_title: 'Develop AI use cases', role: 'supervisor' },
    { gig_id: GIG_TWO, gig_title: 'Data migration audit', role: 'supervisor' },
  ],
};

async function install(page: Page, me: Me) {
  const api = new FakeApi([], me, [], []);
  await api.install(page);
  return api;
}

const WAY_IN = 'Frameworks, copy a rubric or assign one to a gig';

test('Dr Lee: no pills; Frameworks is a row on the queue, and back returns', async ({
  page,
}) => {
  await install(page, LEE);
  await page.goto('/review-queue');
  await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await page.getByRole('main').getByRole('link', { name: WAY_IN }).click();
  await expect(page).toHaveURL(/\/frameworks$/);
  await page
    .getByRole('banner')
    .getByRole('link', { name: 'Back to Review queue' })
    .click();
  await expect(page).toHaveURL(/\/review-queue$/);
});

test('Dr Lee: the way in shows whatever state the queue is in', async ({ page }) => {
  const api = await install(page, LEE);
  // times 2, as the review-queue-error shot does: StrictMode mounts twice.
  api.fail(
    'GET /review-queue',
    {
      kind: 'error',
      status: 500,
      code: 'VALIDATION_FAILED',
      message: 'Something went wrong.',
    },
    2,
  );
  await page.goto('/review-queue');
  await expect(page.getByText('Something went wrong.')).toBeVisible();
  await expect(page.getByRole('link', { name: WAY_IN })).toBeVisible();
});

test('Sam: no pills and no way into Frameworks', async ({ page }) => {
  await install(page, SAM);
  await page.goto('/review-queue');
  await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Frameworks/ })).toHaveCount(0);
});

test('Dr Lee: Frameworks sits above the review queue (round 3, Patrick 2026-10-05)', async ({
  page,
}) => {
  await install(page, LEE);
  await page.goto('/review-queue');
  const way_in = await page.getByRole('link', { name: WAY_IN }).boundingBox();
  const heading = await page
    .getByRole('heading', { level: 1, name: 'Review queue' })
    .boundingBox();
  expect(way_in!.y + way_in!.height).toBeLessThan(heading!.y);
});
