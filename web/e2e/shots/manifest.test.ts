/**
 * A screen added to routes.tsx with no shot in the manifest is a screen
 * HO-6 silently stopped covering. This has no browser in it on purpose --
 * it is a plain assertion over the manifest and the router source, run with
 * `node --experimental-strip-types` (Node 24 ships this; web/package.json's
 * devDependencies already pin @types/node ^24), not through Playwright.
 */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { SHOTS } from './manifest.ts';

const routes_source = readFileSync(
  new URL('../../src/app/routes.tsx', import.meta.url),
  'utf8',
);

// Every static (non-dynamic-segment) path in routes.tsx that is not the
// catch-all or a Placeholder. This is intentionally a narrow regex over the
// known file shape, not a JSX parser: routes.tsx is small, hand-written and
// reviewed on every change, and this check's job is to catch a screen that
// forgot a shot, not to be a general-purpose router.
const path_matches = [...routes_source.matchAll(/<Route\s+(?:index\s+)?path="([^"*]+)"/g)]
  .map((match) => match[1])
  .filter((path) => path !== '*');

// Also check for index routes (which have no explicit path, representing '')
const has_index_route = /<Route\s+index\s+element/.test(routes_source);
const all_paths = has_index_route ? ['', ...path_matches] : path_matches;

// Filter out placeholder routes (which don't get screenshots), and the
// Alumable demo shell's two routes (CAP-51, ADR #60): they exist only on the
// dev server with VITE_DEMO_SHELL on, are not product screens, and have no
// place in the User Manual.
const placeholders = new Set(['entries/:entry_id']);
const demo_only = new Set(['welcome', 'home']);
const routed_paths = all_paths.filter(
  (path) => !placeholders.has(path) && !demo_only.has(path),
);

const covered_ids = new Set(SHOTS.map((shot) => shot.id));
const covered_screens = new Set(SHOTS.map((shot) => shot.screen));

const SCREEN_FOR_ROUTE: Record<string, string> = {
  '': 'Diary home',
  'gigs/:gig_id': 'Gig detail',
  'reflections/:reflection_id': 'Entry stepper',
  'reflections/:reflection_id/submitted': 'Submitted confirmation',
  'review-queue': 'Review queue',
  'review-queue/reflections/:reflection_id': 'Entry stepper',
  frameworks: 'Select framework',
  'frameworks/:framework_id/edit': 'Edit framework',
};

for (const path of routed_paths) {
  const screen = SCREEN_FOR_ROUTE[path];
  assert.ok(
    screen,
    `routes.tsx has "${path}" with no entry in SCREEN_FOR_ROUTE -- add one`,
  );
  assert.ok(
    covered_screens.has(screen),
    `"${screen}" (route "${path}") has no shot in the manifest yet`,
  );
}

assert.equal(
  covered_ids.size,
  SHOTS.length,
  'two manifest entries share an id -- filenames would collide',
);

console.log(
  `${SHOTS.length} shots, ${covered_ids.size} unique ids, ${covered_screens.size} screens covered.`,
);
