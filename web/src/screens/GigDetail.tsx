/**
 * One gig: what it is, how long it runs, and where its reflections are up
 * to -- the three cards the design draws on My Gig -> Overview.
 *
 * This screen is not a diary screen. In the design it belongs to the host
 * app: Earn -> My Gigs -> a gig, with tabs Overview / Application / Offer,
 * and the diary appears on it as one card of three. Alumable's own Earn
 * section is not in this build, so the screen is reached from the diary
 * instead -- the arrow is reversed, and the cards are what stop it reading
 * as a second diary list. See "The design, found late" in the CAP-8 plan,
 * and §11.4a of the prose spec in the prototype at ~/projects/alumable-diary.
 *
 * The sprint rows are rows, not a table: the whole row is the target,
 * the way DiaryHome's entry list works. Selecting a sprint should not be
 * a different gesture on two screens of the same product.
 *
 * Two calls for a student, one for everybody else. GET /gigs/{gig_id}
 * carries the gig, its sprints, its framework, its participants and the
 * reflection counts. The per-sprint SELF / ASSESSOR columns need each
 * sprint's reflection status, which only GET /reflections?gig_id= returns
 * -- and that endpoint gives a student their own rows but an assessor
 * every student's on the gig, so a single-student table cannot be built
 * from it for a non-student. They get the sprint list with its dates
 * instead, which is the question they can actually be answered.
 *
 * The relative date wording and the sprint states are both in
 * gig-timing.ts, which imports nothing, so scripts/verify-gig-detail.sh
 * can compile it and call it with dates the seed does not contain. Every
 * seeded sprint is already past due.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import type { components } from '../api/schema.ts';
import { Card, ErrorNotice, Skeleton, SkeletonGroup } from '../components/index.ts';
import { useSession } from '../session/useSession.ts';
import {
  by_ordinal,
  format_full_date,
  gig_dates,
  gig_duration_weeks,
  sprint_progress,
  sprint_timing,
} from './gig-timing.ts';
import styles from './GigDetail.module.css';

type Gig = components['schemas']['GigDetail'];
type Sprint = Gig['sprints'][number];
type Participant = Gig['participants'][number];
type Reflection = components['schemas']['ReflectionSummary'];
type Role = components['schemas']['Role'];

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; gig: Gig; reflections: Reflection[] };

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
    const signal = controller.signal;

    api
      .get('/gigs/{gig_id}', { path: { gig_id }, signal })
      .then(async (gig): Promise<{ gig: Gig; reflections: Reflection[] }> => {
        // Only a student's rows describe one person's progress, so only a
        // student's are asked for. The role comes from the payload the
        // server just resolved, never from the client.
        if (gig.my_role !== 'student') return { gig, reflections: [] };

        const reflections = await api.get('/reflections', {
          query: { gig_id },
          signal,
        });

        return { gig, reflections };
      })
      .then(({ gig, reflections }) => setLoad({ status: 'loaded', gig, reflections }))
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

  const { gig, reflections } = load;

  return (
    <section>
      <GigHeader gig={gig} />
      <GigDetailsCard gig={gig} me_id={me?.id ?? null} />
      <TimelineCard gig={gig} />
      <DiaryCard gig={gig} reflections={reflections} today={new Date()} />
    </section>
  );
}

/**
 * The frame's page head: the title, the host, and the span underneath.
 * The status pill beside it ("Applied" / "Accepted") is not here -- this
 * build has no application or offer state to render, and a pill that
 * always says the same word is decoration.
 */
function GigHeader({ gig }: { gig: Gig }) {
  const when = gig_dates(gig.starts_on, gig.ends_on);

  return (
    <header className={styles.header}>
      <h1 className={styles.heading}>{gig.title}</h1>
      {gig.org_name && <p className={styles.sub}>{gig.org_name}</p>}
      {when && <p className={styles.sub}>{when}</p>}
    </header>
  );
}

/**
 * The frame's first card: GIG TITLE and HOST as a labelled fact list.
 *
 * The participants sit here too, and they are the one block on this screen
 * with no design behind it -- all 45 frames were checked and none carries a
 * roster. CAP-8's criterion 1 asks for "the participant roles", so it is
 * built, but as a row of this card rather than as a section of its own:
 * the criterion is met and the screen still reads as the frame's three
 * cards. The only roster in the design is the host's scoring worklist,
 * which is CAP-10 and CAP-13 territory.
 */
