/**
 * The demo-shell flag and its personas (CAP-51).
 *
 * The flag gates an Alumable-branded demo harness around the diary: a
 * labelled profile picker and a My Gigs home. It is off in every
 * production build, where the app is exactly the diary with its own token
 * entry. Demo-only, not product scope (ADR #60).
 *
 * No React here on purpose: the gate is read in routing and in the shell, and
 * it is easier to trust when it is not tangled with a render cycle. This
 * mirrors session/tokens.ts, which keeps the same rule for the same reason.
 */
import type { SlotId } from '../session/tokens.ts';

/**
 * True only on the development server with VITE_DEMO_SHELL=1. Never in a
 * production build: import.meta.env.DEV is statically false there, so the
 * shell is off in every one (CAP-51, criterion 1), whatever the env files say.
 * Vite reads web/.env.local for `vite build` too, so a flag left there would
 * otherwise reach a production build: the env alone cannot promise this (F15).
 */
export function demoMode(): boolean {
  return import.meta.env.DEV ? import.meta.env.VITE_DEMO_SHELL === '1' : false;
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
    const parsed: unknown = JSON.parse(raw);
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
  } catch {
    return [];
  }
}
