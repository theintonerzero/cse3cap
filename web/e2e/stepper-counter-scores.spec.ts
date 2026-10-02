/**
 * CAP-38: the student reads a counter-score the way the assessor wrote it.
 *
 * Patrick on PR #56 (CAP-13): a saved score is the chip row, greyed, with the
 * chosen level selected, and the comment in its box, read-only -- never one
 * line of text. The assessor's own view already does this; the student's
 * read-only view of the same score now matches it, in the counter-score
 * green, so the two halves read side by side.
 *
 * Ids prefixed '3839' (CAP-38, second scenario), distinct from every other
 * spec's.
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

const id = (n: string) => `3839${n}-0000-4839-8839-383938393839`;
const GIG = id('0001');
const FRAMEWORK = id('0002');
const SPRINT = id('0003');
const COMPETENCY = id('0004');
const ASSESSED = id('0005');
const ENTRY = id('0006');
const level_id = (value: number) => id(`001${value}`);

const JANE: Me = {
  id: id('0007'),
  display_name: 'Jane D',
  participations: [{ gig_id: GIG, gig_title: 'Develop AI use cases', role: 'student' }],
};
const SAM = { id: id('0008'), display_name: 'Sam O' };

const COMMENT = 'Good start; the PR shows it once, not as a habit yet.';

const RUBRIC: FrameworkDetail = {
  id: FRAMEWORK,
  fw_key: 'latrobe6',
  version: 'v1',
  name: 'La Trobe six-competency',
  created_by: null,
  in_use: true,
  comment_required: true,
  evidence_required: false,
  accepted_file_types: ['pdf'],
  max_file_bytes: 10485760,
  scale: { min: 1, max: 4 },
  competencies: [
    {
      id: COMPETENCY,
      code: 'collaboration',
      name: 'Collaboration',
      short_label: null,
      category: null,
      position: 1,
      levels: [1, 2, 3, 4].map((value) => ({
        id: level_id(value),
        level_value: value,
        descriptor: `Collaboration at level ${value}.`,
      })),
    },
  ],
};

const GIG_DETAIL: GigDetail = {
  id: GIG,
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [{ id: SPRINT, ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' }],
  framework: { id: FRAMEWORK, fw_key: 'latrobe6', name: RUBRIC.name, version: 'v1' },
  reflection_summary: { draft: 0, submitted: 0, assessed: 1 },
  participants: [
    { id: JANE.id, display_name: JANE.display_name, role: 'student' },
    { id: SAM.id, display_name: SAM.display_name, role: 'assessor' },
  ],
};

const REFLECTION: ReflectionDetail = {
  id: ASSESSED,
  status: 'assessed',
  gig_id: GIG,
  sprint_id: SPRINT,
  sprint_ordinal: 1,
  framework_id: FRAMEWORK,
  framework_version: 'v1',
  submitted_at: '2026-08-14T10:00:00.000000Z',
  created_at: '2026-08-10T10:00:00.000000Z',
  updated_at: '2026-08-16T10:00:00.000000Z',
  owner: { id: JANE.id, display_name: JANE.display_name },
  entries: [
    {
      id: ENTRY,
      competency_id: COMPETENCY,
      competency_code: 'collaboration',
      competency_name: 'Collaboration',
      short_label: null,
      position: 1,
      narrative: 'Paired with Priya on the import script.',
      evidence: [
        {
          id: id('0009'),
          reflection_entry_id: ENTRY,
          kind: 'link',
          label: 'Pull request',
          uri: 'https://example.org/pr/1',
          size_bytes: null,
          uploaded_at: '2026-08-11T10:00:00.000000Z',
        },
      ],
      scores: [
        {
          id: id('000a'),
          reflection_entry_id: ENTRY,
          scorer_role: 'student',
          scorer_class: 'self',
          level_id: level_id(3),
          level_value: 3,
          comment: null,
          scored_at: '2026-08-13T10:00:00.000000Z',
          scorer: { id: JANE.id, display_name: JANE.display_name },
        },
        {
          id: id('000b'),
          reflection_entry_id: ENTRY,
          scorer_role: 'assessor',
          scorer_class: 'counter',
          level_id: level_id(2),
          level_value: 2,
          comment: COMMENT,
          scored_at: '2026-08-16T10:00:00.000000Z',
          scorer: SAM,
        },
      ],
    },
  ],
};

const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi([RUBRIC], JANE, [GIG_DETAIL], [REFLECTION]);
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

test('the assessor score reads as greyed chips with the level selected', async ({
  page,
}) => {
  await page.goto(`/reflections/${ASSESSED}`);

  const row = page.getByRole('group', { name: "Sam O's score" });
  await expect(row.getByRole('button')).toHaveCount(4);
  for (const button of await row.getByRole('button').all()) {
    await expect(button).toBeDisabled();
  }
  await expect(row.getByRole('button', { name: /^2 · / })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(row.getByRole('button', { name: /^3 · / })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  // Not the old one-line summary.
  await expect(page.getByText('Sam O: level 2')).toHaveCount(0);
});

test('the assessor comment sits in its box, read-only', async ({ page }) => {
  await page.goto(`/reflections/${ASSESSED}`);

  const comment = page.getByLabel("Sam O's comment");
  await expect(comment).toHaveValue(COMMENT);
  await expect(comment).not.toBeEditable();
});

test('evidence is still a link to its own URL, in a new tab', async ({ page }) => {
  // Guard, not a new behaviour: the evidence rows are restyled in CAP-38
  // and must stay plain links with the same target and rel.
  await page.goto(`/reflections/${ASSESSED}`);

  const link = page.getByRole('link', { name: /Pull request/ });
  await expect(link).toHaveAttribute('href', 'https://example.org/pr/1');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});
