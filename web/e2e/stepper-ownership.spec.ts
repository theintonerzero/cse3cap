/**
 * CAP-36, F9 in docs/Security-Review.md: the student stepper is editable for
 * the reflection's owner and nobody else.
 *
 * The permission matrix lets every reviewer on a gig read a draft on it, so
 * an assessor can open /reflections/{id} and get the student's mode. The
 * server refuses each write (ReflectionPolicy::update, held by
 * ReflectionWritePathTest and CAP-37's tests), so this is not a way in. What
 * it checks is that the screen stops offering controls it will then refuse:
 * nothing editable, and nothing sent.
 *
 * The signed-in user is a fixture option, so one spec can be Sam on Jane's
 * draft and Jane on her own.
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

const GIG = '36360001-0000-4336-8336-363636363636';
const FRAMEWORK = '36360002-0000-4336-8336-363636363636';
const SPRINT = '36360003-0000-4336-8336-363636363636';
const COMPETENCY = '36360004-0000-4336-8336-363636363636';
const DRAFT = '36360005-0000-4336-8336-363636363636';
const SUBMITTED = '36360006-0000-4336-8336-363636363636';
const level_id = (value: number) => `3636001${value}-0000-4336-8336-363636363636`;

const JANE: Me = {
  id: '36360007-0000-4336-8336-363636363636',
  display_name: 'Jane D',
  participations: [{ gig_id: GIG, gig_title: 'Develop AI use cases', role: 'student' }],
};

const SAM: Me = {
  id: '36360008-0000-4336-8336-363636363636',
  display_name: 'Sam O',
  participations: [{ gig_id: GIG, gig_title: 'Develop AI use cases', role: 'assessor' }],
};

const RUBRIC: FrameworkDetail = {
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
  scale: { min: 1, max: 2 },
  competencies: [
    {
      id: COMPETENCY,
      code: 'collaboration',
      name: 'Collaboration',
      short_label: null,
      category: null,
      position: 1,
      levels: [1, 2].map((value) => ({
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
  reflection_summary: { draft: 1, submitted: 1, assessed: 0 },
  participants: [
    { id: JANE.id, display_name: JANE.display_name, role: 'student' },
    { id: SAM.id, display_name: SAM.display_name, role: 'assessor' },
  ],
};

/** Jane's draft, part-way through: a narrative, a self-score and one link. */
function reflection(id: string, status: ReflectionDetail['status']): ReflectionDetail {
  // Child ids share the reflection's first group, so each reflection's are distinct.
  const child = (n: number) => `${id.slice(0, 9)}0e0${n}-4336-8336-363636363636`;
  const entry = child(1);
  return {
    id,
    status,
    gig_id: GIG,
    sprint_id: SPRINT,
    sprint_ordinal: 1,
    framework_id: FRAMEWORK,
    framework_version: 'v1',
    submitted_at: status === 'draft' ? null : '2026-09-27T10:00:00.000000Z',
    created_at: '2026-09-20T10:00:00.000000Z',
    updated_at: '2026-09-27T10:00:00.000000Z',
    owner: { id: JANE.id, display_name: JANE.display_name },
    entries: [
      {
        id: entry,
        competency_id: COMPETENCY,
        competency_code: 'collaboration',
        competency_name: 'Collaboration',
        short_label: null,
        position: 1,
        narrative: 'Paired with Priya on the import script.',
        evidence: [
          {
            id: child(2),
            reflection_entry_id: entry,
            kind: 'link',
            label: 'Pull request',
            uri: 'https://example.org/pr/1',
            size_bytes: null,
            uploaded_at: '2026-09-21T10:00:00.000000Z',
          },
        ],
        scores: [
          {
            id: child(3),
            reflection_entry_id: entry,
            scorer_role: 'student',
            scorer_class: 'self',
            level_id: level_id(2),
            level_value: 2,
            comment: null,
            scored_at: '2026-09-22T10:00:00.000000Z',
            scorer: { id: JANE.id, display_name: JANE.display_name },
          },
        ],
      },
    ],
  };
}

const test = base.extend<{ me: Me; api: FakeApi }>({
  me: [JANE, { option: true }],
  api: [
    async ({ page, me }, provide) => {
      const api = new FakeApi(
        [RUBRIC],
        me,
        [GIG_DETAIL],
        [reflection(DRAFT, 'draft'), reflection(SUBMITTED, 'submitted')],
      );
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

test.describe('a reviewer on the gig', () => {
  test.use({ me: SAM });

  test("opens a student's draft: nothing to edit, and nothing sent", async ({
    page,
    api,
  }) => {
    await page.goto(`/reflections/${DRAFT}`);
    const narrative = page.getByLabel('Your reflection');
    await expect(narrative).toHaveValue('Paired with Priya on the import script.');

    await expect(narrative).toBeDisabled();
    for (const chip of await page
      .getByRole('radiogroup', { name: 'Self-score' })
      .getByRole('radio')
      .all()) {
      await expect(chip).toBeDisabled();
    }
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add a link' })).toHaveCount(0);
    await expect(page.getByText('Attach a file')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);

    // Nothing has been tried yet, so this only says loading wrote nothing. The
    // test below is the one that tries.
    expect(api.writes()).toEqual([]);
  });

  test("tries to self-score a student's draft: no write leaves the page", async ({
    page,
    api,
  }) => {
    await page.goto(`/reflections/${DRAFT}`);
    const chips = page.getByRole('radiogroup', { name: 'Self-score' }).getByRole('radio');
    await expect(chips.first()).toBeVisible();

    // force skips Playwright's "is it enabled" wait, so the click reaches the
    // button whatever its state. An enabled chip would PUT the score at once
    // (choose_level in EntryStepper); a disabled one does nothing.
    for (const chip of await chips.all()) {
      await chip.click({ force: true });
    }
    await page.waitForLoadState('networkidle');

    // The server would refuse each of these with 403 ROLE_FORBIDDEN; the screen
    // must not send them at all (F9).
    expect(api.writes()).toEqual([]);
  });
});

test.describe('the owner', () => {
  test('opens her own draft: still editable', async ({ page }) => {
    await page.goto(`/reflections/${DRAFT}`);
    const narrative = page.getByLabel('Your reflection');
    await expect(narrative).toHaveValue('Paired with Priya on the import script.');

    await expect(narrative).toBeEnabled();
    await expect(
      page.getByRole('radiogroup', { name: 'Self-score' }).getByRole('radio').first(),
    ).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a link' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();
  });

  test('opens her own submitted reflection: read-only', async ({ page }) => {
    await page.goto(`/reflections/${SUBMITTED}`);
    const narrative = page.getByLabel('Your reflection');
    await expect(narrative).toHaveValue('Paired with Priya on the import script.');

    await expect(narrative).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Remove' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0);
  });
});
