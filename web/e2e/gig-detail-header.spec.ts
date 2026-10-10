/**
 * CAP-38 round 2d: the gig page's History button (ADR #42).
 *
 * Patrick: History was a page-sized button that hung below the title. It is
 * the small size now, centred on the title's FIRST line, and stays there when
 * a long title wraps: the title grows downward, History does not move.
 *
 * Self-contained scenario, ids prefixed '6161' so they collide with no other
 * spec's.
 */
import { test as base, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi, type GigDetail } from './fake-api.ts';

const id = (n: string) => `6161${n}-0000-4616-8616-616161616161`;
const STUDENT = id('0001');
const SHORT = id('0002');
const LONG = id('0003');

const ME: components['schemas']['Me'] = {
  id: STUDENT,
  display_name: 'Ash',
  participations: [
    { gig_id: SHORT, gig_title: 'La Trobe capstone', role: 'student' },
    { gig_id: LONG, gig_title: 'A long title', role: 'student' },
  ],
};

function gig(gig_id: string, title: string): GigDetail {
  return {
    id: gig_id,
    title,
    org_name: 'Alumable',
    starts_on: '2026-08-01',
    ends_on: '2026-11-01',
    my_role: 'student',
    sprints: [],
    framework: null,
    reflection_summary: { draft: 0, submitted: 0, assessed: 0 },
    participants: [{ id: STUDENT, display_name: 'Ash', role: 'student' }],
  };
}

const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi([], ME, [
        gig(SHORT, 'La Trobe capstone'),
        gig(LONG, 'Migrating the regional health records platform to a new data warehouse'),
      ]);
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

/** The title's first line and History's box, measured in the page. */
async function measure(page: Page) {
  const title = page.getByRole('heading', { level: 1 });
  const history = page.getByRole('button', { name: 'History' });
  await expect(history).toBeVisible();

  const line = await title.evaluate((node) => {
    const style = getComputedStyle(node);
    const top = node.getBoundingClientRect().top + parseFloat(style.paddingTop);
    const height = parseFloat(style.lineHeight);
    return { centre: top + height / 2, height, total: node.getBoundingClientRect().height };
  });
  const box = (await history.boundingBox())!;
  const font = await history.evaluate((node) => getComputedStyle(node).fontSize);
  const title_box = (await title.boundingBox())!;
  return { line, box, font, title_box };
}

for (const width of [390, 1440]) {
  for (const [name, gig_id] of [
    ['a short title', SHORT],
    ['a title that wraps', LONG],
  ] as const) {
    test(`History is small and centred on the first line of ${name} at ${width}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/gigs/${gig_id}`);
      const { line, box, font, title_box } = await measure(page);

      // The small size: Gig details' and Start reflection's text.
      expect(font).toBe('13px');
      expect(box.height).toBeLessThanOrEqual(44.5);

      // Centred on the first line, whatever the title's length.
      expect(Math.abs(box.y + box.height / 2 - line.centre)).toBeLessThanOrEqual(1);

      // Beside the title, never over it.
      expect(box.x).toBeGreaterThanOrEqual(title_box.x + title_box.width);
    });
  }
}

test('the long title really does wrap at 390, so the check above means something', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/gigs/${LONG}`);
  const { line } = await measure(page);
  expect(line.total).toBeGreaterThan(line.height * 1.5);
});
