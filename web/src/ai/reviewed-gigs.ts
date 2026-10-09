import type { components } from '../api/schema.ts';

type Me = components['schemas']['Me'];

export interface ReviewedGig {
  gig_id: string;
  gig_title: string;
}

/**
 * The gigs the caller assesses or supervises and does not also study on,
 * as the sidecar reads them (ai/sidecar/reviewer.py, reviewed_gigs). This
 * only decides which gigs get theme chips; the sidecar decides what it
 * answers.
 */
export function reviewed_gigs(me: Me | null): ReviewedGig[] {
  if (!me) return [];
  const studying = new Set(
    me.participations.filter((p) => p.role === 'student').map((p) => p.gig_id),
  );
  const seen = new Set<string>();
  const gigs: ReviewedGig[] = [];
  for (const p of me.participations) {
    if ((p.role === 'assessor' || p.role === 'supervisor') && !studying.has(p.gig_id)) {
      if (seen.has(p.gig_id)) continue;
      seen.add(p.gig_id);
      gigs.push({ gig_id: p.gig_id, gig_title: p.gig_title });
    }
  }
  return gigs;
}
