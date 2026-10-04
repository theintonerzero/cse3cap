/**
 * CAP-38 round 3, B1: a change of user lands on that user's default screen.
 *
 * Switching from Dr Lee to Jane on the review queue used to leave Jane
 * there, with Leave as the only way out. Whatever page you were on is never
 * carried over to the next person: every change of user goes to "/", where
 * Home sends each person to their own start, exactly as a first sign-in
 * does. The first person in a tab keeps the address they arrived at, so a
 * shared link still opens where it points (ADR #27), and the same person
 * signing back in is not a change of user.
 *
 * The fake's /auth/me answers one fixed person whatever the token, so this
 * spec answers it per bearer token instead: three people set up the way the
 * seeded ones are. Jane is a student only, Sam assesses one gig, Dr Lee
 * supervises two. Registered after FakeApi.install, so it takes precedence.
 *
 * These are about where the shell lands, so the screen under it may be in
 * any state.
 *
 * Self-contained scenario, ids prefixed '3831'.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi, type GigDetail } from './fake-api.ts';

type Me = components['schemas']['Me'];
type Role = GigDetail['my_role'];
type Slot = 'student' | 'assessor' | 'supervisor';

const id = (n: string) => `3831${n}-0000-4831-8831-383138313831`;
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
    framework: { id: id('00f0'), fw_key: 'e2e-switch', name: 'E2E rubric', version: 'v1' },
    reflection_summary: { draft: 0, submitted: 0, assessed: 0 },
    participants: [],
  };
}

/**
 * Signs in as `as` (or no one: the token screen), with `saved` tokens
 * already in their slots, the way a tester who has pasted each token once is
 * set up.
 */
async function install(
  page: Page,
  as: Person | null,
  saved: Partial<Record<Slot, string>>,
) {
  const api = new FakeApi([], PEOPLE[TOKEN.lee], [
    gig(GIG_A, 'Gig A', id('a001'), 'student'),
    gig(GIG_B, 'Gig B', id('b001'), 'supervisor'),
  ]);
  await api.install(page);
  await page.addInitScript(
    ([slots, active]) => {
      sessionStorage.setItem('reflection-diary-tokens', JSON.stringify(slots));
      if (active) sessionStorage.setItem('reflection-diary-active-slot', active);
      else sessionStorage.removeItem('reflection-diary-active-slot');
    },
    [
      { student: null, assessor: null, supervisor: null, ...saved },
      as && SLOT[as],
    ] as const,
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

async function open_switcher(page: Page) {
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: 'Switch user' }).click();
  return page.getByRole('dialog', { name: 'Switch user' });
}

async function expect_diary_home(page: Page, name: string) {
  await expect(page.getByRole('banner').getByText(name)).toBeVisible();
  await expect(page).toHaveURL('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reflection Diary' }),
  ).toBeVisible();
}

async function expect_queue(page: Page, name: string) {
  await expect(page.getByRole('banner').getByText(name)).toBeVisible();
  await expect(page).toHaveURL('/review-queue');
  await expect(page.getByRole('heading', { level: 1, name: 'Review queue' })).toBeVisible();
}

const queue_loads = (api: FakeApi) =>
  api.calls.filter((call) => call.route === 'GET /review-queue').length;

test('Dr Lee on the review queue switches to Jane: her diary home, and her queue never loads', async ({
  page,
}) => {
  const api = await install(page, 'lee', { student: TOKEN.jane, supervisor: TOKEN.lee });
  await page.goto('/review-queue');
  await expect_queue(page, 'Dr Lee');
  // Dr Lee's own load (twice in dev, where StrictMode mounts twice).
  const before = queue_loads(api);

  const sheet = await open_switcher(page);
  await sheet.getByRole('button', { name: 'Student', exact: true }).click();

  await expect_diary_home(page, 'Jane N');
  // No more than Dr Lee's own: the queue never mounted for Jane, not even
  // for a frame before the move.
  expect(queue_loads(api)).toBe(before);
});

test("the same with Jane's token newly pasted", async ({ page }) => {
  await install(page, 'lee', { supervisor: TOKEN.lee });
  await page.goto('/review-queue');
  await expect_queue(page, 'Dr Lee');

  const sheet = await open_switcher(page);
  await sheet.getByRole('button', { name: 'Student +' }).click();
  await sheet.getByLabel('Paste the student token').fill(TOKEN.jane);
  await sheet.getByRole('button', { name: 'Use this token' }).click();

  await expect_diary_home(page, 'Jane N');
});

