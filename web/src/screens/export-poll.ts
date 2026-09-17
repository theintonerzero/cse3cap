/**
 * When to ask the server about an export again, and when to stop asking.
 *
 * Import-free on purpose: scripts/verify-export-sheet.sh compiles this
 * file on its own and runs the schedule, because "backs off and gives up"
 * cannot be seen by clicking around a sync queue, where every export is
 * complete by the time the 202 arrives.
 */

/** Polls after the request itself. Ten is about a minute on this schedule. */
export const MAX_POLLS = 10;

const FIRST_DELAY_MS = 1_000;
const MAX_DELAY_MS = 8_000;

/** 1s, 2s, 4s, 8s, 8s, ... `attempt` is 1 for the first poll. */
export function next_delay_ms(attempt: number): number {
  const doubled = FIRST_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  return Math.min(doubled, MAX_DELAY_MS);
}

export function should_give_up(attempt: number): boolean {
  return attempt > MAX_POLLS;
}

export const GIVE_UP_MESSAGE =
  'This is taking longer than usual. The export may still finish on its own; close this and try again in a few minutes.';

export function download_name(export_id: string, format: 'json' | 'pdf'): string {
  return `reflection-diary-${export_id}.${format}`;
}
