/**
 * The rubrics and the user the browser checks run against, and the `api`
 * fixture every spec takes.
 *
 * Shaped like the seeded ones on purpose, including what makes them awkward:
 * both templates are in use, La Trobe has a null radar label, and SFIA's
 * skills carry a category and are valid over only part of the scale, so a
 * level list can start at 2. A copy with no competencies stands in for the
 * empty state, which the seeded data cannot produce.
 */
import { test as base, expect } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionSummary,
} from './fake-api.ts';

export const LATROBE = 'aaaa1111-0000-4aaa-8aaa-aaaaaaaaaaaa';
export const SFIA = 'bbbb2222-0000-4bbb-8bbb-bbbbbbbbbbbb';
export const EMPTY = 'cccc3333-0000-4ccc-8ccc-cccccccccccc';
export const NOWHERE = 'ffff9999-0000-4fff-8fff-ffffffffffff';

// Path-segment ids only (gig_id and reflection_id both appear in a request
// URL, e.g. GET /reflections/{id}): every hex group must actually BE hex.
// fake-api.ts's UUID regex generalises a path by matching
// [0-9a-f]{8}-[0-9a-f]{4}-... verbatim, so a mnemonic-but-non-hex group like
// "g001" or "r001" fails to match, the route falls through as
// unexpected, and the fake answers 404 no matter what the test asked for.
export const GIG_WITH_NEXT_SPRINT = 'aaaa1111-0a01-4aaa-8aaa-aaaaaaaaaaaa';
export const GIG_LAST_SPRINT = 'aaaa1111-0a02-4aaa-8aaa-aaaaaaaaaaaa';
export const GIG_NO_ASSESSOR = 'aaaa1111-0a03-4aaa-8aaa-aaaaaaaaaaaa';
export const GIG_NO_REVIEWER = 'aaaa1111-0a04-4aaa-8aaa-aaaaaaaaaaaa';
export const REFLECTION_SUBMITTED = 'aaaa1111-0b01-4aaa-8aaa-aaaaaaaaaaaa';
export const REFLECTION_ON_LAST_SPRINT = 'aaaa1111-0b02-4aaa-8aaa-aaaaaaaaaaaa';
export const REFLECTION_NO_ASSESSOR = 'aaaa1111-0b03-4aaa-8aaa-aaaaaaaaaaaa';
export const REFLECTION_STILL_DRAFT = 'aaaa1111-0b04-4aaa-8aaa-aaaaaaaaaaaa';
export const REFLECTION_ASSESSED = 'aaaa1111-0b05-4aaa-8aaa-aaaaaaaaaaaa';
export const REFLECTION_NO_REVIEWER = 'aaaa1111-0b06-4aaa-8aaa-aaaaaaaaaaaa';
export const REFLECTION_NOWHERE = 'ffff9999-0b00-4fff-8fff-ffffffffffff';

const DR_LEE: components['schemas']['Me'] = {
  id: 'dddd4444-0000-4ddd-8ddd-dddddddddddd',
  display_name: 'Dr Lee',
  participations: [
    {
      gig_id: 'eeee5555-0000-4eee-8eee-eeeeeeeeeeee',
      gig_title: 'Develop AI use cases',
      role: 'supervisor',
    },
  ],
};

const policy = {
  comment_required: true,
  evidence_required: false,
  accepted_file_types: ['pdf', 'png', 'jpg'],
  max_file_bytes: 10485760,
};

const LA_TROBE_DETAIL: FrameworkDetail = {
  id: LATROBE,
  fw_key: 'latrobe6',
  version: 'v1',
  name: 'La Trobe six-competency',
  created_by: null,
  in_use: true,
  ...policy,
  scale: { min: 1, max: 4 },
  competencies: [
    {
      id: 'aaaa1111-0001-4aaa-8aaa-aaaaaaaaaaaa',
      code: 'collaboration',
      name: 'Collaboration',
      short_label: 'Collab.',
      category: null,
      position: 1,
      levels: [1, 2, 3, 4].map((value) => ({
        id: `aaaa1111-01${value}0-4aaa-8aaa-aaaaaaaaaaaa`,
        level_value: value,
        descriptor: `Collaboration at level ${value}.`,
      })),
    },
    {
      id: 'aaaa1111-0002-4aaa-8aaa-aaaaaaaaaaaa',
      code: 'communication',
      name: 'Communication',
      short_label: null,
      category: null,
      position: 2,
      levels: [1, 2, 3, 4].map((value) => ({
        id: `aaaa1111-02${value}0-4aaa-8aaa-aaaaaaaaaaaa`,
        level_value: value,
        descriptor: `Communication at level ${value}.`,
      })),
    },
  ],
};

