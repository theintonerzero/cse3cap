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
import { HOSTILE_REFLECTION, PAYLOAD, assertInert, expect, test } from './hostile.ts';

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
