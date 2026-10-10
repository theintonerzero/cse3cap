/**
 * The confirmation a student sees right after submitting a reflection --
 * and what anyone sees if they come back to this URL later, since every
 * route stays reachable regardless of how they arrived (CLAUDE.md).
 *
 * Two fetches: GET /reflections/{id} for status, gig_id and sprint_id, then
 * GET /gigs/{gig_id} for participants (to name who reviews it) and sprints
 * (to find the next one). No new endpoint -- both are already fetched
 * elsewhere in this app; this screen is the first to combine them for this
 * purpose.
 *
 * "Confirms the assessor has been notified" (COA4-70) names the assessor
 * specifically, but a gig is not guaranteed to have one: DemoSeeder's SFIA
 * gig has none, and a supervisor counter-scores instead. Whoever can
 * counter-score is named -- assessor first, then supervisor, then employer,
 * matching the contract's own CounterRole enum, which lists exactly those
 * three as the roles a counter-score can come from.
 */
import { useParams } from 'react-router';
import { useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '../api/client.ts';
import type { components } from '../api/schema.ts';
import {
  Card,
  ErrorNotice,
  LinkButton,
  Skeleton,
  SkeletonGroup,
} from '../components/index.ts';
import { by_ordinal, format_full_date } from './gig-timing.ts';
import styles from './Submitted.module.css';

type Gig = components['schemas']['GigDetail'];
type Reflection = components['schemas']['ReflectionSummary'];
type Participant = Gig['participants'][number];

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; reflection: Reflection; gig: Gig };

function as_api_error(error: unknown, fallback: string): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, null, fallback);
}

/**
 * Whoever can counter-score this reflection, preferring an assessor. A gig
 * can genuinely have none of the three (a bare student-only gig mid-setup),
 * in which case this is null and the copy falls back to generic wording.
 */
function reviewer_of(participants: readonly Participant[]): Participant | null {
  const by_role = (role: Participant['role']) =>
    participants.find((participant) => participant.role === role) ?? null;
  return by_role('assessor') ?? by_role('supervisor') ?? by_role('employer');
}

export function Submitted() {
  const { reflection_id } = useParams<{ reflection_id: string }>();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);

  useEffect(() => {
    if (!reflection_id) return;
    const controller = new AbortController();

    api
      .get('/reflections/{reflection_id}', {
        path: { reflection_id },
        signal: controller.signal,
      })
      .then((reflection) =>
        api
          .get('/gigs/{gig_id}', {
            path: { gig_id: reflection.gig_id ?? '' },
            signal: controller.signal,
          })
          .then((gig) => setLoad({ status: 'loaded', reflection, gig })),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({
          status: 'error',
          error: as_api_error(error, 'Something went wrong loading this confirmation.'),
        });
      });

    return () => controller.abort();
  }, [reflection_id, reload_key]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  if (load.status === 'loading') {
    return (
      <section>
        <h1 className={styles.heading}>Submitted</h1>
        <LoadingState />
      </section>
    );
  }

  if (load.status === 'error') {
    return (
      <section>
        <h1 className={styles.heading}>Submitted</h1>
        <ErrorNotice error={load.error} on_retry={retry} />
      </section>
    );
  }

  const { reflection, gig } = load;

  if (reflection.status === 'draft') {
    // Reachable by URL without having actually submitted -- a stale tab, a
    // bookmark, a shared link. Not an error: the honest answer is that
    // there is nothing to confirm yet, so this is this screen's empty state.
    return (
      <section>
        <h1 className={styles.heading}>Submitted</h1>
        <div className={styles.empty}>
          <p className={styles.empty_title}>This reflection has not been submitted yet.</p>
          <p className={styles.empty_body}>
            There is nothing to confirm until you hand it in.
          </p>
          <div className={styles.empty_action}>
            <LinkButton to={`/reflections/${reflection.id}`}>
              Go to the reflection
            </LinkButton>
          </div>
        </div>
      </section>
    );
  }

  const reviewer = reviewer_of(gig.participants);
  const current_sprint = gig.sprints.find((sprint) => sprint.id === reflection.sprint_id);
  const ordered = by_ordinal(gig.sprints);
  const next_sprint = current_sprint
    ? ordered.find((sprint) => sprint.ordinal > current_sprint.ordinal)
    : undefined;

  return (
    <section className={styles.done}>
      {/* A confirmation, centred and marked (CAP-38). The tick is
          decoration: the heading and the card already say it. */}
      <span className={styles.tick} aria-hidden="true">
        ✓
      </span>
      <h1 className={styles.heading}>Submitted</h1>
      <Card accent="mint">
        <p className={styles.confirmation}>
          {reflection.status === 'assessed'
            ? reviewer
              ? `${reviewer.display_name} has reviewed this reflection.`
              : 'This reflection has been reviewed.'
            : reviewer
              ? `${reviewer.display_name} has been notified and will review your reflection.`
              : 'Your reflection has been handed in and is waiting on a review.'}
        </p>
        {next_sprint?.opens_on && (
          <p className={styles.next_sprint}>
            The next sprint opens {format_full_date(next_sprint.opens_on)}.
          </p>
        )}
      </Card>

      <div className={styles.nav}>
        <LinkButton to="/">Back to diary</LinkButton>
      </div>
    </section>
  );
}

/** Shaped like the loaded screen: a heading and one card, not a spinner. */
function LoadingState() {
  return (
    <SkeletonGroup label="Loading your confirmation">
      <Skeleton variant="block" width="100%" height="8rem" />
    </SkeletonGroup>
  );
}
