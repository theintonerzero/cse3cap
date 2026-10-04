/**
 * CAP-38 final review: layout that holds up to long text, layering, and
 * labels that match what is on screen.
 *
 * - An open BottomSheet sits above the sticky header, so nothing behind a
 *   modal dialog can be clicked or hides the sheet's top.
 * - A long display name, or a supervisor's single long gig title (which
 *   becomes "Assign to <title>"), never makes a 360px page scroll sideways.
 * - Gig Detail's column headings line up with each other on a wide screen.
 * - A review-queue row's accessible name begins with the words on it, so a
 *   voice-control user can say "click Score this" (WCAG 2.5.3).
 *
 * Ids prefixed '3841' (CAP-38, fourth scenario).
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionSummary,
} from './fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `3841${n}-0000-4841-8841-384138413841`;
const GIG = id('0001');
const FRAMEWORK = id('0002');
const SPRINT = id('0003');
const REFLECTION = id('0005');
const LONG_TITLE =
  'Develop AI use cases for regional health services across Victoria and southern New South Wales';
const LONG_NAME = 'Maximilian Alexander Featherstonehaugh-Worthington';

const RUBRIC: FrameworkDetail = {
  id: FRAMEWORK,
  fw_key: 'latrobe6',
  version: 'v1',
  name: 'La Trobe six-competency',
  created_by: null,
  in_use: false,
  comment_required: true,
  evidence_required: false,
  accepted_file_types: ['pdf'],
  max_file_bytes: 10485760,
  scale: { min: 1, max: 4 },
  competencies: [
    {
      id: id('0004'),
      code: 'collaboration',
      name: 'Collaboration',
      short_label: null,
      category: null,
      position: 1,
      levels: [1, 2, 3, 4].map((value) => ({
        id: id(`001${value}`),
        level_value: value,
        descriptor: `Collaboration at level ${value}.`,
      })),
    },
  ],
};

function gig(my_role: GigDetail['my_role'], title = 'Develop AI use cases'): GigDetail {
  return {
    id: GIG,
    title,
    org_name: 'Alumable',
    starts_on: '2026-08-01',
    ends_on: '2026-11-01',
    my_role,
    sprints: [{ id: SPRINT, ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' }],
    framework: { id: FRAMEWORK, fw_key: 'latrobe6', name: RUBRIC.name, version: 'v1' },
    reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
    participants: [{ id: id('0007'), display_name: 'Jane D', role: 'student' }],
  };
}

const SUBMITTED: ReflectionSummary = {
  id: REFLECTION,
  status: 'submitted',
  gig_id: GIG,
  sprint_id: SPRINT,
  sprint_ordinal: 1,
  framework_id: FRAMEWORK,
  framework_version: 'v1',
  submitted_at: '2026-08-14T10:00:00.000000Z',
  created_at: '2026-08-10T10:00:00.000000Z',
  updated_at: '2026-08-14T10:00:00.000000Z',
};

function person(display_name: string, role: string, title = 'Develop AI use cases'): Me {
  return {
    id: id('0007'),
    display_name,
    participations: [{ gig_id: GIG, gig_title: title, role: role as never }],
  };
}

async function install(
  page: Page,
  me: Me,
  gigs: GigDetail[],
  reflections: ReflectionSummary[],
) {
  const api = new FakeApi([RUBRIC], me, gigs, reflections);
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

async function horizontal_overflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test('an open sheet covers the sticky header', async ({ page }) => {
  await install(page, person('Jane D', 'student'), [gig('student')], [SUBMITTED]);
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto(`/gigs/${GIG}`);
  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByRole('dialog', { name: 'History' })).toBeVisible();

  // The back link, not the nav: a one-role student has no nav pills (R3).
  const back = page.getByRole('link', { name: 'Back to Reflection Diary' });
  const box = (await back.boundingBox())!;
  const on_top = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.closest('header') !== null,
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(on_top, 'the header is clickable through the open sheet').toBe(false);
});

test('360px: a long display name keeps the header on screen', async ({ page }) => {
  await install(page, person(LONG_NAME, 'student'), [gig('student')], [SUBMITTED]);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Reflection Diary' }),
  ).toBeVisible();
  expect(await horizontal_overflow(page)).toBe(0);
});

test('360px: one long assignable gig title keeps Frameworks on screen', async ({
  page,
}) => {
  await install(
    page,
    person('Dr Lee', 'supervisor', LONG_TITLE),
    [gig('supervisor', LONG_TITLE)],
    [],
  );
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/frameworks');
  await expect(page.getByRole('button', { name: `Assign to ${LONG_TITLE}` })).toBeVisible();
  expect(await horizontal_overflow(page)).toBe(0);
});

test('wide screen: gig detail column headings share a baseline', async ({ page }) => {
  await install(page, person('Jane D', 'student'), [gig('student')], [SUBMITTED]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/gigs/${GIG}`);
  // The card's heading (round 2e: "Sprints", was "Reflection diary").
  await expect(page.getByRole('heading', { name: 'Sprints' })).toBeVisible();

  const bottoms = await page
    .locator('[class*="rows_head"] > span')
    .evaluateAll((spans) => spans.map((s) => Math.round(s.getBoundingClientRect().bottom)));
  expect(bottoms).toHaveLength(3);
  expect(new Set(bottoms).size, `heading bottoms ${bottoms.join(', ')}`).toBe(1);
});

test('a review-queue row is named starting with the words on it', async ({ page }) => {
  await install(page, person('Sam O', 'assessor'), [gig('assessor')], [SUBMITTED]);
  await page.route('**/api/v1/review-queue', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          reflection_id: REFLECTION,
          student: { id: id('0008'), display_name: 'Jane D' },
          gig_id: GIG,
          gig_title: 'Develop AI use cases',
          sprint_id: SPRINT,
          sprint_ordinal: 1,
          submitted_at: '2026-08-14T10:00:00.000000Z',
          progress: { scored_by_me: 2, entries: 6 },
        },
      ]),
    }),
  );
  await page.goto('/review-queue');
  await expect(page.getByRole('link', { name: /^Score this/ })).toHaveCount(1);
});

test('wide screen: a reviewer sprint calendar keeps its dates at the right edge', async ({
  page,
}) => {
  await install(page, person('Sam O', 'assessor'), [gig('assessor')], []);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/gigs/${GIG}`);
  await expect(page.getByText('Sprint 1')).toBeVisible();

  const gap = await page
    .getByText('Sprint 1')
    .locator('xpath=ancestor::*[contains(@class,"row_flat")][1]')
    .evaluate((row) => {
      const meta = row.querySelector(':scope > [class*="row_meta"]')!;
      const style = getComputedStyle(row);
      const padding = parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth);
      return (
        row.getBoundingClientRect().right - padding - meta.getBoundingClientRect().right
      );
    });
  expect(Math.round(gap)).toBe(0);
});
