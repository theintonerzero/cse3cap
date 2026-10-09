/**
 * CAP-53: "Your learning record" (Figma 86:936), at /record.
 *
 * One section per gig the student has written on, each a competency by
 * sprint table of self/assessor. Every number comes from GET /me/progress,
 * served here per gig with page.route as the radar specs serve /me/radar:
 * the fake serves shapes, never the view that decides which score counts.
 *
 * Self-contained, ids prefixed '5354'.
 */
import { test as base, expect, type Page } from '@playwright/test';

import type { components, paths } from '../src/api/schema.ts';
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionSummary,
} from './fake-api.ts';

type Me = components['schemas']['Me'];
type Progress =
  paths['/me/progress']['get']['responses']['200']['content']['application/json'];

const id = (n: string) => `5354${n}-0000-4354-8354-535453545354`;
const LATROBE = id('0f01');
const SFIA = id('0f02');
const GIG_A = id('0a00');
const GIG_B = id('0b00');
const GIG_UNWRITTEN = id('0c00');
const GIG_NO_RUBRIC = id('0e00');
const GIG_REVIEWED = id('0d00');

function rubric(
  framework_id: string,
  name: string,
  max: number,
  competencies: [string, string, string | null][],
): FrameworkDetail {
  return {
    id: framework_id,
    fw_key: name.toLowerCase().replace(/\W+/g, '-'),
    version: 'v1',
    name,
    created_by: null,
    in_use: true,
    assigned: true,
    comment_required: true,
    evidence_required: false,
    accepted_file_types: ['pdf'],
    max_file_bytes: 10485760,
    scale: { min: 1, max },
    competencies: competencies.map(([code, competency_name, short_label], i) => ({
      id: id(`${framework_id.slice(6, 8)}c${i}`),
      code,
      name: competency_name,
      short_label,
      category: null,
      position: i + 1,
      levels: [],
    })),
  };
}

const LATROBE_RUBRIC = rubric(LATROBE, 'Alumable sprint 1 template', 4, [
  ['contrib', 'Contribution to the team', 'Contribution'],
  ['comms', 'Communication', null],
  ['lead', 'Leadership', 'Leadership'],
]);
const SFIA_RUBRIC = rubric(SFIA, 'SFIA 9', 7, [['datm', 'Data management', 'DATM']]);

function gig(
  gig_id: string,
  title: string,
  role: 'student' | 'assessor',
  framework: FrameworkDetail | null,
  sprint_count: number,
  starts_on: string,
): GigDetail {
  return {
    id: gig_id,
    title,
    org_name: 'Alumable',
    starts_on,
    ends_on: '2026-11-01',
    my_role: role,
    sprints: Array.from({ length: sprint_count }, (_, i) => ({
      id: id(`${gig_id.slice(4, 6)}5${i + 1}`),
      ordinal: i + 1,
      opens_on: '2026-08-01',
      due_on: '2026-08-14',
    })),
    framework: framework
      ? {
          id: framework.id,
          fw_key: framework.fw_key,
          name: framework.name,
          version: 'v1',
        }
      : null,
    reflection_summary: { draft: 0, submitted: 1, assessed: 1 },
    participants: [{ id: id('0e01'), display_name: 'Ash', role }],
  };
}

const GIGS: GigDetail[] = [
  gig(GIG_A, 'Develop AI use cases', 'student', LATROBE_RUBRIC, 3, '2026-08-03'),
  gig(GIG_B, 'Data migration audit', 'student', SFIA_RUBRIC, 2, '2026-08-17'),
  gig(GIG_UNWRITTEN, 'Policy chatbot', 'student', LATROBE_RUBRIC, 4, '2026-08-01'),
  gig(GIG_NO_RUBRIC, 'Unassigned gig', 'student', null, 1, '2026-07-01'),
  gig(GIG_REVIEWED, 'Cohort review', 'assessor', LATROBE_RUBRIC, 1, '2026-06-01'),
];

function reflection(
  reflection_id: string,
  gig_id: string,
  ordinal: number,
  status: ReflectionSummary['status'],
): ReflectionSummary {
  return {
    id: reflection_id,
    status,
    gig_id,
    sprint_id: id(`${gig_id.slice(4, 6)}5${ordinal}`),
    sprint_ordinal: ordinal,
    framework_id: gig_id === GIG_B ? SFIA : LATROBE,
    framework_version: 'v1',
    submitted_at: '2026-08-14T10:00:00.000000Z',
    created_at: '2026-08-10T10:00:00.000000Z',
    updated_at: '2026-08-14T10:00:00.000000Z',
  };
}

const REFLECTIONS = [
  reflection(id('f001'), GIG_A, 1, 'assessed'),
  reflection(id('f002'), GIG_A, 2, 'submitted'),
  reflection(id('f003'), GIG_B, 1, 'assessed'),
  // Ash only reviews this gig: someone else's reflection, never in Ash's record.
  reflection(id('f004'), GIG_REVIEWED, 1, 'submitted'),
];

