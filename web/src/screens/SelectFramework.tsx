/**
 * CAP-15. Which rubrics exist, which are yours, and putting one on a gig.
 *
 * Editing is copy-then-edit and there is no replace flow, deliberately: a
 * gig takes one rubric (ADR #33, extended by #35, which moved the rule into
 * the unique key itself) and the answer to "I picked the wrong one" is a
 * new gig. The 409 is surfaced rather than designed around.
 *
 * ON THE ASSIGN BUTTON, which the design says should not be here. 11.20 of
 * the prose spec in ~/projects/alumable-diary specs this screen and removes
 * the frame's Assign button on the reasoning that a template is reusable,
 * so which one is in force is a fact about the gig you are standing in, not
 * about the template -- assignment belongs on the Change-framework sheet at
 * 11.24, and the library carries a line saying so.
 *
 * That reasoning does not transfer. There is no Change-framework sheet in
 * this build and there will not be one: a gig's rubric is permanent and
 * singular. CAP-8's gig detail renders "No rubric assigned to this gig yet"
 * and offers no way to fix it. If this screen does not assign, nothing in
 * the product assigns. And useSession supplies exactly the context 11.20
 * says the library lacks. The divergence is deliberate and recorded here so
 * it is not rediscovered as a bug.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import { Button, Card, ErrorNotice, Skeleton, SkeletonGroup } from '../components/index.ts';
import { useSession, type SessionUser } from '../session/useSession.ts';
import { assignable_gigs, group_frameworks, type Framework } from './framework-groups.ts';
import styles from './SelectFramework.module.css';

type Participation = SessionUser['participations'][number];

type State =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; frameworks: Framework[] };

export function SelectFramework() {
  const { me } = useSession();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    api
      .get('/frameworks', { signal: controller.signal })
      .then((frameworks) => setState({ status: 'loaded', frameworks }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;

        setState({
          status: 'error',
          error:
            error instanceof ApiError
              ? error
              : new ApiError(0, null, 'Something went wrong loading the rubrics.'),
        });
      });

    return () => controller.abort();
  }, [reload_key]);

  // Back to the skeletons first, rather than leaving the error notice on
  // screen while the retry is in flight. Same as ReviewQueue and GigDetail.
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  // Resolved once here rather than per row: it is the same answer for every
  // rubric on the screen, and it decides the line under the heading.
  const assignable = assignable_gigs(me?.participations ?? []);

  return (
    <section>
      <h1 className={styles.heading}>Frameworks</h1>
      <p className={styles.sub}>
        {assignable.length > 0
          ? 'The rubrics a gig can be scored against. Copy a template to change one.'
          : 'The rubrics a gig can be scored against. Assigning one needs a gig you supervise.'}
      </p>

      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorNotice error={state.error} on_retry={retry} />}
      {state.status === 'loaded' && (
        <LoadedState frameworks={state.frameworks} assignable={assignable} />
      )}
    </section>
  );
}

/**
 * The empty state is the whole list being empty, not either group being
 * empty: a database that has been seeded always has templates, so nothing
 * at all means nothing has been seeded. An empty *copies* group is an
 * ordinary Tuesday and is said inside the group instead.
 */
function LoadedState({
  frameworks,
  assignable,
}: {
  frameworks: Framework[];
  assignable: Participation[];
}) {
  const { templates, copies } = group_frameworks(frameworks);

  if (templates.length === 0 && copies.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.empty_title}>No rubrics yet.</p>
        <p className={styles.empty_body}>
          A rubric arrives with the schema, so an empty list means the database has not been
          seeded. Run <code>php artisan db:seed</code> in <code>api/</code>.
        </p>
      </div>
    );
  }

  return (
    <>
      <Group
        title="Templates"
        hint="Shipped with the product. Copy one to edit it."
        frameworks={templates}
        assignable={assignable}
        when_empty="No templates. The database has not been seeded."
      />
      <Group
        title="Saved copies"
        hint="Copies made by a supervisor."
        frameworks={copies}
        assignable={assignable}
        when_empty="Nothing copied yet."
      />
    </>
  );
}