const SFIA_DETAIL: FrameworkDetail = {
  id: SFIA,
  fw_key: 'sfia9',
  version: '9.0',
  name: 'SFIA 9',
  created_by: null,
  in_use: true,
  ...policy,
  scale: { min: 2, max: 6 },
  competencies: [
    {
      id: 'bbbb2222-0001-4bbb-8bbb-bbbbbbbbbbbb',
      code: 'PROG',
      name: 'Programming/software development',
      short_label: 'PROG',
      category: 'Development and implementation',
      position: 1,
      levels: [2, 3, 4, 5].map((value) => ({
        id: `bbbb2222-01${value}0-4bbb-8bbb-bbbbbbbbbbbb`,
        level_value: value,
        descriptor: `PROG level ${value}.`,
      })),
    },
    {
      id: 'bbbb2222-0002-4bbb-8bbb-bbbbbbbbbbbb',
      code: 'TEST',
      name: 'Functional testing',
      short_label: 'TEST',
      category: 'Development and implementation',
      position: 2,
      levels: [3, 4, 5, 6].map((value) => ({
        id: `bbbb2222-02${value}0-4bbb-8bbb-bbbbbbbbbbbb`,
        level_value: value,
        descriptor: `TEST level ${value}.`,
      })),
    },
  ],
};

const EMPTY_DETAIL: FrameworkDetail = {
  id: EMPTY,
  fw_key: 'hollow',
  version: 'v1',
  name: 'Hollow rubric',
  created_by: DR_LEE.id,
  in_use: false,
  ...policy,
  scale: { min: 1, max: 1 },
  competencies: [],
};

/**
 * Four gigs, covering the shapes Submitted.tsx has to handle: a sprint with
 * a next one after it, the last sprint on the gig (no next date), a gig
 * with no assessor participant at all -- which is a real shape (DemoSeeder's
 * SFIA gig has none; a supervisor counter-scores instead), not an edge case
 * invented for the test -- and a gig with no counter-scoring participant at
 * all (student only), which is genuinely reachable (a bare gig mid-setup)
 * and exercises reviewer_of's fully-generic null fallback.
 */
const GIG_WITH_NEXT_SPRINT_DETAIL: GigDetail = {
  id: GIG_WITH_NEXT_SPRINT,
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [
    {
      id: 'aaaa1111-s001-4aaa-8aaa-aaaaaaaaaaaa',
      ordinal: 1,
      opens_on: '2026-08-01',
      due_on: '2026-08-14',
    },
    {
      id: 'aaaa1111-s002-4aaa-8aaa-aaaaaaaaaaaa',
      ordinal: 2,
      opens_on: '2026-08-15',
      due_on: '2026-08-28',
    },
    {
      id: 'aaaa1111-s003-4aaa-8aaa-aaaaaaaaaaaa',
      ordinal: 3,
      opens_on: '2026-08-29',
      due_on: '2026-09-11',
    },
  ],
  framework: {
    id: LATROBE,
    fw_key: 'latrobe6',
    name: 'La Trobe six-competency',
    version: 'v1',
  },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [
    { id: 'p-student', display_name: 'You', role: 'student' },
    { id: 'p-assessor', display_name: 'Sam O', role: 'assessor' },
    { id: 'p-supervisor', display_name: 'Dr Lee', role: 'supervisor' },
  ],
};

const GIG_LAST_SPRINT_DETAIL: GigDetail = {
  ...structuredClone(GIG_WITH_NEXT_SPRINT_DETAIL),
  id: GIG_LAST_SPRINT,
};

const GIG_NO_ASSESSOR_DETAIL: GigDetail = {
  id: GIG_NO_ASSESSOR,
  title: 'Data migration audit',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [
    {
      id: 'bbbb2222-s001-4bbb-8bbb-bbbbbbbbbbbb',
      ordinal: 1,
      opens_on: '2026-08-01',
      due_on: '2026-08-14',
    },
    {
      id: 'bbbb2222-s002-4bbb-8bbb-bbbbbbbbbbbb',
      ordinal: 2,
      opens_on: '2026-08-15',
      due_on: '2026-08-28',
    },
  ],
  framework: { id: SFIA, fw_key: 'sfia9', name: 'SFIA 9', version: '9.0' },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [
    { id: 'p-student', display_name: 'You', role: 'student' },
    { id: 'p-supervisor', display_name: 'Dr Lee', role: 'supervisor' },
  ],
};

