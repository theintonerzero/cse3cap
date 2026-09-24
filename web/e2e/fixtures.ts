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
import { FakeApi, type FrameworkDetail } from './fake-api.ts';

export const LATROBE = 'aaaa1111-0000-4aaa-8aaa-aaaaaaaaaaaa';
export const SFIA = 'bbbb2222-0000-4bbb-8bbb-bbbbbbbbbbbb';
export const EMPTY = 'cccc3333-0000-4ccc-8ccc-cccccccccccc';
export const NOWHERE = 'ffff9999-0000-4fff-8fff-ffffffffffff';

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
      const api = new FakeApi([LA_TROBE_DETAIL, SFIA_DETAIL, EMPTY_DETAIL], DR_LEE);
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
