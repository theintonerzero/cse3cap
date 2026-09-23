/**
 * Everything the entry stepper decides about steps, levels and submit
 * failures, with no React in it. Same split as diary-scope.ts: the parts
 * worth reading twice are pure functions of the payloads, so a scope bug
 * and a rendering bug are never the same bug.
 */
import type { components, paths } from '../api/schema.ts';

export type ReflectionDetail = components['schemas']['ReflectionDetail'];
export type ReflectionEntry = components['schemas']['ReflectionEntry'];
export type FrameworkDetail = components['schemas']['FrameworkDetail'];
export type Level = components['schemas']['Level'];
export type Evidence = components['schemas']['Evidence'];
export type Score = components['schemas']['Score'];
export type ReflectionStatus = components['schemas']['ReflectionStatus'];

/** The 201 body of a counter-score: the Score, plus what it did to the reflection. */
export type CounterScoreResult =
  paths['/entries/{entry_id}/scores']['post']['responses']['201']['content']['application/json'];

/** The richer shape a score actually has when it arrives embedded on an entry
 *  (ReflectionEntry.scores), which carries `scorer` — the bare `Score` type
 *  above does not, because it's also the response shape for endpoints that
 *  return a score on its own (e.g. PUT .../scores/self). */
export type ReflectionScore = ReflectionEntry['scores'][number];

/**
 * The levels for one competency, in level_value order -- what the stepper
 * taps through. ReflectionEntry carries its own competency_name and
 * competency_code (criterion 1's first half); this is the second half, and
 * it lives only on the framework because a level descriptor is scored
 * against a specific snapshotted version, never the framework "as it is now."
 */
export function levels_for(framework: FrameworkDetail, competency_id: string): Level[] {
  const competency = framework.competencies.find(
    (candidate) => candidate.id === competency_id,
  );
  if (!competency) return [];
  return [...competency.levels].sort((a, b) => a.level_value - b.level_value);
}

/** This entry's own score, if the student has set one yet. */
export function self_score_of(entry: ReflectionEntry): ReflectionScore | null {
  return entry.scores.find((score) => score.scorer_class === 'self') ?? null;
}

/** Every counter-score on this entry. Already oldest-first per the contract. */
export function counter_scores_of(entry: ReflectionEntry): ReflectionScore[] {
  return entry.scores.filter((score) => score.scorer_class === 'counter');
}

/**
 * The gate names the failing entries in details.entry_ids, but not an order
 * to visit them in. "First" is this screen's own rubric order
 * (ReflectionDetail.entries, already position-sorted by the API), matching
 * the ticket's "walk the user to the first one" wording. Returns null when
 * details carried no entry_ids at all, or none of them matched -- a
 * generic error, not a stepper jump.
 */
export function first_offending_index(
  entries: readonly ReflectionEntry[],
  entry_ids: unknown,
): number | null {
  if (!Array.isArray(entry_ids)) return null;
  const offending = new Set(entry_ids.filter((id): id is string => typeof id === 'string'));
  const index = entries.findIndex((entry) => offending.has(entry.id));
  return index === -1 ? null : index;
}

/** Whether this one entry is named in a submit failure's entry_ids. */
export function is_offending(
  entry: ReflectionEntry,
  entry_ids: readonly string[] | null,
): boolean {
  return entry_ids !== null && entry_ids.includes(entry.id);
}

/** "512 B", "48 KB", "2.4 MB" -- for the evidence hint under the framework's own max_file_bytes. */
export function format_bytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** ".pdf, .png, .jpg" for the file input's accept attribute and the hint text. Null means no file restriction stated. */
export function accepted_types_hint(
  accepted_file_types: readonly string[] | null,
): string | null {
  if (!accepted_file_types || accepted_file_types.length === 0) return null;
  return accepted_file_types.map((type) => `.${type}`).join(', ');
}

/**
 * The caller's own counter-score on this entry, if they have given one.
 * Matched on the scorer's id, never on role: the same person can be a
 * supervisor on one gig and a student on another.
 */
export function my_counter_score_of(
  entry: ReflectionEntry,
  user_id: string,
): ReflectionScore | null {
  return counter_scores_of(entry).find((score) => score.scorer?.id === user_id) ?? null;
}

