/**
 * CAP-52: the reflection editor keeps every edit (8 Oct tester pass).
 *
 * A self-score or evidence save used to replace the whole entry with the copy
 * taken before its request, wiping anything typed while it travelled to the
 * VPS. And leaving a competency, or pressing Submit, within the 600 ms
 * autosave delay dropped the last edit. Self-contained, ids prefixed '5252'.
 */
import { test as base, expect } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionDetail,
} from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `5252${n}-0000-4525-8525-525252525252`;
const GIG = id('0001');
const FRAMEWORK = id('0002');
const SPRINT = id('0003');
const DRAFT = id('0005');
const SUBMITTED = id('0006');
const NAMES = ['Contribution', 'Communication'];

const NOOR: Me = {
  id: id('0007'),
  display_name: 'Noor A',
  participations: [{ gig_id: GIG, gig_title: 'Develop AI use cases', role: 'student' }],
};

const RUBRIC: FrameworkDetail = {
  id: FRAMEWORK,
  fw_key: 'e2e-edits',
  version: 'v1',
  name: 'E2E rubric',
  created_by: null,
  in_use: true,
  assigned: true,
  comment_required: false,
  evidence_required: false,
  accepted_file_types: ['pdf'],
  max_file_bytes: 10485760,
  scale: { min: 1, max: 4 },
  competencies: NAMES.map((name, n) => ({
    id: id(`00c${n}`),
    code: name.toLowerCase(),
    name,
    short_label: null,
    category: null,
    position: n + 1,
    levels: [1, 2, 3, 4].map((value) => ({
      id: id(`0${n}l${value}`),
      level_value: value,
      descriptor: `${name} at level ${value}.`,
    })),
  })),
};

const GIG_DETAIL: GigDetail = {
  id: GIG,
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [{ id: SPRINT, ordinal: 3, opens_on: '2026-08-29', due_on: '2026-09-11' }],
  framework: { id: FRAMEWORK, fw_key: 'e2e-edits', name: RUBRIC.name, version: 'v1' },
  reflection_summary: { draft: 1, submitted: 1, assessed: 0 },
  participants: [{ id: NOOR.id, display_name: NOOR.display_name, role: 'student' }],
};

function reflection(
  reflection_id: string,
  status: 'draft' | 'submitted',
): ReflectionDetail {
  return {
    id: reflection_id,
    status,
    gig_id: GIG,
    sprint_id: SPRINT,
    sprint_ordinal: 3,
    framework_id: FRAMEWORK,
    framework_version: 'v1',
    submitted_at: status === 'submitted' ? '2026-09-10T10:00:00.000000Z' : null,
    created_at: '2026-09-01T10:00:00.000000Z',
    updated_at: '2026-09-01T10:00:00.000000Z',
    owner: { id: NOOR.id, display_name: NOOR.display_name },
    entries: NAMES.map((name, n) => ({
      // 'a' for the draft's entries, 'b' for the submitted one's: hex, so the
      // fake's UUID pattern matches them, and distinct across the two.
      id: id(`${status === 'draft' ? 'a' : 'b'}0e${n}`),
      competency_id: id(`00c${n}`),
      competency_code: name.toLowerCase(),
      competency_name: name,
      short_label: null,
      position: n + 1,
      narrative: null,
      evidence: [],
      scores: [],
    })),
  };
}

const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi(
        [RUBRIC],
        NOOR,
        [GIG_DETAIL],
        [reflection(DRAFT, 'draft'), reflection(SUBMITTED, 'submitted')],
      );
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

const narrative = (page: import('@playwright/test').Page) =>
  page.getByRole('textbox', { name: 'Your reflection' });

test('typing while a self-score saves is not wiped when it returns', async ({
  page,
  api,
}) => {
  const release = api.hold('PUT /entries/:id/scores/self');
  await page.goto(`/reflections/${DRAFT}`);

  const level = page.getByRole('button', { name: /^2 · Contribution at level 2/ });
  await level.click();
  await narrative(page).fill('Typed while the score was on its way.');

  const returned = page.waitForResponse((r) => r.url().endsWith('/scores/self'));
  release();
  await returned;

  await expect(level).toHaveAttribute('aria-pressed', 'true');
  await expect(narrative(page)).toHaveValue('Typed while the score was on its way.');
});

test('typing while a link saves is not wiped when it returns', async ({ page, api }) => {
  const release = api.hold('POST /entries/:id/evidence');
  await page.goto(`/reflections/${DRAFT}`);

  await page.getByRole('button', { name: 'Add a link' }).click();
  await page.getByRole('textbox', { name: 'Evidence label' }).fill('Stand-up notes');
  await page.getByRole('textbox', { name: 'Link URL' }).fill('https://example.com/notes');
  await page.getByRole('button', { name: 'Add link' }).click();
  await narrative(page).fill('Typed while the link was on its way.');

  release();

  await expect(page.getByText('Stand-up notes')).toBeVisible();
  await expect(narrative(page)).toHaveValue('Typed while the link was on its way.');
});

const narratives_sent = (api: FakeApi) =>
  api
    .writes()
    .filter((call) => call.route === 'PATCH /entries/:id')
    .map((call) => (call.body as { narrative: string }).narrative);

test('Next straight after typing still saves the last words', async ({ page, api }) => {
  await page.goto(`/reflections/${DRAFT}`);
  await narrative(page).fill('Last words before Next.');
  await page.getByRole('button', { name: 'Next', exact: true }).click();

  await expect(page.getByText('Competency 2 of 2')).toBeVisible();
  await expect.poll(() => narratives_sent(api)).toContain('Last words before Next.');
});

test('Submit straight after typing saves first, then submits', async ({ page, api }) => {
  await page.goto(`/reflections/${DRAFT}`);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await narrative(page).fill('Last words before Submit.');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/reflections/${DRAFT}/submitted$`));
  const routes = api.writes().map((call) => call.route);
  const saved = api
    .writes()
    .findIndex(
      (call) =>
        call.route === 'PATCH /entries/:id' &&
        (call.body as { narrative: string }).narrative === 'Last words before Submit.',
    );
  expect(saved, `writes were ${routes.join(', ')}`).toBeGreaterThanOrEqual(0);
  expect(saved).toBeLessThan(routes.indexOf('POST /reflections/:id/submit'));
});

test('if the last save fails, Submit sends nothing and says why', async ({ page, api }) => {
  api.fail('PATCH /entries/:id', { kind: 'network' });
  await page.goto(`/reflections/${DRAFT}`);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await narrative(page).fill('This one will not save.');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();

  await expect(page.getByText(/last edit did not save/)).toBeVisible();
  expect(api.writes().map((call) => call.route)).not.toContain(
    'POST /reflections/:id/submit',
  );
});

test('a read-only entry with no evidence says so', async ({ page }) => {
  await page.goto(`/reflections/${SUBMITTED}`);
  await expect(page.getByText('No evidence attached.')).toBeVisible();
});
