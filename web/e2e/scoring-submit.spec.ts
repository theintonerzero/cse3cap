/**
 * CAP-38 round 3 (Patrick, 2026-10-05): the scoring screen has no
 * per-competency Save. A pick and a comment stay editable until "Submit
 * scores" sends them all. A finished competency still counts in "you have
 * scored X of N". Unfinished work (a score with no comment, a comment with
 * no score) is kept on this device, per person and per reflection, for
 * next time, and cleared once submitted. When something is missing,
 * Submit says which in plain words and sends nothing.
 *
 * The fake does not serve counter-scores, so this spec answers
 * POST /entries/{id}/scores itself and counts what was sent.
 *
 * Self-contained scenario, ids prefixed '3851'.
 */
import { test, expect, type Page, type Route } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionDetail,
} from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `3851${n}-0000-4851-8851-385138513851`;
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

// No comment required by the rubric; a comment is expected only when the
// counter-score is below the student's own (2), mirroring Scoring.php.
const RUBRIC: FrameworkDetail = {
  id: FRAMEWORK,
  fw_key: 'e2e-submit',
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
  framework: { id: FRAMEWORK, fw_key: 'e2e-submit', name: RUBRIC.name, version: 'v1' },
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

/** Installs the fake as Sam and answers counter-score POSTs; returns what was sent. */
async function install(page: Page) {
  const api = new FakeApi([RUBRIC], SAM, [GIG_DETAIL], [REFLECTION]);
  await api.install(page);
  const sent: { entry_id: string; level_id: string; comment: string | null }[] = [];
  await page.route('**/api/v1/entries/*/scores', async (route: Route) => {
    const entry_id = route.request().url().split('/entries/')[1].split('/')[0];
    const body = route.request().postDataJSON() as {
      level_id: string;
      comment: string | null;
    };
    sent.push({ entry_id, ...body });
    const n = REFLECTION.entries.findIndex((entry) => entry.id === entry_id);
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: id(`0s${n}9`),
        reflection_entry_id: entry_id,
        scorer_role: 'assessor',
        scorer_class: 'counter',
        level_id: body.level_id,
        level_value: Number(body.level_id.slice(7, 8)),
        comment: body.comment,
        scored_at: '2026-08-29T10:00:00.000000Z',
        reflection_status: sent.length === NAMES.length ? 'assessed' : 'submitted',
        completed_the_reflection: sent.length === NAMES.length,
      }),
    });
  });
  return sent;
}

const OPEN = `/review-queue/reflections/${REFLECTION_ID}`;
const your_score = (page: Page) => page.getByRole('group', { name: 'Your score' });

test('no per-competency Save: a pick stays changeable and counts as scored', async ({
  page,
}) => {
  const sent = await install(page);
  await page.goto(OPEN);
  await expect(page.getByText('you have scored 0 of 2')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Save score/ })).toHaveCount(0);

  await your_score(page).getByRole('button', { name: /^3 · / }).click();
  await expect(page.getByText('you have scored 1 of 2')).toBeVisible();
  // Still open: a different pick replaces it.
  await your_score(page).getByRole('button', { name: /^4 · / }).click();
  await expect(your_score(page).getByRole('button', { name: /^4 · / })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByText('you have scored 1 of 2')).toBeVisible();
  expect(sent).toEqual([]);
});

test('unfinished work comes back after leaving: a score alone, a comment alone', async ({
  page,
}) => {
  await install(page);
  await page.goto(OPEN);
  await your_score(page).getByRole('button', { name: /^3 · / }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByLabel(/^Why this score/).fill('Half a thought');

  await page.goto('/review-queue');
  await page.goto(OPEN);
  await expect(your_score(page).getByRole('button', { name: /^3 · / })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByLabel(/^Why this score/)).toHaveValue('Half a thought');
});

test("someone else's unfinished work on this device never shows", async ({ page }) => {
  await install(page);
  await page.addInitScript(
    ([reflection_id, entry_id, level_id]) => {
      localStorage.setItem(
        `reflection-diary-counter-drafts:someone-else:${reflection_id}`,
        JSON.stringify({ [entry_id]: { level_id, comment: 'x' } }),
      );
    },
    [REFLECTION_ID, REFLECTION.entries[0].id, level(0, 4)],
  );
  await page.goto(OPEN);
  await expect(page.getByText('you have scored 0 of 2')).toBeVisible();
  await expect(your_score(page).getByRole('button', { name: /^4 · / })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('Submit with a gap: says what is missing in plain words, sends nothing', async ({
  page,
}) => {
  const sent = await install(page);
  await page.goto(OPEN);
  await your_score(page).getByRole('button', { name: /^3 · / }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Submit scores' }).click();

  await expect(page.getByText('Communication (2 of 2) still needs a score.')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Go to / })).toHaveCount(0);
  await expect(page.getByText('Nearly there.')).toHaveCount(0);
  expect(sent).toEqual([]);
});

test('Submit when complete: every score goes, and the device copy is cleared', async ({
  page,
}) => {
  const sent = await install(page);
  await page.goto(OPEN);
  await your_score(page).getByRole('button', { name: /^3 · / }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await your_score(page).getByRole('button', { name: /^2 · / }).click();
  await page.getByRole('button', { name: 'Submit scores' }).click();

  await expect(page.getByText('That was the last one.')).toBeVisible();
  expect(sent.map((score) => score.level_id)).toEqual([level(0, 3), level(1, 2)]);
  const left = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) =>
      key.startsWith('reflection-diary-counter-drafts'),
    ),
  );
  expect(left).toEqual([]);
});
