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
import { group_frameworks, is_editable, type Framework } from './framework-groups.ts';
import styles from './SelectFramework.module.css';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; frameworks: Framework[] };

export function SelectFramework() {
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

  return (
    <section>
      <h1 className={styles.heading}>Frameworks</h1>
      <p className={styles.sub}>
        The rubrics a gig can be scored against. Copy a template to change one.
      </p>

      {state.status === 'loading' && <LoadingState />}
      {state.status === 'error' && <ErrorNotice error={state.error} on_retry={retry} />}
      {state.status === 'loaded' && <LoadedState frameworks={state.frameworks} />}
    </section>
  );
}

/**
 * The empty state is the whole list being empty, not either group being
 * empty: a database that has been seeded always has templates, so nothing
 * at all means nothing has been seeded. An empty *copies* group is an
 * ordinary Tuesday and is said inside the group instead.
 */
function LoadedState({ frameworks }: { frameworks: Framework[] }) {
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
        when_empty="No templates. The database has not been seeded."
      />
      <Group
        title="Saved copies"
        hint="Copies made by a supervisor."
        frameworks={copies}
        when_empty="Nothing copied yet."
      />
    </>
  );
}

function Group({
  title,
  hint,
  frameworks,
  when_empty,
}: {
  title: string;
  hint: string;
  frameworks: Framework[];
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
              <FrameworkRow framework={framework} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One rubric. Assigning it to a gig is CAP-15's Task 3; until then the row
 * says what the rubric is and offers Edit when editing is still possible.
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
function FrameworkRow({ framework }: { framework: Framework }) {
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
          {is_editable(framework) && (
            <Link className={styles.edit} to={`/frameworks/${framework.id}/edit`}>
              <Button variant="secondary" full_width={false}>
                Edit
              </Button>
            </Link>
          )}
        </div>
      </div>
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
