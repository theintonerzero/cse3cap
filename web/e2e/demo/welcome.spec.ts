/**
 * CAP-51: the Alumable demo welcome, with persona tokens present.
 *
 * Runs on the `demo` project (VITE_DEMO_SHELL=1, VITE_DEMO_TOKENS set). A
 * persona signs in on one click and lands on the Alumable home. The backend
 * is the same fake every other spec uses; the token is a placeholder it never
 * checks.
 *
 * Self-contained ids prefixed '5151' (CAP-51) so they collide with no other
 * spec's.
 */
import { test as base, expect } from '@playwright/test';

import type { components } from '../../src/api/schema.ts';
import { FakeApi, type GigDetail } from '../fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `5151${n}-0000-4515-8515-515151515151`;
const JANE = id('0001');
const FRAMEWORK = id('0002');
const GIG = id('0003');

const gig: GigDetail = {
  id: GIG,
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [{ id: id('0004'), ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' }],
  framework: { id: FRAMEWORK, fw_key: 'e2e-demo', name: 'E2E rubric', version: 'v1' },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [{ id: JANE, display_name: 'Jane N', role: 'student' }],
};

const me: Me = {
  id: JANE,
  display_name: 'Jane N',
  participations: [{ gig_id: GIG, gig_title: gig.title, role: 'student' }],
};

const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi([], me, [gig]);
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

test('welcome shows Alumable branding and a persona signs in on one click', async ({
  page,
  api,
}) => {
  await page.goto('/welcome');

  await expect(page.getByRole('img', { name: /alumable/i })).toBeVisible();

  await page.getByRole('button', { name: /Jane N/ }).click();

  await expect(page).toHaveURL(/\/home$/);
  expect(api.calls.some((call) => call.route === 'GET /auth/me')).toBe(true);
});
