import type { components } from '../api/schema.ts';

type Entry = components['schemas']['ReflectionDetail']['entries'][number];

/**
 * Whose counter-score the student's self-score differs from, or null when
 * they agree or either is missing. The latest counter-score by time, as the
 * sidecar reads it (ai/sidecar/coach.py, latest_counter). This decides only
 * whether the button shows; the sidecar decides whether it answers.
 */
export function calibration_reviewer(entry: Entry): string | null {
  const self = entry.scores.find((score) => score.scorer_class === 'self');
  const counters = entry.scores
    .filter((score) => score.scorer_class === 'counter')
    .sort((a, b) => (a.scored_at ?? '').localeCompare(b.scored_at ?? ''));
  const latest = counters.at(-1);
  if (!self || !latest || self.level_id === latest.level_id) return null;
  return latest.scorer?.display_name ?? null;
}
