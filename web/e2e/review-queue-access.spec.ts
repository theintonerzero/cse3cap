/**
 * CAP-38 round 3, B1's failsafe: the review queue is the reviewers'.
 *
 * Switching user never lands anyone here who reviews nothing (see
 * switch-user.spec.ts). Someone who still reaches it, by a typed or stale
 * address, gets Page not found under the ordinary diary bar, the way CAP-46
 * already treats the framework screens, and the screen never mounts, so its
 * requests are never sent. NotFound's link goes to "/", where Home sends
 * each person to their own start.
 *
 * Self-contained scenario, ids prefixed '3832'.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi, type GigDetail } from './fake-api.ts';

type Me = components['schemas']['Me'];
type Role = GigDetail['my_role'];
type Slot = 'student' | 'assessor' | 'supervisor';

const id = (n: string) => `3832${n}-0000-4832-8832-383238323832`;
const GIG_A = id('000a');
const GIG_B = id('000b');
const REFLECTION = id('00a0');

const TOKEN = { jane: 'e2e-jane', sam: 'e2e-sam', lee: 'e2e-lee' } as const;
type Person = keyof typeof TOKEN;
const SLOT: Record<Person, Slot> = { jane: 'student', sam: 'assessor', lee: 'supervisor' };

const PEOPLE: Record<string, Me> = {
  [TOKEN.jane]: {
    id: id('0001'),
    display_name: 'Jane N',
    participations: [{ gig_id: GIG_A, gig_title: 'Gig A', role: 'student' }],
  },
  [TOKEN.sam]: {
    id: id('0002'),
    display_name: 'Sam O',
    participations: [{ gig_id: GIG_A, gig_title: 'Gig A', role: 'assessor' }],
  },
  [TOKEN.lee]: {
    id: id('0003'),
    display_name: 'Dr Lee',
    participations: [
      { gig_id: GIG_A, gig_title: 'Gig A', role: 'supervisor' },
      { gig_id: GIG_B, gig_title: 'Gig B', role: 'supervisor' },
    ],
  },
};

function gig(gig_id: string, title: string, sprint_id: string, role: Role): GigDetail {
  return {
    id: gig_id,
    title,
    org_name: 'Alumable',
    starts_on: '2026-08-01',
    ends_on: '2026-11-01',
    my_role: role,
    sprints: [{ id: sprint_id, ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' }],
    framework: { id: id('00f0'), fw_key: 'e2e-access', name: 'E2E rubric', version: 'v1' },
    reflection_summary: { draft: 0, submitted: 0, assessed: 0 },
    participants: [],
  };
}

/** Signs in as `as`, answering /auth/me per bearer token. */
async function install(page: Page, as: Person) {
  const api = new FakeApi([], PEOPLE[TOKEN.lee], [
    gig(GIG_A, 'Gig A', id('a001'), 'student'),
    gig(GIG_B, 'Gig B', id('b001'), 'supervisor'),
  ]);
  await api.install(page);
  await page.addInitScript(
    ([slot, token]) => {
      sessionStorage.setItem(
        'reflection-diary-tokens',
        JSON.stringify({ student: null, assessor: null, supervisor: null, [slot]: token }),
      );
      sessionStorage.setItem('reflection-diary-active-slot', slot);
    },
    [SLOT[as], TOKEN[as]] as const,
  );
  await page.route('**/api/v1/auth/me', (route) => {
    const bearer =
      route
        .request()
        .headers()
        ['authorization']?.replace(/^Bearer /, '') ?? '';
    const person = PEOPLE[bearer];
    return person
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(person),
        })
      : route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: '{"error":{"code":"UNAUTHENTICATED","message":"x","details":{}}}',
        });
  });
  await page.route('**/api/v1/me/radar**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"error":{"code":"NOT_FOUND","message":"x","details":{}}}',
    }),
  );
  return api;
}

async function expect_ordinary_not_found(page: Page) {
  await expect(
    page.getByRole('heading', { level: 1, name: 'Page not found' }),
  ).toBeVisible();
  const banner = page.getByRole('banner');
  await expect(banner.getByText('Review queue', { exact: true })).toHaveCount(0);
  await expect(
    banner.getByRole('link', { name: 'Back to Reflection Diary' }),
  ).toBeVisible();
  await expect(page.locator('[data-section]')).toHaveCount(0);
}

async function expect_queue(page: Page, name: string) {
  await expect(page.getByRole('banner').getByText(name)).toBeVisible();
  await expect(page).toHaveURL('/review-queue');
  await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible();
}

test('Jane typing the review queue gets Page not found, and its link takes her to her diary', async ({
  page,
}) => {
  const api = await install(page, 'jane');
  await page.goto('/review-queue');

  await expect_ordinary_not_found(page);
  expect(api.calls.filter((call) => call.route === 'GET /review-queue')).toEqual([]);

  await page.getByRole('main').getByRole('link', { name: 'Back to the diary' }).click();
  await expect(page).toHaveURL('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reflection Diary' }),
  ).toBeVisible();
});

test('Jane typing a scoring address gets Page not found, and the reflection is never asked for', async ({
  page,
}) => {
  const api = await install(page, 'jane');
  await page.goto(`/review-queue/reflections/${REFLECTION}`);

  await expect_ordinary_not_found(page);
  expect(api.calls.filter((call) => call.path.includes(REFLECTION))).toEqual([]);
});

test("Page not found's link takes Sam to his review queue", async ({ page }) => {
  await install(page, 'sam');
  await page.goto('/frameworks');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Page not found' }),
  ).toBeVisible();

  await page.getByRole('main').getByRole('link', { name: 'Back to the diary' }).click();
  await expect_queue(page, 'Sam O');
});

test("Page not found's link takes Dr Lee to her review queue", async ({ page }) => {
  await install(page, 'lee');
  await page.goto('/nowhere');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Page not found' }),
  ).toBeVisible();

  await page.getByRole('main').getByRole('link', { name: 'Back to the diary' }).click();
  await expect_queue(page, 'Dr Lee');
});

for (const person of ['sam', 'lee'] as const) {
  test(`${person}: the review queue still opens for a reviewer`, async ({ page }) => {
    await install(page, person);
    await page.goto('/review-queue');
    await expect_queue(page, PEOPLE[TOKEN[person]].display_name);
  });
}
