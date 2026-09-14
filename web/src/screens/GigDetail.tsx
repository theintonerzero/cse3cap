/**
 * One gig: who is on it, what rubric it is scored against, when its
 * sprints open and are due, and the way into the diary scoped to it.
 *
 * One call. GET /gigs/{gig_id} returns GigDetail, which carries every
 * field all four criteria need -- including reflection_summary, already
 * counted and already role-scoped by the server
 * (GigController::visibleReflections gives a student their own and an
 * assessor, supervisor or employer every one on the gig), and
 * participants, which only this endpoint returns. Fetching reflections
 * again to count them here would be that rule implemented twice.
 *
 * The relative date wording is all in gig-timing.ts, which imports
 * nothing, so scripts/verify-gig-detail.sh can compile it and call it with
 * dates the seed does not contain. Every seeded sprint is already past
 * due, so "not open yet" and "due in 3 days" are unreachable by looking at
 * the app.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import type { components } from '../api/schema.ts';
import { Badge, Card, ErrorNotice, Skeleton, SkeletonGroup } from '../components/index.ts';
import { useSession } from '../session/useSession.ts';
import { by_ordinal, gig_dates, sprint_timing } from './gig-timing.ts';
import styles from './GigDetail.module.css';

type Gig = components['schemas']['GigDetail'];
type Participant = Gig['participants'][number];
type Role = components['schemas']['Role'];

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; gig: Gig };

/**
 * The route pattern guarantees a gig_id, the type does not. A missing one
 * is the same answer the API would give for a bad one, so it is rendered
 * through the same notice. Built once at module scope rather than inside
 * the component: it never varies, and constructing an Error every render
 * to throw it away is waste.
 */
const NO_SUCH_GIG = new ApiError(404, 'NOT_FOUND', 'No such gig, or it is not yours.');

/** How a role is said to a person, rather than how the database spells it. */
const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  assessor: 'Assessor',
  supervisor: 'Supervisor',
  employer: 'Employer',
};

export function GigDetail() {
  const { gig_id } = useParams<{ gig_id: string }>();
  const { me } = useSession();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);

  useEffect(() => {
    // Nothing to fetch and nothing to set: the render path below answers
    // this case. Setting state here instead would be a synchronous
    // setState inside an effect, which is a cascading render for a value
    // that was knowable before the effect ever ran.
    if (!gig_id) return;

    const controller = new AbortController();

    api
      .get('/gigs/{gig_id}', { path: { gig_id }, signal: controller.signal })
      .then((gig) => setLoad({ status: 'loaded', gig }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({
          status: 'error',
          error:
            error instanceof ApiError
              ? error
              : new ApiError(0, null, 'Something went wrong loading this gig.'),
        });
      });

    return () => controller.abort();
  }, [gig_id, reload_key]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  // Before the load states, because with no id there is no load: the
  // effect above deliberately does nothing and `load` would sit on
  // 'loading' for ever.
  if (!gig_id) {
    return (
      <section>
        <h1 className={styles.heading}>Gig</h1>
        <ErrorNotice error={NO_SUCH_GIG} />
      </section>
    );
  }

  if (load.status === 'loading') return <LoadingState />;

  /*
   * A 404 here is "no such gig, or it is not yours", and the two are
   * deliberately indistinguishable (docs/openapi.yaml, NotFound).
   * ErrorNotice already switches on NOT_FOUND and on ROLE_FORBIDDEN and
   * already decides that a 4xx is not worth a retry button, so this hands
   * it the error rather than re-deciding any of that here.
   */
  if (load.status === 'error') {
    return (
      <section>
        <h1 className={styles.heading}>Gig</h1>
        <ErrorNotice error={load.error} on_retry={retry} />
      </section>
    );
  }

  const { gig } = load;

  return (
    <section>
      <GigHeader gig={gig} me_id={me?.id ?? null} />
      <SprintList sprints={gig.sprints} today={new Date()} />
      <DiaryCard gig={gig} />
    </section>
  );
}

/**
 * Criterion 1: the gig, the assigned framework, and the participant roles.
 *
 * The framework line names the rubric and its version because a score is
 * only ever read against the rubric it was given under, and neither the
 * axes nor the scale are fixed -- that is the whole point of the framework
 * engine. Null is a real state: GigFramework is nullable in the contract
 * and a gig with no assignment yet cannot be reflected on at all.
 */
function GigHeader({ gig, me_id }: { gig: Gig; me_id: string | null }) {
  const when = gig_dates(gig.starts_on, gig.ends_on);
  const where = [gig.org_name, when].filter((part): part is string => part !== null);

  return (
    <header className={styles.header}>
      <h1 className={styles.heading}>{gig.title}</h1>
      {where.length > 0 && <p className={styles.sub}>{where.join(' · ')}</p>}

      <p className={styles.framework}>
        {gig.framework ? (
          <>
            Scored against <strong>{gig.framework.name}</strong> ({gig.framework.version})
          </>
        ) : (
          'No rubric assigned to this gig yet.'
        )}
      </p>

      <ParticipantList participants={gig.participants} me_id={me_id} />
    </header>
  );
}

