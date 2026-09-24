/**
 * CAP-16, the edit framework screen, in a real browser against the fake API.
 *
 * Each test asserts what the screen shows AND what it sent, because the save
 * is a sequence of requests and the screen can look right while sending the
 * wrong ones. The backend's side of every write here is in
 * api/tests/Feature/FrameworkMutationTest.php.
 */
import type { Page } from '@playwright/test';

import { EMPTY, LATROBE, NOWHERE, SFIA, expect, test } from './fixtures.ts';

function competency(page: Page, code: string) {
  return page.getByRole('group', { name: code });
}

async function open(page: Page, framework_id: string) {
  await page.goto(`/frameworks/${framework_id}/edit`);
}

const save_as_copy = (page: Page) =>
  page.getByRole('button', { name: 'Save as a new copy' });

test('every rubric, in use or not, can be copied and edited', async ({ page, api }) => {
  await page.goto('/frameworks');

  const la_trobe = page
    .getByRole('listitem')
    .filter({ hasText: 'La Trobe six-competency' });
  await expect(la_trobe.getByText('In use')).toBeVisible();
  await la_trobe.getByRole('button', { name: 'Copy and edit' }).click();

  await expect(page).toHaveURL(`/frameworks/${LATROBE}/edit`);
  await expect(page.getByRole('heading', { name: 'Copy and edit a rubric' })).toBeVisible();
  expect(api.writes()).toEqual([]);
});

test('loaded: the base, a name that says copy, every field, and nothing that changes shape', async ({
  page,
}) => {
  await open(page, LATROBE);

  await expect(page.getByLabel('Based on')).toHaveValue(LATROBE);
  await expect(page.getByLabel('Name of your copy')).toHaveValue(
    'Copy of La Trobe six-competency',
  );
  await expect(page.getByText('2 competencies, scored 1 to 4.')).toBeVisible();

  await expect(competency(page, 'collaboration').getByLabel('Competency name')).toHaveValue(
    'Collaboration',
  );
  await expect(competency(page, 'collaboration').getByLabel('Radar label')).toHaveValue(
    'Collab.',
  );
  // A null radar label is an empty field, not the text "null".
  await expect(competency(page, 'communication').getByLabel('Radar label')).toHaveValue('');
  await expect(competency(page, 'communication').getByLabel('Level 4')).toHaveValue(
    'Communication at level 4.',
  );

  // ADR #16: no control for adding, removing or resizing -- not even disabled.
  // The one button the screen itself draws is Save.
  const buttons = await page.getByRole('main').getByRole('button').allTextContents();
  expect(buttons).toEqual(['Save as a new copy']);
});

test('save: one copy, then only the fields that changed, trimmed', async ({
  page,
  api,
}) => {
  await open(page, LATROBE);

  await page.getByLabel('Name of your copy').fill('  Our rubric  ');
  await competency(page, 'collaboration').getByLabel('Competency name').fill('Teamwork');
  await competency(page, 'collaboration').getByLabel('Radar label').fill('Team');
  await competency(page, 'communication')
    .getByLabel('Level 3')
    .fill('  Explains the why.  ');
  await save_as_copy(page).click();

  await expect(page.getByText('Saved as Our rubric.')).toBeVisible();

  const [copy] = api.copies();
  const teamwork = copy.competencies.find((c) => c.code === 'collaboration')!;
  const level_3 = copy.competencies
    .find((c) => c.code === 'communication')!
    .levels.find((l) => l.level_value === 3)!;

  // The name travels on the POST, so no PATCH /frameworks. Untouched fields
  // cost nothing: two competencies and eight levels, three requests in all.
  expect(api.writes().map(({ route, path, body }) => ({ route, path, body }))).toEqual([
    {
      route: 'POST /frameworks',
      path: '/frameworks',
      body: { based_on_framework_id: LATROBE, name: 'Our rubric' },
    },
    {
      route: 'PATCH /competencies/:id',
      path: `/competencies/${teamwork.id}`,
      body: { name: 'Teamwork', short_label: 'Team' },
    },
    {
      route: 'PATCH /levels/:id',
      path: `/levels/${level_3.id}`,
      body: { descriptor: 'Explains the why.' },
    },
  ]);

  // The copy exists now, so its base is fixed and the next save edits it.
  await expect(page.getByLabel('Based on')).toBeDisabled();
  await page.getByLabel('Name of your copy').fill('Our rubric, v2');
  await page.getByRole('button', { name: 'Save changes to your copy' }).click();
  await expect(page.getByText('Saved as Our rubric, v2.')).toBeVisible();

  expect(api.writes().slice(3)).toMatchObject([
    {
      route: 'PATCH /frameworks/:id',
      path: `/frameworks/${copy.id}`,
      body: { name: 'Our rubric, v2' },
    },
  ]);
  expect(api.copies()).toHaveLength(1);
});

