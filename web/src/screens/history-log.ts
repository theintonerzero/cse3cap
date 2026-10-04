/**
 * What the history sheet shows, in what order, and in what words.
 *
 * Import-free on purpose: scripts/verify-history-sheet.sh compiles this
 * file on its own and runs it, because the two things most likely to go
 * wrong here cannot be seen by clicking around the seed. Every seeded
 * reflection was created, submitted and assessed in the same instant, so
 * an order that only looks at the clock comes out shuffled; and the local
 * time conversion looks right on any machine that happens to be in UTC.
 *
 * The frame (My Gigs - History) lists milestones, not a log: when the
 * student submitted a sprint and when the assessor finished scoring it.
 * So two event types are milestones and two are not:
 *
 *   reflection_created     not shown. Opening a draft is not something
 *                          that happened to the record yet, and hiding it
 *                          is what makes the ticket's "empty on a fresh
 *                          draft" true rather than unreachable.
 *   entry_counter_scored   not shown. One per competency, six a sprint;
 *                          reflection_assessed already says they are done.
 *
 * A type this file has never heard of is shown with a label made from its
 * name, rather than dropped. The server is the one that decides what is
 * worth logging, and a sheet that silently hides a new kind of event is
 * the wrong way to find out one was added.
 *
 * The frame's Applied and Accepted rows are not here: this build has no
 * application or offer to date them from. See the CAP-14 PR.
 */

/** One row of GET /reflections/{id}/events, the fields this file reads. */
export interface RawEvent {
  id: string;
  event_type: string;
  actor_display_name: string | null;
  occurred_at: string;
}

/** An event with the sprint it belongs to, which the endpoint does not say. */
export interface SprintEvent extends RawEvent {
  sprint_ordinal: number | null;
}

export interface HistoryRow {
  id: string;
  label: string;
  actor: string | null;
  occurred_at: string;
}

const HIDDEN: ReadonlySet<string> = new Set(['reflection_created', 'entry_counter_scored']);

const LABEL: Readonly<Record<string, string>> = {
  reflection_submitted: 'Reflection submitted',
  reflection_assessed: 'Assessor reflection submitted',
};

/**
 * Where an event sits in a reflection's life. Only consulted when two
 * events share a timestamp, which in the seed is all of them. Unknown
 * types sort after the ones this file knows, in name order, so the result
 * is at least the same every time.
 */
const LIFECYCLE: Readonly<Record<string, number>> = {
  reflection_created: 0,
  reflection_submitted: 1,
  entry_counter_scored: 2,
  reflection_assessed: 3,
};

/** "portfolio_linked" -> "Portfolio linked". */
export function humanise(event_type: string): string {
  const words = event_type.replace(/[_-]+/g, ' ').trim();
  if (words === '') return 'Something happened';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function label_for(event_type: string, sprint_ordinal: number | null): string {
  const base = LABEL[event_type] ?? humanise(event_type);
  return sprint_ordinal === null ? base : `${base} (Sprint ${sprint_ordinal})`;
}

function rank(event_type: string): number {
  return LIFECYCLE[event_type] ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Every event from every reflection on the gig, as one list, oldest first:
 * the frame reads downward from Applied, the way a timeline does. The
 * endpoint returns newest first, one reflection at a time, so nothing
 * about its order survives.
 */
export function history_rows(events: readonly SprintEvent[]): HistoryRow[] {
  return events
    .filter((event) => !HIDDEN.has(event.event_type))
    .slice()
    .sort(
      (a, b) =>
        Date.parse(a.occurred_at) - Date.parse(b.occurred_at) ||
        (a.sprint_ordinal ?? 0) - (b.sprint_ordinal ?? 0) ||
        rank(a.event_type) - rank(b.event_type) ||
        a.event_type.localeCompare(b.event_type),
    )
    .map((event) => ({
      id: event.id,
      label: label_for(event.event_type, event.sprint_ordinal),
      actor: event.actor_display_name,
      occurred_at: event.occurred_at,
    }));
}

/**
 * The stored UTC instant in the reader's own zone and locale: the date as
 * the frame draws it, and the time, because a time is what shows the
 * conversion happened at all. `locale` and `time_zone` exist for the
 * verify script; the screen passes neither.
 */
export function format_local(iso: string, locale?: string, time_zone?: string): string {
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: time_zone,
  });
}
