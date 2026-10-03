/**
 * CAP-38 round 2b: moving through a reflection. Back and Next take the
 * reader to the top and put focus on the new competency's name, because
 * two competencies' score chips can look nearly the same and nothing else
 * says the page changed. And the page names its gig and sprint.
 *
 * Self-contained scenario, ids prefixed '3850'.
 */
import { test as base, expect } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionDetail,
} from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `3850${n}-0000-4850-8850-385038503850`;
const GIG = id('0001');
const FRAMEWORK = id('0002');
const SPRINT = id('0003');
const DRAFT = id('0005');

const JANE: Me = {
  id: id('0007'),
  display_name: 'Jane D',
  participations: [{ gig_id: GIG, gig_title: 'Develop AI use cases', role: 'student' }],
};

const NAMES = ['Contribution', 'Communication'];

const RUBRIC: FrameworkDetail = {
  id: FRAMEWORK,
  fw_key: 'latrobe6',
  version: 'v1',
  name: 'La Trobe six-competency',
  created_by: null,
  in_use: true,
  comment_required: true,
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
      id: id(`0${n}l${value}`),
      level_value: value,
      descriptor: `${name} at level ${value}, written long enough to wrap on a phone.`,
    })),
  })),
};

const GIG_DETAIL: GigDetail = {
  id: GIG,
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [{ id: SPRINT, ordinal: 2, opens_on: '2026-08-15', due_on: '2026-08-28' }],
  framework: { id: FRAMEWORK, fw_key: 'latrobe6', name: RUBRIC.name, version: 'v1' },
  reflection_summary: { draft: 1, submitted: 0, assessed: 0 },
  participants: [{ id: JANE.id, display_name: JANE.display_name, role: 'student' }],
};

const REFLECTION: ReflectionDetail = {
  id: DRAFT,
  status: 'draft',
  gig_id: GIG,
  sprint_id: SPRINT,
  sprint_ordinal: 2,
  framework_id: FRAMEWORK,
  framework_version: 'v1',
  submitted_at: null,
  created_at: '2026-08-16T10:00:00.000000Z',
  updated_at: '2026-08-17T10:00:00.000000Z',
  owner: { id: JANE.id, display_name: JANE.display_name },
  entries: NAMES.map((name, n) => ({
    id: id(`00e${n}`),
    competency_id: id(`00c${n}`),
    competency_code: name.toLowerCase(),
    competency_name: name,
    short_label: null,
    position: n + 1,
    narrative: `What I did for ${name.toLowerCase()} this sprint. `.repeat(12),
    evidence: [],
    scores: [],
  })),
};

const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi([RUBRIC], JANE, [GIG_DETAIL], [REFLECTION]);
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

test.describe('Back and Next', () => {
  test.use({ reducedMotion: 'reduce' });

  test('Next goes to the top and focuses the new competency', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto(`/reflections/${DRAFT}`);
    await expect(page.getByText('Competency 1 of 2')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Competency 2 of 2')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByText('Communication', { exact: true })).toBeFocused();
  });

  test('Back does the same', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto(`/reflections/${DRAFT}`);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Competency 2 of 2')).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByText('Competency 1 of 2')).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByText('Contribution', { exact: true })).toBeFocused();
  });

  test('opening a reflection does not move focus to the competency', async ({ page }) => {
    await page.goto(`/reflections/${DRAFT}`);
    await expect(page.getByText('Competency 1 of 2')).toBeVisible();
    await expect(page.getByText('Contribution', { exact: true })).not.toBeFocused();
  });
});

