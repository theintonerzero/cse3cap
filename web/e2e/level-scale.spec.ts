/**
 * CAP-66: the stacked level pills become one row of numbered levels with the
 * chosen level's words beneath. Each level is a radio named "N of M, <words>";
 * "All levels" is open until a level is chosen, then folds. A pointer choice
 * saves at once; arrow keys save once they stop.
 */
import { test as base, expect, type Page } from '@playwright/test';

import {
  DRAFT,
  GIG_FOR_TESTS,
  JANE,
  RUBRIC_FOR_TESTS,
  reflection_for_tests,
  test,
} from './ai-fixtures.ts';
import { FakeApi, type FrameworkDetail } from './fake-api.ts';

const SAVE = 'PUT /entries/:id/scores/self';
const self_score = (page: Page) => page.getByRole('radiogroup', { name: 'Self-score' });
const saves = (api: FakeApi) => api.writes().filter((call) => call.route === SAVE);

test.describe('choosing your self-score', () => {
  test('one radio per level, named with its number and words', async ({ page }) => {
    await page.goto(`/reflections/${DRAFT}`);
    const radios = self_score(page).getByRole('radio');
    await expect(radios).toHaveCount(4);
    await expect(
      self_score(page).getByRole('radio', { name: '2 of 4, Communication at level 2.' }),
    ).toBeVisible();
  });

  test('nothing chosen: the levels are listed, and the words line says so', async ({
    page,
  }) => {
    await page.goto(`/reflections/${DRAFT}`);
    await expect(page.getByRole('button', { name: 'Hide levels' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(page.getByText('No level yet.', { exact: false })).toBeVisible();
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Communication at level 3.' }),
    ).toBeVisible();
  });

  test('a tap saves once, shows the words, and folds the list; All levels reopens it', async ({
    page,
    api,
  }) => {
    await page.goto(`/reflections/${DRAFT}`);
    await self_score(page)
      .getByRole('radio', { name: /^2 of 4/ })
      .click();
    await expect(self_score(page).getByRole('radio', { name: /^2 of 4/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByText('2 · Communication at level 2.')).toBeVisible();
    const toggle = page.getByRole('button', { name: 'All levels' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(saves(api)).toHaveLength(1);
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Hide levels' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  test('arrow keys move the choice and save once, where they stop', async ({
    page,
    api,
  }) => {
    await page.goto(`/reflections/${DRAFT}`);
    await self_score(page)
      .getByRole('radio', { name: /^2 of 4/ })
      .click();
    await expect.poll(() => saves(api).length).toBe(1);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(self_score(page).getByRole('radio', { name: /^4 of 4/ })).toBeFocused();
    await expect(self_score(page).getByRole('radio', { name: /^4 of 4/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect.poll(() => saves(api).length).toBe(2);
    await page.waitForTimeout(800);
    expect(saves(api)).toHaveLength(2);
    expect(saves(api)[1].body).toEqual({
      level_id: RUBRIC_FOR_TESTS.competencies[0].levels[3].id,
    });
  });

  test('a failed save says so, and the scale keeps the level that was saved', async ({
    page,
    api,
  }) => {
    api.fail(SAVE, {
      kind: 'error',
      status: 400,
      code: 'VALIDATION_FAILED',
      message: 'No.',
    });
    await page.goto(`/reflections/${DRAFT}`);
    await self_score(page)
      .getByRole('radio', { name: /^3 of 4/ })
      .click();
    await expect(page.getByRole('alert')).toContainText('No.');
    await expect(self_score(page).getByRole('radio', { name: /^3 of 4/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});

// SFIA's seven levels on a phone: every level keeps the tap floor.
const SEVEN: FrameworkDetail = {
  ...RUBRIC_FOR_TESTS,
  competencies: RUBRIC_FOR_TESTS.competencies.map((c, n) => ({
    ...c,
    levels: [1, 2, 3, 4, 5, 6, 7].map((value) => ({
      id: `6400${n}7${value}0-0000-4640-8640-640064006400`,
      level_value: value,
      descriptor: [
        'Follow',
        'Assist',
        'Apply',
        'Enable',
        'Ensure / advise',
        'Initiate / influence',
        'Set strategy / inspire',
      ][value - 1],
    })),
  })),
  scale: { min: 1, max: 7 },
};
const seven = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi(
        [SEVEN],
        JANE,
        [GIG_FOR_TESTS],
        [reflection_for_tests(DRAFT, 'draft')],
      );
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

seven.describe('seven levels at 390px', () => {
  seven.use({ viewport: { width: 390, height: 844 } });

  seven(
    'every level keeps the tap floor, and nothing scrolls sideways',
    async ({ page }) => {
      await page.goto(`/reflections/${DRAFT}`);
      const radios = self_score(page).getByRole('radio');
      await expect(radios).toHaveCount(7);
      for (const box of await radios.evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().toJSON()),
      )) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    },
  );
});
