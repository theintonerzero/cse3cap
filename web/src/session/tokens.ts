/**
 * The seeded tokens, and which one is in use.
 *
 * There is no login screen in this MVP (ADR #15): three Sanctum tokens are
 * seeded server-side, one per role, and the app is told which one to act as
 * by having it pasted in. This module is where they are kept.
 *
 * `sessionStorage`, not `localStorage`, for two reasons. Each browser tab
 * gets its own identity, so the student and the assessor can be open side by
 * side, which is how a counter-score arriving on the radar is actually
 * demonstrated. And a credential that docs/Security-Review.md records as
 * never expiring and unscoped (findings F2 and F3) should not outlive the
 * tab that used it. `theme.ts` is the structural model here, including its
 * try/catch around storage being unavailable; it just makes the other
 * choice about which store to use, because a theme is not a credential.
 *
 * NOTHING HERE DECIDES WHAT A USER MAY DO. The slot labels below exist
 * because pasting three tokens into three unlabelled boxes is miserable, and
 * because they match what the tokens are called in the file the seeder
 * writes. A label is a hint about which token to paste, never a role. Roles
 * are resolved server-side from gig_participants and reach the frontend only
 * through GET /auth/me, per gig, and that is the only thing navigation or
 * any screen may read. See CLAUDE.md and docs/Frontend-and-Backend.md.
 *
 * No React in this file on purpose: the storage rules are easier to trust
 * when they are not tangled up with a render cycle.
 */

const TOKENS_KEY = 'reflection-diary-tokens';
const ACTIVE_KEY = 'reflection-diary-active-slot';

/** Which seeded token a slot holds. A label, not a permission. */
export type SlotId = 'student' | 'assessor' | 'supervisor';

export const SLOT_IDS: readonly SlotId[] = ['student', 'assessor', 'supervisor'];

/** Matches the names in ~/reflection-diary-tokens.txt, so the paste is obvious. */
export const SLOT_LABEL: Record<SlotId, string> = {
  student: 'Student',
  assessor: 'Assessor',
  supervisor: 'Supervisor',
};

export type TokenSlots = Record<SlotId, string | null>;

const EMPTY: TokenSlots = { student: null, assessor: null, supervisor: null };

function is_slot(value: unknown): value is SlotId {
  return typeof value === 'string' && (SLOT_IDS as readonly string[]).includes(value);
}

/** Every slot, with `null` for the ones nothing has been pasted into. */
export function get_slots(): TokenSlots {
  try {
    const raw = sessionStorage.getItem(TOKENS_KEY);
    if (!raw) return { ...EMPTY };

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY };

    const slots: TokenSlots = { ...EMPTY };
    for (const slot of SLOT_IDS) {
      const value = (parsed as Record<string, unknown>)[slot];
      slots[slot] = typeof value === 'string' && value !== '' ? value : null;
    }
    return slots;
  } catch {
    // Storage blocked, or a value someone else wrote that is not ours.
    // Starting empty is correct: it lands on the token entry state, which
    // is a state this app has and can recover from.
    return { ...EMPTY };
  }
}

export function set_slot_token(slot: SlotId, token: string | null): void {
  const slots = get_slots();
  slots[slot] = token && token.trim() !== '' ? token.trim() : null;

  try {
    sessionStorage.setItem(TOKENS_KEY, JSON.stringify(slots));
  } catch {
    // Private browsing, or quota. The token still applies for this page
    // load, because the caller holds it in React state; it just will not
    // survive a reload.
  }
}

export function get_active_slot(): SlotId | null {
  try {
    const value = sessionStorage.getItem(ACTIVE_KEY);
    return is_slot(value) ? value : null;
  } catch {
    return null;
  }
}

export function set_active_slot(slot: SlotId | null): void {
  try {
    if (slot) {
      sessionStorage.setItem(ACTIVE_KEY, slot);
    } else {
      sessionStorage.removeItem(ACTIVE_KEY);
    }
  } catch {
    // As above.
  }
}

/** The token the app should be sending, or null when there is not one. */
export function get_active_token(): string | null {
  const slot = get_active_slot();
  if (!slot) return null;
  return get_slots()[slot];
}

/**
 * Forget the active token entirely: the slot is emptied and deselected.
 *
 * This is what a 401 does (acceptance criterion 5). The token is emptied
 * rather than merely deselected because a 401 means the API has told us this
 * specific token is not valid, so keeping it in the slot only invites it to
 * be picked again. The other slots are untouched.
 */
export function clear_active_token(): void {
  const slot = get_active_slot();
  if (slot) set_slot_token(slot, null);
  set_active_slot(null);
}
