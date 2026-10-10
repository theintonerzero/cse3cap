/**
 * CAP-57: what a phone user notices, from a review of every screen at 384 px
 * (a Galaxy S24 Ultra) with the demo's real data. At 360 too, the Figma
 * frames' width. These hold in the app itself, at any width, not only in the
 * live demo's /phone frame.
 *
 * Self-contained scenario, ids prefixed '5757'.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi, type GigDetail, type ReflectionSummary } from './fake-api.ts';

type Me = components['schemas']['Me'];
type Role = GigDetail['my_role'];

const id = (n: string) => `5757${n}-0000-4757-8757-575757575757`;
const PERSON = id('0001');
const FRAMEWORK = id('0002');
const GIG = id('0003');

function gig(role: Role): GigDetail {
  return {
    id: GIG,
    title: 'Develop AI use cases',
    org_name: 'Alumable',
    starts_on: '2026-08-01',
    ends_on: '2026-11-01',
    my_role: role,
    sprints: [1, 2, 3].map((n) => ({
      id: id(`001${n}`),
      ordinal: n,
      opens_on: '2026-08-01',
      due_on: '2026-08-14',
    })),
    framework: { id: FRAMEWORK, fw_key: 'e2e-phone', name: 'E2E rubric', version: 'v1' },
    reflection_summary: { draft: 0, submitted: 3, assessed: 0 },
    participants: [{ id: PERSON, display_name: 'Ash', role }],
  };
}

const rows = (g: GigDetail): ReflectionSummary[] =>
  g.sprints.map((s, n) => ({
    id: id(`00a${n}`),
    status: 'submitted',
    gig_id: g.id,
    sprint_id: s.id,
    sprint_ordinal: s.ordinal,
    framework_id: FRAMEWORK,
    framework_version: 'v1',
    submitted_at: '2026-08-14T10:00:00.000000Z',
    created_at: '2026-08-10T10:00:00.000000Z',
    updated_at: '2026-08-14T10:00:00.000000Z',
  }));

async function install(page: Page, display_name: string, role: Role) {
  const g = gig(role);
  const me: Me = {
    id: PERSON,
    display_name,
    participations: [{ gig_id: GIG, gig_title: g.title, role }],
  };
  const api = new FakeApi([], me, [g], role === 'student' ? rows(g) : []);
  await api.install(page);
  await page.route('**/api/v1/me/radar**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"error":{"code":"NOT_FOUND","message":"x","details":{}}}',
    }),
  );
  return api;
}

/** Text an element shows is cut off when its content is wider than its box. */
async function cut_off(page: Page, text: string) {
  const el = page.getByRole('banner').getByText(text, { exact: true });
  await expect(el).toBeVisible();
  return el.evaluate(async (node) => {
    await document.fonts.ready;
    return node.scrollWidth > node.clientWidth + 1;
  });
}

const PEOPLE: [string, Role, string][] = [
  ['Jane N', 'student', '/'],
  ['Noor A', 'student', '/'],
  ['Sam O', 'assessor', '/review-queue'],
  ['Dr Lee', 'supervisor', '/review-queue'],
];

for (const width of [360, 384]) {
  test.describe(`${width}px`, () => {
    test.use({ viewport: { width, height: 800 } });

    for (const [name, role, path] of PEOPLE) {
      test(`the app bar shows ${name} and ${role} in full, and the title`, async ({
        page,
      }) => {
        await install(page, name, role);
        await page.goto(path);
        expect(await cut_off(page, name), `"${name}" is cut off`).toBe(false);
        expect(await cut_off(page, role), `"${role}" is cut off`).toBe(false);
        expect(await cut_off(page, 'Reflection Diary'), 'the title is cut off').toBe(false);
      });
    }

    test('the 404 page’s way back is a full-size tap target', async ({ page }) => {
      await install(page, 'Jane N', 'student');
      await page.goto('/no-such-page');
      const back = page.getByRole('link', { name: 'Back to the diary' });
      await expect(back).toBeVisible();
      const box = (await back.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
    });

    test('scrolled to the end, the last row clears the floating Export button', async ({
      page,
    }) => {
      await install(page, 'Jane N', 'student');
      await page.goto('/');
      const fab = page.getByRole('button', { name: 'Export record' });
      await expect(fab).toBeVisible();
      await page.evaluate(() =>
        window.scrollTo(0, document.scrollingElement!.scrollHeight),
      );
      const last = page.getByRole('link', { name: /sprint 3/i }).last();
      await expect(last).toBeVisible();
      const [row, button] = [(await last.boundingBox())!, (await fab.boundingBox())!];
      expect(row.y + row.height).toBeLessThanOrEqual(button.y);
    });
  });
}
