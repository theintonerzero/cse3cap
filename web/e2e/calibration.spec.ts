/**
 * The calibration coach (ADR #64): once a reflection is assessed, and only
 * where the student and their reviewer chose different levels, questions
 * about why they might see it differently. Asked for, never automatic.
 * Refusals are injected, never re-ruled.
 */
import { test as base } from '@playwright/test';

import { ASSESSED, JANE, SUBMITTED, expect, test } from './ai-fixtures.ts';
import { FakeApi } from './fake-api.ts';

const CALIBRATION = 'POST /reflections/:id/entries/:id/calibration';
const QUESTIONS = {
  questions: [
    'What did Dr Lee see that your reflection leaves out?',
    'How often did it happen?',
  ],
};
const ASK = 'Think about the difference';

test.describe('on the student’s assessed reflection', () => {
  test.beforeEach(({ api }) => {
    api.ai_status(['calibration']);
    api.ai_reply(CALIBRATION, QUESTIONS);
  });

  test('a quiet button under the reviewer’s score, and nothing asked until pressed', async ({
    page,
    api,
  }) => {
    await page.goto(`/reflections/${ASSESSED}`);
    await expect(
      page.getByText('Dr Lee’s score').or(page.getByText("Dr Lee's score")),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: ASK })).toBeVisible();
    expect(api.ai_calls.map((c) => c.route)).toEqual(['GET /status']);
  });

  test('loading, then the questions under a title naming the reviewer', async ({
    page,
    api,
  }) => {
    const release = api.ai_hold(CALIBRATION);
    await page.goto(`/reflections/${ASSESSED}`);
    await page.getByRole('button', { name: ASK }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Finding questions' }),
    ).toBeVisible();
    release();
    const panel = page.getByRole('region', {
      name: 'Why might you and Dr Lee see this differently?',
    });
    await expect(panel.getByText(QUESTIONS.questions[0])).toBeVisible();
    await expect(panel.getByText('AI', { exact: true })).toBeVisible();
  });

  test('Hide puts the button back', async ({ page }) => {
    await page.goto(`/reflections/${ASSESSED}`);
    await page.getByRole('button', { name: ASK }).click();
    await page.getByRole('button', { name: 'Hide', exact: true }).click();
    await expect(page.getByRole('button', { name: ASK })).toBeVisible();
  });

  test('where the two scores agree, no button', async ({ page }) => {
    await page.goto(`/reflections/${ASSESSED}`);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Competency 2 of 2')).toBeVisible();
    await expect(page.getByRole('button', { name: ASK })).toHaveCount(0);
  });

  test('error: says so, and the scores are untouched', async ({ page, api }) => {
    api.ai_fail(CALIBRATION, {
      kind: 'error',
      status: 503,
      code: 'AI_UNAVAILABLE',
      message: 'x',
      details: { reason: 'upstream' },
    });
    await page.goto(`/reflections/${ASSESSED}`);
    await page.getByRole('button', { name: ASK }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Questions aren’t available right now' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: ASK })).toBeVisible();
  });

  test('rate-limited: says when to try again', async ({ page, api }) => {
    api.ai_fail(CALIBRATION, {
      kind: 'error',
      status: 429,
      code: 'AI_RATE_LIMITED',
      message: 'x',
      details: { retry_after: 30 },
    });
    await page.goto(`/reflections/${ASSESSED}`);
    await page.getByRole('button', { name: ASK }).click();
    await expect(
      page.getByText('You’ve asked a lot just now. Try again in a minute.'),
    ).toBeVisible();
  });
});

test('nothing on a reflection still waiting for its scores', async ({ page, api }) => {
  api.ai_status(['calibration']);
  await page.goto(`/reflections/${SUBMITTED}`);
  await expect(page.getByText('Competency 1 of 2')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: ASK })).toHaveCount(0);
});

test('nothing when the sidecar does not serve it', async ({ page, api }) => {
  api.ai_status(['coach']);
  await page.goto(`/reflections/${ASSESSED}`);
  await expect(page.getByText('Competency 1 of 2')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: ASK })).toHaveCount(0);
});

// Dr Lee can read Jane's assessed reflection; the difference is Jane's to think about.
const as_reviewer = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const { RUBRIC_FOR_TESTS, GIG_FOR_TESTS, assessed_for_tests, LEE } =
        await import('./ai-fixtures.ts');
      const lee = {
        ...LEE,
        participations: JANE.participations.map((p) => ({
          ...p,
          role: 'supervisor' as const,
        })),
      };
      const api = new FakeApi(
        [RUBRIC_FOR_TESTS],
        lee,
        [GIG_FOR_TESTS],
        [assessed_for_tests()],
      );
      api.ai_status(['calibration']);
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

as_reviewer('nothing in the reviewer’s view of it', async ({ page }) => {
  await page.goto(`/review-queue/reflections/${ASSESSED}`);
  await expect(page.getByText('Competency 1 of 2')).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.getByRole('button', { name: ASK })).toHaveCount(0);
});