test.describe('the heading', () => {
  test('names the gig and the sprint', async ({ page }) => {
    await page.goto(`/reflections/${DRAFT}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Develop AI use cases · Sprint 2',
    );
  });

  test('still names the sprint when the gig cannot be read', async ({ page, api }) => {
    api.fail('GET /gigs/:id', { kind: 'network' });
    await page.goto(`/reflections/${DRAFT}`);
    await expect(page.getByText('Competency 1 of 2')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sprint 2');
  });
});

// The assessor's side: a submitted reflection with nothing counter-scored,
// so "Save all scores" lists a "Go to <competency>" for every entry.
const SAM: Me = {
  id: id('0008'),
  display_name: 'Sam O',
  participations: [{ gig_id: GIG, gig_title: 'Develop AI use cases', role: 'assessor' }],
};
const SUBMITTED = id('0006');
const TO_SCORE: ReflectionDetail = {
  ...REFLECTION,
  id: SUBMITTED,
  status: 'submitted',
  submitted_at: '2026-08-28T10:00:00.000000Z',
  entries: REFLECTION.entries.map((entry, n) => ({
    ...entry,
    scores: [
      {
        id: id(`0s${n}0`),
        reflection_entry_id: entry.id,
        scorer_role: 'student',
        scorer_class: 'self',
        level_id: id(`0${n}l3`),
        level_value: 3,
        comment: null,
        scored_at: '2026-08-27T10:00:00.000000Z',
        scorer: { id: JANE.id, display_name: JANE.display_name },
      },
    ],
  })),
};

/** The same reflection once Sam has counter-scored every entry. */
const SCORED = id('0009');
const DONE: ReflectionDetail = {
  ...TO_SCORE,
  id: SCORED,
  status: 'assessed',
  entries: TO_SCORE.entries.map((entry, n) => ({
    ...entry,
    scores: [
      ...entry.scores,
      {
        id: id(`0s${n}1`),
        reflection_entry_id: entry.id,
        scorer_role: 'assessor',
        scorer_class: 'counter',
        level_id: id(`0${n}l3`),
        level_value: 3,
        comment: null,
        scored_at: '2026-08-29T10:00:00.000000Z',
        scorer: { id: SAM.id, display_name: SAM.display_name },
      },
    ],
  })),
};

const assessor_test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi(
        [RUBRIC],
        SAM,
        [{ ...GIG_DETAIL, my_role: 'assessor' }],
        [TO_SCORE, DONE],
      );
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

assessor_test.describe('the assessor', () => {
  assessor_test.use({ reducedMotion: 'reduce' });

  assessor_test(
    '"Go to" the competency already open still goes to its top',
    async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 600 });
      await page.goto(`/review-queue/reflections/${SUBMITTED}`);
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(page.getByText('Competency 2 of 2')).toBeVisible();
      await page.getByRole('button', { name: 'Save all scores' }).click();
      const go = page.getByRole('button', { name: 'Go to Communication' });
      await go.scrollIntoViewIfNeeded();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

      await go.click();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
      await expect(page.getByText('Communication', { exact: true })).toBeFocused();
    },
  );

  for (const [reflection, label] of [
    [SUBMITTED, 'Save all scores'],
    [SCORED, 'Back to the queue'],
  ] as const) {
    assessor_test(`360: "${label}" keeps its label on one line`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 640 });
      await page.goto(`/review-queue/reflections/${reflection}`);
      await page.getByRole('button', { name: 'Next', exact: true }).click();
      const back = page.getByRole('button', { name: 'Back', exact: true });
      const forward = page.getByRole('button', { name: label, exact: true });
      await expect(forward).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const b = (await back.boundingBox())!;
      const f = (await forward.boundingBox())!;
      expect(Math.abs(f.height - b.height), 'same height as Back').toBeLessThanOrEqual(1);
      expect(f.x + f.width, 'inside the screen').toBeLessThanOrEqual(360);
    });
  }
});

// GET /reflections/{id} leaves sprint_ordinal out when the sprint is not
// loaded (ReflectionResource whenLoaded('sprint'), and the detail endpoint
// does not load it), so the page must find the sprint through the gig.
const LIKE_THE_API = id('000a');
const { sprint_ordinal: _left_out, ...WITHOUT_ORDINAL } = REFLECTION;
const api_shaped_test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi(
        [RUBRIC],
        JANE,
        [GIG_DETAIL],
        [{ ...WITHOUT_ORDINAL, id: LIKE_THE_API } as ReflectionDetail],
      );
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

api_shaped_test(
  'the heading names the sprint even when the reflection leaves its number out',
  async ({ page }) => {
    await page.goto(`/reflections/${LIKE_THE_API}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Develop AI use cases · Sprint 2',
    );
  },
);
