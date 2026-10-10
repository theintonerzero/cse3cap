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
import type {
  FrameworkDetail,
  GigDetail,
  ReflectionDetail,
  ReflectionSummary,
} from '../fake-api.ts';

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
  assigned: true,
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

/**
 * A rubric with no competencies, for Edit Framework's own empty state
 * (CAP-21: `base.competencies.length === 0` -> "Nothing to rename."). Not
 * reachable through normal use -- ReflectionCreator and the schema both
 * assume a rubric has at least one competency -- but Edit Framework reads
 * the base straight off the route param, so a broken or hand-edited row
 * still renders a designed empty state rather than crashing. `created_by:
 * null` puts it in the Templates group the same way LA_TROBE_FRAMEWORK is.
 */
export const EMPTY_FRAMEWORK: FrameworkDetail = {
  id: 'ffff1111-0f02-4fff-8fff-ffffffffffff',
  fw_key: 'shots-empty',
  version: 'v1',
  name: 'Empty rubric',
  created_by: null,
  in_use: false,
  assigned: false,
  comment_required: true,
  evidence_required: false,
  accepted_file_types: ['pdf', 'png', 'jpg'],
  max_file_bytes: 10485760,
  scale: { min: 1, max: 4 },
  competencies: [],
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

/**
 * The assessor identity for Review Queue and the Entry Stepper's assessor
 * mode (CAP-13/CAP-10) -- the same id GIG.participants above already lists
 * as "Sam O", so the two stay one identity rather than two coincidentally
 * matching ones.
 */
export const SAM: Me = {
  id: 'ffff1111-0002-4fff-8fff-ffffffffffff',
  display_name: 'Sam O',
  participations: [{ gig_id: GIG.id, gig_title: GIG.title, role: 'assessor' }],
};

/** The supervisor identity for Select Framework and Edit Framework (CAP-15/CAP-16). */
export const DR_LEE: Me = {
  id: 'ffff1111-0003-4fff-8fff-ffffffffffff',
  display_name: 'Dr Lee',
  participations: [{ gig_id: GIG.id, gig_title: GIG.title, role: 'supervisor' }],
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

/**
 * A gig with nothing written on it yet: no sprints, so nothing to score
 * against. Diary Home's own "Nothing in your diary yet" empty state (as
 * opposed to "you are not a student on any gig") needs a gig the caller
 * *is* a student on, paired with an empty reflections list -- an empty
 * `gigs` array on its own would land on the different "not a student"
 * empty state instead.
 */
export const EMPTY_GIG: GigDetail = {
  id: 'ffff1111-0a02-4fff-8fff-ffffffffffff',
  title: 'Brand new placement',
  org_name: 'Alumable',
  starts_on: '2026-10-01',
  ends_on: '2026-12-01',
  my_role: 'student',
  sprints: [],
  framework: null,
  reflection_summary: { draft: 0, submitted: 0, assessed: 0 },
  participants: [{ id: JANE.id, display_name: 'Jane', role: 'student' }],
};

/**
 * One competency, one entry, self-scored: the Entry Stepper's `loaded`
 * shape for a student still working a draft. `scorer_role` is the scorer's
 * own participant role ('student'), not the literal 'self' the `scores`
 * table stores server-side -- ReflectionDetailResource derives the wire
 * `scorer_class` from that DB value, but the wire `scorer_role` itself is
 * typed as Role, which has no 'self' member. web/e2e/hostile.ts's own
 * ENTRY fixture already resolves this the same way; matched here rather
 * than invented afresh.
 */
export const REFLECTION_DRAFT_DETAIL: ReflectionDetail = {
  id: 'ffff1111-0b02-4fff-8fff-ffffffffffff',
  status: 'draft',
  gig_id: GIG.id,
  sprint_id: GIG.sprints[0].id,
  sprint_ordinal: 1,
  framework_id: LA_TROBE_FRAMEWORK.id,
  framework_version: LA_TROBE_FRAMEWORK.version,
  submitted_at: null,
  created_at: '2026-09-20T10:00:00.000000Z',
  updated_at: '2026-09-24T10:00:00.000000Z',
  owner: { id: JANE.id, display_name: 'Jane' },
  entries: [
    {
      id: 'ffff1111-0d01-4fff-8fff-ffffffffffff',
      competency_id: LA_TROBE_FRAMEWORK.competencies[0].id,
      competency_code: LA_TROBE_FRAMEWORK.competencies[0].code,
      competency_name: LA_TROBE_FRAMEWORK.competencies[0].name,
      short_label: LA_TROBE_FRAMEWORK.competencies[0].short_label,
      position: LA_TROBE_FRAMEWORK.competencies[0].position,
      narrative: 'I kept the team updated on my blockers during standups this sprint.',
      evidence: [],
      scores: [
        {
          id: 'ffff1111-0e01-4fff-8fff-ffffffffffff',
          reflection_entry_id: 'ffff1111-0d01-4fff-8fff-ffffffffffff',
          scorer_role: 'student',
          scorer_class: 'self',
          level_id: LA_TROBE_FRAMEWORK.competencies[0].levels[2].id,
          level_value: 3,
          comment: null,
          scored_at: '2026-09-24T10:00:00.000000Z',
          scorer: { id: JANE.id, display_name: 'Jane' },
        },
      ],
    },
  ],
};

/**
 * The same reflection, submitted: the Entry Stepper's `loaded` shape for
 * the assessor mode (CAP-13), self-scored but not yet counter-scored, so
 * CounterScorePanel renders its open scoring form rather than a saved
 * score or nothing at all.
 */
export const REFLECTION_SUBMITTED_DETAIL: ReflectionDetail = {
  id: 'ffff1111-0b03-4fff-8fff-ffffffffffff',
  status: 'submitted',
  gig_id: GIG.id,
  sprint_id: GIG.sprints[0].id,
  sprint_ordinal: 1,
  framework_id: LA_TROBE_FRAMEWORK.id,
  framework_version: LA_TROBE_FRAMEWORK.version,
  submitted_at: '2026-09-27T10:00:00.000000Z',
  created_at: '2026-09-20T10:00:00.000000Z',
  updated_at: '2026-09-27T10:00:00.000000Z',
  owner: { id: JANE.id, display_name: 'Jane' },
  entries: [
    {
      id: 'ffff1111-0d02-4fff-8fff-ffffffffffff',
      competency_id: LA_TROBE_FRAMEWORK.competencies[0].id,
      competency_code: LA_TROBE_FRAMEWORK.competencies[0].code,
      competency_name: LA_TROBE_FRAMEWORK.competencies[0].name,
      short_label: LA_TROBE_FRAMEWORK.competencies[0].short_label,
      position: LA_TROBE_FRAMEWORK.competencies[0].position,
      narrative: 'I kept the team updated on my blockers during standups this sprint.',
      evidence: [],
      scores: [
        {
          id: 'ffff1111-0e02-4fff-8fff-ffffffffffff',
          reflection_entry_id: 'ffff1111-0d02-4fff-8fff-ffffffffffff',
          scorer_role: 'student',
          scorer_class: 'self',
          level_id: LA_TROBE_FRAMEWORK.competencies[0].levels[2].id,
          level_value: 3,
          comment: null,
          scored_at: '2026-09-24T10:00:00.000000Z',
          scorer: { id: JANE.id, display_name: 'Jane' },
        },
      ],
    },
  ],
};

/**
 * A reflection whose snapshotted rubric has no competencies, so it has no
 * entries either -- ReflectionCreator makes one entry per competency
 * eagerly, so this is only reachable with a broken rubric, but the Entry
 * Stepper still renders a designed empty state for it rather than crashing,
 * and that state is one of this task's four required shots.
 */
export const REFLECTION_EMPTY_DETAIL: ReflectionDetail = {
  id: 'ffff1111-0b04-4fff-8fff-ffffffffffff',
  status: 'draft',
  gig_id: GIG.id,
  sprint_id: GIG.sprints[0].id,
  sprint_ordinal: 1,
  framework_id: LA_TROBE_FRAMEWORK.id,
  framework_version: LA_TROBE_FRAMEWORK.version,
  submitted_at: null,
  created_at: '2026-09-20T10:00:00.000000Z',
  updated_at: '2026-09-20T10:00:00.000000Z',
  owner: { id: JANE.id, display_name: 'Jane' },
  entries: [],
};
