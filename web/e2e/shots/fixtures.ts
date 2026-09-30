/**
 * Self-contained fake-API scenarios for shots, independent of
 * web/e2e/fixtures.ts (which is scoped to the CI specs' own needs). Every id
 * here uses the 'ffff' prefix reserved for throwaway data in
 * web/e2e/fixtures.ts's own convention (NOWHERE), so a shots id can never
 * collide with a real seeded id or a CI fixture id.
 *
 * Field shapes are read from src/api/schema.ts, not guessed: GigDetail
 * nests its rubric as GigFramework (id, fw_key, name, version), not a bare
 * framework_id, and its sprints carry opens_on/due_on, not starts_on/ends_on.
 * FrameworkDetail carries the submit-gate policy fields (comment_required,
 * evidence_required, accepted_file_types, max_file_bytes) alongside scale
 * and competencies; there is no based_on_id on the wire.
 */
import type { components } from '../../src/api/schema.ts';
import type { FrameworkDetail, GigDetail, ReflectionSummary } from '../fake-api.ts';

type Me = components['schemas']['Me'];

export const JANE: Me = {
  id: 'ffff1111-0000-4fff-8fff-ffffffffffff',
  display_name: 'Jane',
  participations: [
    {
      gig_id: 'ffff1111-0a01-4fff-8fff-ffffffffffff',
      gig_title: 'La Trobe capstone',
      role: 'student',
    },
  ],
};

export const LA_TROBE_FRAMEWORK: FrameworkDetail = {
  id: 'ffff1111-0f01-4fff-8fff-ffffffffffff',
  fw_key: 'shots-la-trobe',
  version: 'v1',
  name: 'La Trobe capstone rubric',
  created_by: null,
  in_use: true,
  comment_required: true,
  evidence_required: false,
  accepted_file_types: ['pdf', 'png', 'jpg'],
  max_file_bytes: 10485760,
  scale: { min: 1, max: 4 },
  competencies: [
    {
      id: 'ffff1111-0c01-4fff-8fff-ffffffffffff',
      code: 'COMM',
      name: 'Communication',
      short_label: 'Comm.',
      category: null,
      position: 1,
      levels: [
        {
          id: 'ffff1111-0c11-4fff-8fff-ffffffffffff',
          level_value: 1,
          descriptor: 'Rarely shares progress unprompted.',
        },
        {
          id: 'ffff1111-0c12-4fff-8fff-ffffffffffff',
          level_value: 2,
          descriptor: 'Shares progress when asked.',
        },
        {
          id: 'ffff1111-0c13-4fff-8fff-ffffffffffff',
          level_value: 3,
          descriptor: 'Shares progress and blockers proactively.',
        },
        {
          id: 'ffff1111-0c14-4fff-8fff-ffffffffffff',
          level_value: 4,
          descriptor: 'Keeps the whole team aligned without being asked.',
        },
      ],
    },
  ],
};

export const GIG: GigDetail = {
  id: 'ffff1111-0a01-4fff-8fff-ffffffffffff',
  title: 'La Trobe capstone',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [
    {
      id: 'ffff1111-0501-4fff-8fff-ffffffffffff',
      ordinal: 1,
      opens_on: '2026-08-01',
      due_on: '2026-08-14',
    },
    {
      id: 'ffff1111-0502-4fff-8fff-ffffffffffff',
      ordinal: 2,
      opens_on: '2026-08-15',
      due_on: '2026-08-28',
    },
  ],
  framework: {
    id: LA_TROBE_FRAMEWORK.id,
    fw_key: LA_TROBE_FRAMEWORK.fw_key,
    name: LA_TROBE_FRAMEWORK.name,
    version: LA_TROBE_FRAMEWORK.version,
  },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [
    { id: JANE.id, display_name: 'Jane', role: 'student' },
    { id: 'ffff1111-0002-4fff-8fff-ffffffffffff', display_name: 'Sam O', role: 'assessor' },
  ],
};

export const REFLECTION_SUBMITTED: ReflectionSummary = {
  id: 'ffff1111-0b01-4fff-8fff-ffffffffffff',
  status: 'submitted',
  gig_id: GIG.id,
  sprint_id: GIG.sprints[0].id,
  sprint_ordinal: 1,
  framework_id: LA_TROBE_FRAMEWORK.id,
  framework_version: LA_TROBE_FRAMEWORK.version,
  submitted_at: '2026-09-27T10:00:00.000000Z',
  created_at: '2026-09-20T10:00:00.000000Z',
  updated_at: '2026-09-27T10:00:00.000000Z',
};