test('a save that fails partway finishes the same copy, not a second one', async ({
  page,
  api,
}) => {
  api.fail('PATCH /levels/:id', { kind: 'network' });
  await open(page, LATROBE);

  await competency(page, 'collaboration').getByLabel('Level 2').fill('Works with others.');
  await save_as_copy(page).click();

  await expect(
    page.getByText(/exists, but 1 of your edits have not reached it yet/),
  ).toBeVisible();
  await expect(page.getByText('Cannot reach the server')).toBeVisible();

  await page.getByRole('button', { name: 'Save changes to your copy' }).click();
  await expect(page.getByText('Saved as Copy of La Trobe six-competency.')).toBeVisible();

  const [copy] = api.copies();
  const level_2 = copy.competencies[0].levels.find((l) => l.level_value === 2)!;
  expect(api.copies()).toHaveLength(1);
  expect(api.writes().map((w) => w.path)).toEqual([
    '/frameworks',
    `/levels/${level_2.id}`,
    `/levels/${level_2.id}`,
  ]);
  expect(level_2.descriptor).toBe('Works with others.');
});

test('FRAMEWORK_IN_USE mid-edit is said plainly, and a fresh copy keeps the typing', async ({
  page,
  api,
}) => {
  const message =
    'This framework has been used to score a reflection and can no longer be changed. Copy it and edit the copy.';
  api.fail('PATCH /competencies/:id', {
    kind: 'error',
    status: 409,
    code: 'FRAMEWORK_IN_USE',
    message,
  });
  await open(page, LATROBE);

  await competency(page, 'collaboration').getByLabel('Competency name').fill('Teamwork');
  await save_as_copy(page).click();

  const alert = page.getByRole('alert').filter({ hasText: 'can no longer change' });
  await expect(alert).toContainText(message);
  await expect(
    page.getByRole('button', { name: 'Save changes to your copy' }),
  ).toBeDisabled();

  await page.getByRole('button', { name: 'Save to a fresh copy' }).click();
  await expect(page.getByText(/^Saved as /)).toBeVisible();

  const [frozen, fresh] = api.copies();
  expect(fresh.id).not.toBe(frozen.id);
  expect(fresh.competencies.find((c) => c.code === 'collaboration')!.name).toBe('Teamwork');
  expect(api.writes().map((w) => w.route)).toEqual([
    'POST /frameworks',
    'PATCH /competencies/:id',
    'POST /frameworks',
    'PATCH /competencies/:id',
  ]);
  await expect(competency(page, 'collaboration').getByLabel('Competency name')).toHaveValue(
    'Teamwork',
  );
});

test('a refused copy saves nothing and says so', async ({ page, api }) => {
  api.fail('POST /frameworks', {
    kind: 'error',
    status: 403,
    code: 'ROLE_FORBIDDEN',
    message: 'Only a supervisor can create a framework copy.',
  });
  await open(page, LATROBE);

  await save_as_copy(page).click();

  await expect(page.getByText('Nothing was saved.')).toBeVisible();
  await expect(page.getByText('You do not have access to this')).toBeVisible();
  await expect(
    page.getByText('Only a supervisor can create a framework copy.'),
  ).toBeVisible();
  expect(api.writes().map((w) => w.route)).toEqual(['POST /frameworks']);
  await expect(page.getByLabel('Based on')).toBeEnabled();
});

test('error: a rubric that does not exist', async ({ page }) => {
  await open(page, NOWHERE);

  await expect(page.getByRole('heading', { name: 'Copy and edit a rubric' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Not found');
  await expect(page.getByRole('link', { name: /Frameworks/ }).first()).toBeVisible();
});

test('empty: a rubric with no competencies has nothing to rename', async ({ page }) => {
  await open(page, EMPTY);

  await expect(page.getByText('Nothing to rename.')).toBeVisible();
  await expect(page.getByLabel('Based on')).toBeEnabled();
  await expect(page.getByRole('button', { name: /Save/ })).toHaveCount(0);
});

test('loading: skeletons shaped like the form, not a spinner', async ({ page, api }) => {
  const release = api.hold('GET /frameworks/:id');
  await open(page, LATROBE);

  await expect(
    page.getByRole('status').filter({ hasText: 'Loading rubric' }),
  ).toBeVisible();
  await expect(page.getByLabel('Name of your copy')).toHaveCount(0);

  release();
  await expect(page.getByLabel('Name of your copy')).toBeVisible();
});

test('a blank field blocks the save and is named', async ({ page, api }) => {
  await open(page, LATROBE);

  await competency(page, 'collaboration').getByLabel('Level 2').fill('   ');

  await expect(
    page.getByText('Needs text before it can save: collaboration: level 2.'),
  ).toBeVisible();
  await expect(save_as_copy(page)).toBeDisabled();
  expect(api.writes()).toEqual([]);
});

test('choosing another base warns first, then starts from it', async ({ page }) => {
  await open(page, LATROBE);
  await expect(
    page.getByText('Choosing a different rubric discards your edits.'),
  ).toHaveCount(0);

  await competency(page, 'collaboration').getByLabel('Competency name').fill('Teamwork');
  await expect(
    page.getByText('Choosing a different rubric discards your edits.'),
  ).toBeVisible();

  await page.getByLabel('Based on').selectOption(SFIA);

  await expect(page).toHaveURL(`/frameworks/${SFIA}/edit`);
  await expect(page.getByLabel('Name of your copy')).toHaveValue('Copy of SFIA 9');
  // SFIA's skills carry a category and start part-way up the scale.
  const prog = page.getByRole('group', { name: 'PROG · Development and implementation' });
  await expect(prog.getByLabel('Level 2')).toBeVisible();
  await expect(prog.getByLabel('Level 1')).toHaveCount(0);
});

test('phone width: nothing scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, SFIA);
  await expect(page.getByLabel('Name of your copy')).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