function Group({
  title,
  hint,
  frameworks,
  assignable,
  when_empty,
}: {
  title: string;
  hint: string;
  frameworks: Framework[];
  assignable: Participation[];
  when_empty: string;
}) {
  return (
    <section className={styles.block}>
      <h2 className={styles.group_heading}>{title}</h2>
      <p className={styles.sub}>{hint}</p>

      {frameworks.length === 0 ? (
        <p className={styles.none}>{when_empty}</p>
      ) : (
        <ul className={styles.list}>
          {frameworks.map((framework) => (
            <li key={framework.id}>
              <FrameworkRow framework={framework} assignable={assignable} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type AssignState =
  | { status: 'idle' }
  | { status: 'picking' }
  | { status: 'saving' }
  | { status: 'refused'; message: string }
  | { status: 'assigned'; gig_title: string };

/**
 * One rubric, and putting it on a gig.
 *
 * The picker expands rather than rendering a button per gig. The shared
 * database grows a smoke-test-copy-* framework on every run of smoke.sh, so
 * this list runs to a dozen rows against real data; a button per gig per
 * row is two dozen primary buttons on one screen. One gig is the common
 * case and skips the picking step entirely.
 *
 * Nothing is refetched after a successful assign. The Framework payload is
 * id, fw_key, version, name, is_active, created_by and in_use, and an
 * assignment changes none of them -- in_use means "a reflection references
 * this", not "this is on a gig". A reload here would cost a round trip to
 * redraw identical rows and would throw away the confirmation.
 *
 * "In use" is a plain span, not Badge and not Chip. Badge takes a
 * BadgeStatus, which is the contract's ReflectionStatus generated from
 * schema.ts -- draft | submitted | assessed -- and renders its own label
 * from a lookup rather than taking children, so it would neither compile
 * nor mean the right thing. Chip renders a <button>, and this marker is not
 * clickable.
 *
 * The marker says in_use, which is "a reflection references this, so it can
 * never be edited". That is NOT the spec's "Active" marker, which means
 * "this is the rubric in force on a gig" and is derived from
 * framework_assignments. GET /frameworks does not carry that fact and this
 * screen does not invent it.
 */
function FrameworkRow({
  framework,
  assignable,
}: {
  framework: Framework;
  assignable: Participation[];
}) {
  const [assign, setAssign] = useState<AssignState>({ status: 'idle' });

  async function assign_to(gig_id: string, gig_title: string) {
    setAssign({ status: 'saving' });

    try {
      await api.post('/framework-assignments', {
        body: { framework_id: framework.id, gig_id },
      });
      setAssign({ status: 'assigned', gig_title });
    } catch (error: unknown) {
      if (!(error instanceof ApiError)) throw error;

      // DUPLICATE_ASSIGNMENT is the common path on the seeded data: both
      // gigs already carry a rubric. Every other code that can arrive here
      // -- ROLE_FORBIDDEN, NOT_FOUND, a validation failure -- is equally a
      // considered answer about this one row, so all of them are shown the
      // same way, in place, rather than replacing the screen.
      setAssign({ status: 'refused', message: error.message });
    }
  }

  function begin() {
    if (assignable.length === 1) {
      const only = assignable[0];
      void assign_to(only.gig_id, only.gig_title);
      return;
    }
    setAssign({ status: 'picking' });
  }

  return (
    <Card>
      <div className={styles.row}>
        <div className={styles.identity}>
          <p className={styles.name}>{framework.name}</p>
          <p className={styles.meta}>
            {framework.fw_key} {'·'} {framework.version}
          </p>
        </div>

        <div className={styles.actions}>
          {framework.in_use && (
            <span className={styles.in_use} title="A reflection already uses this rubric">
              In use
            </span>
          )}

          {/* Every row, in use or not. The editor never changes the rubric
              it starts from -- it copies it (ADR #16, CAP-16) -- so a
              reflection referencing this one is no reason to hide it. Both
              seeded templates are in use; gating on in_use left a freshly
              seeded database with no way into the editor at all. */}
          <Link className={styles.edit} to={`/frameworks/${framework.id}/edit`}>
            <Button variant="secondary" full_width={false}>
              Copy and edit
            </Button>
          </Link>

          {assignable.length > 0 && assign.status !== 'picking' && (
            <Button
              full_width={false}
              disabled={assign.status === 'saving'}
              on_click={begin}
            >
              {assign.status === 'saving'
                ? 'Assigning…'
                : assignable.length === 1
                  ? `Assign to ${assignable[0].gig_title}`
                  : 'Assign to a gig'}
            </Button>
          )}
        </div>
      </div>

      {assign.status === 'picking' && (
        <div className={styles.picker}>
          <p className={styles.picker_label} id={`pick-${framework.id}`}>
            Assign {framework.name} to:
          </p>
          <div className={styles.picker_options} aria-labelledby={`pick-${framework.id}`}>
            {assignable.map((gig) => (
              <Button
                key={gig.gig_id}
                full_width={false}
                on_click={() => void assign_to(gig.gig_id, gig.gig_title)}
              >
                {gig.gig_title}
              </Button>
            ))}
            <Button
              variant="secondary"
              full_width={false}
              on_click={() => setAssign({ status: 'idle' })}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Announced, because the outcome of pressing a button is not on the
          button: the row is where it lands and a screen reader is not
          looking at it. */}
      {assign.status === 'refused' && (
        <p className={styles.refused} role="status">
          {assign.message}
        </p>
      )}
      {assign.status === 'assigned' && (
        <p className={styles.assigned} role="status">
          Assigned to {assign.gig_title}.
        </p>
      )}
    </Card>
  );
}

/** Shaped like the loaded screen: two groups, a few rows each. */
function LoadingState() {
  return (
    <SkeletonGroup label="Loading rubrics">
      {[0, 1].map((group) => (
        <div key={group} className={styles.block}>
          <Skeleton variant="text" width="30%" />
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} variant="block" height="var(--space-64)" />
          ))}
        </div>
      ))}
    </SkeletonGroup>
  );
}