const PROGRESS: Record<string, Progress> = {
  [GIG_A]: {
    competencies: [
      {
        code: 'contrib',
        short_label: 'Contribution',
        series: [
          { sprint_ordinal: 1, self: 3, counter: 4 },
          { sprint_ordinal: 2, self: 4, counter: null },
        ],
      },
      {
        code: 'comms',
        short_label: null,
        series: [{ sprint_ordinal: 1, self: 2, counter: 3 }],
      },
    ],
  },
  [GIG_B]: {
    competencies: [
      {
        code: 'datm',
        short_label: 'DATM',
        series: [{ sprint_ordinal: 1, self: 5, counter: 6 }],
      },
    ],
  },
};

const STUDENT: Me = {
  id: id('0e01'),
  display_name: 'Ash',
  participations: GIGS.map((g) => ({
    gig_id: g.id,
    gig_title: g.title,
    role: g.my_role,
  })),
};

const REVIEWER: Me = {
  id: id('0e02'),
  display_name: 'Sam',
  participations: [{ gig_id: GIG_REVIEWED, gig_title: 'Cohort review', role: 'assessor' }],
};

const test = base.extend<{
  me: Me;
  gigs: GigDetail[];
  reflections: ReflectionSummary[];
  api: FakeApi;
  progress_calls: string[];
}>({
  me: [STUDENT, { option: true }],
  gigs: [GIGS, { option: true }],
  reflections: [REFLECTIONS, { option: true }],
  api: [
    async ({ page, me, gigs, reflections }, provide) => {
      const api = new FakeApi(
        [LATROBE_RUBRIC, SFIA_RUBRIC],
        me,
        me === REVIEWER ? gigs.filter((g) => g.id === GIG_REVIEWED) : gigs,
        reflections,
      );
      await api.install(page);
      // The diary home draws a radar when the student lands there.
      await page.route('**/api/v1/me/radar**', (route) =>
        route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'NOT_FOUND', message: 'Nothing yet.', details: {} },
          }),
        }),
      );
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
  // Depends on api so this route is registered after the fake's catch-all,
  // and so wins (Playwright tries the newest route first).
  progress_calls: [
    async ({ page, api: _api }, provide) => {
      const calls: string[] = [];
      await page.route('**/api/v1/me/progress**', (route) => {
        const gig_id = new URL(route.request().url()).searchParams.get('gig_id') ?? '';
        calls.push(gig_id);
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(PROGRESS[gig_id] ?? { competencies: [] }),
        });
      });
      await provide(calls);
    },
    { auto: true },
  ],
});

const section = (page: Page, title: string) => page.getByRole('table', { name: title });

/** The cells of one competency's row, after its header cell. */
const cells = (page: Page, gig_title: string, competency: string) =>
  section(page, gig_title)
    .getByRole('row')
    .filter({ hasText: competency })
    .getByRole('cell');

test('the summary, one section per written gig, and the grid of self/assessor', async ({
  page,
  progress_calls,
}) => {
  await page.goto('/record');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your learning record');
  await expect(page.getByText('3 reflections · 2 gigs')).toBeVisible();
  await expect(page.getByText(/^2 rubrics · since .*2026$/)).toBeVisible();
  await expect(page.getByText('Yours to keep. Export it whenever you like.')).toBeVisible();

  // Two tables: the unwritten gig, the gig with no rubric and the reviewed
  // gig have no section.
  await expect(page.getByRole('table')).toHaveCount(2);
  await expect(page.getByText('Policy chatbot')).toHaveCount(0);
  await expect(page.getByText('Unassigned gig')).toHaveCount(0);
  await expect(page.getByText('Cohort review')).toHaveCount(0);
  // A set: in development StrictMode mounts the effect twice.
  expect([...new Set(progress_calls)].sort()).toEqual([GIG_A, GIG_B].sort());

  // Develop AI use cases: three sprints, three competencies in rubric order.
  const a = section(page, 'Develop AI use cases');
  await expect(a.getByRole('columnheader')).toHaveText(['Competency', 'S1', 'S2', 'S3']);
  await expect(a.getByRole('rowheader')).toHaveText([
    'Contribution',
    'Communication',
    'Leadership',
  ]);
  await expect(cells(page, 'Develop AI use cases', 'Contribution')).toHaveText([
    /^3\/4/,
    /^4\/–/,
    /^–not yet$/,
  ]);
  // No short label falls back to the name; a sprint with no reflection is "–".
  await expect(cells(page, 'Develop AI use cases', 'Communication')).toHaveText([
    /^2\/3/,
    /^–not yet$/,
    /^–not yet$/,
  ]);
  // Nothing scored on this competency at all: still a row.
  await expect(cells(page, 'Develop AI use cases', 'Leadership')).toHaveText([
    /^–not yet$/,
    /^–not yet$/,
    /^–not yet$/,
  ]);

  await expect(page.getByText('Alumable sprint 1 template', { exact: true })).toBeVisible();
  await expect(page.getByText('3 sprints')).toBeVisible();
  await expect(page.getByText('levels 1–4 · – not yet')).toBeVisible();

  // Data migration audit: its own rubric and its own scale.
  await expect(cells(page, 'Data migration audit', 'DATM')).toHaveText([
    /^5\/6/,
    /^–not yet$/,
  ]);
  await expect(page.getByText('levels 1–7 · – not yet')).toBeVisible();

  await expect(
    page.getByText(
      'Scores from different rubrics aren’t compared. Each section uses its own scale.',
    ),
  ).toBeVisible();
});

