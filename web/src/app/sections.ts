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
  /** Which background tint the shell wears (CAP-38 R8). Top screens only. */
  tint: 'diary' | 'review' | 'frameworks' | null;
}

const DIARY = { to: '/', title: 'Reflection Diary' };
const QUEUE = { to: '/review-queue', title: 'Review queue' };
const FRAMEWORKS = { to: '/frameworks', title: 'Frameworks' };

function at(pattern: string, pathname: string): boolean {
  return matchPath({ path: pattern, end: true }, pathname) !== null;
}

/**
 * `supervises` mirrors routes.tsx's SupervisorOnly (CAP-46): for anyone
 * else a frameworks path renders NotFound, so the bar gives it the same
 * ordinary bar as any unknown page rather than announcing a section they
 * cannot see.
 */
export function section_for(pathname: string, supervises = true): Section {
  if (at('/', pathname)) {
    return { title: 'Reflection Diary', parent: null, title_is_h1: true, tint: 'diary' };
  }
  if (at('/review-queue', pathname)) {
    return { title: 'Review queue', parent: null, title_is_h1: false, tint: 'review' };
  }
  if (at('/review-queue/*', pathname)) {
    return { title: 'Review queue', parent: QUEUE, title_is_h1: false, tint: null };
  }
  if (supervises && at('/frameworks', pathname)) {
    return { title: 'Frameworks', parent: null, title_is_h1: false, tint: 'frameworks' };
  }
  if (supervises && at('/frameworks/*', pathname)) {
    return { title: 'Frameworks', parent: FRAMEWORKS, title_is_h1: false, tint: null };
  }
  // /gigs/:id, /reflections/:id(/submitted), /entries/:id and anything
  // unknown are all deeper diary screens.
  return { title: 'Reflection Diary', parent: DIARY, title_is_h1: false, tint: null };
}
