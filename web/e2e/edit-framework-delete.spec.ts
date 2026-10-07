/**
 * CAP-50, deleting a framework copy from the editor (ADR #59).
 *
 * The screen offers the delete only to the copy's creator, and only while no
 * gig has it as its rubric. Both come from the payload (created_by, assigned)
 * and the session; the rule itself is FrameworkPolicy's and FrameworkEditing's
 * and is tested in api/tests/Feature/FrameworkDeletionTest.php. Here the fake
 * serves shapes, and the 409 is injected with fail().
 *
 * Its own fixtures, so the shared list every other framework spec counts on
 * does not change.
 */
import { test as base, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi, type FrameworkDetail } from './fake-api.ts';

const TEMPLATE = 'aaaa1111-0000-4aaa-8aaa-aaaaaaaaaaaa';
const MINE = 'aaaa1111-0c01-4aaa-8aaa-aaaaaaaaaaaa';
const MINE_ASSIGNED = 'aaaa1111-0c02-4aaa-8aaa-aaaaaaaaaaaa';
const THEIRS = 'aaaa1111-0c03-4aaa-8aaa-aaaaaaaaaaaa';

const ME: components['schemas']['Me'] = {
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

const REFUSAL =
  "This framework is assigned to a gig, so it can't be deleted. Frameworks assigned to a gig are kept so every score stays readable.";

function framework(
  id: string,
  name: string,
  created_by: string | null,
  assigned: boolean,
): FrameworkDetail {
  return {
    id,
    fw_key: `key-${id.slice(10, 14)}`,
    version: 'v1',
    name,
    created_by,
    in_use: false,
    assigned,
    comment_required: true,
    evidence_required: false,
    accepted_file_types: null,
    max_file_bytes: 10485760,
    scale: { min: 1, max: 2 },
    competencies: [
      {
        id: `${id.slice(0, 24)}d00000000001`,
        code: 'collaboration',
        name: 'Collaboration',
        short_label: null,
        category: null,
        position: 1,
        levels: [1, 2].map((value) => ({
          id: `${id.slice(0, 24)}e0000000000${value}`,
          level_value: value,
          descriptor: `Collaboration at level ${value}.`,
        })),
      },
    ],
  };
}

const test = base.extend<{ api: FakeApi }>({
  api: [
    async ({ page }, provide) => {
      const api = new FakeApi(
        [
          { ...framework(TEMPLATE, 'La Trobe six-competency', null, true), in_use: true },
          framework(MINE, 'Made by mistake', ME.id, false),
          framework(MINE_ASSIGNED, 'On a gig already', ME.id, true),
          framework(
            THEIRS,
            'Someone else’s copy',
            'abcd0000-0000-4abc-8abc-abcdabcdabcd',
            false,
          ),
        ],
        ME,
      );
      await api.install(page);
      await provide(api);
      expect(api.unexpected, 'requests the fake does not serve').toEqual([]);
    },
    { auto: true },
  ],
});

async function open(page: Page, framework_id: string) {
  await page.goto(`/frameworks/${framework_id}/edit`);
  await expect(page.getByLabel('Name of your copy')).toBeVisible();
}

const delete_button = (page: Page) =>
  page.getByRole('main').getByRole('button', { name: 'Delete framework' });

test('an owner deletes an unassigned copy and lands on Frameworks with a confirmation', async ({
  page,
  api,
}) => {
  await open(page, MINE);
  await delete_button(page).click();

  // The confirm names the framework and says it is for good, and nothing
  // has been sent yet.
  const sheet = page.getByRole('dialog', { name: 'Delete Made by mistake?' });
  await expect(sheet).toContainText('Made by mistake');
  await expect(sheet).toContainText(/can.t be undone/);
  expect(api.writes()).toEqual([]);

  await sheet.getByRole('button', { name: 'Delete framework' }).click();

  await expect(page).toHaveURL('/frameworks');
  await expect(
    page.getByRole('status').filter({ hasText: 'Deleted Made by mistake.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Made by mistake' }),
  ).toHaveCount(0);
  expect(api.writes().map((call) => call.route)).toEqual(['DELETE /frameworks/:id']);
  expect(api.writes()[0].path).toBe(`/frameworks/${MINE}`);
});

// Review finding: the sheet focuses its first control, so a held or doubled
// Enter on the trigger must land on the safe answer, and a screen reader
// must hear the warning, not only the title.
test('the confirm starts on Keep it and reads out that it cannot be undone', async ({
  page,
  api,
}) => {
  await open(page, MINE);
  await delete_button(page).focus();
  await page.keyboard.press('Enter');

  const sheet = page.getByRole('dialog', { name: 'Delete Made by mistake?' });
  await expect(sheet.getByRole('button', { name: 'Keep it' })).toBeFocused();
  await expect(sheet).toHaveAccessibleDescription(/can.t be undone/);

  await page.keyboard.press('Enter');
  await expect(sheet).toHaveCount(0);
  expect(api.writes()).toEqual([]);
});

test('the confirmation on Frameworks is said once, not again on a reload', async ({
  page,
}) => {
  await open(page, MINE);
  await delete_button(page).click();
  await page
    .getByRole('dialog', { name: 'Delete Made by mistake?' })
    .getByRole('button', { name: 'Delete framework' })
    .click();
  await expect(page.getByText('Deleted Made by mistake.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Frameworks' })).toBeVisible();
  await expect(page.getByText('Deleted Made by mistake.')).toHaveCount(0);
});

