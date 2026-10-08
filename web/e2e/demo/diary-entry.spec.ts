/**
 * CAP-51 follow-up (Patrick, 8 Oct): My Gigs is a way into the diary home.
 *
 * The shell used to redirect "/" to My Gigs and leave the diary out of its
 * shortcuts, so the diary home and its radar, step 1 of docs/Demo-Script.md,
 * could not be reached in the demo at all. Now My Gigs carries a Reflection
 * Diary card, as the Figma "My gigs" sheet carries a diary row, "/" is the
 * diary as it is in the product, and the diary's back-arrow returns to My Gigs.
 *
 * Self-contained ids prefixed '5158' so they collide with no other spec's.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components, paths } from '../../src/api/schema.ts';
import { FakeApi, type GigDetail } from '../fake-api.ts';

type Me = components['schemas']['Me'];
type Radar = paths['/me/radar']['get']['responses']['200']['content']['application/json'];

const id = (n: string) => `5158${n}-0000-4515-8515-515151515151`;
const FRAMEWORK = id('0002');

function gig(n: string, title: string, my_role: GigDetail['my_role']): GigDetail {
  return {
    id: id(n),
    title,
    org_name: 'Alumable',
    starts_on: '2026-08-03',
    ends_on: '2026-10-26',
    my_role,
    sprints: [
      { id: id(`${n}9`), ordinal: 1, opens_on: '2026-08-03', due_on: '2026-08-16' },
    ],
    framework: { id: FRAMEWORK, fw_key: 'e2e-demo', name: 'E2E rubric', version: 'v1' },
    reflection_summary: { draft: 0, submitted: 0, assessed: 0 },
    participants: [],
  };
}

const RADAR: Radar = {
  scope: { gig_id: null, sprint_id: null },
  framework: { id: FRAMEWORK, fw_key: 'e2e-demo', scale_min: 1, scale_max: 4 },
  axes: ['a', 'b', 'c'].map((code, n) => ({
    code,
    short_label: code.toUpperCase(),
    position: n + 1,
    self: 3,
    counter: 2,
    counter_role: 'assessor',
  })),
};

const STUDENT_GIG = gig('0003', 'Develop AI use cases', 'student');
const ASSESSOR_GIG = gig('0005', 'Data migration audit', 'assessor');

function person(name: string, gigs: GigDetail[]): Me {
  return {
    id: id('0001'),
    display_name: name,
    participations: gigs.map((g) => ({
      gig_id: g.id,
      gig_title: g.title,
      role: g.my_role,
    })),
  };
}

async function install(page: Page, me: Me, gigs: GigDetail[]) {
  const api = new FakeApi([], me, gigs);
  await api.install(page);
  await page.route('**/api/v1/me/radar**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(RADAR),
    }),
  );
  return api;
}

const diary_heading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: 'Reflection Diary' });

test("a student's My Gigs opens the diary home", async ({ page }) => {
  const api = await install(page, person('Jane N', [STUDENT_GIG]), [STUDENT_GIG]);
  await page.goto('/home');

  const diary = page.getByRole('link', { name: /Reflection Diary/ });
  await expect(diary).toBeVisible();
  await diary.click();

  await expect(diary_heading(page)).toBeVisible();
  await expect(page).not.toHaveURL(/\/home$/);
  expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
});

test('"/" is the diary home in demo mode, not a redirect to My Gigs', async ({ page }) => {
  await install(page, person('Jane N', [STUDENT_GIG]), [STUDENT_GIG]);
  await page.goto('/');

  await expect(diary_heading(page)).toBeVisible();
  await expect(page).not.toHaveURL(/\/home$/);
});

test('gig → diary home → My Gigs, by the back-arrows', async ({ page }) => {
  await install(page, person('Jane N', [STUDENT_GIG]), [STUDENT_GIG]);
  await page.goto('/home');

  await page.getByRole('link', { name: /Develop AI use cases/ }).click();
  await expect(page).toHaveURL(new RegExp(`/gigs/${STUDENT_GIG.id}`));

  await page.getByRole('link', { name: 'Back to Reflection Diary' }).click();
  await expect(diary_heading(page)).toBeVisible();

  await page.getByRole('banner').getByRole('link', { name: 'Back to My Gigs' }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test('a reviewer with no student gig gets no diary card', async ({ page }) => {
  await install(page, person('Sam O', [ASSESSOR_GIG]), [ASSESSOR_GIG]);
  await page.goto('/home');

  await expect(page.getByRole('link', { name: /Data migration audit/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Reflection Diary/ })).toHaveCount(0);
});
