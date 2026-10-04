/**
 * CAP-38 R3: the top bar. Back goes up one fixed level, not through
 * history, so a pasted link still has somewhere to go; on a top screen it
 * offers to leave the diary, which here means the switch-user screen.
 * The bar title is the section, and the diary home's only h1.
 *
 * These are about the shell, so the screen under it may be in any state;
 * no test here asserts on what the screen itself rendered.
 *
 * Self-contained scenario, ids prefixed '3803'.
 */
import { test, expect, type Page } from '@playwright/test';

import type { components } from '../src/api/schema.ts';
import { FakeApi, type GigDetail, type ReflectionSummary } from './fake-api.ts';

type Me = components['schemas']['Me'];
type Role = GigDetail['my_role'];

const id = (n: string) => `3803${n}-0000-4803-8803-380338033803`;
const PERSON = id('0001');
const FRAMEWORK = id('0002');
const GIG = id('0003');
const SPRINT = id('0004');
const REFLECTION = id('00a0');
const LONG_NAME = 'Maximiliana Alexandrovna Wolfeschlegelsteinhausenbergerdorff';

function gig(role: Role): GigDetail {
  return {
    id: GIG,
    title: 'Gig one',
    org_name: 'Alumable',
    starts_on: '2026-08-01',
    ends_on: '2026-11-01',
    my_role: role,
    sprints: [{ id: SPRINT, ordinal: 1, opens_on: '2026-08-01', due_on: '2026-08-14' }],
    framework: { id: FRAMEWORK, fw_key: 'e2e-shell', name: 'E2E rubric', version: 'v1' },
    reflection_summary: { draft: 0, submitted: 1, assessed: 0 },
    participants: [{ id: PERSON, display_name: 'Ash', role }],
  };
}

const ROW: ReflectionSummary = {
  id: REFLECTION,
  status: 'submitted',
  gig_id: GIG,
  sprint_id: SPRINT,
  sprint_ordinal: 1,
  framework_id: FRAMEWORK,
  framework_version: 'v1',
  submitted_at: '2026-08-14T10:00:00.000000Z',
  created_at: '2026-08-10T10:00:00.000000Z',
  updated_at: '2026-08-14T10:00:00.000000Z',
};

function me(display_name: string, role: Role): Me {
  return {
    id: PERSON,
    display_name,
    participations: [{ gig_id: GIG, gig_title: 'Gig one', role }],
  };
}

async function install(page: Page, display_name: string, role: Role = 'student') {
  const api = new FakeApi([], me(display_name, role), [gig(role)], [ROW]);
  await api.install(page);
  await page.route('**/api/v1/me/radar**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: '{"error":{"code":"NOT_FOUND","message":"x","details":{}}}',
    }),
  );
  return api;
}

