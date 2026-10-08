/**
 * The Alumable "My Gigs" home (CAP-51, ADR #60).
 *
 * Demo-only, behind demoMode(). It is the caller's real gigs (GET /gigs)
 * drawn as Alumable cards: the same data the diary scores, under the host's
 * skin. Each card links into that gig's existing diary flow at /gigs/:id, so
 * the diary opens as a feature inside Alumable rather than a separate app.
 *
 * A student also gets a Reflection Diary card above the gigs, the way the
 * Figma "My gigs" sheet (3:139) carries a diary row. It opens the diary home
 * and its radar, step 1 of docs/Demo-Script.md, which the shell otherwise
 * had no way to reach (Patrick, 8 Oct).
 *
 * The four states are the diary's own pattern (DiaryHome.tsx): a loading
 * skeleton, an ErrorNotice with retry, an empty state for a persona on no
 * gigs, and the cards. Every call goes through the typed client; nothing here
 * is hand-fetched.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import type { components } from '../api/schema.ts';
import {
  Card,
  ErrorNotice,
  ProgressBar,
  Skeleton,
  SkeletonGroup,
} from '../components/index.ts';
import { diary_href } from '../app/diary-return.ts';
import { nav_items_for } from '../app/nav.ts';
import { gig_dates } from '../screens/gig-timing.ts';
import { useSession } from '../session/useSession.ts';
import styles from './AlumableHome.module.css';

type Gig = components['schemas']['Gig'];

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; gigs: Gig[] };

const ROLE_LABEL: Record<Gig['my_role'], string> = {
  student: 'Student',
  assessor: 'Assessor',
  supervisor: 'Supervisor',
  employer: 'Employer',
};

export function AlumableHome() {
  // Gate on the session the way AppShell does: this screen lives outside the
  // shell, so without this it would fetch /gigs before SessionProvider sets the
  // bearer token (on a refresh or a direct/bookmarked /home), 401 against the
  // real backend, and drop the persona. Fetch only once the session is ready.
  const {
    state: session_state,
    me,
    error: session_error,
    retry: session_retry,
  } = useSession();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);

  // Loading is set here, by the event, as DiaryHome does; the screen mounts
  // already loading, and switching profile remounts it via /welcome.
  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (session_state !== 'ready') return;

    const controller = new AbortController();

    api
      .get('/gigs', { signal: controller.signal })
      .then((gigs) => setLoad({ status: 'loaded', gigs }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({
          status: 'error',
          error:
            error instanceof ApiError
              ? error
              : new ApiError(0, null, 'Could not load gigs.'),
        });
      });

    return () => controller.abort();
  }, [reload_key, session_state]);

  // Signed out in demo mode means sign in, not an empty diary.
  if (session_state === 'no_token') return <Navigate to="/welcome" replace />;

  const loading =
    session_state === 'loading' || (session_state === 'ready' && load.status === 'loading');

  // The same places the diary's own nav offers (nav_items_for). The diary
  // itself, which only a student has, gets a card of its own; the reviewing
  // places are buttons above the gigs.
  const items = session_state === 'ready' && me ? nav_items_for(me) : [];
  const has_diary = items.some((item) => item.to === '/');
  const shortcuts = items.filter((item) => item.to !== '/');

  return (
    <main data-brand="alumable" className={styles.home}>
      <h1 className={styles.heading}>My gigs</h1>

      {has_diary && (
        <Link to={diary_href(me?.id ?? null)} className={styles.card}>
          <Card>
            <span className={styles.title}>Reflection Diary</span>
            <span className={styles.lede}>
              Your radar, reflections and record across every gig
            </span>
          </Card>
        </Link>
      )}

      {shortcuts.length > 0 && (
        <ul className={styles.shortcuts} aria-label="Your reviewing">
          {shortcuts.map((item) => (
            <li key={item.to}>
              <Link to={item.to} className={styles.shortcut}>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {loading && (
        <SkeletonGroup label="Loading your gigs">
          <div className={styles.cards}>
            {[0, 1].map((n) => (
              <Card key={n}>
                <Skeleton variant="text" lines={2} width="70%" />
                <Skeleton variant="block" height="var(--space-16)" />
              </Card>
            ))}
          </div>
        </SkeletonGroup>
      )}

      {session_state === 'error' && session_error && (
        <ErrorNotice error={session_error} on_retry={session_retry} />
      )}

      {session_state === 'ready' && load.status === 'error' && (
        <ErrorNotice error={load.error} on_retry={retry} />
      )}

      {session_state === 'ready' && load.status === 'loaded' && load.gigs.length === 0 && (
        <p className={styles.empty}>
          No gigs yet. When Alumable puts you on one, it shows here.
        </p>
      )}

      {load.status === 'loaded' && load.gigs.length > 0 && (
        <ul className={styles.cards}>
          {load.gigs.map((gig) => {
            const total =
              gig.reflection_summary.draft +
              gig.reflection_summary.submitted +
              gig.reflection_summary.assessed;
            // The diary's own gig date line (GigDetail uses it too), so the
            // two never disagree and the timezone trap is handled once.
            const range = gig_dates(gig.starts_on, gig.ends_on);
            return (
              <li key={gig.id}>
                <Link to={`/gigs/${gig.id}`} className={styles.card}>
                  <Card>
                    <div className={styles.cardTop}>
                      {gig.org_name && <span className={styles.org}>{gig.org_name}</span>}
                      <span className={styles.role}>{ROLE_LABEL[gig.my_role]}</span>
                    </div>
                    <span className={styles.title}>{gig.title}</span>
                    {range && <span className={styles.dates}>{range}</span>}
                    {/* ProgressBar clamps its total to at least 1, so a gig with
                        nothing yet would read "0 of 1". Say it plainly instead. */}
                    {total === 0 ? (
                      <span className={styles.fresh}>No reflections yet</span>
                    ) : (
                      <ProgressBar
                        current={gig.reflection_summary.assessed}
                        total={total}
                        label="Reflections assessed"
                      />
                    )}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
