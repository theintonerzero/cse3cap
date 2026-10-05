/**
 * CAP-23 Task 3: BottomSheet's keyboard focus trap, and no horizontal
 * overflow at 360px across every screen a fake-API scenario can reach
 * (ADR #42).
 *
 * The shared `test`/`api` fixture in fixtures.ts signs in as DR_LEE, a
 * supervisor with no student participation anywhere -- Home() (routes.tsx)
 * redirects anyone who is not a student on any gig straight to
 * /review-queue, so that fixture can reach Select Framework, Edit Framework
 * and Review Queue, but never Diary Home or Gig Detail, and so never either
 * BottomSheet-opening screen (History Sheet, Export Sheet).
 * submitted.spec.ts's own "back to diary" test already documents hitting
 * this exact wall. Rather than extending the shared CI fixture to cover a
 * role it was never scoped for, this file builds its own small,
 * self-contained FakeApi scenario with a student identity, following the
 * precedent in web/e2e/shots/fixtures.ts (a separate tool for a separate
 * ticket -- read for the pattern, not imported from).
 *
 * Every id here uses a '2323' prefix (CAP-23), distinct from fixtures.ts's
 * own (aaaa/bbbb/cccc/ffff), hostile.ts's (9999) and
 * stepper-ownership.spec.ts's (3636), so none of these files can ever
 * collide on an id.
 */
import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

import type { components, paths } from '../src/api/schema.ts';
import { FakeApi, type GigDetail, type ReflectionSummary } from './fake-api.ts';
import { EMPTY, LATROBE, test as dr_lee_test } from './fixtures.ts';

type Me = components['schemas']['Me'];
type Radar = paths['/me/radar']['get']['responses']['200']['content']['application/json'];

const STUDENT_ID = '23230001-0000-4232-8232-232323232323';
const ASSESSOR_ID = '23230002-0000-4232-8232-232323232323';
const GIG_ID = '23230003-0000-4232-8232-232323232323';
const SPRINT_ID = '23230004-0000-4232-8232-232323232323';
const FRAMEWORK_ID = '23230005-0000-4232-8232-232323232323';
const REFLECTION_ID = '23230006-0000-4232-8232-232323232323';

const ME: Me = {
  id: STUDENT_ID,
  display_name: 'Ash',
  participations: [
    { gig_id: GIG_ID, gig_title: 'La Trobe capstone (e2e)', role: 'student' },
  ],
};

const GIG: GigDetail = {
  id: GIG_ID,
  title: 'La Trobe capstone (e2e)',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [{ id: SPRINT_ID, ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' }],
  framework: {
    id: FRAMEWORK_ID,
    fw_key: 'e2e-a11y',
    name: 'E2E accessibility rubric',
    version: 'v1',
  },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [
    { id: STUDENT_ID, display_name: 'Ash', role: 'student' },
    { id: ASSESSOR_ID, display_name: 'Sam O', role: 'assessor' },
  ],
};

const REFLECTION: ReflectionSummary = {
  id: REFLECTION_ID,
  status: 'submitted',
  gig_id: GIG_ID,
  sprint_id: SPRINT_ID,
  sprint_ordinal: 1,
  framework_id: FRAMEWORK_ID,
  framework_version: 'v1',
  submitted_at: '2026-09-27T10:00:00.000000Z',
  created_at: '2026-09-20T10:00:00.000000Z',
  updated_at: '2026-09-27T10:00:00.000000Z',
};

/**
 * Two axes, one fully scored and one still awaiting a counter-score, so the
 * Task 1 radar table's "Not yet scored" fallback and its real-number cells
 * are both exercised by the same fixture.
 */
const RADAR: Radar = {
  scope: { gig_id: null, sprint_id: null },
  framework: { id: FRAMEWORK_ID, fw_key: 'e2e-a11y', scale_min: 1, scale_max: 4 },
  axes: [
    {
      code: 'collaboration',
      short_label: 'Collab.',
      position: 1,
      self: 3,
      counter: 2,
      counter_role: 'assessor',
    },
    {
      code: 'communication',
      short_label: 'Comm.',
      position: 2,
      self: 4,
      counter: null,
      counter_role: 'assessor',
    },
  ],
};

/**
 * The student scenario, auto-installed like fixtures.ts's own `api`.
 *
 * `GET /me/radar` has no FakeApi support at all (no CI scenario has ever
 * needed it -- Diary Home's own shot is real-API-sourced, per
 * shots/manifest.ts's `diary-home-loaded`), so it is served directly here,
 * registered after `api.install()` so it takes priority over FakeApi's own
 * catch-all `**\/api/v1/**` for the same URL: Playwright runs the
 * most-recently-registered matching route handler first, and this one
 * fulfils rather than falling back, so FakeApi never sees the request.
 */
export const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi([], ME, [GIG], [REFLECTION]);
      await api.install(page);

      await page.route('**/api/v1/me/radar**', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(RADAR),
        }),
      );

      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

/** `document.documentElement`'s own scroll width against its client width. */
async function expect_no_horizontal_overflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow at 360px').toBe(0);
}

