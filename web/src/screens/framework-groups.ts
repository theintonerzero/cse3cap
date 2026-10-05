/**
 * Splitting the rubric list into the two groups the screen shows.
 *
 * `created_by` is the whole rule: null means a seeded base template that
 * shipped with the schema, anything else means somebody copied it. There is
 * no "is_template" field and there does not need to be one.
 *
 * The prose spec's 11.20 draws THREE lists -- Available, Saved and Drafts.
 * Two are built, because this build has no draft state on a framework: the
 * contract's Framework carries id, fw_key, version, name, is_active,
 * created_by and in_use, and nothing that says "not published yet". A third
 * list would be permanently empty.
 *
 * Outside the component because it is the only part with a decision in it,
 * and because scripts/verify-select-framework.sh can compile and call it
 * without a browser. Same reason gig-timing.ts sits beside GigDetail.
 */
import type { components } from '../api/schema.ts';

export type Framework = components['schemas']['Framework'];

export interface FrameworkGroups {
  templates: Framework[];
  copies: Framework[];
}

/**
 * By name, then by key among equal names (round 3 E7). Names are not unique,
 * keys are, and the server makes them slug, slug-2, slug-3 … (smoke copies
 * carry a timestamp), so with numeric collation this is the nearest thing to
 * "oldest first" the payload has. framework-names.ts numbers in this order.
 */
export function by_name_then_key(a: Framework, b: Framework): number {
  return (
    a.name.localeCompare(b.name) ||
    a.fw_key.localeCompare(b.fw_key, undefined, { numeric: true })
  );
}

/**
 * Sorted by name inside each group. The shared database accumulates a
 * `smoke-test-copy-*` framework on every run of scripts/smoke.sh, so the
 * copies list is longer and less ordered than a seeded demo suggests.
 */
export function group_frameworks(list: Framework[]): FrameworkGroups {
  return {
    templates: list.filter((f) => f.created_by === null).sort(by_name_then_key),
    copies: list.filter((f) => f.created_by !== null).sort(by_name_then_key),
  };
}

/**
 * The gigs this user could put a rubric on.
 *
 * Role is per gig and resolved by the server from gig_participants; this
 * filter is a convenience so the picker is not full of gigs the assign
 * would 403 on. CLAUDE.md: never accept a role from the client. The 403 is
 * still what enforces it. Supervisor only: an employer can see a gig but
 * not choose its rubric (ADR #17, ADR #48).
 */
export function assignable_gigs<T extends { role: string }>(participations: T[]): T[] {
  return participations.filter((p) => p.role === 'supervisor');
}
