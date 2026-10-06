/**
 * Everything the diary home decides about scope, with no React in it.
 *
 * Split out so the screen file stays a screen: the parts worth reading
 * twice -- what a URL means, which rows are actually yours, and who the
 * radar says scored it -- are all here, in functions that take their
 * inputs and return a value.
 *
 * Scope lives in the URL (ADR #27), so every one of these is a pure
 * function of the query string and the payloads, which is what makes a
 * shared link render the same screen twice.
 */
import type { components } from '../api/schema.ts';

export type Gig = components['schemas']['Gig'];
export type Sprint = components['schemas']['Sprint'];
export type ReflectionSummary = components['schemas']['ReflectionSummary'];
export type Participant = components['schemas']['GigDetail']['participants'][number];

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
 *
 * With exactly one gig to be a student on, the fallback is that gig, not
 * "all gigs" (CAP-38 round 2e, Patrick): over one gig they are the same
 * record, and only the gig scope offers its sprints and Gig details. Still
 * a pure function of the URL and the payload, so a link renders the same
 * screen twice; a bare "/" just means something different to a student
 * with one gig than to a student with two.
 */
export function scope_from_params(params: URLSearchParams, gigs: Gig[]): Scope {
  const mine = student_gigs(gigs);
  const gig =
    mine.find((candidate) => candidate.id === params.get('gig_id')) ??
    (mine.length === 1 ? mine[0] : undefined);

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
 * The gig whose people "Scored by" names: the one in scope, or a one-gig
 * student's only gig, whose "All gigs" is that gig. Null under "All gigs"
 * with two or more, where there is no radar to label.
 */
export function named_gig(scope: Scope, gigs: Gig[]): string | null {
  const mine = student_gigs(gigs);
  return scope.gig_id ?? (mine.length === 1 ? mine[0].id : null);
}

/**
 * Who gave the counter-scores the radar is drawing, in a few words
 * (round 2b, Patrick): "Scored by Sam O". The radar names only the role
 * that scored each axis (counter_role), so the name comes from the gig's
 * participants. It is only ever a name when exactly one person on the gig
 * holds that role; with two it says "your assessors" rather than guess, and
 * with no counter-score yet it says nothing (RadarPanel already says it is
 * awaited). Null participants means not known (yet, or the read failed),
 * which also says nothing: a guess at the plural would be wrong for a gig
 * with one assessor.
 */
export function scored_by(
  counter_roles: (string | null)[],
  participants: Participant[] | null,
): string | null {
  if (participants === null) return null;
  const roles = [...new Set(counter_roles.filter((role): role is string => role !== null))];
  if (roles.length === 0) return null;

  const who = roles.map((role) => {
    const people = participants.filter((person) => person.role === role);
    return people.length === 1 ? people[0].display_name : `your ${role}s`;
  });

  return `Scored by ${who.join(' and ')}`;
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
  // The version goes in brackets rather than after a space: SFIA's name
  // already ends in a number, and "SFIA 9 9.0" reads as a typo.
  const match = gigs.find((gig) => gig.framework?.fw_key === fw_key);
  const named = match?.framework
    ? `${match.framework.name} (${match.framework.version})`
    : fw_key;

  return `Levels ${scale_min}–${scale_max} on ${named}.`;
}
