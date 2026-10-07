/**
 * The Alumable "My Gigs" home (CAP-51, ADR #60).
 *
 * Demo-only, behind demoMode(). It is the caller's real gigs (GET /gigs)
 * drawn as Alumable cards: the same data the diary scores, under the host's
 * skin. Each card links into that gig's existing diary flow at /gigs/:id, so
 * the diary opens as a feature inside Alumable rather than a separate app.
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
import { nav_items_for } from '../app/nav.ts';
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

function year_range(gig: Gig): string | null {
  if (!gig.starts_on || !gig.ends_on) return null;
  const year = (iso: string) => iso.slice(0, 4);
  return `${year(gig.starts_on)}–${year(gig.ends_on)}`;
}

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

  // In the product "/" sends a reviewer straight to their queue; here "/" is
  // My Gigs for everyone, so it offers the same places the shell's nav would
  // (nav_items_for), less the diary itself, which the gig cards open.
  const shortcuts =
    session_state === 'ready' && me
      ? nav_items_for(me).filter((item) => item.to !== '/')
      : [];

  return (
    <main data-brand="alumable" className={styles.home}>
      <h1 className={styles.heading}>My gigs</h1>

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
            const range = year_range(gig);
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