test('keeping it deletes nothing', async ({ page, api }) => {
  await open(page, MINE);
  await delete_button(page).click();

  const sheet = page.getByRole('dialog', { name: 'Delete Made by mistake?' });
  await sheet.getByRole('button', { name: 'Keep it' }).click();

  await expect(sheet).toHaveCount(0);
  await expect(delete_button(page)).toBeVisible();
  await expect(page).toHaveURL(`/frameworks/${MINE}/edit`);
  expect(api.writes()).toEqual([]);
});

test('no delete for an assigned copy, a seeded template or someone else’s copy', async ({
  page,
}) => {
  for (const id of [MINE_ASSIGNED, TEMPLATE, THEIRS]) {
    await open(page, id);
    await expect(delete_button(page)).toHaveCount(0);
  }
});

test('a refusal shows the server’s message, the button goes, and the edits stay', async ({
  page,
  api,
}) => {
  await open(page, MINE);
  await page.getByLabel('Name of your copy').fill('Still typing');

  // Somebody assigned it in another tab since the page loaded.
  api.assign(MINE);
  api.fail('DELETE /frameworks/:id', {
    kind: 'error',
    status: 409,
    code: 'FRAMEWORK_ASSIGNED',
    message: REFUSAL,
  });

  await delete_button(page).click();
  await page
    .getByRole('dialog', { name: 'Delete Made by mistake?' })
    .getByRole('button', { name: 'Delete framework' })
    .click();

  await expect(page.getByRole('status').filter({ hasText: REFUSAL })).toBeVisible();
  await expect(delete_button(page)).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(`/frameworks/${MINE}/edit`);
  await expect(page.getByLabel('Name of your copy')).toHaveValue('Still typing');

  // And the framework was read again after the refusal, so the page holds
  // what the server does. After it, not a count: the dev build's StrictMode
  // runs the first load twice.
  const routes = api.calls.map((call) => call.route);
  const refused_at = routes.indexOf('DELETE /frameworks/:id');
  expect(refused_at).toBeGreaterThan(-1);
  expect(routes.slice(refused_at + 1)).toContain('GET /frameworks/:id');
});

// Review finding: the button must go on the refusal itself, not because the
// refresh happens to say assigned. Here the refresh fails, so only the
// refusal can be what hides it. Focus goes to the message, since the button
// it came from is gone.
test('after a refusal the button stays gone even if the refresh fails', async ({
  page,
  api,
}) => {
  await open(page, MINE);
  api.fail('DELETE /frameworks/:id', {
    kind: 'error',
    status: 409,
    code: 'FRAMEWORK_ASSIGNED',
    message: REFUSAL,
  });
  api.fail('GET /frameworks/:id', { kind: 'network' });

  await delete_button(page).click();
  await page
    .getByRole('dialog', { name: 'Delete Made by mistake?' })
    .getByRole('button', { name: 'Delete framework' })
    .click();

  const message = page.getByRole('status').filter({ hasText: REFUSAL });
  await expect(message).toBeVisible();
  await expect(message).toBeFocused();
  await expect(delete_button(page)).toHaveCount(0);
  await expect(page.getByLabel('Name of your copy')).toBeVisible();
});

test('any other failure is the screen’s error state', async ({ page, api }) => {
  await open(page, MINE);
  api.fail('DELETE /frameworks/:id', { kind: 'network' });

  await delete_button(page).click();
  await page
    .getByRole('dialog', { name: 'Delete Made by mistake?' })
    .getByRole('button', { name: 'Delete framework' })
    .click();

  await expect(page.getByRole('alert')).toContainText('Cannot reach the server');
  await expect(page.getByLabel('Name of your copy')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