/**
 * Where an assessor lands: the first entry, in rubric order, they have not
 * scored yet. Everything scored (or nothing to score) lands on the first.
 */
export function first_unscored_index(
  entries: readonly ReflectionEntry[],
  user_id: string,
): number {
  const index = entries.findIndex((entry) => my_counter_score_of(entry, user_id) === null);
  return index === -1 ? 0 : index;
}

/** How many of these entries the caller has counter-scored. Same count as the queue's scored_by_me. */
export function scored_by_count(
  entries: readonly ReflectionEntry[],
  user_id: string,
): number {
  return entries.filter((entry) => my_counter_score_of(entry, user_id) !== null).length;
}

/**
 * Whether the comment box should read as required before Save is pressed.
 *
 * A convenience, not the rule. The rule is
 * api/app/Services/Scoring.php (assertCommentPresent): a comment is
 * required when the counter-score is below the student's own, and whenever
 * the rubric's comment_required flag is set. This mirrors it only so the
 * Save button can be disabled early. The screen handles a 400
 * COMMENT_REQUIRED whatever this returns (CAP-13 criterion 3).
 */
export function comment_expected(
  framework: FrameworkDetail,
  self_level_value: number | null,
  chosen_level_value: number | null,
): boolean {
  if (framework.comment_required) return true;
  if (self_level_value === null || chosen_level_value === null) return false;
  return chosen_level_value < self_level_value;
}

/**
 * What a failed counter-score means for the screen, by code and never by
 * message.
 *
 *   comment         400 COMMENT_REQUIRED: mark the box required, keep what was typed
 *   closed          409 NOT_SUBMITTED: a draft, or already assessed (ADR #34)
 *   already_scored  409 ALREADY_SCORED: this scorer has scored this entry; it stands
 *   other           anything else: show the message and change nothing
 */
export type CounterScoreFailure = 'comment' | 'closed' | 'already_scored' | 'other';

export function counter_score_failure(code: string | null): CounterScoreFailure {
  switch (code) {
    case 'COMMENT_REQUIRED':
      return 'comment';
    case 'NOT_SUBMITTED':
      return 'closed';
    case 'ALREADY_SCORED':
      return 'already_scored';
    default:
      return 'other';
  }
}

/**
 * An assessor's unsaved work on one competency. Held by the stepper per
 * entry id rather than inside the panel, so stepping away and back keeps it
 * and an error outlives the panel that showed it.
 */
export interface CounterDraft {
  level_id: string | null;
  comment: string;
  /** The server said COMMENT_REQUIRED; required from then on, whatever the hint says. */
  comment_forced: boolean;
  /** The last save's error message, if it failed. */
  error: string | null;
}

export const EMPTY_DRAFT: CounterDraft = {
  level_id: null,
  comment: '',
  comment_forced: false,
  error: null,
};

/** One competency that stops a Save all, and what it still needs. */
export interface SaveAllGap {
  index: number;
  entry: ReflectionEntry;
  needs: 'score' | 'comment';
}

/**
 * Which competencies stop "Save all scores" from sending anything, in
 * rubric order. Ones the caller has already scored never count. A draft
 * with no level needs a score; one whose level makes a comment expected
 * (comment_expected, the same hint the single Save uses) needs a comment.
 * An empty result means every remaining draft is ready to send.
 */
export function missing_before_save_all(
  entries: readonly ReflectionEntry[],
  framework: FrameworkDetail,
  drafts: Readonly<Record<string, CounterDraft>>,
  user_id: string,
): SaveAllGap[] {
  return entries.flatMap((entry, index): SaveAllGap[] => {
    if (my_counter_score_of(entry, user_id) !== null) return [];
    const draft = drafts[entry.id] ?? EMPTY_DRAFT;
    const level = levels_for(framework, entry.competency_id).find(
      (candidate) => candidate.id === draft.level_id,
    );
    if (!level) return [{ index, entry, needs: 'score' }];
    const needs_comment =
      draft.comment_forced ||
      comment_expected(
        framework,
        self_score_of(entry)?.level_value ?? null,
        level.level_value,
      );
    return needs_comment && draft.comment.trim() === ''
      ? [{ index, entry, needs: 'comment' }]
      : [];
  });
}
