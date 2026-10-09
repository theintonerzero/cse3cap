/**
 * The demo-shell flag and its personas (CAP-51).
 *
 * The flag swaps the diary's token gate for a one-click picker of named
 * demo people, under the Alumable logo, and changes nothing else (ADR #61).
 * It is off in every production build, where the app is exactly the diary
 * with its own token entry. Demo-only, not product scope.
 *
 * No React here on purpose: the gate is read in AppShell's render and its
 * menu, and it is easier to trust when it is not tangled with a render cycle. This
 * mirrors session/tokens.ts, which keeps the same rule for the same reason.
 */
import type { SlotId } from '../session/tokens.ts';

/**
 * The live demo's personas file (CAP-54, ADR #62), a path such as
 * /demo/personas.json. A path, never a secret: the file sits behind the site's
 * password gate and is written on the box by scripts/demo-reset.sh. Setting it
 * turns the picker on in a build, with no token compiled in, so F15 stays
 * closed; scripts/check-bundle-secrets.sh builds with it set to prove that.
 */
const PERSONAS_URL = import.meta.env.VITE_DEMO_PERSONAS_URL;

/**
 * True with a personas URL (the live demo, in any build), or on the
 * development server with VITE_DEMO_SHELL=1. Otherwise false in every
 * production build: import.meta.env.DEV is statically false there, so the
 * laptop flag alone can never turn the shell on (CAP-51, criterion 1). Vite
 * reads web/.env.local for `vite build` too, so a flag left there would
 * otherwise reach a production build: the env alone cannot promise this (F15).
 */
export function demoMode(): boolean {
  if (PERSONAS_URL) return true;
  return import.meta.env.DEV ? import.meta.env.VITE_DEMO_SHELL === '1' : false;
}

/** True when the people come from the box rather than the laptop's env. */
export function demoLive(): boolean {
  return Boolean(PERSONAS_URL);
}

/**
 * One demo persona: a name to show, a hint at the role, and which token slot
 * to sign into. The token is a seeded Sanctum token supplied through the
 * git-ignored env, never committed.
 */
export interface DemoPersona {
  id: string;
  name: string;
  role_hint: string;
  slot: SlotId;
  token: string;
}

/**
 * The personas from VITE_DEMO_TOKENS, or an empty list when the env is absent
 * or malformed. An empty list is the signal the welcome uses to fall back to
 * the seeded-token paste, so a fresh checkout without the env still works.
 */
export function demoPersonas(): DemoPersona[] {
  try {
    // Behind DEV, as client.ts keeps its seed (F1 in docs/Security-Review.md):
    // Vite inlines VITE_DEMO_TOKENS as a string literal, real seeded tokens
    // included, and only a statically false branch keeps it out of the
    // bundle. scripts/check-bundle-secrets.sh builds with a canary persona and
    // fails if it survives.
    const raw = import.meta.env.DEV ? import.meta.env.VITE_DEMO_TOKENS : undefined;
    if (!raw) return [];
    return parsePersonas(JSON.parse(raw));
  } catch {
    return [];
  }
}

/**
 * The people, from the live file when there is one, else from the dev env.
 * Any failure is an empty list, so the welcome falls back to the paste gate.
 * Not through api/client.ts on purpose: this is a static file beside the app,
 * not the API, and it is fetched without a bearer token.
 */
export async function loadDemoPersonas(): Promise<DemoPersona[]> {
  if (!PERSONAS_URL) return demoPersonas();
  try {
    // no-store: a reset revokes every token in the previous copy.
    const response = await fetch(PERSONAS_URL, {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) return [];
    return parsePersonas(await response.json());
  } catch {
    return [];
  }
}

function parsePersonas(parsed: unknown): DemoPersona[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (entry): entry is DemoPersona =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as DemoPersona).id === 'string' &&
      typeof (entry as DemoPersona).name === 'string' &&
      typeof (entry as DemoPersona).slot === 'string' &&
      typeof (entry as DemoPersona).token === 'string',
  );
}