test('notes read as notes, not as empty fields (CAP-63)', async ({ page }) => {
  await page.goto('/record');
  for (const text of ['Yours to keep', 'aren’t compared']) {
    const note = page.getByText(text);
    await expect(note).toBeVisible();
    const look = await note.evaluate((el) => {
      const s = getComputedStyle(el);
      return { border: s.borderTopWidth, fill: s.backgroundColor };
    });
    expect(look.border, `${text}: no border`).toBe('0px');
    expect(look.fill, `${text}: a fill`).not.toBe('rgba(0, 0, 0, 0)');
  }
});

test('each section opens the diary scoped to its gig', async ({ page }) => {
  await page.goto('/record');

  await expect(
    page.getByRole('link', { name: 'Open the 2 reflections ›' }),
  ).toHaveAttribute('href', `/?gig_id=${GIG_A}`);
  await expect(page.getByRole('link', { name: 'Open the reflection ›' })).toHaveAttribute(
    'href',
    `/?gig_id=${GIG_B}`,
  );
});

test('the diary links in, and back returns to the diary', async ({ page }) => {
  await page.goto(`/?gig_id=${GIG_A}`);
  await page.getByRole('link', { name: 'Your learning record ›' }).click();

  await expect(page).toHaveURL('/record');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your learning record');

  await page.getByRole('link', { name: 'Back to Reflection Diary' }).click();
  await expect(page).toHaveURL(/\/(\?.*)?$/);
});

test('Export record opens the export sheet', async ({ page }) => {
  await page.goto('/record');
  await page.getByRole('button', { name: 'Export record' }).click();

  await expect(page.getByRole('dialog', { name: 'Export record' })).toBeVisible();
});

test('loading shows skeletons, not a spinner', async ({ page, api }) => {
  const release = api.hold('GET /gigs');
  await page.goto('/record');

  await expect(page.getByText('Loading your learning record')).toBeAttached();
  release();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your learning record');
});

test('a failed read shows the error, and Try again recovers', async ({ page }) => {
  // Down until switched back, rather than fail() with a count: how many
  // loads reach the network depends on whether dev StrictMode's first,
  // aborted mount got a request out, which is timing, not behaviour.
  let down = true;
  await page.route('**/api/v1/reflections', (route) =>
    down ? route.abort('failed') : route.fallback(),
  );
  await page.goto('/record');

  await expect(page.getByText('Cannot reach the server')).toBeVisible();
  down = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('table')).toHaveCount(2);
});

test.describe('a student who has written nothing', () => {
  test.use({ reflections: [[], { scope: 'test' }] });

  test('says the record starts with the first reflection', async ({ page }) => {
    await page.goto('/record');

    await expect(
      page.getByText('Your record starts with your first reflection.'),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to your diary' })).toHaveAttribute(
      'href',
      '/',
    );
    await expect(page.getByRole('table')).toHaveCount(0);
  });
});

test.describe('someone who is not a student anywhere', () => {
  test.use({ me: REVIEWER });

  test('is told the diary is the student’s own record', async ({ page }) => {
    await page.goto('/record');

    await expect(page.getByText('The diary is the student’s own record.')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
  });
});

test.describe('a gig with more sprints than fit on a phone', () => {
  // Fourteen sprints on Data migration audit: far wider than a 360px card,
  // so columns start past the viewport's edge, where anything absolutely
  // positioned in a cell (the screen-reader text) escapes an unpositioned
  // scroller and widens the page. Sprint 1 keeps its id, so the fixture's
  // reflection still belongs to it.
  // [value, options]: a bare array would be read as that tuple (as in
  // diary-home-layout.spec.ts).
  test.use({
    gigs: [
      GIGS.map((g) =>
        g.id === GIG_B
          ? gig(GIG_B, 'Data migration audit', 'student', SFIA_RUBRIC, 14, '2026-08-17')
          : g,
      ),
      { scope: 'test' },
    ],
  });

  test('the table scrolls inside its card, not the page', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/record');
    const table = page.getByRole('table', { name: 'Data migration audit' });
    await expect(table.getByRole('columnheader')).toHaveCount(15);

    const scroller = await table.evaluate((node) => {
      const box = node.parentElement!;
      return { scroll: box.scrollWidth, client: box.clientWidth };
    });
    expect(scroller.scroll, 'the table is wider than its card').toBeGreaterThan(
      scroller.client,
    );

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'the page itself does not scroll sideways').toBeLessThanOrEqual(0);
  });
});
