/**
 * HO-9 (ADR #64): a cohort search result opens the reviewer's stepper at the
 * competency it matched, by `?entry=`. Without it, or with an entry that
 * isn't on this reflection, the stepper lands where it always has: the first
 * competency the reviewer still owes a score.
 */
import { test as base, expect } from '@playwright/test';

import {
  GIG_FOR_TESTS,
  JANE,
  LONG_ENTRY,
  RUBRIC_FOR_TESTS,
  SHORT_ENTRY,
  SUBMITTED,
  reflection_for_tests,
} from './ai-fixtures.ts';
import { FakeApi } from './fake-api.ts';

const SAM = {
  id: 'sam-the-assessor',
  display_name: 'Sam O',
  participations: JANE.participations.map((p) => ({ ...p, role: 'assessor' as const })),
};

function test_with(scored_first: boolean) {
  return base.extend<{ api: FakeApi }>({
    api: [
      async ({ page }, provide) => {
        const reflection = reflection_for_tests(SUBMITTED, 'submitted');
        if (scored_first) {
          const first = reflection.entries[0];
          first.scores = [
            {
              id: 'sam-score-1',
              reflection_entry_id: first.id,
              scorer_role: 'assessor',
              scorer_class: 'counter',
              level_id: RUBRIC_FOR_TESTS.competencies[0].levels[2].id,
              level_value: 3,
              comment: 'Clear.',
              scored_at: '2026-09-01T10:00:00.000000Z',
              scorer: { id: SAM.id, display_name: SAM.display_name },
            },
          ];
        }
        const api = new FakeApi([RUBRIC_FOR_TESTS], SAM, [GIG_FOR_TESTS], [reflection]);
        await api.install(page);
        await provide(api);
        expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
      },
      { auto: true },
    ],
  });
}

const none_scored = test_with(false);
const first_scored = test_with(true);
const at = (entry: string) => `/review-queue/reflections/${SUBMITTED}?entry=${entry}`;

none_scored('?entry= opens at that competency', async ({ page }) => {
  await page.goto(at(SHORT_ENTRY));
  await expect(page.getByText('Competency 2 of 2')).toBeVisible();
});

none_scored('an entry not on this reflection lands as before', async ({ page }) => {
  await page.goto(at('6400ffff-0000-4640-8640-640064006400'));
  await expect(page.getByText('Competency 1 of 2')).toBeVisible();
});

none_scored('no ?entry= lands as before', async ({ page }) => {
  await page.goto(`/review-queue/reflections/${SUBMITTED}`);
  await expect(page.getByText('Competency 1 of 2')).toBeVisible();
});

first_scored(
  'the named competency wins over the first one still owed',
  async ({ page }) => {
    await page.goto(at(LONG_ENTRY));
    await expect(page.getByText('Competency 1 of 2')).toBeVisible();
  },
);

first_scored('without it, the first one still owed', async ({ page }) => {
  await page.goto(`/review-queue/reflections/${SUBMITTED}`);
  await expect(page.getByText('Competency 2 of 2')).toBeVisible();
});
