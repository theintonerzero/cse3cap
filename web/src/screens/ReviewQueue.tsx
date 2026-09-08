/**
 * The assessor's worklist: submitted reflections still awaiting the
 * caller's own score. Scoping by gig and by role is entirely the server's
 * job (`GET /review-queue`, `ReviewQueueController::index`) — this screen
 * renders whatever comes back and does not re-derive it.
 *
 * CAP-10, built against CAP-3/CAP-4's real components. CAP-5's router and
 * token context still don't exist, so the link into the assessor stepper
 * stays a disabled placeholder and this screen has no mount point of its
 * own in the product yet — see `web/review-queue.html` for the throwaway
 * dev mount used to look at it before CAP-5 lands.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client.ts';
import type { paths } from '../api/schema.ts';
import { ErrorNotice, ProgressBar, Skeleton, SkeletonGroup } from '../components/index.ts';
import styles from './ReviewQueue.module.css';

type ReviewQueueEntry =
  paths['/review-queue']['get']['responses']['200']['content']['application/json'][number];

type State =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; entries: ReviewQueueEntry[] };

export function ReviewQueue() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    api
      .get('/review-queue', { signal: controller.signal })
      .then((entries) => setState({ status: 'loaded', entries }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;

        setState({
          status: 'error',
          error:
            error instanceof ApiError
              ? error
              : new ApiError(0, null, 'Something went wrong loading the review queue.'),
        });
      });

    return () => controller.abort();
  }, [reloadKey]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  return (
    <section>
      <h1 className={styles.heading}>Review queue</h1>

      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorNotice error={state.error} on_retry={retry} />}
      {state.status === 'loaded' && state.entries.length === 0 && <EmptyState />}
      {state.status === 'loaded' && state.entries.length > 0 && (
        <ul className={styles.list}>
          {state.entries.map((entry) => (
            <ReviewQueueRow key={entry.reflection_id} entry={entry} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Three rows, matching the shape a loaded list typically has, so the
 * layout doesn't jump when data arrives.
 */
function LoadingState() {
  return (
    <SkeletonGroup label="Loading the review queue">
      <ul className={styles.list}>
        {[0, 1, 2].map((i) => (
          <li key={i} className={styles.row}>
            <Skeleton variant="text" lines={2} width="40%" />
            <Skeleton variant="block" width="30%" height="var(--space-32)" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/**
 * "Empty means nothing is waiting, which is the normal state most of the
 * time, so it should not look like an error." (CAP-10 acceptance text.)
 */
function EmptyState() {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>Nothing is waiting on you right now.</p>
      <p className={styles.emptyBody}>
        New submissions will show up here as soon as a student turns one in.
      </p>
    </div>
  );
}

function ReviewQueueRow({ entry }: { entry: ReviewQueueEntry }) {
  const { student, gig_title, sprint_ordinal, progress } = entry;

  return (
    <li className={styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.studentName}>{student.display_name}</span>
        <span className={styles.rowMeta}>
          {gig_title ?? 'Unknown gig'}
          {sprint_ordinal != null ? ` · Sprint ${sprint_ordinal}` : ''}
        </span>
      </div>

      <ProgressBar
        current={progress.scored_by_me}
        total={progress.entries}
        label="Entries"
      />

      {/*
       * Becomes a real <Link> once CAP-5's router exists and CAP-13 builds
       * the assessor stepper it points to. `/review-queue/:reflectionId`
       * is not documented anywhere — it's this screen's own inference
       * from the API's `reflection_id` field, and CAP-13's actual route
       * may differ.
       */}
      <span className={styles.scoreLink} aria-disabled="true">
        Score this →
      </span>
    </li>
  );
}
