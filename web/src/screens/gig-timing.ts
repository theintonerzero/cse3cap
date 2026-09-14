/**
 * When a sprint opens, when it is due, and how to say so in words.
 *
 * Sprints are a table rather than an integer on the reflection precisely
 * so this file can exist (CAP-8's criterion 2 says as much). Everything
 * here is a pure function of two dates and "today", with no React and --
 * deliberately, unlike diary-scope.ts -- no import of the generated schema
 * either. The screen passes contract-typed sprints straight in and
 * TypeScript checks the shapes match at the call site; keeping this module
 * import-free is what lets scripts/verify-gig-detail.sh compile it on its
 * own and call it with dates of its own choosing, which is the only way
 * the wordings in the acceptance criteria get proved at all. Every seeded
 * sprint is already in the past.
 *
 * Nothing in api/app/Services/ reads opens_on or due_on: the submit gate
 * is about evidence and narrative, not the calendar. So a past sprint is
 * "Due 2 days ago", never "Closed" and never "Overdue" -- the first would
 * claim a gate the API does not enforce and the second adds a judgement
 * the product does not make.
 */

/**
 * The shape this module needs, which is the shape the contract's Sprint
 * happens to have. Structural rather than imported: see the header.
 */
export interface DatedSprint {
  opens_on: string | null;
  due_on: string | null;
}

export type SprintState = 'not_open' | 'open' | 'past_due' | 'undated';

export interface SprintTiming {
  state: SprintState;
  /** The relative phrase, or null when a relative phrase does not help. */
  relative: string | null;
  /** "3 Aug - 16 Aug". Null only when the sprint carries no dates at all. */
  dates: string | null;
}

/**
 * Past this many days a relative phrase stops helping and starts being
 * noise: "Due in 312 days" tells a student nothing the date beside it did
 * not. The row keeps its absolute dates either way.
 */
export const RELATIVE_HORIZON_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/**
 * Whole calendar days from today to an ISO date. Negative is the past.
 *
 * Both sides are reduced to a UTC midnight before subtracting: the left
 * from the string's own parts, the right from today's LOCAL calendar day.
 * Parsing 'YYYY-MM-DD' with the Date constructor gives UTC midnight, so
 * comparing it against a local `new Date()` is a day out for every user
 * west of Greenwich -- and everyone building this is east of it, so the
 * bug would never show here. There is no hour arithmetic, so DST never
 * arises.
 */
export function days_between(iso: string, today: Date): number {
  const [year, month, day] = iso.split('-').map(Number);
  const then = Date.UTC(year, month - 1, day);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  return Math.round((then - now) / MS_PER_DAY);
}

/**
 * "3 Aug", or "Aug 3" -- the reader's browser decides the order, which is
 * why `undefined` is passed as the locale rather than a fixed one. The
 * diary home's own date line does the same. Formatted in UTC for the same
 * reason days_between reduces to it.
 */
export function format_short_date(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Criterion 2 asks for opens_on and due_on, not only for a paraphrase of
 * them, so this is rendered on every row whatever the relative phrase says
 * -- and it is all a row past the horizon has left.
 */
export function sprint_dates(sprint: DatedSprint): string | null {
  const { opens_on, due_on } = sprint;

  if (opens_on && due_on) {
    return `${format_short_date(opens_on)} – ${format_short_date(due_on)}`;
  }
  if (opens_on) return `From ${format_short_date(opens_on)}`;
  if (due_on) return `Due ${format_short_date(due_on)}`;

  return null;
}

/**
 * The gig's own span, for the line under its title. Here rather than in the
 * screen because it is the same date-only value with the same timezone
 * trap, and a second copy of format_short_date beside it is how the two
 * drift.
 */
export function gig_dates(starts_on: string | null, ends_on: string | null): string | null {
  if (starts_on && ends_on) {
    return `${format_short_date(starts_on)} – ${format_short_date(ends_on)}`;
  }
  if (starts_on) return `From ${format_short_date(starts_on)}`;
  if (ends_on) return `Until ${format_short_date(ends_on)}`;

  return null;
}

/**
 * The state a sprint is in and the sentence that says so.
 *
 * A null opens_on counts as open rather than as never opening, matching
 * chippable_sprints in diary-scope.ts: the alternative hides a sprint that
 * may well have reflections against it.
 */
export function sprint_timing(sprint: DatedSprint, today: Date): SprintTiming {
  const dates = sprint_dates(sprint);

  if (!sprint.opens_on && !sprint.due_on) {
    return { state: 'undated', relative: null, dates: null };
  }

  if (sprint.opens_on) {
    const until_open = days_between(sprint.opens_on, today);

    if (until_open > 0) {
      return { state: 'not_open', relative: opens_phrase(until_open), dates };
    }
  }

  if (!sprint.due_on) {
    return { state: 'open', relative: null, dates };
  }

  const until_due = days_between(sprint.due_on, today);

  if (until_due < 0) {
    return { state: 'past_due', relative: past_due_phrase(-until_due), dates };
  }

  return { state: 'open', relative: due_phrase(until_due), dates };
}

/**
 * "Not open yet" survives past the horizon where the two countdowns below
 * do not. That asymmetry is deliberate: not-open is a STATE, and a row
 * showing only a date range with no other mark reads as though it were
 * live. "Due in 312 days" is a countdown, and dropping it loses nothing
 * the dates beside it do not already say.
 */
function opens_phrase(days: number): string {
  if (days > RELATIVE_HORIZON_DAYS) return 'Not open yet';
  if (days === 1) return 'Not open yet, opens tomorrow';

  return `Not open yet, opens in ${days} days`;
}

function due_phrase(days: number): string | null {
  if (days > RELATIVE_HORIZON_DAYS) return null;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';

  return `Due in ${days} days`;
}

function past_due_phrase(days: number): string | null {
  if (days > RELATIVE_HORIZON_DAYS) return null;
  if (days === 1) return 'Due yesterday';

  return `Due ${days} days ago`;
}

/**
 * Ordinal order, from a copy. GigController eager-loads sprints with no
 * order by, so the array arrives in whatever order MySQL returned it, and
 * sorting the payload in place would mutate a caller's object.
 */
export function by_ordinal<T extends { ordinal: number }>(sprints: readonly T[]): T[] {
  return [...sprints].sort((a, b) => a.ordinal - b.ordinal);
}