function GigDetailsCard({ gig, me_id }: { gig: Gig; me_id: string | null }) {
  return (
    <section className={styles.block}>
      <Card accent="lavender">
        <h2 className={styles.card_heading}>Gig details</h2>
        <dl className={styles.facts}>
          <dt className={styles.fact_label}>Gig title</dt>
          <dd className={styles.fact_value}>{gig.title}</dd>

          <dt className={styles.fact_label}>Host</dt>
          <dd className={styles.fact_value}>{gig.org_name ?? 'Not recorded'}</dd>

          <dt className={styles.fact_label}>People</dt>
          <dd className={styles.fact_value}>
            <ParticipantList participants={gig.participants} me_id={me_id} />
          </dd>
        </dl>
      </Card>
    </section>
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
    return <span className={styles.none}>Nobody is on this gig yet.</span>;
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
 * The frame's second card: START | END | DURATION, the weeks computed.
 *
 * Rendered only when both ends are known. A timeline with one date is not
 * a timeline, and the frame has no drawing for that case -- the gig's span
 * is already in the header line, so nothing is lost by dropping the card.
 */
function TimelineCard({ gig }: { gig: Gig }) {
  const weeks = gig_duration_weeks(gig.starts_on, gig.ends_on);

  if (!gig.starts_on || !gig.ends_on) return null;

  return (
    <section className={styles.block}>
      <Card accent="evidence">
        <h2 className={styles.card_heading}>Timeline</h2>
        <dl className={styles.timeline}>
          <div className={styles.timeline_cell}>
            <dt className={styles.fact_label}>Start</dt>
            <dd className={styles.timeline_value}>{format_full_date(gig.starts_on)}</dd>
          </div>
          <div className={styles.timeline_cell}>
            <dt className={styles.fact_label}>End</dt>
            <dd className={styles.timeline_value}>{format_full_date(gig.ends_on)}</dd>
          </div>
          {weeks !== null && (
            <div className={styles.timeline_cell}>
              <dt className={styles.fact_label}>Duration</dt>
              <dd className={styles.timeline_value}>
                {weeks} {weeks === 1 ? 'week' : 'weeks'}
              </dd>
            </div>
          )}
        </dl>
      </Card>
    </section>
  );
}

/**
 * The frame's third card, and criterion 3's way into the diary scoped to
 * this gig.
 *
 * For a student it is the frame's SPRINT / SELF REFLECTION / ASSESSOR
 * REFLECTION rows, the two columns being the reflection states split
 * rather than a second vocabulary (see sprint_progress).
 *
 * The counts that used to sit at the bottom are gone. They said in three
 * numbers what the rows now say sprint by sprint, and a card that states
 * the same fact twice in two vocabularies is the thing that made this
 * screen read as over-built. The prose line went with them for a student,
 * and stayed for everybody else, where it is load-bearing: it is what
 * explains why they are not offered a link.
 *
 * For a non-student the card shows the sprint calendar with its dates,
 * because GET /reflections returns them every student's rows and a
 * single-student table cannot be built out of that.
 */
function DiaryCard({
  gig,
  reflections,
  today,
}: {
  gig: Gig;
  reflections: Reflection[];
  today: Date;
}) {
  const is_student = gig.my_role === 'student';

  return (
    <section className={styles.block}>
      <Card accent="pink">
        <h2 className={styles.card_heading}>Reflection diary</h2>

        <p className={styles.framework}>
          {gig.framework ? (
            <>
              Scored against <strong>{gig.framework.name}</strong> ({gig.framework.version})
            </>
          ) : (
            'No rubric assigned to this gig yet.'
          )}
        </p>

        {gig.sprints.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.empty_title}>No sprints on this gig yet.</p>
            <p className={styles.empty_body}>
              A reflection belongs to a sprint, so nothing can be written here until someone
              adds one.
            </p>
          </div>
        ) : is_student ? (
          <SprintRows sprints={gig.sprints} reflections={reflections} today={today} />
        ) : (
          <SprintCalendar sprints={gig.sprints} today={today} />
        )}

        {!is_student && <p className={styles.diary_body}>{NOT_YOUR_DIARY}</p>}

        {is_student && (
          <Link className={styles.diary_link} to={`/?gig_id=${gig.id}`}>
            Open your diary for this gig
          </Link>
        )}
      </Card>
    </section>
  );
}

/**
 * Why a supervisor, assessor or employer is shown the gig's sprints but is
 * not offered a way into the diary: it is somebody else's record, and their
 * own work on it is in the review queue.
 */
const NOT_YOUR_DIARY =
  'Reflections on this gig that you can see. The diary itself is each ' +
  'student\u2019s own record; your work on it is in the review queue.';

