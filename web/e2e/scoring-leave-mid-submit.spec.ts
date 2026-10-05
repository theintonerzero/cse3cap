/**
 * CAP-38 pre-PR review (2026-10-06): leaving the scoring screen while
 * "Submit scores" is still sending. The sends carry on, but the screen is
 * gone, so a refusal is never seen. What this device keeps must still say
 * what happened: a score the server took is forgotten, and one it refused
 * is not counted as ready on the queue's Entries bar (ADR #57).
 *
 * The fake does not serve counter-scores, so this spec answers
 * POST /entries/{id}/scores itself: the first is held until Sam has left,
 * then taken; the second is refused.
 *
 * Self-contained scenario, ids prefixed '3854'.
 */
import { test, expect, type Page, type Route } from '@playwright/test';

import type { components, paths } from '../src/api/schema.ts';
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionDetail,
} from './fake-api.ts';

type Me = components['schemas']['Me'];
type QueueEntry =
  paths['/review-queue']['get']['responses']['200']['content']['application/json'][number];

const id = (n: string) => `3854${n}-0000-4854-8854-385438543854`;
const GIG = id('0001');
const FRAMEWORK = id('0002');
const SPRINT = id('0003');
const REFLECTION_ID = id('0004');
const NAMES = ['Collaboration', 'Communication'];
const level = (n: number, value: number) => id(`0${n}l${value}`);

const JANE = { id: id('0007'), display_name: 'Jane N' };
const SAM: Me = {
  id: id('0008'),
  display_name: 'Sam O',
  participations: [{ gig_id: GIG, gig_title: 'Develop AI use cases', role: 'assessor' }],
};

const RUBRIC: FrameworkDetail = {
  id: FRAMEWORK,
  fw_key: 'e2e-leave',
  version: 'v1',
  name: 'E2E rubric',
  created_by: null,
  in_use: true,
  comment_required: false,
  evidence_required: false,
  accepted_file_types: ['pdf'],
  max_file_bytes: 10485760,
  scale: { min: 1, max: 4 },
  competencies: NAMES.map((name, n) => ({
    id: id(`00c${n}`),
    code: name.toLowerCase(),
    name,
    short_label: null,
    category: null,
    position: n + 1,
    levels: [1, 2, 3, 4].map((value) => ({
      id: level(n, value),
      level_value: value,
      descriptor: `Level ${value}`,
    })),
  })),
};

const GIG_DETAIL: GigDetail = {
  id: GIG,
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'assessor',
  sprints: [{ id: SPRINT, ordinal: 2, opens_on: '2026-08-15', due_on: '2026-08-28' }],
  framework: { id: FRAMEWORK, fw_key: 'e2e-leave', name: RUBRIC.name, version: 'v1' },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [],
};

const REFLECTION: ReflectionDetail = {
  id: REFLECTION_ID,
  status: 'submitted',
  gig_id: GIG,
  sprint_id: SPRINT,
  sprint_ordinal: 2,
  framework_id: FRAMEWORK,
  framework_version: 'v1',
  submitted_at: '2026-08-28T10:00:00.000000Z',
  created_at: '2026-08-16T10:00:00.000000Z',
  updated_at: '2026-08-28T10:00:00.000000Z',
  owner: JANE,
  entries: NAMES.map((name, n) => ({
    id: id(`00e${n}`),
    competency_id: id(`00c${n}`),
    competency_code: name.toLowerCase(),
    competency_name: name,
    short_label: null,
    position: n + 1,
    narrative: `What I did for ${name.toLowerCase()}.`,
    evidence: [],
    scores: [
      {
        id: id(`0s${n}0`),
        reflection_entry_id: id(`00e${n}`),
        scorer_role: 'student',
        scorer_class: 'self',
        level_id: level(n, 2),
        level_value: 2,
        comment: null,
        scored_at: '2026-08-27T10:00:00.000000Z',
        scorer: JANE,
      },
    ],
  })),
};

