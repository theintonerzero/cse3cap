/**
 * Everything the entry stepper decides about steps, levels and submit
 * failures, with no React in it. Same split as diary-scope.ts: the parts
 * worth reading twice are pure functions of the payloads, so a scope bug
 * and a rendering bug are never the same bug.
 */
import type { components } from '../api/schema.ts';

export type ReflectionDetail = components['schemas']['ReflectionDetail'];
export type ReflectionEntry = components['schemas']['ReflectionEntry'];
export type FrameworkDetail = components['schemas']['FrameworkDetail'];
export type Level = components['schemas']['Level'];
export type Evidence = components['schemas']['Evidence'];
export type Score = components['schemas']['Score'];

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