const GIG_NO_REVIEWER_DETAIL: GigDetail = {
  id: GIG_NO_REVIEWER,
  title: 'Bare gig mid-setup',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [
    {
      id: 'aaaa1111-s901-4aaa-8aaa-aaaaaaaaaaaa',
      ordinal: 1,
      opens_on: '2026-08-01',
      due_on: '2026-08-14',
    },
  ],
  framework: { id: LATROBE, fw_key: 'latrobe6', name: 'La Trobe six-competency', version: 'v1' },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [{ id: 'p-student', display_name: 'You', role: 'student' }],
};

const REFLECTION_SUBMITTED_SUMMARY: ReflectionSummary = {
  id: REFLECTION_SUBMITTED,
  status: 'submitted',
  gig_id: GIG_WITH_NEXT_SPRINT,
  sprint_id: 'aaaa1111-s001-4aaa-8aaa-aaaaaaaaaaaa',
  sprint_ordinal: 1,
  framework_id: LATROBE,
  framework_version: 'v1',
  submitted_at: '2026-09-27T10:00:00.000000Z',
  created_at: '2026-09-20T10:00:00.000000Z',
  updated_at: '2026-09-27T10:00:00.000000Z',
};

const REFLECTION_ON_LAST_SPRINT_SUMMARY: ReflectionSummary = {
  ...structuredClone(REFLECTION_SUBMITTED_SUMMARY),
  id: REFLECTION_ON_LAST_SPRINT,
  gig_id: GIG_LAST_SPRINT,
  sprint_id: 'aaaa1111-s003-4aaa-8aaa-aaaaaaaaaaaa',
  sprint_ordinal: 3,
};

const REFLECTION_NO_ASSESSOR_SUMMARY: ReflectionSummary = {
  ...structuredClone(REFLECTION_SUBMITTED_SUMMARY),
  id: REFLECTION_NO_ASSESSOR,
  gig_id: GIG_NO_ASSESSOR,
  sprint_id: 'bbbb2222-s001-4bbb-8bbb-bbbbbbbbbbbb',
  sprint_ordinal: 1,
  framework_id: SFIA,
};

const REFLECTION_STILL_DRAFT_SUMMARY: ReflectionSummary = {
  ...structuredClone(REFLECTION_SUBMITTED_SUMMARY),
  id: REFLECTION_STILL_DRAFT,
  status: 'draft',
  submitted_at: null,
};

const REFLECTION_ASSESSED_SUMMARY: ReflectionSummary = {
  ...structuredClone(REFLECTION_SUBMITTED_SUMMARY),
  id: REFLECTION_ASSESSED,
  status: 'assessed',
};

const REFLECTION_NO_REVIEWER_SUMMARY: ReflectionSummary = {
  ...structuredClone(REFLECTION_SUBMITTED_SUMMARY),
  id: REFLECTION_NO_REVIEWER,
  gig_id: GIG_NO_REVIEWER,
  sprint_id: 'aaaa1111-s901-4aaa-8aaa-aaaaaaaaaaaa',
  sprint_ordinal: 1,
};

/**
 * The fake, installed for EVERY test, and a failure if the page asked for
 * anything it does not serve.
 *
 * `auto`, because Playwright only builds a fixture a test names: a test that
 * takes `{ page }` alone would otherwise run with no fake and no sign-in,
 * land on the token gate, and fail looking like a screen bug.
 */
export const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi(
        [LA_TROBE_DETAIL, SFIA_DETAIL, EMPTY_DETAIL],
        DR_LEE,
        [
          GIG_WITH_NEXT_SPRINT_DETAIL,
          GIG_LAST_SPRINT_DETAIL,
          GIG_NO_ASSESSOR_DETAIL,
          GIG_NO_REVIEWER_DETAIL,
        ],
        [
          REFLECTION_SUBMITTED_SUMMARY,
          REFLECTION_ON_LAST_SPRINT_SUMMARY,
          REFLECTION_NO_ASSESSOR_SUMMARY,
          REFLECTION_STILL_DRAFT_SUMMARY,
          REFLECTION_ASSESSED_SUMMARY,
          REFLECTION_NO_REVIEWER_SUMMARY,
        ],
      );
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