// After the first score lands, the server has one of Sam's two.
const ROW: QueueEntry = {
  reflection_id: REFLECTION_ID,
  student: JANE,
  gig_id: GIG,
  gig_title: 'Develop AI use cases',
  sprint_id: SPRINT,
  sprint_ordinal: 2,
  submitted_at: '2026-08-28T10:00:00.000000Z',
  progress: { scored_by_me: 0, entries: 2 },
};

const KEY = `reflection-diary-counter-drafts:${SAM.id}:${REFLECTION_ID}`;
const OPEN = `/review-queue/reflections/${REFLECTION_ID}`;
const your_score = (page: Page) => page.getByRole('group', { name: 'Your score' });

/**
 * Installs the fake as Sam. The first score is held until `let_first_go`,
 * then taken; the second is refused. `answered` counts replies sent.
 */
async function install(page: Page) {
  const api = new FakeApi([RUBRIC], SAM, [GIG_DETAIL], [REFLECTION]);
  await api.install(page);
  let scored_by_me = 0;
  await page.route('**/api/v1/review-queue', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ ...ROW, progress: { scored_by_me, entries: 2 } }]),
    }),
  );

  let let_first_go = () => {};
  const first_held = new Promise<void>((resolve) => (let_first_go = resolve));
  let answered = 0;
  await page.route('**/api/v1/entries/*/scores', async (route: Route) => {
    const entry_id = route.request().url().split('/entries/')[1].split('/')[0];
    const body = route.request().postDataJSON() as { level_id: string };
    if (entry_id === REFLECTION.entries[0].id) {
      await first_held;
      scored_by_me = 1;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: id('0s09'),
          reflection_entry_id: entry_id,
          scorer_role: 'assessor',
          scorer_class: 'counter',
          level_id: body.level_id,
          level_value: 3,
          comment: null,
          scored_at: '2026-08-29T10:00:00.000000Z',
          reflection_status: 'submitted',
          completed_the_reflection: false,
        }),
      });
    } else {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'VALIDATION_FAILED', message: 'Refused.', details: {} },
        }),
      });
    }
    answered += 1;
  });
  return { let_first_go, answered: () => answered };
}

/** Picks a 3 then a 2 and presses Submit scores. */
async function score_both_and_submit(page: Page) {
  await page.goto(OPEN);
  await your_score(page).getByRole('button', { name: /^3 · / }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await your_score(page).getByRole('button', { name: /^2 · / }).click();
  await page.getByRole('button', { name: 'Submit scores' }).click();
}

const kept = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), KEY);
const REFUSED_NOT_READY = {
  [REFLECTION.entries[1].id]: { level_id: level(1, 2), comment: '', done: false },
};

test('leaving during Submit scores: a refused score is not counted as ready', async ({
  page,
}) => {
  const fake = await install(page);
  await score_both_and_submit(page);

  // Sam leaves by the bar's back arrow while the first score is in flight.
  await page.getByRole('link', { name: /^Back to / }).click();
  await expect(page).toHaveURL(/\/review-queue$/);
  fake.let_first_go();
  await expect.poll(fake.answered).toBe(2);

  // The taken score is forgotten; the refused one is kept, but not as ready.
  await expect.poll(() => kept(page)).toEqual(REFUSED_NOT_READY);

  // Back on the queue: one sent, nothing ready, so 1 of 2, not 2 of 2.
  await page.goto('/review-queue');
  await expect(page.getByRole('link', { name: /^Jane N,/ })).toContainText(
    'Entries 1 of 2',
  );
});

test('staying to see the refusal, then leaving: still not counted as ready', async ({
  page,
}) => {
  const fake = await install(page);
  fake.let_first_go();
  await score_both_and_submit(page);
  await expect(page.getByText('Refused.')).toBeVisible();

  await page.getByRole('link', { name: /^Back to / }).click();
  await expect(page.getByRole('link', { name: /^Jane N,/ })).toContainText(
    'Entries 1 of 2',
  );
  expect(await kept(page)).toEqual(REFUSED_NOT_READY);
});
