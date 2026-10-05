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

import { api, ApiError } from '../api/client.ts';
import {
  BottomSheet,
  Button,
  ErrorNotice,
  LinkButton,
  Skeleton,
  SkeletonGroup,
} from '../components/index.ts';
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
          ? 'The rubrics a gig is scored against. Copy one to change it.'
          : 'The rubrics a gig is scored against. Copy one to change it. Assigning one needs a gig you supervise.'}
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
  // One sheet for the screen, not one per row (round 3 E6). The framework
  // stays set while the sheet is shut, so its title never blanks mid-close.
  const [open, setOpen] = useState<Framework | null>(null);
  const [sheet_open, setSheetOpen] = useState(false);

  function open_sheet(framework: Framework) {
    setOpen(framework);
    setSheetOpen(true);
  }

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
        frameworks={templates}
        on_open={open_sheet}
        when_empty="No templates. The database has not been seeded."
      />
      <Group
        title="Saved copies"
        frameworks={copies}
        on_open={open_sheet}
        when_empty="Nothing copied yet."
      />

      <BottomSheet open={sheet_open} title={open?.name} onClose={() => setSheetOpen(false)}>
        {/* Keyed, so another framework opens fresh: nothing picked, no
            outcome left over from the last one. */}
        {open && <FrameworkSheet key={open.id} framework={open} assignable={assignable} />}
      </BottomSheet>
    </>
  );
}

function Group({
  title,
  frameworks,
  on_open,
  when_empty,
}: {
  title: string;
  frameworks: Framework[];
  on_open: (framework: Framework) => void;
  when_empty: string;
}) {
  return (
    <section className={styles.block}>
      {/* The gig page's section label (round 3 F2): one line under the
          screen's heading says what these are, so no hint per group. */}
      <h2 className={styles.section_label}>{title}</h2>

      {frameworks.length === 0 ? (
        <p className={styles.none}>{when_empty}</p>
      ) : (
        <ul className={styles.list}>
          {frameworks.map((framework) => (
            <li key={framework.id}>
              <FrameworkRow framework={framework} on_open={on_open} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The version, and In use as words (round 3 F2): the gig page's muted meta
 * line. The fw_key slug is for machines.
 *
 * "In use" is plain text, not Badge and not Chip. Badge takes a
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
function meta_line(framework: Framework): string {
  return framework.in_use ? `${framework.version} · In use` : framework.version;
}

/**
 * One rubric: a whole-row card with a chevron, like every other list in
 * the app (round 3 E6, Patrick 2026-10-05: the two buttons in every card
 * "use too much vertical real estate" and "fit in awkwardly"). A button,
 * not a link, because it opens a sheet rather than a page.
 */
function FrameworkRow({
  framework,
  on_open,
}: {
  framework: Framework;
  on_open: (framework: Framework) => void;
}) {
  return (
    <button
      type="button"
      className={styles.row}
      aria-haspopup="dialog"
      onClick={() => on_open(framework)}
    >
      <span className={styles.row_main}>
        <span className={styles.name}>{framework.name}</span>
        <span className={styles.meta}>{meta_line(framework)}</span>
      </span>
      {/* The character itself, as the queue's rows do: check-tokens.sh
          reads a numeric entity as a raw hex colour. */}
      <span className={styles.chevron} aria-hidden="true">
        {'›'}
      </span>
    </button>
  );
}

type AssignState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'refused'; message: string }
  | { status: 'assigned'; gig_title: string };

/**
 * What can be done with one rubric: copy it into the editor, or put it on a
 * gig (round 3 E6 and E2).
 *
 * The gigs are radio rows with one Assign button, not a button per gig: a
 * supervisor has a few gigs, so every choice shows at once, and nothing is
 * sent until Assign. One assignable gig is picked already, so it is still
 * one press, the same flow as two.
 *
 * "Edit a copy" is on every rubric, in use or not. The editor never changes
 * the rubric it starts from -- it copies it (ADR #16, CAP-16) -- so a
 * reflection referencing this one is no reason to hide it. Both seeded
 * templates are in use; gating on in_use left a freshly seeded database
 * with no way into the editor at all.
 *
 * Nothing is refetched after a successful assign. The Framework payload is
 * id, fw_key, version, name, is_active, created_by and in_use, and an
 * assignment changes none of them -- in_use means "a reflection references
 * this", not "this is on a gig".
 */
function FrameworkSheet({
  framework,
  assignable,
}: {
  framework: Framework;
  assignable: Participation[];
}) {
  const [assign, setAssign] = useState<AssignState>({ status: 'idle' });
  const [picked, setPicked] = useState<string | null>(
    assignable.length === 1 ? assignable[0].gig_id : null,
  );

  async function assign_to(gig: Participation) {
    setAssign({ status: 'saving' });

    try {
      await api.post('/framework-assignments', {
        body: { framework_id: framework.id, gig_id: gig.gig_id },
      });
      setAssign({ status: 'assigned', gig_title: gig.gig_title });
    } catch (error: unknown) {
      if (!(error instanceof ApiError)) throw error;

      // DUPLICATE_ASSIGNMENT is the common path on the seeded data: both
      // gigs already carry a rubric. Every other code that can arrive here
      // -- ROLE_FORBIDDEN, NOT_FOUND, a validation failure -- is equally a
      // considered answer about this one rubric, so all of them are shown
      // the same way, in the sheet, rather than replacing the screen.
      setAssign({ status: 'refused', message: error.message });
    }
  }

  const picked_gig = assignable.find((gig) => gig.gig_id === picked) ?? null;
  const saving = assign.status === 'saving';

  return (
    <>
      <p className={styles.sheet_meta}>{meta_line(framework)}</p>

      <LinkButton to={`/frameworks/${framework.id}/edit`} variant="secondary" full_width>
        Edit a copy
      </LinkButton>

      {assignable.length > 0 && (
        <fieldset className={styles.gigs} disabled={saving}>
          <legend className={styles.section_label}>Assign to a gig</legend>
          {assignable.map((gig) => (
            <label key={gig.gig_id} className={styles.gig}>
              <input
                type="radio"
                name={`assign-${framework.id}`}
                value={gig.gig_id}
                checked={picked === gig.gig_id}
                onChange={() => setPicked(gig.gig_id)}
              />
              <span className={styles.gig_text}>
                <span className={styles.gig_title}>{gig.gig_title}</span>
              </span>
            </label>
          ))}
          <div className={styles.assign}>
            <Button
              disabled={picked_gig === null || saving}
              on_click={() => {
                if (picked_gig) void assign_to(picked_gig);
              }}
            >
              {saving ? 'Assigning…' : 'Assign'}
            </Button>
          </div>
        </fieldset>
      )}

      {/* Announced, because the outcome of pressing a button is not on the
          button: a screen reader is not looking at the line under it. */}
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
    </>
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
