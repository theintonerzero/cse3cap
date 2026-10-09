/**
 * Similar past reflections (ADR #64): the student's own earlier entries that
 * read alike, collapsed under the coach. A row opens that entry read-only in
 * a sheet, and closing it keeps the student's place.
 */
import {
  DRAFT,
  EARLIER,
  EARLIER_ENTRY,
  EARLIER_TEXT,
  expect,
  test,
} from './ai-fixtures.ts';

const RELATED = 'GET /reflections/:id/entries/:id/related';
const TWO = {
  entries: [
    {
      reflection_id: EARLIER,
      entry_id: EARLIER_ENTRY,
      sprint_ordinal: 1,
      competency_name: 'Communication',
      excerpt: 'In sprint one I raised a blocker about the test database in standup…',
    },
    {
      reflection_id: EARLIER,
      entry_id: EARLIER_ENTRY.replace('01e0', '01e9'),
      sprint_ordinal: 1,
      competency_name: 'Contribution',
      excerpt: 'I took the migration script over when it stalled.',
    },
  ],
};

test.describe('similar past reflections on the owner’s draft', () => {
  test.beforeEach(({ api }) => {
    api.ai_status(['related']);
  });

  test('collapsed, with a count; opened, each row names its sprint and competency', async ({
    page,
    api,
  }) => {
    api.ai_reply(RELATED, TWO);
    await page.goto(`/reflections/${DRAFT}`);
    const toggle = page.getByRole('button', { name: 'From your earlier sprints (2)' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.getByRole('button', { name: /Sprint 1 · Communication/ }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'In sprint one I raised a blocker about the test database in standup…',
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Sprint 1 · Contribution/ }),
    ).toBeVisible();
  });

  test('a row opens that entry read-only, and closing it keeps the place', async ({
    page,
    api,
  }) => {
    api.ai_reply(RELATED, TWO);
    await page.goto(`/reflections/${DRAFT}`);
    await page.getByRole('button', { name: 'From your earlier sprints (2)' }).click();
    const row = page.getByRole('button', { name: /Sprint 1 · Communication/ });
    await row.click();
    const sheet = page.getByRole('dialog', { name: 'Sprint 1 · Communication' });
    await expect(sheet.getByText(EARLIER_TEXT)).toBeVisible();
    await expect(sheet.getByRole('textbox')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(row).toBeFocused();
    await expect(page.getByText('Competency 1 of 2')).toBeVisible();
  });

  test('looked up again when the narrative is saved, not on every keystroke', async ({
    page,
    api,
  }) => {
    api.ai_reply(RELATED, TWO);
    await page.goto(`/reflections/${DRAFT}`);
    await expect(
      page.getByRole('button', { name: 'From your earlier sprints (2)' }),
    ).toBeVisible();
    await page.waitForLoadState('networkidle');
    const lookups = () => api.ai_calls.filter((call) => call.route === RELATED).length;
    const before = lookups();
    await page
      .getByRole('textbox', { name: 'Your reflection' })
      .pressSequentially(' Then more.');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(lookups()).toBe(before + 1);
  });

  test('a row with no sprint number names just its competency', async ({ page, api }) => {
    api.ai_reply(RELATED, { entries: [{ ...TWO.entries[0], sprint_ordinal: null }] });
    await page.goto(`/reflections/${DRAFT}`);
    await page.getByRole('button', { name: 'From your earlier sprints (1)' }).click();
    await expect(page.getByRole('button', { name: /^Communication/ })).toBeVisible();
    await expect(page.getByText(/null/)).toHaveCount(0);
  });

  test('nothing earlier: no disclosure at all', async ({ page, api }) => {
    api.ai_reply(RELATED, { entries: [] });
    await page.goto(`/reflections/${DRAFT}`);
    await expect(page.getByText('Competency 1 of 2')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/From your earlier sprints/)).toHaveCount(0);
  });

  test('loading: a skeleton line where the disclosure will be', async ({ page, api }) => {
    api.ai_reply(RELATED, TWO);
    const release = api.ai_hold(RELATED);
    await page.goto(`/reflections/${DRAFT}`);
    await expect(
      page.getByRole('status').filter({ hasText: 'Looking for earlier reflections' }),
    ).toBeVisible();
    release();
    await expect(
      page.getByRole('button', { name: 'From your earlier sprints (2)' }),
    ).toBeVisible();
  });

  test('error: the disclosure is simply absent, and the card is untouched', async ({
    page,
    api,
  }) => {
    // Every lookup fails, the dev server's double mount included.
    api.ai_fail(
      RELATED,
      {
        kind: 'error',
        status: 503,
        code: 'AI_UNAVAILABLE',
        message: 'x',
        details: { reason: 'upstream' },
      },
      10,
    );
    await page.goto(`/reflections/${DRAFT}`);
    await expect(page.getByText('Competency 1 of 2')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(/From your earlier sprints/)).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Your reflection' })).toBeEditable();
  });
});
