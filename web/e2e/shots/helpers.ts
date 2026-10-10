/**
 * Shared setup every shot in capture.spec.ts applies, regardless of manifest
 * entry: a fixed clock (HO-6 criterion 3, so two runs of the same shot
 * produce the same pixels), animations off (ditto), and signing in against
 * the REAL backend for a read-only shot (fake-API sign-in is FakeApi.install
 * itself, called directly in capture.spec.ts -- this file only covers the
 * real-API half).
 */
import type { Page } from '@playwright/test';
import type { SlotId } from '../../src/session/tokens.ts';

/** Same instant on every run. Chosen after every seeded sprint's date, so
 *  relative wording ("due in 3 days") on real-API shots reads the way it
 *  will on the day the shots are actually taken, not as if time has stopped
 *  on some day already known to be in the past for every seeded gig. */
export const SHOTS_CLOCK = '2026-10-07T09:00:00Z';

export async function freeze_clock(page: Page): Promise<void> {
  await page.clock.install({ time: new Date(SHOTS_CLOCK) });
}

export async function disable_animations(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent =
      '*, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }';
    document.head.appendChild(style);
  });
}

/**
 * Signs the page in against the REAL API as a real seeded user. The token
 * itself never appears in this file or anywhere else in the repository: it
 * is read from the environment at run time, the same convention
 * VITE_API_TOKEN already uses for local dev (see web/README.md and
 * /add-screen). A shot with no token set for its slot is not this
 * function's problem to solve -- capture.spec.ts skips the test before
 * calling this, per the existing scripts/verify-*.sh "the live half skips
 * rather than fails" convention.
 */
export async function sign_in_real(page: Page, slot: SlotId, token: string): Promise<void> {
  await page.addInitScript(
    ([slot, token]) => {
      const slots = { student: null, assessor: null, supervisor: null };
      (slots as Record<string, string | null>)[slot] = token;
      sessionStorage.setItem('reflection-diary-tokens', JSON.stringify(slots));
      sessionStorage.setItem('reflection-diary-active-slot', slot);
    },
    [slot, token] as [string, string],
  );
}

/** The env var a real-API shot for this slot reads its token from. */
export function token_env_var(slot: SlotId): string {
  return `SHOTS_${slot.toUpperCase()}_TOKEN`;
}
