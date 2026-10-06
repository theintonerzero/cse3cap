/**
 * CAP-38 round 3 (Patrick, 2026-10-05): "Review queue" dominated the page.
 * The heading takes the gig page's card heading size ("Sprints"): 17px,
 * medium weight, rather than the 22px bold page title. Sam and Dr Lee.
 *
 * Self-contained scenario, ids prefixed '3835'.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi } from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `3835${n}-0000-4835-8835-383538353835`;
const GIG_ONE = id('0003');
const GIG_TWO = id('0004');

const SAM: Me = {
  id: id('0010'),
  display_name: 'Sam O',
  participations: [
    { gig_id: GIG_ONE, gig_title: 'Develop AI use cases', role: 'assessor' },
  ],
};
const LEE: Me = {
  id: id('0011'),
  display_name: 'Dr Lee',
  participations: [
    { gig_id: GIG_ONE, gig_title: 'Develop AI use cases', role: 'supervisor' },
    { gig_id: GIG_TWO, gig_title: 'Data migration audit', role: 'supervisor' },
  ],
};

async function install(page: Page, me: Me) {
  const api = new FakeApi([], me, [], []);
  await api.install(page);
}

for (const me of [SAM, LEE]) {
  for (const width of [390, 1440]) {
    test(`${me.display_name}, ${width}: the heading is the card heading's size`, async ({
      page,
    }) => {
      await install(page, me);
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/review-queue');
      const heading = page.getByRole('heading', { level: 1, name: 'Review queue' });
      await expect(heading).toBeVisible();
      const style = await heading.evaluate((node) => {
        const cs = getComputedStyle(node);
        return { size: cs.fontSize, weight: cs.fontWeight };
      });
      expect(style).toEqual({ size: '17px', weight: '600' });
    });
  }
}