test.describe('back', () => {
  for (const path of [`/gigs/${GIG}`, `/reflections/${REFLECTION}/submitted`]) {
    test(`${path}: a link back to the diary home`, async ({ page }) => {
      await install(page, 'Ash');
      await page.goto(path);
      const back = page.getByRole('banner').getByRole('link', {
        name: 'Back to Reflection Diary',
      });
      await expect(back).toBeVisible();
      await back.click();
      await expect(page).toHaveURL(/\/$/);
    });
  }

  test('a scoring screen goes back to the review queue', async ({ page }) => {
    await install(page, 'Sam O', 'assessor');
    await page.goto(`/review-queue/reflections/${REFLECTION}`);
    const back = page
      .getByRole('banner')
      .getByRole('link', { name: 'Back to Review queue' });
    await expect(back).toHaveAttribute('href', '/review-queue');
  });

  test('a top screen offers to leave; Stay keeps you here', async ({ page }) => {
    await install(page, 'Ash');
    await page.goto('/');
    await page.getByRole('button', { name: 'Leave the Reflection Diary' }).click();
    const sheet = page.getByRole('dialog', { name: 'Leave the Reflection Diary?' });
    await expect(
      sheet.getByText('This takes you back to the switch user screen.'),
    ).toBeVisible();
    await sheet.getByRole('button', { name: 'Stay' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Reflection Diary' }),
    ).toBeVisible();
  });

  test('Leave lands on the token screen with the saved user still listed', async ({
    page,
  }) => {
    await install(page, 'Ash');
    await page.goto('/');
    await page.getByRole('button', { name: 'Leave the Reflection Diary' }).click();
    await page
      .getByRole('dialog', { name: 'Leave the Reflection Diary?' })
      .getByRole('button', { name: 'Leave' })
      .click();
    await expect(page.getByRole('banner')).toHaveCount(0);
    // FakeApi signs in through the supervisor slot. Leave keeps its token,
    // so the slot shows without a "+" and one tap brings you back.
    const saved = page.getByRole('button', { name: 'Supervisor', exact: true });
    await expect(saved).toBeVisible();
    await saved.click();
    await expect(page.getByRole('banner')).toBeVisible();
  });
});

test.describe('title and nav', () => {
  test('the diary home has exactly one h1, the bar title', async ({ page }) => {
    await install(page, 'Ash');
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(['Reflection Diary']);
    await expect(page.getByRole('heading', { name: 'Your diary' })).toHaveCount(0);
  });

  test('a one-role student sees no nav pills', async ({ page }) => {
    await install(page, 'Ash');
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
  });

  test('someone with two destinations sees the pills', async ({ page }) => {
    await install(page, 'Dr Lee', 'supervisor');
    await page.goto('/review-queue');
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link')).toHaveText(['Review queue', 'Frameworks']);
  });

  test('360: a long name never covers the centred title', async ({ page }) => {
    await install(page, LONG_NAME, 'assessor');
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/review-queue');
    const banner = page.getByRole('banner');
    await expect(banner.getByText(LONG_NAME)).toBeVisible();
    // Both boxes in one frame, after the web font is in: measured in two
    // calls, a font swap between them skewed the result under load.
    const { title_right, name_left } = await banner.evaluate(async (header) => {
      await document.fonts.ready;
      const title = [...header.querySelectorAll('span, h1')].find(
        (el) => el.textContent === 'Reflection Diary',
      )!;
      const name = [...header.querySelectorAll('span')].find((el) =>
        el.textContent?.startsWith('Maximiliana'),
      )!;
      return {
        title_right: title.getBoundingClientRect().right,
        name_left: name.getBoundingClientRect().left,
      };
    });
    expect(name_left, 'the name starts right of the title').toBeGreaterThanOrEqual(
      title_right - 1,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0);
  });
});

test.describe('⋮ menu', () => {
  test('keyboard: ArrowDown opens on the first item, arrows move, Escape returns to ⋮', async ({
    page,
  }) => {
    await install(page, 'Ash');
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'More options' });
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const switch_user = page.getByRole('menuitem', { name: 'Switch user' });
    const dark = page.getByRole('menuitemcheckbox', { name: 'Dark mode' });
    await expect(switch_user).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(dark).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(switch_user).toBeFocused();
    await page.keyboard.press('End');
    await expect(dark).toBeFocused();
    await page.keyboard.press('Home');
    await expect(switch_user).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('Enter opens it too, and Tab closes it', async ({ page }) => {
    await install(page, 'Ash');
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'More options' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Switch user' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('a click outside closes it', async ({ page }) => {
    await install(page, 'Ash');
    await page.goto('/');
    await page.getByRole('button', { name: 'More options' }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.mouse.click(5, 400);
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('Dark mode toggles the theme and survives a reload', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await install(page, 'Ash');
    await page.goto('/');
    await page.getByRole('button', { name: 'More options' }).click();
    const dark = page.getByRole('menuitemcheckbox', { name: 'Dark mode' });
    await expect(dark).toHaveAttribute('aria-checked', 'false');
    await dark.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: 'More options' }).click();
    await expect(page.getByRole('menuitemcheckbox', { name: 'Dark mode' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  test('Dark mode reflects the system theme before any choice', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await install(page, 'Ash');
    await page.goto('/');
    await page.getByRole('button', { name: 'More options' }).click();
    const dark = page.getByRole('menuitemcheckbox', { name: 'Dark mode' });
    await expect(dark).toHaveAttribute('aria-checked', 'true');
    await dark.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('Switch user opens the sheet, and focus comes back to ⋮', async ({ page }) => {
    await install(page, 'Ash');
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'More options' });
    await trigger.click();
    await page.getByRole('menuitem', { name: 'Switch user' }).click();
    const sheet = page.getByRole('dialog', { name: 'Switch user' });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('360: the open menu stays inside the viewport', async ({ page }) => {
    await install(page, LONG_NAME);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    await page.getByRole('button', { name: 'More options' }).click();
    const box = (await page.getByRole('menu').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
  });

  test('the name is text, not a button', async ({ page }) => {
    await install(page, 'Ash');
    await page.goto('/');
    const banner = page.getByRole('banner');
    await expect(banner.getByText('Ash', { exact: true })).toBeVisible();
    await expect(banner.getByRole('button', { name: /Ash/ })).toHaveCount(0);
    await expect(banner.getByRole('button', { name: /^(Dark|Light)$/ })).toHaveCount(0);
  });
});

test.describe('section tint', () => {
  test('diary home carries data-section="diary"; a deeper screen carries none', async ({
    page,
  }) => {
    await install(page, 'Ash');
    await page.goto('/');
    await expect(page.locator('[data-section="diary"]')).toHaveCount(1);
    await page.goto(`/gigs/${GIG}`);
    await expect(
      page.getByRole('link', { name: 'Back to Reflection Diary' }),
    ).toBeVisible();
    await expect(page.locator('[data-section]')).toHaveCount(0);
  });

  test('review queue and frameworks carry their own section', async ({ page }) => {
    await install(page, 'Dr Lee', 'supervisor');
    await page.goto('/review-queue');
    await expect(page.locator('[data-section="review"]')).toHaveCount(1);
    await page.goto('/frameworks');
    await expect(page.locator('[data-section="frameworks"]')).toHaveCount(1);
  });
});

test('with no nav pills the bar sits evenly in the header', async ({ page }) => {
  await install(page, 'Ash');
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const gaps = await page.getByRole('banner').evaluate((header) => {
    const outer = header.getBoundingClientRect();
    const items = [...header.querySelectorAll('h1, button, a')].map((el) =>
      el.getBoundingClientRect(),
    );
    const top = Math.min(...items.map((r) => r.top));
    const bottom = Math.max(...items.map((r) => r.bottom));
    return { above: top - outer.top, below: outer.bottom - bottom };
  });
  expect(Math.abs(gaps.above - gaps.below), JSON.stringify(gaps)).toBeLessThanOrEqual(1.5);
});

test('the bar title is 20px at phone and desktop widths', async ({ page }) => {
  await install(page, 'Ash');
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    const title = page.getByRole('heading', { level: 1, name: 'Reflection Diary' });
    await expect(title).toBeVisible();
    expect(
      await title.evaluate((node) => getComputedStyle(node).fontSize),
      `at ${width}`,
    ).toBe('20px');
  }
});

test("someone who supervises nothing gets an ordinary bar over /frameworks' Page not found", async ({
  page,
}) => {
  // CAP-46 shows them NotFound there; the bar must not still announce the
  // Frameworks section, tint it, or offer to leave from a "top screen".
  await install(page, 'Ash');
  await page.goto('/frameworks');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  const banner = page.getByRole('banner');
  await expect(banner.getByText('Frameworks', { exact: true })).toHaveCount(0);
  await expect(
    banner.getByRole('link', { name: 'Back to Reflection Diary' }),
  ).toBeVisible();
  await expect(page.locator('[data-section]')).toHaveCount(0);
});
