/**
 * One generic test per manifest entry (web/e2e/shots/manifest.ts). Adding a
 * screenshot is adding a Shot, never adding a test.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

import { FakeApi } from '../fake-api.ts';
import { SHOTS } from './manifest.ts';
import {
  disable_animations,
  freeze_clock,
  sign_in_real,
  token_env_var,
} from './helpers.ts';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output');
fs.mkdirSync(OUT, { recursive: true });

for (const shot of SHOTS) {
  test(`${shot.screen} — ${shot.state} — ${shot.viewport}: ${shot.id}`, async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== shot.viewport,
      `${shot.id} is a ${shot.viewport} shot`,
    );

    await freeze_clock(page);
    await disable_animations(page);

    let release: (() => void) | undefined;

    if (shot.scenario.source === 'fake') {
      const api = new FakeApi(
        shot.scenario.frameworks,
        shot.scenario.me,
        shot.scenario.gigs ?? [],
        shot.scenario.reflections ?? [],
      );
      if (shot.scenario.fault)
        api.fail(
          shot.scenario.fault.route,
          shot.scenario.fault.fault,
          shot.scenario.fault.times ?? 1,
        );
      if (shot.scenario.hold) release = api.hold(shot.scenario.hold);
      await api.install(page);

      // token-entry-masked (and any future "clean sign-in" shot) needs
      // TokenGate's own initial, no-error state -- install() above always
      // plants a token (a supervisor placeholder) so every other fake-sourced
      // shot can skip the token dance entirely. An addInitScript registered
      // AFTER install()'s runs later in the same page load, so this removes
      // what install() just planted before the app ever reads it, rather
      // than racing it.
      if (shot.scenario.no_token) {
        await page.addInitScript(() => {
          sessionStorage.removeItem('reflection-diary-tokens');
          sessionStorage.removeItem('reflection-diary-active-slot');
        });
      }
    } else {
      const token = process.env[token_env_var(shot.scenario.slot)];
      test.skip(
        !token,
        `${token_env_var(shot.scenario.slot)} is not set -- skipping a real-API shot`,
      );
      for (const env_var of shot.scenario.requires_env ?? []) {
        test.skip(
          !process.env[env_var],
          `${env_var} is not set -- skipping a real-API shot`,
        );
      }
      await sign_in_real(page, shot.scenario.slot, token!);

      // Defense-in-depth (final-review finding, HO-6): no manifest entry
      // today does more than open a sheet via shot.open, but nothing
      // technical stops a future real-sourced entry from clicking something
      // that fires a write against the real, shared database. Every
      // real-API shot is read-only screens already doing navigations their
      // own screen makes to render itself (Global Constraints), so aborting
      // every non-GET here changes nothing about what passes today.
      await page.route('**/api/v1/**', (route) =>
        route.request().method() === 'GET' ? route.continue() : route.abort(),
      );
    }

    await page.goto(shot.route);

    // History Sheet and Export Sheet are BottomSheet children opened by a
    // button click, not routes of their own (routes.tsx: "they open over
    // the diary rather than navigating away from it") -- `shot.open` names
    // that trigger's visible text, clicked here before either wait below.
    // An array (CAP-21, export-sheet-error) clicks each text in turn, for a
    // state reachable only after a second press once the sheet is open.
    for (const text of shot.open ? [shot.open].flat() : []) {
      await page.getByText(text).click();
    }

    if (shot.state === 'loading') {
      await expect(page.getByRole('status').first()).toBeVisible();
    } else {
      await expect(page.getByText(shot.ready!)).toBeVisible();
    }

    // token-entry-masked fills a dummy value into the token input after it
    // opens, so the masked box in the screenshot visibly covers real content
    // rather than an empty field.
    if (shot.fill) {
      for (const { selector, value } of shot.fill) {
        await page.locator(selector).fill(value);
      }
    }

    // Criterion 3's deviceScaleFactor: 2 is set per-project in
    // playwright.shots.config.ts specifically because devices['Desktop
    // Chrome'] silently overrides a top-level value (final-review finding,
    // HO-6) -- this guard fails loudly if that regresses rather than quietly
    // shipping 1x PNGs again.
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);

    // A mask selector that matches nothing produces a screenshot that looks
    // fine but redacts nothing -- exactly the bug an earlier reviewer on
    // this branch caught only by opening the PNG by hand. Fail loudly here
    // instead.
    for (const selector of shot.mask ?? []) {
      await expect(page.locator(selector)).toBeVisible();
    }

    await page.screenshot({
      path: path.join(OUT, `${shot.id}.png`),
      fullPage: true,
      mask: (shot.mask ?? []).map((selector) => page.locator(selector)),
    });

    release?.();
  });
}
