/**
 * CAP-52: switching user in the demo shell, mid-edit.
 *
 * "Switch user" clears the token synchronously, before React unmounts the
 * stepper, so a save left to the unmount would go out with no Authorization
 * header. The narrative box therefore saves on blur, which the menu button
 * causes while the token is still set. Self-contained, ids prefixed '5253'.
 */
import { test, expect } from '@playwright/test';

import type { components } from '../../src/api/schema.ts';
import {
  FakeApi,
  type FrameworkDetail,
  type GigDetail,
  type ReflectionDetail,
} from '../fake-api.ts';

type Me = components['schemas']['Me'];

const id = (n: string) => `5253${n}-0000-4535-8535-535353535353`;
const GIG = id('0001');
const FRAMEWORK = id('0002');
const SPRINT = id('0003');
const DRAFT = id('0005');

const me: Me = {
  id: id('0007'),
  display_name: 'Jane N',
  participations: [{ gig_id: GIG, gig_title: 'Develop AI use cases', role: 'student' }],
};

const rubric: FrameworkDetail = {
  id: FRAMEWORK,
  fw_key: 'e2e-switch',
  version: 'v1',
  name: 'E2E rubric',
  created_by: null,
  in_use: true,
  assigned: true,
  comment_required: false,
  evidence_required: false,
  accepted_file_types: ['pdf'],
  max_file_bytes: 10485760,
  scale: { min: 1, max: 4 },
  competencies: [
    {
      id: id('00c0'),
      code: 'contribution',
      name: 'Contribution',
      short_label: null,
      category: null,
      position: 1,
      levels: [1, 2, 3, 4].map((value) => ({
        id: id(`00l${value}`),
        level_value: value,
        descriptor: `Contribution at level ${value}.`,
      })),
    },
  ],
};

const gig: GigDetail = {
  id: GIG,
  title: 'Develop AI use cases',
  org_name: 'Alumable',
  starts_on: '2026-08-01',
  ends_on: '2026-11-01',
  my_role: 'student',
  sprints: [{ id: SPRINT, ordinal: 3, opens_on: '2026-08-29', due_on: '2026-09-11' }],
  framework: { id: FRAMEWORK, fw_key: 'e2e-switch', name: rubric.name, version: 'v1' },
  reflection_summary: { draft: 1, submitted: 0, assessed: 0 },
  participants: [{ id: me.id, display_name: me.display_name, role: 'student' }],
};

const draft: ReflectionDetail = {
  id: DRAFT,
  status: 'draft',
  gig_id: GIG,
  sprint_id: SPRINT,
  sprint_ordinal: 3,
  framework_id: FRAMEWORK,
  framework_version: 'v1',
  submitted_at: null,
  created_at: '2026-09-01T10:00:00.000000Z',
  updated_at: '2026-09-01T10:00:00.000000Z',
  owner: { id: me.id, display_name: me.display_name },
  entries: [
    {
      id: id('a0e0'),
      competency_id: id('00c0'),
      competency_code: 'contribution',
      competency_name: 'Contribution',
      short_label: null,
      position: 1,
      narrative: null,
      evidence: [],
      scores: [],
    },
  ],
};

test('Switch user sends the edit still waiting, with the token it was typed under', async ({
  page,
}) => {
  const api = new FakeApi([rubric], me, [gig], [draft]);
  await api.install(page);
  await page.goto(`/reflections/${DRAFT}`);

  const typed = 'Typed just before switching user.';
  await page.getByRole('textbox', { name: 'Your reflection' }).fill(typed);
  const patch = page.waitForRequest(
    (request) => request.method() === 'PATCH' && /\/entries\//.test(request.url()),
  );
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('menuitem', { name: /Switch (user|profile)/ }).click();

  const request = await patch;
  expect(request.headers()['authorization'], 'the save must carry the token').toBeTruthy();
  expect(JSON.parse(request.postData()!).narrative).toBe(typed);
});
