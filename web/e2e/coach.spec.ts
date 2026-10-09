/**
 * The reflection coach (ADR #64): questions about a draft, never words and
 * never a level. Four states, the 15-word rule, and a reply that stays with
 * the competency it was asked about. Refusals are injected, never re-ruled.
 */
import { test as base } from '@playwright/test';

import { DRAFT, JANE, SUBMITTED, expect, test } from './ai-fixtures.ts';
import { FakeApi } from './fake-api.ts';

const COACH = 'POST /reflections/:id/entries/:id/coach';
const QUESTIONS = {
  questions: ['What happened after you raised the blocker?', 'Who acted on it?'],
};

test.describe('the coach on the owner’s draft', () => {
  test.beforeEach(({ api }) => {
    api.ai_status(['coach']);
    api.ai_reply(COACH, QUESTIONS);
  });

  test('idle: a quiet button, and nothing asked until it is pressed', async ({
    page,
    api,
  }) => {
    await page.goto(`/reflections/${DRAFT}`);
    await expect(page.getByRole('button', { name: 'Ask me questions' })).toBeEnabled();
    expect(api.ai_calls.map((c) => c.route)).toEqual(['GET /status']);
  });

  test('loading, then the questions as plain text with the AI badge', async ({
    page,
    api,
  }) => {
    const release = api.ai_hold(COACH);
    await page.goto(`/reflections/${DRAFT}`);
    await page.getByRole('button', { name: 'Ask me questions' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Finding questions' }),
    ).toBeVisible();
    release();
    const panel = page.getByRole('region', { name: 'Questions to think about' });
    await expect(
      panel.getByText('What happened after you raised the blocker?'),
    ).toBeVisible();
    await expect(panel.getByText('Who acted on it?')).toBeVisible();
    await expect(panel.getByText('AI', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Ask again' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Hide' })).toBeVisible();
    // The coach cannot put words into the narrative.
    await expect(page.getByRole('button', { name: /insert|apply|use this/i })).toHaveCount(
      0,
    );
  });

  test('Hide puts the button back', async ({ page }) => {
    await page.goto(`/reflections/${DRAFT}`);
    await page.getByRole('button', { name: 'Ask me questions' }).click();
    await page.getByRole('button', { name: 'Hide' }).click();
    await expect(
      page.getByRole('region', { name: 'Questions to think about' }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ask me questions' })).toBeVisible();
  });

  test('under 15 words: disabled, and says why', async ({ page }) => {
    await page.goto(`/reflections/${DRAFT}`);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Competency 2 of 2')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask me questions' })).toBeDisabled();
    await expect(page.getByText('Write a few sentences first')).toBeVisible();
  });

  test('error: says so, and the rest of the card is untouched', async ({ page, api }) => {
    api.ai_fail(COACH, {
      kind: 'error',
      status: 503,
      code: 'AI_UNAVAILABLE',
      message: "AI isn't available right now.",
      details: { reason: 'upstream' },
    });
    await page.goto(`/reflections/${DRAFT}`);
    await page.getByRole('button', { name: 'Ask me questions' }).click();
    await expect(page.getByText('Questions aren’t available right now')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Your reflection' })).toBeEditable();
  });

  test('a late reply stays with its competency', async ({ page, api }) => {
    const release = api.ai_hold(COACH);
    await page.goto(`/reflections/${DRAFT}`);
    await page.getByRole('button', { name: 'Ask me questions' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Competency 2 of 2')).toBeVisible();
    release();
    await page.waitForTimeout(300);
    await expect(page.getByText('What happened after you raised the blocker?')).toHaveCount(
      0,
    );
  });
});

test('no coach on a submitted reflection', async ({ page, api }) => {
  api.ai_status(['coach']);
  await page.goto(`/reflections/${SUBMITTED}`);
  await expect(page.getByText('Competency 1 of 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask me questions' })).toHaveCount(0);
});

test('no coach when the sidecar does not serve it', async ({ page, api }) => {
  api.ai_status(['related']);
  await page.goto(`/reflections/${DRAFT}`);
  await expect(page.getByText('Competency 1 of 2')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Ask me questions' })).toHaveCount(0);
});

// A reviewer can read the student's draft through Laravel; it isn't theirs to be coached on.
const as_reviewer = base.extend<{ api: FakeApi }>({
  // auto: built for every test here, which names only `page`.
  api: [
    async ({ page }, provide) => {
      const { RUBRIC_FOR_TESTS, GIG_FOR_TESTS, reflection_for_tests } =
        await import('./ai-fixtures.ts');
      const sam = {
        id: 'sam-not-the-owner',
        display_name: 'Sam O',
        participations: JANE.participations.map((p) => ({
          ...p,
          role: 'assessor' as const,
        })),
      };
      const api = new FakeApi(
        [RUBRIC_FOR_TESTS],
        sam,
        [GIG_FOR_TESTS],
        [reflection_for_tests(DRAFT, 'draft')],
      );
      api.ai_status(['coach']);
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

as_reviewer('no coach in a reviewer’s view of the draft', async ({ page }) => {
  await page.goto(`/reflections/${DRAFT}`);
  await expect(page.getByText('Competency 1 of 2')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: 'Ask me questions' })).toHaveCount(0);
});
