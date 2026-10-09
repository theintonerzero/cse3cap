/**
 * The AI sidecar's browser checks (ADR #64): a student's draft with one
 * narrative long enough for the coach and one too short, a submitted
 * reflection, and the fake with the sidecar off unless a spec switches it on.
 *
 * Self-contained scenario, ids prefixed '6400'.
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

export const id = (n: string) => `6400${n}-0000-4640-8640-640064006400`;
export const GIG = id('0001');
const FRAMEWORK = id('0002');
const SPRINT = id('0003');
export const DRAFT = id('0005');
export const SUBMITTED = id('0006');
export const LONG_ENTRY = id('00e0');
export const SHORT_ENTRY = id('00e1');
export const EARLIER = id('0004');
export const EARLIER_ENTRY = id('01e0');
export const EARLIER_TEXT =
  'In sprint one I raised a blocker about the test database in standup, and Sam paired with me that afternoon to sort it out.';

export const LONG =
  'I kept the team updated on my blockers during standups, and when the migration stalled on Wednesday I posted it in the channel before lunch.';

export const JANE: Me = {
  id: id('0007'),
  display_name: 'Jane N',
  participations: [{ gig_id: GIG, gig_title: 'Develop AI use cases', role: 'student' }],
};

const NAMES = ['Communication', 'Contribution'];

export const RUBRIC_FOR_TESTS: FrameworkDetail = {
  id: FRAMEWORK,
  fw_key: 'latrobe6',
  version: 'v1',
  name: 'La Trobe six-competency',
  created_by: null,
  in_use: true,
  assigned: true,
  comment_required: true,
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

export const GIG_FOR_TESTS: GigDetail = {
  id: GIG,
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [{ id: SPRINT, ordinal: 2, opens_on: '2026-08-15', due_on: '2026-08-28' }],
  framework: {
    id: FRAMEWORK,
    fw_key: 'latrobe6',
    name: RUBRIC_FOR_TESTS.name,
    version: 'v1',
  },
  reflection_summary: { draft: 1, submitted: 1, assessed: 0 },
  participants: [{ id: JANE.id, display_name: JANE.display_name, role: 'student' }],
};

export function reflection_for_tests(
  rid: string,
  status: ReflectionDetail['status'],
): ReflectionDetail {
  return {
    id: rid,
    status,
    gig_id: GIG,
    sprint_id: SPRINT,
    sprint_ordinal: 2,
    framework_id: FRAMEWORK,
    framework_version: 'v1',
    submitted_at: status === 'draft' ? null : '2026-08-28T10:00:00.000000Z',
    created_at: '2026-08-16T10:00:00.000000Z',
    updated_at: '2026-08-17T10:00:00.000000Z',
    owner: { id: JANE.id, display_name: JANE.display_name },
    entries: NAMES.map((name, n) => ({
      id: n === 0 ? LONG_ENTRY : SHORT_ENTRY,
      competency_id: id(`00c${n}`),
      competency_code: name.toLowerCase(),
      competency_name: name,
      short_label: null,
      position: n + 1,
      narrative: n === 0 ? LONG : 'Only a few words.',
      evidence: [],
      scores: [],
    })),
  };
}

/** Jane's assessed sprint 1, the earlier reflection similar-reflections points at. */
export function earlier_reflection(): ReflectionDetail {
  const r = reflection_for_tests(EARLIER, 'assessed');
  r.sprint_ordinal = 1;
  r.entries = r.entries.map((e, n) => ({
    ...e,
    id: n === 0 ? EARLIER_ENTRY : id(`01e${n}`),
    narrative: n === 0 ? EARLIER_TEXT : '',
  }));
  return r;
}

export const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi(
        [RUBRIC_FOR_TESTS],
        JANE,
        [GIG_FOR_TESTS],
        [
          reflection_for_tests(DRAFT, 'draft'),
          reflection_for_tests(SUBMITTED, 'submitted'),
          earlier_reflection(),
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
