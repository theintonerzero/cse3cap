/**
 * The assessor's worklist: submitted reflections still awaiting the
 * caller's own score. Scoping by gig and by role is entirely the
 * server's job (`GET /review-queue`, `ReviewQueueController::index`) —
 * this screen renders whatever comes back and does not re-derive it.
 *
 * CAP-10. Skeleton only: CAP-3's reusable components (Skeleton,
 * ErrorNotice, Card, Button) and CAP-5's router/token context don't
 * exist yet, so several pieces below are marked with a TODO for the
 * ticket that will replace them. `web/src/screens/` is this file's own
 * invention — no screen-directory convention exists anywhere else in
 * the repo yet, and CAP-5 may pick a different one.
 */
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client.ts';
import type { paths } from '../api/schema.ts';
import styles from './ReviewQueue.module.css';

type ReviewQueueEntry =
  paths['/review-queue']['get']['responses']['200']['content']['application/json'][number];

type State =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; entries: ReviewQueueEntry[] };

export function ReviewQueue() {
  const [state, setState] = useState<State>({ status: 'loading' });

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
  }, []);

  if (state.status === 'loading') {
    return <LoadingState />;
  }

  if (state.status === 'error') {
    return <ErrorState error={state.error} />;
  }

  if (state.entries.length === 0) {
    return <EmptyState />;
  }

  return (
    <ul className={styles.list}>
      {state.entries.map((entry) => (
        <ReviewQueueRow key={entry.reflection_id} entry={entry} />
      ))}
    </ul>
  );
}

// TODO(CAP-3): replace with the real Skeleton component once it exists.
// This renders the same number of placeholder rows a loaded list
// typically has, so the layout doesn't jump when data arrives.
function LoadingState() {
  return (
    <ul className={styles.list} aria-busy="true" aria-label="Loading the review queue">
      {[0, 1, 2].map((i) => (
        <li key={i} className={styles.rowSkeleton} />
      ))}
    </ul>
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

// TODO(CAP-3): replace with the real ErrorNotice component once it
// exists. `/review-queue` has no endpoint-specific error codes today,
// so this always falls back to the envelope's message.
function ErrorState({ error }: { error: ApiError }) {
  return (
    <div className={styles.error} role="alert">
      <p className={styles.errorTitle}>Could not load the review queue.</p>
      <p className={styles.errorBody}>{error.message}</p>
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

      {/* TODO(CAP-4): replace with <ProgressBar> once PR #16 merges. */}
      <span className={styles.progress}>
        {progress.scored_by_me} of {progress.entries} scored
      </span>

      {/*
       * TODO(CAP-5): this becomes a real <Link> once the router exists.
       * `/review-queue/:reflectionId` is not documented anywhere — it's
       * this screen's own inference from the API's `reflection_id`
       * field, and the actual path CAP-13's route ends up using may
       * differ.
       */}
      <span className={styles.scoreLink} aria-disabled="true">
        Score this →
      </span>
    </li>
  );
}