/**
 * A row per sprint, and the row is the target -- not a link buried inside
 * it. This is the same idiom DiaryHome's entry list uses: the whole row is
 * one Link, the state sits at the right edge, and a chevron says so. The
 * first build of this made the sprint NUMBER a hyperlink inside a table
 * cell, which is a second way of selecting a sprint in a product that
 * already had one, and a much smaller tap target.
 *
 * The frame's three columns survive as a grid rather than a table, because
 * a <tr> cannot be a link and splitting one row across several links is
 * exactly the thing that makes a screen reader read it three times. The
 * header line above carries the column names, and every row shares its
 * grid template, so they line up as the frame draws them.
 *
 * A sprint with no reflection is not a link: there is nothing yet to
 * address, and creating one is the stepper's job, not this screen's.
 */
function SprintRows({
  sprints,
  reflections,
  today,
}: {
  sprints: Sprint[];
  reflections: Reflection[];
  today: Date;
}) {
  // One reflection per student per sprint -- the (user_id, gig_key,
  // sprint_key) unique index is what guarantees it, so a Map is safe.
  const by_sprint = new Map(
    reflections
      .filter((reflection) => reflection.sprint_id !== null)
      .map((reflection) => [reflection.sprint_id as string, reflection]),
  );

  return (
    <div className={styles.rows}>
      <p className={styles.rows_head} aria-hidden="true">
        <span>Sprint</span>
        <span>Self reflection</span>
        <span>Assessor reflection</span>
      </p>

      <ul className={styles.rows_list}>
        {by_ordinal(sprints).map((sprint) => {
          const reflection = by_sprint.get(sprint.id) ?? null;
          const progress = sprint_progress(sprint, reflection?.status ?? null, today);
          const timing = sprint_timing(sprint, today);

          // The header row is decorative (aria-hidden), so each cell says
          // what it is to a screen reader instead. Sighted readers get the
          // column; everyone else gets the label.
          const body = (
            <>
              <span className={styles.row_sprint}>
                <span className={styles.row_title}>Sprint {sprint.ordinal}</span>
                <span className={styles.row_meta}>{timing.line}</span>
              </span>
              <span className={styles.row_state}>
                <span className={styles.sr_only}>Self reflection: </span>
                {progress.self ?? <span aria-hidden="true">{'\u2014'}</span>}
                {progress.self === null && <span className={styles.sr_only}>none</span>}
              </span>
              <span className={styles.row_state}>
                <span className={styles.sr_only}>Assessor reflection: </span>
                {progress.assessor ?? <span aria-hidden="true">{'\u2014'}</span>}
                {progress.assessor === null && <span className={styles.sr_only}>none</span>}
              </span>
              {/*
               * The character itself rather than a numeric HTML entity:
               * check-tokens.sh reads one as a raw hex colour and fails
               * the build, which its own header lists as a known false
               * positive. Same note as DiaryHome's row.
               */}
              <span className={styles.chevron} aria-hidden="true">
                {reflection ? '\u203a' : ''}
              </span>
            </>
          );

          return (
            <li key={sprint.id}>
              {reflection ? (
                <Link className={styles.row} to={`/reflections/${reflection.id}`}>
                  {body}
                </Link>
              ) : (
                <div className={styles.row_flat}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Criterion 2 for a reader who is not the student: one line per sprint,
 * saying the single most useful thing about its timing -- when it opens,
 * how long is left, or which window it was. gig_timing picks; the
 * reasoning is on sprint_timing.
 */
function SprintCalendar({ sprints, today }: { sprints: Sprint[]; today: Date }) {
  return (
    <ul className={styles.rows_list}>
      {by_ordinal(sprints).map((sprint) => (
        <li key={sprint.id}>
          <div className={styles.row_flat}>
            <span className={styles.row_sprint}>
              <span className={styles.row_title}>Sprint {sprint.ordinal}</span>
            </span>
            <span className={styles.row_meta}>{sprint_timing(sprint, today).line}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Shaped like the loaded screen: a header and the three cards. */
function LoadingState() {
  return (
    <SkeletonGroup label="Loading this gig">
      <div className={styles.header}>
        <Skeleton variant="text" width="50%" />
        <Skeleton variant="text" width="30%" />
      </div>
      {[0, 1, 2].map((card) => (
        <div key={card} className={styles.block}>
          <Skeleton variant="block" height="var(--space-64)" />
        </div>
      ))}
    </SkeletonGroup>
  );
}
