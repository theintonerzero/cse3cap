/**
 * CAP-24's injection criterion, under test rather than read: every screen
 * that renders text a person typed, fed hostile text through the fake API.
 *
 * Each test asserts two things. The payload is on the page as literal text,
 * so the field really was rendered. And it never became markup: no <img>
 * from it in the DOM, and nothing it carries ran (assertInert). Each was
 * also run against a deliberate dangerouslySetInnerHTML in its screen and
 * failed there; the PR records how. See docs/Security-Review.md, 2026-09-29.
 */
import {
  HOSTILE_FRAMEWORK,
  HOSTILE_REFLECTION,
  PAYLOAD,
  assertInert,
  expect,
  test,
} from './hostile.ts';

test('student stepper: every typed field is text, and a javascript: link is not a link', async ({
  page,
}) => {
  await page.goto(`/reflections/${HOSTILE_REFLECTION}`);
  await expect(page.getByRole('heading', { name: 'Reflection' })).toBeVisible();

  // One assertion per rendered field, so each one is shown to be on the page
  // as text: the competency name, the narrative, every level descriptor, the
  // counter-score's scorer and comment, and both evidence labels.
  const card = page.getByRole('main');
  await expect(card.locator('p', { hasText: PAYLOAD }).first()).toHaveText(PAYLOAD);
  await expect(page.getByLabel('Your reflection')).toHaveValue(PAYLOAD);
  for (const value of [1, 2]) {
    await expect(page.getByRole('button', { name: `${value} · ${PAYLOAD}` })).toBeVisible();
  }
  await expect(page.getByText(`${PAYLOAD}: level 1 — “${PAYLOAD}”`)).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: PAYLOAD })).toHaveCount(2);

  // StoreEvidenceRequest refuses this scheme (F7), and the screen still
  // renders a stored one as plain text rather than trusting that.
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await assertInert(page);
});

test("assessor stepper: the student's name and work are text", async ({ page }) => {
  await page.goto(`/review-queue/reflections/${HOSTILE_REFLECTION}`);
  await expect(page.getByRole('heading', { name: 'Score reflection' })).toBeVisible();

  // The owner's display name comes from Alumable, and the assessor screen
  // puts it in the status line and in two field labels.
  await expect(page.getByText(`${PAYLOAD} · you have scored 0 of 1`)).toBeVisible();
  await expect(page.getByLabel(`${PAYLOAD} wrote`)).toHaveValue(PAYLOAD);
  await expect(page.getByRole('group', { name: `${PAYLOAD}'s self-score` })).toBeVisible();
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await assertInert(page);
});

test("edit framework: a rubric's wording, and the name a supervisor types, are text", async ({
  page,
  api,
}) => {
  await page.goto(`/frameworks/${HOSTILE_FRAMEWORK}/edit`);
  await expect(page.getByRole('heading', { name: 'Copy and edit a rubric' })).toBeVisible();

  // The base rubric's own wording, as the fields a supervisor edits.
  const competency = page.getByRole('group', { name: 'hostile' });
  await expect(competency.getByLabel('Competency name')).toHaveValue(PAYLOAD);
  await expect(competency.getByLabel('Level 1')).toHaveValue(PAYLOAD);
  await expect(
    page.getByRole('option', { name: new RegExp(`^${escape(PAYLOAD)}`) }),
  ).toHaveCount(1);

  // And what the supervisor types becomes the copy's name, shown back once saved.
  await page.getByLabel('Name of your copy').fill(PAYLOAD);
  await page.getByRole('button', { name: 'Save as a new copy' }).click();
  await expect(page.getByRole('status')).toContainText(`Saved as ${PAYLOAD}.`);
  expect(api.copies()).toHaveLength(1);
  await assertInert(page);
});

/** A literal string as a RegExp source. */
function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