test("Jane on a gig page switches to Sam: Sam's review queue", async ({ page }) => {
  await install(page, 'jane', { student: TOKEN.jane, assessor: TOKEN.sam });
  await page.goto(`/gigs/${GIG_A}`);
  await expect(page.getByRole('banner').getByText('Jane N')).toBeVisible();

  const sheet = await open_switcher(page);
  await sheet.getByRole('button', { name: 'Assessor', exact: true }).click();

  await expect_queue(page, 'Sam O');
});

test('Leave on the review queue, then Jane from the token screen: her diary home', async ({
  page,
}) => {
  await install(page, 'lee', { student: TOKEN.jane, supervisor: TOKEN.lee });
  await page.goto('/review-queue');
  await expect_queue(page, 'Dr Lee');
  await page.getByRole('button', { name: 'Leave the Reflection Diary' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Student', exact: true }).click();

  await expect_diary_home(page, 'Jane N');
});

test("Dr Lee on Frameworks switches to Sam: Sam's review queue", async ({ page }) => {
  await install(page, 'lee', { assessor: TOKEN.sam, supervisor: TOKEN.lee });
  await page.goto('/frameworks');
  await expect(page.getByRole('heading', { level: 1, name: 'Frameworks' })).toBeVisible();

  const sheet = await open_switcher(page);
  await sheet.getByRole('button', { name: 'Assessor', exact: true }).click();

  await expect_queue(page, 'Sam O');
});

test('Jane on her diary home switches to Sam, then to Dr Lee: each lands on their queue', async ({
  page,
}) => {
  await install(page, 'jane', {
    student: TOKEN.jane,
    assessor: TOKEN.sam,
    supervisor: TOKEN.lee,
  });
  await page.goto('/');
  await expect_diary_home(page, 'Jane N');

  let sheet = await open_switcher(page);
  await sheet.getByRole('button', { name: 'Assessor', exact: true }).click();
  await expect_queue(page, 'Sam O');

  sheet = await open_switcher(page);
  await sheet.getByRole('button', { name: 'Supervisor', exact: true }).click();
  await expect_queue(page, 'Dr Lee');
});

test("Sam scoring a reflection switches to Dr Lee: her queue, not Sam's reflection", async ({
  page,
}) => {
  await install(page, 'sam', { assessor: TOKEN.sam, supervisor: TOKEN.lee });
  await page.goto(`/review-queue/reflections/${REFLECTION}`);
  await expect(page.getByRole('banner').getByText('Sam O')).toBeVisible();

  const sheet = await open_switcher(page);
  await sheet.getByRole('button', { name: 'Supervisor', exact: true }).click();

  await expect_queue(page, 'Dr Lee');
});

test('a shared link opened in a fresh tab still opens where it points after the token is pasted', async ({
  page,
}) => {
  await install(page, null, {});
  await page.goto(`/review-queue/reflections/${REFLECTION}`);
  await page.getByRole('button', { name: 'Supervisor +' }).click();
  await page.getByLabel('Paste the supervisor token').fill(TOKEN.lee);
  await page.getByRole('button', { name: 'Use this token' }).click();

  await expect(page.getByRole('banner').getByText('Dr Lee')).toBeVisible();
  await expect(page).toHaveURL(`/review-queue/reflections/${REFLECTION}`);
});

test('Leave and back in as the same person returns to the page they left', async ({
  page,
}) => {
  await install(page, 'lee', { supervisor: TOKEN.lee });
  await page.goto('/frameworks');
  await expect(page.getByRole('heading', { level: 1, name: 'Frameworks' })).toBeVisible();
  await page.getByRole('button', { name: 'Leave the Reflection Diary' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
  await page.getByRole('button', { name: 'Supervisor', exact: true }).click();

  await expect(page.getByRole('banner').getByText('Dr Lee')).toBeVisible();
  await expect(page).toHaveURL('/frameworks');
  await expect(page.getByRole('heading', { level: 1, name: 'Frameworks' })).toBeVisible();
});
