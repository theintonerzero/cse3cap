/**
 * CAP-66: the stacked level pills become one row of numbered levels with the
 * chosen level's words beneath. Each level is a radio named "N of M, <words>";
 * "All levels" is open until a level is chosen, then folds. A pointer choice
 * saves at once; arrow keys save once they stop.
 */
import { test as base, expect, type Page } from '@playwright/test';

import {
  ASSESSED,
  DRAFT,
  LEE_COMMENT,
  LONG_ENTRY,
  SUBMITTED,
  assessed_for_tests,
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

for (const width of [360, 375]) {
  seven.describe(`seven levels at ${width}px`, () => {
    seven.use({ viewport: { width, height: 800 } });

    seven('every level keeps the tap floor on a narrower phone', async ({ page }) => {
      await page.goto(`/reflections/${DRAFT}`);
      const radios = self_score(page).getByRole('radio');
      await expect(radios).toHaveCount(7);
      for (const box of await radios.evaluateAll((els) =>
        els.map((el) => el.getBoundingClientRect().toJSON()),
      )) {
        expect(box.width).toBeGreaterThanOrEqual(44);
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  });
}

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

test.describe('reading scores that can no longer change', () => {
  test('a submitted reflection: the self-score shows, and no level can be chosen', async ({
    page,
  }) => {
    await page.goto(`/reflections/${SUBMITTED}`);
    const radios = self_score(page).getByRole('radio');
    await expect(radios).toHaveCount(4);
    for (const radio of await radios.all()) await expect(radio).toBeDisabled();
    await expect(page.getByRole('button', { name: 'All levels' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  test('an assessed reflection: one scale with both scores, then the comment', async ({
    page,
  }) => {
    await page.goto(`/reflections/${ASSESSED}`);
    const shared = page.getByRole('group', { name: "Your score and Dr Lee's" });
    await expect(shared).toBeVisible();
    // Names and numbers only (CAP-68): what a level means is under All levels.
    const legend = shared.getByRole('list', { name: 'Who chose which level' });
    await expect(legend.getByRole('listitem')).toHaveText(['You · 2', 'Dr Lee · 3']);
    await expect(legend).not.toContainText('Communication at level');
    // Nothing on an assessed reflection can be chosen.
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: "Dr Lee's comment" })).toHaveValue(
      LEE_COMMENT,
    );
    // Score first, then the reflection, then the comment (Patrick, round 2b).
    const tops = [];
    for (const field of [
      shared,
      page.getByRole('textbox', { name: 'Your reflection' }),
      page.getByRole('textbox', { name: "Dr Lee's comment" }),
    ])
      tops.push((await field.boundingBox())!.y);
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
  });
});

// An assessor and a supervisor both scored: both on the scale, both comments.
const two_reviewers = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const r = assessed_for_tests();
      const first = r.entries[0];
      first.scores = [
        ...first.scores,
        {
          ...first.scores[1],
          id: 'sam-counter',
          scorer_role: 'assessor',
          level_id: RUBRIC_FOR_TESTS.competencies[0].levels[2].id,
          level_value: 3,
          comment: 'Clear in standup, every time.',
          scored_at: '2026-09-03T10:00:00.000000Z',
          scorer: { id: 'sam', display_name: 'Sam O' },
        },
      ];
      const api = new FakeApi([RUBRIC_FOR_TESTS], JANE, [GIG_FOR_TESTS], [r]);
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

two_reviewers(
  'two counter-scores: both on the scale, and both comments',
  async ({ page }) => {
    await page.goto(`/reflections/${ASSESSED}`);
    const shared = page.getByRole('group', { name: "Your score, Dr Lee's and Sam O's" });
    await expect(shared.getByText('Dr Lee · 3')).toBeVisible();
    await expect(shared.getByText('Sam O · 3')).toBeVisible();
    await expect(page.getByRole('textbox', { name: "Dr Lee's comment" })).toHaveValue(
      LEE_COMMENT,
    );
    await expect(page.getByRole('textbox', { name: "Sam O's comment" })).toHaveValue(
      'Clear in standup, every time.',
    );
  },
);

// Sam assesses Jane's submitted sprint 2; she chose 2 on Communication.
const SAM = {
  id: 'sam-the-assessor',
  display_name: 'Sam O',
  participations: JANE.participations.map((p) => ({ ...p, role: 'assessor' as const })),
};
function submitted_with_self(given: boolean) {
  const r = reflection_for_tests(SUBMITTED, 'submitted');
  const first = r.entries[0];
  const level = (n: number) => RUBRIC_FOR_TESTS.competencies[0].levels[n - 1];
  first.scores = [
    {
      id: 'jane-self',
      reflection_entry_id: first.id,
      scorer_role: 'student',
      scorer_class: 'self',
      level_id: level(2).id,
      level_value: 2,
      comment: null,
      scored_at: '2026-08-27T10:00:00.000000Z',
      scorer: { id: JANE.id, display_name: JANE.display_name },
    },
    ...(given
      ? [
          {
            id: 'sam-counter',
            reflection_entry_id: first.id,
            scorer_role: 'assessor' as const,
            scorer_class: 'counter' as const,
            level_id: level(3).id,
            level_value: 3,
            comment: 'Raised it unprompted.',
            scored_at: '2026-09-01T10:00:00.000000Z',
            scorer: { id: SAM.id, display_name: SAM.display_name },
          },
        ]
      : []),
  ];
  return r;
}
const as_sam = (given: boolean) =>
  base.extend<{ api: FakeApi }>({
    api: [
      async ({ page }, provide) => {
        const api = new FakeApi(
          [RUBRIC_FOR_TESTS],
          SAM,
          [GIG_FOR_TESTS],
          [submitted_with_self(given)],
        );
        await api.install(page);
        await provide(api);
        expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
      },
      { auto: true },
    ],
  });
const scoring = as_sam(false);
const scored = as_sam(true);
const your_score = (page: Page) => page.getByRole('radiogroup', { name: 'Your score' });

scoring(
  "the assessor's own scale marks the student's level, and picking sends nothing",
  async ({ page, api }) => {
    await page.goto(`/review-queue/reflections/${SUBMITTED}`);
    await expect(
      your_score(page).getByRole('radio', { name: /^2 of 4, .*Jane N chose this level$/ }),
    ).toBeVisible();
    await expect(page.getByText('Jane N chose 2')).toBeVisible();
    await your_score(page)
      .getByRole('radio', { name: /^3 of 4/ })
      .click();
    await expect(your_score(page).getByRole('radio', { name: /^3 of 4/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.getByText('3 · Communication at level 3.')).toBeVisible();
    // ADR #57: nothing is sent until "Submit scores".
    expect(api.writes()).toEqual([]);
  },
);

scored('a given score shows on a scale that can no longer change', async ({ page }) => {
  // Sam has scored the first competency, so open it by name: the stepper
  // would otherwise land on the first one he still owes.
  await page.goto(`/review-queue/reflections/${SUBMITTED}?entry=${LONG_ENTRY}`);
  const radios = your_score(page).getByRole('radio');
  await expect(radios).toHaveCount(4);
  for (const radio of await radios.all()) await expect(radio).toBeDisabled();
  await expect(your_score(page).getByRole('radio', { name: /^3 of 4/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('an arrow-key choice is saved even when Next comes before it settles', async ({
  page,
  api,
}) => {
  await page.goto(`/reflections/${DRAFT}`);
  await self_score(page)
    .getByRole('radio', { name: /^2 of 4/ })
    .click();
  await expect.poll(() => saves(api).length).toBe(1);
  await page.keyboard.press('ArrowRight');
  // At once, well inside the half-second the arrows wait for.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByText('Competency 2 of 2')).toBeVisible();
  await expect.poll(() => saves(api).length).toBe(2);
  expect(saves(api)[1].body).toEqual({
    level_id: RUBRIC_FOR_TESTS.competencies[0].levels[2].id,
  });
});

// Dr Lee, a reviewer on the gig, opens Jane's assessed reflection by its URL.
const as_lee = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const lee = {
        id: assessed_for_tests().entries[0].scores[1].scorer!.id,
        display_name: 'Dr Lee',
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
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

as_lee("someone else's view names the student, never 'You'", async ({ page }) => {
  await page.goto(`/reflections/${ASSESSED}`);
  const shared = page.getByRole('group', { name: "Jane N's score and Dr Lee's" });
  await expect(
    shared.getByRole('listitem').filter({ hasText: 'Jane N · 2' }),
  ).toBeVisible();
  await expect(shared.getByRole('listitem').filter({ hasText: 'You ·' })).toHaveCount(0);
});

test('two saves answered out of order: the scale keeps the later choice', async ({
  page,
}) => {
  // The first save is slow and the second quick, so their answers cross.
  const levels = RUBRIC_FOR_TESTS.competencies[0].levels;
  await page.route('**/api/v1/entries/*/scores/self', async (route) => {
    const { level_id } = route.request().postDataJSON() as { level_id: string };
    if (level_id === levels[1].id) await new Promise((r) => setTimeout(r, 700));
    const level = levels.find((l) => l.id === level_id)!;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: `self-${level.level_value}`,
        reflection_entry_id: 'x',
        scorer_role: 'student',
        scorer_class: 'self',
        level_id,
        level_value: level.level_value,
        comment: null,
        scored_at: '2026-10-05T00:00:00.000000Z',
        scorer: { id: JANE.id, display_name: JANE.display_name },
      }),
    });
  });
  await page.goto(`/reflections/${DRAFT}`);
  await self_score(page)
    .getByRole('radio', { name: /^2 of 4/ })
    .click();
  await self_score(page)
    .getByRole('radio', { name: /^3 of 4/ })
    .click();
  await page.waitForTimeout(1200);
  await expect(self_score(page).getByRole('radio', { name: /^3 of 4/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('after a failed arrow-key save, the next arrow moves from where focus is', async ({
  page,
  api,
}) => {
  await page.goto(`/reflections/${DRAFT}`);
  await self_score(page)
    .getByRole('radio', { name: /^2 of 4/ })
    .click();
  await expect.poll(() => saves(api).length).toBe(1);
  api.fail(SAVE, { kind: 'error', status: 400, code: 'VALIDATION_FAILED', message: 'No.' });
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('alert')).toContainText('No.');
  await expect(self_score(page).getByRole('radio', { name: /^3 of 4/ })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(self_score(page).getByRole('radio', { name: /^4 of 4/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('the shared scale colours each person, and All levels marks whose level is whose', async ({
  page,
}) => {
  await page.goto(`/reflections/${ASSESSED}`);
  const shared = page.getByRole('group', { name: "Your score and Dr Lee's" });
  const background = (n: number) =>
    shared
      .locator('[aria-hidden="true"] > *')
      .nth(n - 1)
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  const token = (name: string) =>
    page.evaluate((n) => {
      const probe = document.createElement('div');
      probe.style.background = `var(${n})`;
      document.body.append(probe);
      const colour = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return colour;
    }, name);
  expect(await background(2)).toBe(await token('--color-primary'));
  expect(await background(3)).toBe(await token('--color-success'));
  expect(await background(1)).not.toBe(await token('--color-primary'));
  await shared.getByRole('button', { name: 'All levels' }).click();
  await expect(shared.locator('ol > li').nth(1)).toContainText('You');
  await expect(shared.locator('ol > li').nth(2)).toContainText('Dr Lee');
  await expect(shared.locator('ol > li').nth(0)).not.toContainText('You');
});
