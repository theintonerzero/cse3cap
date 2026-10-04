/**
 * Which section a path belongs to, what the top bar calls it, and where its
 * back arrow goes (CAP-38 R3).
 *
 * A path map rather than route handles: routes.tsx uses declarative
 * <Routes>, and useMatches only works under a data router, which ADR #27
 * keeps out along with loaders. Pure, so the bar and its tests agree.
 *
 * Back goes up one fixed level, never through history, so a pasted link
 * still has a parent. A top screen has none: there, back means leaving the
 * diary, which the shell asks about first.
 */
import { matchPath } from 'react-router';

export interface Section {
  title: 'Reflection Diary' | 'Review queue' | 'Frameworks';
  /** Null on a top screen. */
  parent: { to: string; title: string } | null;
  /** The bar title is the page's h1 only on the diary home, this round. */
  title_is_h1: boolean;
  /**
   * Which background tint the shell wears (CAP-38 R8). Top screens only, and
   * not Frameworks (round 3 F1, ADR #56).
   */
  tint: 'diary' | 'review' | null;
}

const DIARY = { to: '/', title: 'Reflection Diary' };
const QUEUE = { to: '/review-queue', title: 'Review queue' };
const FRAMEWORKS = { to: '/frameworks', title: 'Frameworks' };

function at(pattern: string, pathname: string): boolean {
  return matchPath({ path: pattern, end: true }, pathname) !== null;
}

/**
 * Where a path sits. Title, back arrow and tint are three lookups rather
 * than one object per place, so a change to one of them never edits the
 * line another changes, and each can be reverted on its own (CAP-38
 * round 3).
 */
type Place =
  'diary' | 'diary_deep' | 'queue' | 'queue_deep' | 'frameworks' | 'frameworks_deep';

/**
 * `supervises` mirrors routes.tsx's SupervisorOnly (CAP-46): for anyone
 * else a frameworks path renders NotFound, so the bar gives it the same
 * ordinary bar as any unknown page rather than announcing a section they
 * cannot see. `reviews` mirrors ReviewerOnly the same way for the review
 * queue (CAP-38 round 3).
 */
function place_of(pathname: string, supervises: boolean, reviews: boolean): Place {
  if (at('/', pathname)) return 'diary';
  if (reviews && at('/review-queue', pathname)) return 'queue';
  if (reviews && at('/review-queue/*', pathname)) return 'queue_deep';
  if (supervises && at('/frameworks', pathname)) return 'frameworks';
  if (supervises && at('/frameworks/*', pathname)) return 'frameworks_deep';
  // /gigs/:id, /reflections/:id(/submitted), /entries/:id and anything
  // unknown are all deeper diary screens.
  return 'diary_deep';
}

/**
 * What the bar calls each place: the module's name for everyone (CAP-38
 * round 3 D1). Each page carries its own heading.
 */
const TITLE: Record<Place, Section['title']> = {
  diary: 'Reflection Diary',
  diary_deep: 'Reflection Diary',
  queue: 'Reflection Diary',
  queue_deep: 'Reflection Diary',
  frameworks: 'Reflection Diary',
  frameworks_deep: 'Reflection Diary',
};

/**
 * Where back goes: up one fixed level. Null is a top screen, where back
 * asks before leaving the diary.
 */
const PARENT: Record<Place, Section['parent']> = {
  diary: null,
  diary_deep: DIARY,
  queue: null,
  queue_deep: QUEUE,
  frameworks: null,
  frameworks_deep: FRAMEWORKS,
};

/** Which background tint the shell wears (CAP-38 R8, ADR #52). */
const TINT: Record<Place, Section['tint']> = {
  diary: 'diary',
  diary_deep: null,
  queue: 'review',
  queue_deep: null,
  frameworks: null,
  frameworks_deep: null,
};

export function section_for(pathname: string, supervises = true, reviews = true): Section {
  const place = place_of(pathname, supervises, reviews);
  return {
    title: TITLE[place],
    parent: PARENT[place],
    title_is_h1: place === 'diary',
    tint: TINT[place],
  };
}
