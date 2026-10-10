/**
 * Where "back to the diary" goes: the diary as the student last left it
 * (round 2b, Patrick). The diary's scope lives in its URL (ADR #27), so this
 * keeps that query string, and the shell's back arrow and Diary pill return
 * to it instead of a bare "/" that would drop the gig and sprint they had
 * picked.
 *
 * sessionStorage, like the tokens (session/tokens.ts): one browser tab, one
 * memory, gone with the tab. Keyed by user, so switching user never opens
 * someone else's filter. A pasted link still lands where it says, because
 * only the shell's own links read this.
 *
 * No React in this file on purpose, as in tokens.ts and theme.ts.
 */

const KEY_PREFIX = 'reflection-diary-diary-scope:';

/** Remember the diary's query string ("" for "All gigs"). */
export function remember_diary_scope(user_id: string, search: string): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + user_id, search);
  } catch {
    // Storage blocked: back simply goes to the unfiltered diary.
  }
}

/** The diary's path for this user, with their last scope if there is one. */
export function diary_href(user_id: string | null): string {
  if (!user_id) return '/';
  try {
    const search = sessionStorage.getItem(KEY_PREFIX + user_id);
    return search ? `/?${search}` : '/';
  } catch {
    return '/';
  }
}
