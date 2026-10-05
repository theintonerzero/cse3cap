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
  HOSTILE_GIG,
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
  // The heading is "<gig title> · Sprint N" and the gig title is the payload:
  // it has to arrive as text (round 2b).
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${PAYLOAD} · Sprint 1`);

  // One assertion per rendered field, so each one is shown to be on the page
  // as text: the competency name, the narrative, every level descriptor, the
  // counter-score's scorer and comment, and both evidence labels.
  const card = page.getByRole('main');
  await expect(card.locator('p', { hasText: PAYLOAD }).first()).toHaveText(PAYLOAD);
  await expect(page.getByLabel('Your reflection')).toHaveValue(PAYLOAD);
  for (const value of [1, 2]) {
    await expect(
      page
        .getByRole('group', { name: 'Self-score' })
        .getByRole('button', { name: `${value} · ${PAYLOAD}` }),
    ).toBeVisible();
  }
  // The counter-score reads as the assessor sees it (CAP-38): the scorer's
  // name labels a chip row and a read-only comment box, both still text.
  const counter = page.getByRole('group', { name: `${PAYLOAD}'s score` });
  for (const value of [1, 2]) {
    await expect(
      counter.getByRole('button', { name: `${value} · ${PAYLOAD}` }),
    ).toBeVisible();
  }
  await expect(page.getByLabel(`${PAYLOAD}'s comment`)).toHaveValue(PAYLOAD);
  await expect(page.getByRole('listitem').filter({ hasText: PAYLOAD })).toHaveCount(2);

  // StoreEvidenceRequest refuses this scheme (F7), and the screen still
  // renders a stored one as plain text rather than trusting that.
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await assertInert(page);
});

test("assessor stepper: the student's name and work are text", async ({ page }) => {
  await page.goto(`/review-queue/reflections/${HOSTILE_REFLECTION}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${PAYLOAD} · Sprint 1`);

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
  await expect(
    page.getByRole('heading', { name: 'Edit a copy of a rubric' }),
  ).toBeVisible();

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

test('gig page and history: the title, who acted, and an unknown event are text', async ({
  page,
}) => {
  await page.goto(`/gigs/${HOSTILE_GIG}`);
  await expect(page.getByRole('heading', { name: PAYLOAD })).toBeVisible();

  await page.getByRole('button', { name: 'History' }).click();
  const sheet = page.getByRole('dialog', { name: 'History' });
  await expect(sheet.getByText('Reflection submitted (Sprint 1)')).toBeVisible();
  await expect(sheet.getByText(`· ${PAYLOAD}`)).toBeVisible();

  // An event type the sheet has never heard of is shown by name rather than
  // dropped (history-log.ts), so its name is typed text too.
  await expect(sheet.getByText('<b>odd</b> (Sprint 1)')).toBeVisible();
  await expect(sheet.locator('b')).toHaveCount(0);
  await assertInert(page);
});

/** A literal string as a RegExp source. */
function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
