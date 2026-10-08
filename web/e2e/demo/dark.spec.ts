/**
 * CAP-51 follow-up (Patrick, 8 Oct): the Alumable shell follows the theme.
 *
 * The shell used to stay light in every theme. On a laptop set to dark the
 * diary's own screens are dark, so every hop between the sign-in, My Gigs and
 * the diary flashed white. Now the shell is dark when the diary is: under a
 * dark system theme, under the diary's own Dark mode choice (data-theme), and
 * it stays light when someone chose light over a dark system.
 *
 * contrast.spec.ts checks the text in both themes; this checks the surround
 * itself is dark, which a contrast check cannot see.
 *
 * Self-contained ids prefixed '5159' so they collide with no other spec's.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../../src/api/schema.ts';
import { FakeApi, type GigDetail } from '../fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `5159${n}-0000-4515-8515-515151515151`;

const GIG: GigDetail = {
  id: id('0003'),
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-03',
  ends_on: '2026-10-26',
  my_role: 'student',
  sprints: [{ id: id('0004'), ordinal: 1, opens_on: '2026-08-03', due_on: '2026-08-16' }],
  framework: { id: id('0002'), fw_key: 'e2e-demo', name: 'E2E rubric', version: 'v1' },
  reflection_summary: { draft: 0, submitted: 1, assessed: 1 },
  participants: [],
};
const ME: Me = {
  id: id('0001'),
  display_name: 'Jane N',
  participations: [{ gig_id: GIG.id, gig_title: GIG.title, role: 'student' }],
};

/** Relative luminance of the first [data-brand] element's background. */
async function surround_luminance(page: Page): Promise<number> {
  return page
    .locator('[data-brand="alumable"]')
    .first()
    .evaluate((el) => {
      const m = getComputedStyle(el)
        .backgroundColor.match(/\d+(\.\d+)?/g)!
        .map(Number);
      const [r, g, b] = m.slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    });
}

const DARK = 0.05;
const LIGHT = 0.8;

async function open(page: Page, path: '/welcome' | '/home') {
  await new FakeApi([], ME, [GIG]).install(page);
  if (path === '/welcome') await page.addInitScript(() => sessionStorage.clear());
  await page.goto(path);
  await expect(page.locator('[data-brand="alumable"]').first()).toBeVisible();
}

for (const path of ['/welcome', '/home'] as const) {
  test(`${path} is dark under a dark system theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, path);
    expect(await surround_luminance(page)).toBeLessThan(DARK);
  });

  test(`${path} is dark when the diary's Dark mode is chosen`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => localStorage.setItem('reflection-diary-theme', 'dark'));
    await open(page, path);
    expect(await surround_luminance(page)).toBeLessThan(DARK);
  });

  test(`${path} stays light when light is chosen over a dark system`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => localStorage.setItem('reflection-diary-theme', 'light'));
    await open(page, path);
    expect(await surround_luminance(page)).toBeGreaterThan(LIGHT);
  });
}