test.describe('BottomSheet: keyboard focus trap', () => {
  // Export Sheet over History Sheet: HistorySheet's own loaded and empty
  // states (web/src/screens/HistorySheet.tsx) contain zero focusable
  // elements, which would make Tab a no-op rather than a real trap to test.
  // Export Sheet's idle state has three -- the PDF chip, the JSON chip and
  // the request button -- which is what actually exercises the wrap.
  test('traps Tab, wraps focus around, and returns it to the trigger on Escape', async ({
    page,
  }) => {
    await page.goto('/');

    const trigger = page.getByRole('button', { name: 'Export record' });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Export record' });
    await expect(dialog).toBeVisible();

    const pdf_chip = dialog.getByRole('button', { name: 'PDF', exact: true });
    const json_chip = dialog.getByRole('button', { name: 'JSON', exact: true });
    const request_button = dialog.getByRole('button', { name: 'Request a PDF export' });

    // ExportSheet's own mount effect ("every state names where focus
    // lives", ExportSheet.tsx) moves focus to its current action -- the
    // request button -- once it renders, overriding BottomSheet's generic
    // first-focusable fallback (BottomSheet.tsx). Either way, focus moved
    // into the sheet, which is what this assertion is actually for.
    await expect(request_button).toBeFocused();

    // Shift+Tab backward through every focusable element...
    await page.keyboard.press('Shift+Tab');
    await expect(json_chip).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(pdf_chip).toBeFocused();

    // ...off the first one wraps back to the last, rather than escaping
    // into the page behind the sheet...
    await page.keyboard.press('Shift+Tab');
    await expect(request_button).toBeFocused();

    // ...and forward Tab off the last wraps back to the first. Both
    // directions round-trip, which is the actual trap being tested here,
    // not just that focus happened to start inside.
    await page.keyboard.press('Tab');
    await expect(pdf_chip).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);

    // BottomSheet.tsx's cleanup restores focus to whatever was focused
    // before the sheet opened.
    await expect(trigger).toBeFocused();
  });
});

test.describe('360px: no horizontal overflow (student scenario)', () => {
  test('Diary Home, with a real radar, including the Task 1 table', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    // Scoped to the gig (CAP-38): "All gigs" over two or more gigs shows a
    // prompt rather than a radar. This student has one gig, so either URL
    // draws it; the gig's own URL says which radar this test is about.
    await page.goto(`/?gig_id=${GIG_ID}`);

    await expect(
      page.getByRole('heading', { level: 1, name: 'Reflection Diary' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export record' })).toBeVisible();

    await expect(page.locator('table caption')).toHaveText(
      'The radar above, as numbers: self-score and counter-score per competency, ' +
        'on a 1 to 4 scale.',
    );
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(2);

    const collaboration = rows.nth(0);
    await expect(collaboration.locator('th')).toHaveText('Collab.');
    await expect(collaboration.locator('td').first()).toHaveText('3');
    await expect(collaboration.locator('td').last()).toHaveText('2');

    // Still awaiting its counter-score: the fallback text, not a number.
    const communication = rows.nth(1);
    await expect(communication.locator('th')).toHaveText('Comm.');
    await expect(communication.locator('td').first()).toHaveText('4');
    await expect(communication.locator('td').last()).toHaveText('Not yet scored');

    await expect_no_horizontal_overflow(page);
  });

  test('Gig Detail', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/gigs/${GIG_ID}`);

    await expect(page.getByRole('heading', { name: GIG.title })).toBeVisible();
    await expect_no_horizontal_overflow(page);
  });

  test('History Sheet, opened from Gig Detail', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/gigs/${GIG_ID}`);
    await page.getByRole('button', { name: 'History' }).click();

    await expect(page.getByRole('dialog', { name: 'History' })).toBeVisible();
    await expect_no_horizontal_overflow(page);
  });

  test('Export Sheet, opened from Diary Home', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Export record' }).click();

    await expect(page.getByRole('dialog', { name: 'Export record' })).toBeVisible();
    await expect_no_horizontal_overflow(page);
  });
});

dr_lee_test.describe('360px: no horizontal overflow (DR_LEE scenario)', () => {
  dr_lee_test('Select Framework', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/frameworks');

    await expect(page.getByRole('heading', { name: 'Frameworks' })).toBeVisible();
    await expect_no_horizontal_overflow(page);
  });

  dr_lee_test('Edit Framework', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/frameworks/${LATROBE}/edit`);

    await expect(
      page.getByRole('heading', { name: 'Edit a copy of a rubric' }),
    ).toBeVisible();
    await expect_no_horizontal_overflow(page);
  });

  // The hollow (no-competency) framework, for Edit Framework's own empty
  // state -- a different layout shape from the populated one above, worth
  // the same check rather than assuming the populated pass covers it.
  dr_lee_test('Edit Framework, empty rubric', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/frameworks/${EMPTY}/edit`);

    await expect(
      page.getByRole('heading', { name: 'Edit a copy of a rubric' }),
    ).toBeVisible();
    await expect_no_horizontal_overflow(page);
  });

  dr_lee_test('Review Queue', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/review-queue');

    await expect(page.getByRole('heading', { name: 'Review queue' })).toBeVisible();
    await expect_no_horizontal_overflow(page);
  });
});

export { expect };
