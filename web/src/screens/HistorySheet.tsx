/**
 * The history sheet: what has happened on this gig, oldest first.
 *
 * Mounted inside GigDetail's BottomSheet, behind the History button the
 * frame (My Gigs - History) puts at the top right of the page. The frame
 * is gig-wide -- "Sprint 1", "Sprint 2" -- and GET /reflections/{id}/events
 * is per reflection, so this asks once for each of the student's
 * reflections on the gig, in parallel, and merges the answers. The gig
 * page already holds that list, so it is handed in rather than fetched
 * again. A gig has a handful of sprints; this is not the place for a batch
 * endpoint.
 *
 * Four states, the sheet's own:
 *
 *   loading   skeleton rows shaped like the list
 *   empty     nothing has happened yet -- including a fresh draft, whose
 *             only event is reflection_created, which is not a milestone
 *   error     the first failed call, through ErrorNotice, with a retry
 *   loaded    the milestones
 *
 * What counts as a milestone, the order, the wording and the local time
 * all live in history-log.ts, which verify-history-sheet.sh runs.
 *
 * BottomSheet unmounts its children when it closes, so every open is a
 * fresh read and closing mid-load aborts the calls.
 */
import { useCallback, useEffect, useState } from 'react';

import { api, ApiError } from '../api/client.ts';
import type { components } from '../api/schema.ts';
import { ErrorNotice, Skeleton, SkeletonGroup } from '../components/index.ts';
import { format_local, history_rows } from './history-log.ts';
import type { HistoryRow, SprintEvent } from './history-log.ts';
import styles from './HistorySheet.module.css';

type Reflection = components['schemas']['ReflectionSummary'];

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; rows: HistoryRow[] };

export interface HistorySheetProps {
  /** The student's own reflections on this gig, as GigDetail loaded them. */
  reflections: Reflection[];
}

export function HistorySheet({ reflections }: HistorySheetProps) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    Promise.all(
      reflections.map((reflection) =>
        api
          .get('/reflections/{reflection_id}/events', {
            path: { reflection_id: reflection.id },
            signal,
          })
          .then((events): SprintEvent[] =>
            events.map((event) => ({
              ...event,
              sprint_ordinal: reflection.sprint_ordinal ?? null,
            })),
          ),
      ),
    )
      .then((per_reflection) =>
        setLoad({ status: 'loaded', rows: history_rows(per_reflection.flat()) }),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({
          status: 'error',
          error:
            error instanceof ApiError
              ? error
              : new ApiError(0, null, 'Something went wrong loading the history.'),
        });
      });

    return () => controller.abort();
  }, [reflections, reload_key]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  if (load.status === 'loading') {
    return (
      <SkeletonGroup label="Loading the history">
        <ul className={styles.list}>
          {[0, 1, 2].map((row) => (
            <li key={row} className={styles.row}>
              <Skeleton variant="text" width="70%" />
              <Skeleton variant="text" width="40%" />
            </li>
          ))}
        </ul>
      </SkeletonGroup>
    );
  }

  if (load.status === 'error') return <ErrorNotice error={load.error} on_retry={retry} />;

  if (load.rows.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.empty_title}>Nothing has happened yet.</p>
        <p className={styles.empty_body}>
          Each sprint adds two dates here: when you submit your reflection, and when your
          assessor finishes scoring it.
        </p>
      </div>
    );
  }

  return (
    <ol className={styles.list}>
      {load.rows.map((row) => (
        <li key={row.id} className={styles.row}>
          <span className={styles.label}>{row.label}</span>
          <span className={styles.meta}>
            <time dateTime={row.occurred_at}>{format_local(row.occurred_at)}</time>
            {row.actor && (
              <>
                {' '}
                {'·'} {row.actor}
              </>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
