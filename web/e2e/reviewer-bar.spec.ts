/**
 * CAP-38 round 3 D1: the bar names the module, "Reflection Diary", for
 * everyone; the page keeps its own heading, so "Review queue" and
 * "Frameworks" each appear once. Run as Sam (assessor, one gig, no pills)
 * and Dr Lee (supervisor on two gigs, Frameworks too), who are set up
 * differently.
 *
 * These are about the bar, so the screen under it may be in any state.
 *
 * Self-contained scenario, ids prefixed '3831'.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi, type GigDetail } from './fake-api.ts';

type Me = components['schemas']['Me'];
type Role = GigDetail['my_role'];

const id = (n: string) => `3831${n}-0000-4831-8831-383138313831`;
const FRAMEWORK = id('0002');
const GIG_ONE = id('0003');
const GIG_TWO = id('0004');
const REFLECTION = id('00a0');

function gig(gig_id: string, title: string, my_role: Role): GigDetail {
  return {
    id: gig_id,
    title,
    org_name: 'Alumable',
    starts_on: '2026-08-01',
    ends_on: '2026-11-01',
    my_role,
    sprints: [{ id: id('0005'), ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' }],
    framework: { id: FRAMEWORK, fw_key: 'e2e-bar', name: 'E2E rubric', version: 'v1' },
    reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
    participants: [],
  };
}

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
  const role = me.participations[0].role;
  const api = new FakeApi(
    [],
    me,
    [
      gig(GIG_ONE, 'Develop AI use cases', role),
      gig(GIG_TWO, 'Data migration audit', role),
    ],
    [],
  );
  await api.install(page);
}

/** The bar's title is a span; the pills, while they exist, are links. */
function bar_title(page: Page) {
  return page
    .getByRole('banner')
    .locator('span')
    .filter({ hasText: /^(Reflection Diary|Review queue|Frameworks)$/ });
}

for (const me of [SAM, LEE]) {
  test.describe(me.display_name, () => {
    test('the queue: the bar says Reflection Diary, the page says Review queue', async ({
      page,
    }) => {
      await install(page, me);
      await page.goto('/review-queue');
      await expect(
        page.getByRole('heading', { level: 1, name: 'Review queue' }),
      ).toBeVisible();
      await expect(bar_title(page)).toHaveText(['Reflection Diary']);
    });

    test('a scoring screen: Reflection Diary, and back still names the queue', async ({
      page,
    }) => {
      await install(page, me);
      await page.goto(`/review-queue/reflections/${REFLECTION}`);
      const back = page
        .getByRole('banner')
        .getByRole('link', { name: 'Back to Review queue' });
      await expect(back).toHaveAttribute('href', '/review-queue');
      await expect(bar_title(page)).toHaveText(['Reflection Diary']);
    });
  });
}

test('Dr Lee on Frameworks: the bar says Reflection Diary, the page says Frameworks', async ({
  page,
}) => {
  await install(page, LEE);
  await page.goto('/frameworks');
  await expect(page.getByRole('heading', { level: 1, name: 'Frameworks' })).toBeVisible();
  await expect(bar_title(page)).toHaveText(['Reflection Diary']);
});

test('Dr Lee editing a copy: Reflection Diary, and back still names Frameworks', async ({
  page,
}) => {
  await install(page, LEE);
  await page.goto(`/frameworks/${FRAMEWORK}/edit`);
  await expect(
    page.getByRole('banner').getByRole('link', { name: 'Back to Frameworks' }),
  ).toBeVisible();
  await expect(bar_title(page)).toHaveText(['Reflection Diary']);
});
