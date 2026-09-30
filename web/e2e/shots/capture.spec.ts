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
    } else {
      const token = process.env[token_env_var(shot.scenario.slot)];
      test.skip(
        !token,
        `${token_env_var(shot.scenario.slot)} is not set -- skipping a real-API shot`,
      );
      await sign_in_real(page, shot.scenario.slot, token!);
    }

    await page.goto(shot.route);

    // History Sheet and Export Sheet are BottomSheet children opened by a
    // button click, not routes of their own (routes.tsx: "they open over
    // the diary rather than navigating away from it") -- `shot.open` names
    // that trigger's visible text, clicked here before either wait below.
    if (shot.open) await page.getByText(shot.open).click();

    if (shot.state === 'loading') {
      await expect(page.getByRole('status').first()).toBeVisible();
    } else {
      await expect(page.getByText(shot.ready!)).toBeVisible();
    }

    await page.screenshot({
      path: path.join(OUT, `${shot.id}.png`),
      fullPage: true,
      mask: (shot.mask ?? []).map((selector) => page.locator(selector)),
    });

    release?.();
  });
}
