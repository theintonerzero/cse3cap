/**
 * CAP-12, the submitted confirmation screen, in a real browser against the
 * fake API (ADR #42).
 */
import {
  REFLECTION_ASSESSED,
  REFLECTION_NOWHERE,
  REFLECTION_NO_ASSESSOR,
  REFLECTION_NO_REVIEWER,
  REFLECTION_ON_LAST_SPRINT,
  REFLECTION_STILL_DRAFT,
  REFLECTION_SUBMITTED,
  expect,
  test,
} from './fixtures.ts';

test('loaded: names the assessor and shows the next sprint', async ({ page }) => {
  await page.goto(`/reflections/${REFLECTION_SUBMITTED}/submitted`);

  await expect(page.getByRole('heading', { name: 'Submitted' })).toBeVisible();
  await expect(
    page.getByText('Sam O has been notified and will review your reflection.'),
  ).toBeVisible();
  await expect(page.getByText(/The next sprint opens/)).toBeVisible();
  // format_full_date deliberately passes `undefined` as the locale so "the
  // reader's browser decides the order" (gig-timing.ts) -- this Chromium's
  // default locale renders "August 15, 2026", not "15 August 2026", so the
  // assertion accepts either day-first or month-first phrasing of the same
  // date rather than assuming one.
  await expect(page.getByText(/15 August 2026|August 15, 2026/)).toBeVisible();
});

test("no next sprint: the reflection is on the gig's last one", async ({ page }) => {
  await page.goto(`/reflections/${REFLECTION_ON_LAST_SPRINT}/submitted`);

  await expect(
    page.getByText('Sam O has been notified and will review your reflection.'),
  ).toBeVisible();
  await expect(page.getByText(/The next sprint opens/)).toHaveCount(0);
});

// GIG_NO_ASSESSOR (fixtures.ts) still has a supervisor participant -- it is
// the DemoSeeder SFIA shape, "no assessor, a supervisor counter-scores
// instead" -- so reviewer_of falls through to Dr Lee rather than finding
// nobody at all. None of Task 1's three fixture gigs has zero
// counter-scoring participants, so the fully generic "names nobody" wording
// is not reachable from seeded-shaped fixtures and is not asserted here;
// what this test actually exercises is the assessor -> supervisor fallback.
test('no assessor on the gig: falls back to naming the supervisor', async ({ page }) => {
  await page.goto(`/reflections/${REFLECTION_NO_ASSESSOR}/submitted`);

  await expect(
    page.getByText('Dr Lee has been notified and will review your reflection.'),
  ).toBeVisible();
});

test('assessed: the reviewer has already reviewed it, not pending', async ({ page }) => {
  await page.goto(`/reflections/${REFLECTION_ASSESSED}/submitted`);

  await expect(page.getByText('Sam O has reviewed this reflection.')).toBeVisible();
  await expect(page.getByText(/will review your reflection/)).toHaveCount(0);
});

// GIG_NO_REVIEWER (fixtures.ts) has a student participant only -- no
// assessor, supervisor or employer at all -- so reviewer_of returns null and
// the copy falls all the way through to the fully generic wording, which
// none of the other fixture gigs reaches (GIG_NO_ASSESSOR still has a
// supervisor).
test('no reviewer at all: falls back to the fully generic wording', async ({ page }) => {
  await page.goto(`/reflections/${REFLECTION_NO_REVIEWER}/submitted`);

  await expect(
    page.getByText('Your reflection has been handed in and is waiting on a review.'),
  ).toBeVisible();
});

test('back to diary', async ({ page }) => {
  await page.goto(`/reflections/${REFLECTION_SUBMITTED}/submitted`);

  // Not clicked through: the shared e2e identity (fixtures.ts's DR_LEE) is a
  // supervisor with no student participation anywhere, so landing on "/"
  // itself redirects on to /review-queue (routes.tsx's Home: "someone who is
  // not a student on any gig ... is sent to their review queue"), and that
  // screen calls GET /review-queue, which this shared fake does not serve --
  // it was built for edit-framework.spec.ts and Task 1's additions, neither
  // of which visits it. Extending the fake to grow a route this ticket does
  // not otherwise need is out of scope, so this test verifies the one thing
  // that is this screen's: the link's real target is home.
  await expect(page.getByRole('link', { name: 'Back to diary' })).toHaveAttribute(
    'href',
    '/',
  );
});

test('empty: not actually submitted yet', async ({ page }) => {
  await page.goto(`/reflections/${REFLECTION_STILL_DRAFT}/submitted`);

  await expect(page.getByText('This reflection has not been submitted yet.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Go to the reflection' })).toBeVisible();
});

test('error: a reflection that does not exist', async ({ page }) => {
  await page.goto(`/reflections/${REFLECTION_NOWHERE}/submitted`);

  await expect(page.getByRole('alert')).toContainText('Not found');
});

test('loading: a skeleton, not a spinner', async ({ page, api }) => {
  const release = api.hold('GET /reflections/:id');
  await page.goto(`/reflections/${REFLECTION_SUBMITTED}/submitted`);

  await expect(
    page.getByRole('status').filter({ hasText: 'Loading your confirmation' }),
  ).toBeVisible();

  release();
  await expect(page.getByText(/has been notified/)).toBeVisible();
});