/**
 * Everyone on the gig and what they are on it. Roles come from the server,
 * resolved from gig_participants; the client never decides one.
 *
 * The caller is marked rather than hidden. On a gig the point is who else
 * is here, and a list that silently omits you reads as though the API
 * dropped a row.
 */
function ParticipantList({
  participants,
  me_id,
}: {
  participants: Participant[];
  me_id: string | null;
}) {
  if (participants.length === 0) {
    return <p className={styles.sub}>Nobody is on this gig yet.</p>;
  }

  return (
    <ul className={styles.people}>
      {participants.map((person) => (
        <li key={`${person.id}:${person.role}`} className={styles.person}>
          <span className={styles.person_name}>
            {person.display_name}
            {person.id === me_id && <span className={styles.you}> (you)</span>}
          </span>
          <span className={styles.person_role}>{ROLE_LABEL[person.role]}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Criterion 2. Every row carries its dates; the relative phrase is added
 * where it helps and dropped past gig-timing's horizon.
 *
 * The rows are not links. A sprint has no screen of its own -- CAP-11's
 * stepper addresses a reflection, and this screen cannot know whether one
 * exists for a sprint without a request per row. The way into the diary is
 * the card below, which is what criterion 3 asks for.
 */
function SprintList({ sprints, today }: { sprints: Gig['sprints']; today: Date }) {
  if (sprints.length === 0) {
    return (
      <section className={styles.block}>
        <h2 className={styles.block_heading}>Sprints</h2>
        <div className={styles.empty}>
          <p className={styles.empty_title}>No sprints on this gig yet.</p>
          <p className={styles.empty_body}>
            A reflection belongs to a sprint, so nothing can be written here until someone
            adds one.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.block}>
      <h2 className={styles.block_heading}>Sprints</h2>
      <ul className={styles.sprints}>
        {by_ordinal(sprints).map((sprint) => {
          const timing = sprint_timing(sprint, today);

          return (
            <li key={sprint.id} className={styles.sprint}>
              <span className={styles.sprint_title}>Sprint {sprint.ordinal}</span>
              <span className={styles.sprint_dates}>{timing.dates ?? 'No dates set'}</span>
              {timing.relative && (
                <span className={`${styles.sprint_when} ${styles[timing.state]}`}>
                  {timing.relative}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Criterion 3: into the diary home, already scoped to this gig.
 *
 * CAP-7 put scope in the URL as ?gig_id= for exactly this (its Decision 1
 * names this ticket), so the link is a query string and nothing more.
 *
 * The counts are the server's, role-scoped, and shown to everyone. The
 * link is not: the diary home is the student's own record and tells
 * anybody else so, and sending a supervisor there would be a link to a
 * dead end. /review-queue is not offered as the alternative because that
 * route is still CAP-10's placeholder, and a link to a placeholder is
 * worse than a sentence.
 */
function DiaryCard({ gig }: { gig: Gig }) {
  const counts = gig.reflection_summary;
  const total = counts.draft + counts.submitted + counts.assessed;
  const is_student = gig.my_role === 'student';

  return (
    <section className={styles.block}>
      <h2 className={styles.block_heading}>Diary</h2>
      <Card accent="lavender">
        <div className={styles.diary}>
          <p className={styles.diary_body}>{diary_copy(gig.my_role, total)}</p>

          <ul className={styles.counts}>
            <li>
              {counts.assessed} assessed
              <Badge status="assessed" />
            </li>
            <li>
              {counts.submitted} submitted
              <Badge status="submitted" />
            </li>
            <li>
              {counts.draft} draft
              <Badge status="draft" />
            </li>
          </ul>

          {is_student && (
            <Link className={styles.diary_link} to={`/?gig_id=${gig.id}`}>
              Open your diary for this gig
            </Link>
          )}
        </div>
      </Card>
    </section>
  );
}

/**
 * What the card says, which depends on the role and on whether anything has
 * been written. Pulled out of the JSX because a nested ternary in the middle
 * of a paragraph is unreadable at prettier's 92 columns.
 */
function diary_copy(my_role: Role, total: number): string {
  if (my_role !== 'student') {
    return (
      'Reflections on this gig that you can see. The diary itself is each ' +
      'student’s own record; your work on it is in the review queue.'
    );
  }

  if (total === 0) {
    return 'Nothing written on this gig yet. Your diary is where a reflection starts.';
  }

  return 'Your reflections on this gig, and the radar for them.';
}

/** Shaped like the loaded screen: a header, three sprint rows, a card. */
function LoadingState() {
  return (
    <SkeletonGroup label="Loading this gig">
      <div className={styles.header}>
        <Skeleton variant="text" width="50%" />
        <Skeleton variant="text" width="30%" />
        <Skeleton variant="text" lines={2} width="70%" />
      </div>
      <ul className={styles.sprints}>
        {[0, 1, 2].map((row) => (
          <li key={row} className={styles.sprint}>
            <Skeleton variant="text" lines={2} width="45%" />
          </li>
        ))}
      </ul>
      <div className={styles.block}>
        <Skeleton variant="block" height="var(--space-64)" />
      </div>
    </SkeletonGroup>
  );
}
