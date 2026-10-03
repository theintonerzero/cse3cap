/**
 * Hostile text, for CAP-24's injection checks (docs/Security-Review.md).
 *
 * Every field a person types and a screen renders carries PAYLOAD here: the
 * student's narrative and evidence, the assessor's comment, a supervisor's
 * rubric wording, and the display names that arrive from Alumable. The specs
 * assert it shows up as literal text and never as markup.
 *
 * The payload carries two vectors on purpose. A <script> added through
 * innerHTML never runs, so on its own it would pass even against a real
 * sink. An <img> with onerror does run, and that is what makes a sink fail
 * assertInert. JS_URI is the evidence link a scheme check has to refuse.
 */
import { test as base, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionDetail,
  type ReflectionEvent,
} from './fake-api.ts';

export const PAYLOAD =
  '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>';
export const JS_URI = 'javascript:window.__pwned=1';

export const HOSTILE_FRAMEWORK = '99990001-0000-4999-8999-999999999999';
export const HOSTILE_GIG = '99990002-0000-4999-8999-999999999999';
export const HOSTILE_REFLECTION = '99990003-0000-4999-8999-999999999999';

const SPRINT = '99990004-0000-4999-8999-999999999999';
const COMPETENCY = '99990005-0000-4999-8999-999999999999';
const ENTRY = '99990006-0000-4999-8999-999999999999';
const level_id = (value: number) => `9999001${value}-0000-4999-8999-999999999999`;

/** No markup from PAYLOAD reached the DOM, and nothing in it ran. */
export async function assertInert(page: Page): Promise<void> {
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as { __pwned?: number }).__pwned),
    'PAYLOAD ran',
  ).toBeUndefined();
}

// Also a supervisor on a second gig, because the edit-framework check plays a
// supervisor saving a copy: the framework screens are the supervisor's
// (ADR #48), and only a supervisor's copy would be accepted by the server.
const ME: components['schemas']['Me'] = {
  id: '99990007-0000-4999-8999-999999999999',
  display_name: 'Reviewer',
  participations: [
    { gig_id: HOSTILE_GIG, gig_title: PAYLOAD, role: 'assessor' },
    {
      gig_id: '99990010-0000-4999-8999-999999999999',
      gig_title: 'A supervised gig',
      role: 'supervisor',
    },
  ],
};

const FRAMEWORK: FrameworkDetail = {
  id: HOSTILE_FRAMEWORK,
  fw_key: 'hostile',
  version: 'v1',
  name: PAYLOAD,
  created_by: null,
  in_use: false,
  comment_required: true,
  evidence_required: false,
  accepted_file_types: ['pdf'],
  max_file_bytes: 10485760,
  scale: { min: 1, max: 2 },
  competencies: [
    {
      id: COMPETENCY,
      code: 'hostile',
      name: PAYLOAD,
      short_label: PAYLOAD,
      category: null,
      position: 1,
      levels: [1, 2].map((value) => ({
        id: level_id(value),
        level_value: value,
        descriptor: PAYLOAD,
      })),
    },
  ],
};

const GIG: GigDetail = {
  id: HOSTILE_GIG,
  title: PAYLOAD,
  org_name: PAYLOAD,
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [{ id: SPRINT, ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' }],
  framework: { id: HOSTILE_FRAMEWORK, fw_key: 'hostile', name: PAYLOAD, version: 'v1' },
  reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
  participants: [
    { id: 'p-student', display_name: PAYLOAD, role: 'student' },
    { id: 'p-assessor', display_name: PAYLOAD, role: 'assessor' },
  ],
};

const REFLECTION: ReflectionDetail = {
  id: HOSTILE_REFLECTION,
  status: 'submitted',
  gig_id: HOSTILE_GIG,
  sprint_id: SPRINT,
  sprint_ordinal: 1,
  framework_id: HOSTILE_FRAMEWORK,
  framework_version: 'v1',
  submitted_at: '2026-09-27T10:00:00.000000Z',
  created_at: '2026-09-20T10:00:00.000000Z',
  updated_at: '2026-09-27T10:00:00.000000Z',
  owner: { id: '99990008-0000-4999-8999-999999999999', display_name: PAYLOAD },
  entries: [
    {
      id: ENTRY,
      competency_id: COMPETENCY,
      competency_code: 'hostile',
      competency_name: PAYLOAD,
      short_label: PAYLOAD,
      position: 1,
      narrative: PAYLOAD,
      evidence: [
        {
          id: '99990009-0000-4999-8999-999999999999',
          reflection_entry_id: ENTRY,
          kind: 'link',
          label: PAYLOAD,
          uri: JS_URI,
          size_bytes: null,
          uploaded_at: '2026-09-21T10:00:00.000000Z',
        },
        {
          id: '9999000a-0000-4999-8999-999999999999',
          reflection_entry_id: ENTRY,
          kind: 'file',
          label: PAYLOAD,
          uri: 'evidence/99990006/report.pdf',
          size_bytes: 2048,
          uploaded_at: '2026-09-21T10:00:00.000000Z',
        },
      ],
      scores: [
        {
          id: '9999000b-0000-4999-8999-999999999999',
          reflection_entry_id: ENTRY,
          scorer_role: 'student',
          scorer_class: 'self',
          level_id: level_id(2),
          level_value: 2,
          comment: null,
          scored_at: '2026-09-22T10:00:00.000000Z',
          scorer: { id: '99990008-0000-4999-8999-999999999999', display_name: PAYLOAD },
        },
        {
          id: '9999000c-0000-4999-8999-999999999999',
          reflection_entry_id: ENTRY,
          scorer_role: 'supervisor',
          scorer_class: 'counter',
          level_id: level_id(1),
          level_value: 1,
          comment: PAYLOAD,
          scored_at: '2026-09-28T10:00:00.000000Z',
          scorer: { id: '9999000d-0000-4999-8999-999999999999', display_name: PAYLOAD },
        },
      ],
    },
  ],
};

const EVENTS: ReflectionEvent[] = [
  {
    id: '9999000e-0000-4999-8999-999999999999',
    event_type: 'reflection_submitted',
    actor_display_name: PAYLOAD,
    occurred_at: '2026-09-27T10:00:00.000000Z',
    metadata: { note: PAYLOAD },
  },
  {
    id: '9999000f-0000-4999-8999-999999999999',
    event_type: '<b>odd</b>',
    actor_display_name: null,
    occurred_at: '2026-09-28T10:00:00.000000Z',
    metadata: {},
  },
];

/** The fake with only the hostile data in it, auto-installed like fixtures.ts's. */
export const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi([FRAMEWORK], ME, [GIG], [REFLECTION], {
        [HOSTILE_REFLECTION]: EVENTS,
      });
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
