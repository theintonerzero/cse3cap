/**
 * The assessor's worklist: submitted reflections still awaiting the
 * caller's own score. Scoping by gig and by role is entirely the server's
 * job (`GET /review-queue`, `ReviewQueueController::index`) — this screen
 * renders whatever comes back and does not re-derive it.
 *
 * CAP-10, built against CAP-3/CAP-4's real components and mounted on
 * CAP-5's router at `/review-queue`. Each row links into the assessor
 * stepper (CAP-13).
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, ApiError } from '../api/client.ts';
import type { paths } from '../api/schema.ts';
import { useSession } from '../session/useSession.ts';
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

  // Same test as routes.tsx's SupervisorOnly, written inline as B1's
  // ReviewerOnly is: Frameworks is a supervisor's (ADR #17).
  const { me } = useSession();
  const supervises = me?.participations.some((p) => p.role === 'supervisor') ?? false;

  return (
    <section>
      {/* Frameworks' way in, now the bar has no pills (round 3 D2): a
          whole-row card like the queue's own, above the queue so it is
          always in reach (Patrick, 2026-10-05). */}
      {supervises && (
        <Link
          className={styles.wayIn}
          to="/frameworks"
          aria-label="Frameworks, copy a rubric or assign one to a gig"
        >
          <span className={styles.wayInMain}>
            <span className={styles.wayInTitle}>Frameworks</span>
            <span className={styles.wayInMeta}>Copy a rubric, or assign one to a gig</span>
          </span>
          <span className={styles.wayInChevron} aria-hidden="true">
            {'›'}
          </span>
        </Link>
      )}

      <h1 className={styles.heading}>Review queue</h1>

      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorNotice error={state.error} on_retry={retry} />}
      {state.status === 'loaded' && state.entries.length === 0 && <EmptyState />}
      {state.status === 'loaded' && state.entries.length > 0 && (
        <QueueList entries={state.entries} />
      )}
    </section>
  );
}

interface GigGroup {
  key: string;
  title: string;
  entries: ReviewQueueEntry[];
}

/** Each gig's rows together, gigs in the order their first row arrived. */
function groups_of(entries: ReviewQueueEntry[]): GigGroup[] {
  const groups: GigGroup[] = [];
  for (const entry of entries) {
    const key = entry.gig_id ?? 'none';
    let group = groups.find((candidate) => candidate.key === key);
    if (!group) {
      group = { key, title: entry.gig_title ?? 'Unknown gig', entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/**
 * The queue listed by gig, each under its name, the way Frameworks lists
 * its groups (Patrick, 2026-10-05: a reviewer has a few gigs at most, so all
 * of them fit on one screen). One gig gets its label too: the row no longer
 * names the gig, and Sam's queue is set up like Dr Lee's. The rows are the
 * ones already loaded; nothing is re-fetched.
 */
function QueueList({ entries }: { entries: ReviewQueueEntry[] }) {
  return (
    <div className={styles.groups}>
      {groups_of(entries).map((group) => (
        <section key={group.key} aria-labelledby={`queue-gig-${group.key}`}>
          <h2 id={`queue-gig-${group.key}`} className={styles.groupLabel}>
            {group.title}
          </h2>
          <ul className={styles.list}>
            {group.entries.map((entry) => (
              <ReviewQueueRow key={entry.reflection_id} entry={entry} />
            ))}
          </ul>
        </section>
      ))}
    </div>
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

  // One link per row, the whole card the target, read like the diary's and
  // the gig page's rows (CAP-38 round 3 Q3): name, a muted meta line, then
  // the progress bar and a chevron at the right edge.
  return (
    <li>
      {/* The assessor stepper (CAP-13), by reflection: the queue has nothing finer. */}
      {/* Named once, plainly: read from its contents the card's name would
          also pick up the progress bar's own value ("of 6 0"). It starts
          with the student's name, the first words on the card (WCAG 2.5.3). */}
      <Link
        className={styles.row}
        to={`/review-queue/reflections/${entry.reflection_id}`}
        aria-label={`${student.display_name}, ${gig_title ?? 'Unknown gig'}${
          sprint_ordinal != null ? `, Sprint ${sprint_ordinal}` : ''
        }: ${progress.scored_by_me} of ${progress.entries} entries scored`}
      >
        {/* "Jane N · Sprint 2" on one line (Patrick, 2026-10-05): the row
            uses its width, and the gig is the label above it. */}
        <span className={styles.rowMain}>
          <span className={styles.studentName}>{student.display_name}</span>
          {sprint_ordinal != null && (
            <span className={styles.rowSprint}> · Sprint {sprint_ordinal}</span>
          )}
        </span>

        <span className={styles.rowProgress}>
          <ProgressBar
            current={progress.scored_by_me}
            total={progress.entries}
            label="Entries"
          />
        </span>

        {/* The character itself, as DiaryHome does: check-tokens.sh reads a
            numeric entity as a raw hex colour. */}
        <span className={styles.chevron} aria-hidden="true">
          {'›'}
        </span>
      </Link>
    </li>
  );
}
