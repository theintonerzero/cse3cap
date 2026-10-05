/**
 * A reviewer's unfinished counter-scores, kept on this device (CAP-38
 * round 3, ADR #57).
 *
 * Nothing reaches the server until "Submit scores", so a pick or a comment
 * would otherwise be lost the moment the reviewer leaves the screen. It is
 * kept in this browser's localStorage, one key per person and reflection,
 * so switching user on the same device never shows one reviewer another's
 * work. Only the pick and the words are kept, never an error. The stepper
 * clears an entry once its score is sent, and the key goes with the last.
 *
 * Every read and write is guarded: storage can be blocked (private
 * browsing, quota), and then scoring still works, it just isn't kept.
 */

import {
  EMPTY_DRAFT,
  levels_for,
  my_counter_score_of,
  type CounterDraft,
  type FrameworkDetail,
  type ReflectionEntry,
} from './entry-stepper-logic.ts';

const PREFIX = 'reflection-diary-counter-drafts';

/** What is kept for one entry. */
export interface KeptDraft {
  level_id: string | null;
  comment: string;
  /**
   * Ready to send (a level, and a comment where one is expected), worked
   * out by the stepper, which has the rubric. The review queue, which
   * doesn't, counts these into its Entries bar.
   */
  done?: boolean;
}

function key_for(user_id: string, reflection_id: string): string {
  return `${PREFIX}:${user_id}:${reflection_id}`;
}

function is_kept(value: unknown): value is KeptDraft {
  if (typeof value !== 'object' || value === null) return false;
  const { level_id, comment } = value as Record<string, unknown>;
  const { done } = value as Record<string, unknown>;
  return (
    (level_id === null || typeof level_id === 'string') &&
    typeof comment === 'string' &&
    (done === undefined || typeof done === 'boolean')
  );
}

/** This person's kept work on this reflection, by entry id. Empty if none or unreadable. */
export function read_kept(
  user_id: string,
  reflection_id: string,
): Record<string, KeptDraft> {
  try {
    const raw = localStorage.getItem(key_for(user_id, reflection_id));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((pair): pair is [string, KeptDraft] =>
        is_kept(pair[1]),
      ),
    );
  } catch {
    return {};
  }
}

/** Replaces what is kept. Nothing left to keep removes the key. */
export function write_kept(
  user_id: string,
  reflection_id: string,
  kept: Record<string, KeptDraft>,
): void {
  try {
    const key = key_for(user_id, reflection_id);
    if (Object.keys(kept).length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(kept));
  } catch {
    // Storage blocked: the work stays on screen, it just isn't kept.
  }
}

/**
 * Kept work turned back into the stepper's drafts: only entries this person
 * hasn't scored yet, and only a level that belongs to that entry's
 * competency (a rubric is a snapshot, but a stale key should never pick a
 * level from somewhere else).
 */
export function kept_as_drafts(
  entries: readonly ReflectionEntry[],
  framework: FrameworkDetail,
  kept: Readonly<Record<string, KeptDraft>>,
  user_id: string,
): Record<string, CounterDraft> {
  const drafts: Record<string, CounterDraft> = {};
  for (const entry of entries) {
    const one = kept[entry.id];
    if (!one || my_counter_score_of(entry, user_id) !== null) continue;
    const level_ok =
      one.level_id !== null &&
      levels_for(framework, entry.competency_id).some((level) => level.id === one.level_id);
    drafts[entry.id] = {
      ...EMPTY_DRAFT,
      level_id: level_ok ? one.level_id : null,
      comment: one.comment,
    };
  }
  return drafts;
}

/** How many of this person's kept entries on this reflection are ready to send. */
export function kept_done_count(user_id: string, reflection_id: string): number {
  return Object.values(read_kept(user_id, reflection_id)).filter((one) => one.done === true)
    .length;
}
