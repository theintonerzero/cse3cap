/**
 * The export's Download button saves the file in every browser (CAP-56).
 *
 * Firefox reads a blob download asynchronously after the click. A link that
 * was never attached to the document, or a blob URL revoked on the next task,
 * can make the download vanish with no error: on the live demo in Firefox
 * 157 the server answered every Download with the PDF and nothing was saved.
 * Playwright's own Firefox does not reproduce that, so this pins the two
 * things that cause it, in the shape the browser sees at the click.
 */
import { test as base, expect } from '@playwright/test';

import type { components, paths } from '../src/api/schema.ts';
import { FakeApi, type GigDetail, type ReflectionSummary } from './fake-api.ts';

type Me = components['schemas']['Me'];
type Radar = paths['/me/radar']['get']['responses']['200']['content']['application/json'];
type Seen =
  | { kind: 'click'; connected: boolean; download: string; at: number }
  | { kind: 'revoke'; at: number };

// A student on one gig with one submitted reflection: the diary home, where
// the Export record button lives, as the shared fixture's supervisor never sees it.
const id = (n: string) => `5656${n}-0000-4565-8565-565656565656`;
const STUDENT = id('0001');
const FRAMEWORK = id('0002');
const GIG = id('0003');

const GIG_DETAIL: GigDetail = {
  id: GIG,
  title: 'La Trobe capstone',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [1, 2].map((n) => ({
    id: id(`001${n}`),
    ordinal: n,
    opens_on: '2026-08-01',
    due_on: '2026-08-14',
  })),
  framework: { id: FRAMEWORK, fw_key: 'e2e-export', name: 'E2E rubric', version: 'v1' },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [{ id: STUDENT, display_name: 'Ash', role: 'student' }],
};

const REFLECTION: ReflectionSummary = {
  id: id('0021'),
  status: 'submitted',
  gig_id: GIG,
  sprint_id: GIG_DETAIL.sprints[0].id,
  sprint_ordinal: 1,
  framework_id: FRAMEWORK,
  framework_version: 'v1',
  submitted_at: '2026-08-14T10:00:00.000000Z',
  created_at: '2026-08-10T10:00:00.000000Z',
  updated_at: '2026-08-14T10:00:00.000000Z',
};

const RADAR: Radar = {
  scope: { gig_id: null, sprint_id: null },
  framework: { id: FRAMEWORK, fw_key: 'e2e-export', scale_min: 1, scale_max: 4 },
  axes: ['a', 'b', 'c'].map((code, n) => ({
    code,
    short_label: code.toUpperCase(),
    position: n + 1,
    self: 3,
    counter: 2,
    counter_role: 'assessor',
  })),
};

const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const me: Me = {
        id: STUDENT,
        display_name: 'Ash',
        participations: [{ gig_id: GIG, gig_title: GIG_DETAIL.title, role: 'student' }],
      };
      const api = new FakeApi([], me, [GIG_DETAIL], [REFLECTION]);
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const seen: Seen[] = [];
    (window as unknown as { __seen: Seen[] }).__seen = seen;
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      if (this.href.startsWith('blob:')) {
        seen.push({
          kind: 'click',
          connected: this.isConnected,
          download: this.download,
          at: performance.now(),
        });
      }
      return click.call(this);
    };
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url: string) => {
      seen.push({ kind: 'revoke', at: performance.now() });
      revoke(url);
    };
  });
});

async function openReady(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /export record/i }).click();
  await page.getByRole('button', { name: /^pdf$/i }).click();
  await page.getByRole('button', { name: /request a pdf export/i }).click();
}

const seenIn = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __seen: Seen[] }).__seen);

test('Download saves the PDF under its own name', async ({ page }) => {
  await openReady(page);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: /^download$/i }).click();
  expect((await download).suggestedFilename()).toMatch(/^reflection-diary-.*\.pdf$/);
});

// The download starts from the user's own click on a real link to the file:
// no script-driven click after an await, which a browser may no longer count
// as the user's, inside a frame or not (CAP-56: Firefox 157 saved nothing).
test('Download is a real link to the file, named for the download', async ({ page }) => {
  await openReady(page);
  const link = page.getByRole('link', { name: /^download$/i });
  await expect(link).toHaveAttribute('href', /^blob:/);
  await expect(link).toHaveAttribute('download', /^reflection-diary-.*\.pdf$/);
});

test('no script clicks a link for the user', async ({ page }) => {
  await openReady(page);
  await page.getByRole('link', { name: /^download$/i }).click();
  await page.waitForTimeout(300);
  expect((await seenIn(page)).filter((s) => s.kind === 'click')).toEqual([]);
});

test('while the file is fetched, Download waits and says so', async ({ page, api }) => {
  const release = api.hold('GET /exports/:id/download');
  await openReady(page);
  await expect(page.getByRole('button', { name: /preparing/i })).toBeDisabled();
  await expect(page.getByRole('link', { name: /^download$/i })).toHaveCount(0);
  release();
  await expect(page.getByRole('link', { name: /^download$/i })).toBeVisible();
});

test('the file stays downloadable while the sheet is open, and is freed when it closes', async ({
  page,
}) => {
  await openReady(page);
  await page.getByRole('link', { name: /^download$/i }).click();
  await page.waitForTimeout(1500);
  expect((await seenIn(page)).filter((s) => s.kind === 'revoke')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: /^download$/i })).toHaveCount(0);
  await expect
    .poll(async () => (await seenIn(page)).filter((s) => s.kind === 'revoke').length)
    .toBe(1);
});
