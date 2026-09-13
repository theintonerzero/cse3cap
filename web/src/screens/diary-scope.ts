/**
 * Everything the diary home decides about scope, with no React in it.
 *
 * Split out so the screen file stays a screen: the parts worth reading
 * twice -- what a URL means, which rows are actually yours, and what the
 * caption under the radar should say -- are all here, in functions that
 * take their inputs and return a value.
 *
 * Scope lives in the URL (ADR #27), so every one of these is a pure
 * function of the query string and the payloads, which is what makes a
 * shared link render the same screen twice.
 */
import type { components } from '../api/schema.ts';

export type Gig = components['schemas']['Gig'];
export type Sprint = components['schemas']['Sprint'];
export type ReflectionSummary = components['schemas']['ReflectionSummary'];

/** What the chips select. Both null is "all gigs". */
export interface Scope {
  gig_id: string | null;
  sprint_id: string | null;
}

export const ALL_GIGS: Scope = { gig_id: null, sprint_id: null };

/**
 * The gigs this screen is about.
 *
 * The diary is the student's own record, so a gig the caller assesses or
 * supervises is not one of its scopes. Role is per gig and comes from the
 * server (`my_role`); the client never decides one.
 */
export function student_gigs(gigs: Gig[]): Gig[] {
  return gigs.filter((gig) => gig.my_role === 'student');
}

/**
 * A scope the data does not support falls back rather than erroring: a
 * stale or shared link is the normal way an unknown id gets here, and an
 * error screen would be the wrong answer to it.
 */
export function scope_from_params(params: URLSearchParams, gigs: Gig[]): Scope {
  const mine = student_gigs(gigs);
  const gig = mine.find((candidate) => candidate.id === params.get('gig_id'));

  if (!gig) return ALL_GIGS;

  const sprint = gig.sprints.find((candidate) => candidate.id === params.get('sprint_id'));

  return { gig_id: gig.id, sprint_id: sprint ? sprint.id : null };
}

/** The inverse. Absent rather than empty, so "all gigs" is a bare URL. */
export function params_for_scope(scope: Scope): Record<string, string> {
  const params: Record<string, string> = {};
  if (scope.gig_id) params.gig_id = scope.gig_id;
  if (scope.sprint_id) params.sprint_id = scope.sprint_id;
  return params;
}

/**
 * Sprints worth offering as chips: the ones that have opened.
 *
 * A sprint nobody could have written in yet has nothing to filter to, and
 * offering it would produce a filtered-empty state that reads as a bug.
 * A null `opens_on` is treated as open, because the alternative is hiding
 * a sprint that may well have reflections against it.
 */
export function chippable_sprints(gig: Gig, today: Date): Sprint[] {
  return [...gig.sprints]
    .filter((sprint) => sprint.opens_on === null || new Date(sprint.opens_on) <= today)
    .sort((a, b) => a.ordinal - b.ordinal);
}

/**
 * The rows that belong on this screen, in this scope.
 *
 * Two filters, and they are different in kind. The first is ownership and
 * applies always: GET /reflections returns a student's own reflections and,
 * to anyone holding an assessor, supervisor or employer role, every
 * reflection on the gigs they hold it on (ReflectionController::index).
 * That is right for the endpoint and wrong for a diary -- a supervisor
 * opening this screen would read four students' reflections as her own --
 * so rows on a gig the caller is not a student on are dropped. A row with a
 * null gig_id is kept: with no gig there is no participation to match, so
 * the endpoint can only have returned it to its owner.
 *
 * This is a display decision, not an authorisation one. The server already
 * refused everything the caller may not read; this only decides what this
 * particular screen is about.
 *
 * The second filter is the chips, and it is exactly what it looks like.
 */
export function reflections_in_scope(
  reflections: ReflectionSummary[],
  gigs: Gig[],
  scope: Scope,
): ReflectionSummary[] {
  const mine = new Set(student_gigs(gigs).map((gig) => gig.id));

  return reflections.filter((reflection) => {
    if (reflection.gig_id !== null && !mine.has(reflection.gig_id)) return false;
    if (scope.gig_id && reflection.gig_id !== scope.gig_id) return false;
    if (scope.sprint_id && reflection.sprint_id !== scope.sprint_id) return false;
    return true;
  });
}

/**
 * What the polygon is summarising, in a sentence, because an unlabelled
 * radar is ambiguous: across the whole record and within one gig it is the
 * latest score per competency, and only within one sprint is it a true
 * self-against-counter comparison of the same piece of work. The API
 * scopes it exactly that way (AnalyticsController::radar) and this says so
 * out loud.
 *
 * `counter_role` is whichever role actually counter-scored, from the radar
 * payload, so the sentence says "supervisor" when a supervisor scored it.
 * Null means nobody has yet, and the clause is left off -- RadarPanel
 * already says "Still awaiting a counter-score" above the chart, and
 * saying it twice in different words reads as a fault.
 */
export function radar_caption(
  scope: Scope,
  gigs: Gig[],
  counter_role: string | null,
): string {
  const gig = gigs.find((candidate) => candidate.id === scope.gig_id);

  if (!gig) {
    return 'The latest score on each competency, across your whole record.';
  }

  if (!scope.sprint_id) {
    return `The latest score on each competency on ${gig.title}.`;
  }

  const sprint = gig.sprints.find((candidate) => candidate.id === scope.sprint_id);
  const which = sprint ? `Sprint ${sprint.ordinal}` : 'This sprint';
  const against = counter_role ? ` against your ${counter_role}'s` : '';

  return `${which} on ${gig.title}: your own score${against}, on that sprint alone.`;
}

/**
 * The footnote under the chart. Scores are only ever read against the
 * rubric they were given under, so the rubric and its scale are named
 * rather than assumed -- the whole point of the framework engine is that
 * neither number is fixed.
 *
 * The radar payload identifies the framework by fw_key; the human-readable
 * name and version come from whichever gig carries the same key. A caller
 * whose gigs do not include it falls back to the key itself rather than
 * printing nothing.
 */
export function rubric_line(
  fw_key: string,
  scale_min: number,
  scale_max: number,
  gigs: Gig[],
): string {
  const match = gigs.find((gig) => gig.framework?.fw_key === fw_key);
  const named = match?.framework
    ? `${match.framework.name} ${match.framework.version}`
    : fw_key;

  return `Levels ${scale_min}–${scale_max} on ${named}.`;
}
