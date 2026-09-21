/**
 * The entry stepper: one reflection, one competency at a time.
 *
 * "The heart of the product" (CAP-11, COA4-69). A student steps through
 * their reflection's entries -- one per competency, in rubric order --
 * writing a narrative, attaching evidence, and scoring themselves, then
 * submits.
 *
 * Two fetches, not one: GET /reflections/{id} for the entries (narrative,
 * evidence, scores, and each entry's own competency name) and GET
 * /frameworks/{framework_id} for the level descriptors and the evidence
 * policy. The framework fetch uses the id the reflection carries, which is
 * the framework as it was snapshotted at framework_version, not necessarily
 * the gig's current rubric.
 *
 * draft is the only editable status (criterion 7): every other status
 * renders every entry read-only, including any counter-score already on
 * it, through this same markup rather than a second screen.
 *
 * Evidence files are never given a link here. The contract's
 * /evidence/{evidence_id} only deletes -- there is no endpoint that serves
 * a file back -- and this ticket's own comment (Tony To, 2026-09-19) flags
 * that serving one inline would let an uploaded .html or .svg run script on
 * the API's origin. A file's label is plain text; only a `link` evidence
 * item gets an <a>, and it carries rel="noopener noreferrer" per the same
 * comment.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import {
  Badge,
  Button,
  ErrorNotice,
  ProgressBar,
  Skeleton,
  SkeletonGroup,
} from '../components/index.ts';
import type { FrameworkDetail, ReflectionDetail } from './entry-stepper-logic.ts';
import styles from './EntryStepper.module.css';

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; reflection: ReflectionDetail; framework: FrameworkDetail };

function as_api_error(error: unknown, fallback: string): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, null, fallback);
}

export function EntryStepper() {
  const { reflection_id } = useParams<{ reflection_id: string }>();
  const navigate = useNavigate();
  // Not read yet: Task 4's submit flow navigates to the confirmation screen
  // with it. Declared here so this task's own tree matches the brief;
  // `noUnusedLocals` otherwise fails the build on a variable with no reader.
  void navigate;
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);
  const [step, setStep] = useState(0);

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
          .get('/frameworks/{framework_id}', {
            path: { framework_id: reflection.framework_id },
            signal: controller.signal,
          })
          .then((framework) => setLoad({ status: 'loaded', reflection, framework })),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({
          status: 'error',
          error: as_api_error(error, 'Something went wrong loading this reflection.'),
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
        <h1 className={styles.heading}>Reflection</h1>
        <LoadingState />
      </section>
    );
  }

  if (load.status === 'error') {
    return (
      <section>
        <h1 className={styles.heading}>Reflection</h1>
        <ErrorNotice error={load.error} on_retry={retry} />
      </section>
    );
  }

  const { reflection } = load;
  const entries = reflection.entries;

  if (entries.length === 0) {
    // Defensive, not expected: ReflectionCreator makes one entry per
    // competency eagerly, so zero entries means the snapshotted framework
    // itself has none -- a broken rubric, not a normal path. Still one of
    // this screen's four states rather than a blank crash.
    return (
      <section>
        <h1 className={styles.heading}>Reflection</h1>
        <div className={styles.empty}>
          <p className={styles.empty_title}>Nothing to reflect on.</p>
          <p className={styles.empty_body}>
            This reflection&rsquo;s rubric has no competencies. That is a problem with the
            rubric, not with you -- tell your supervisor.
          </p>
        </div>
      </section>
    );
  }

  const read_only = reflection.status !== 'draft';
  const current_index = Math.min(step, entries.length - 1);
  const current = entries[current_index];

  return (
    <section>
      <h1 className={styles.heading}>Reflection</h1>
      <div className={styles.status_row}>
        <Badge status={reflection.status} />
      </div>

      <ProgressBar current={current_index + 1} total={entries.length} label="Competency" />

      <p className={styles.competency_name}>{current.competency_name}</p>

      {/* Task 3 replaces this placeholder with the narrative, evidence and
          self-score UI for `current`. Left as visible text rather than
          nothing so this task's own build is checkable end to end. */}
      <p className={styles.todo}>{read_only ? 'Read-only view: Task 4.' : 'Editing: Task 3.'}</p>

      <div className={styles.nav}>
        <Button
          variant="secondary"
          full_width={false}
          disabled={current_index === 0}
          on_click={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </Button>

        {current_index < entries.length - 1 && (
          <Button full_width={false} on_click={() => setStep((s) => s + 1)}>
            Next
          </Button>
        )}
      </div>
    </section>
  );
}

/** Shaped like the loaded screen: a progress bar and one card, not a spinner. */
function LoadingState() {
  return (
    <SkeletonGroup label="Loading this reflection">
      <Skeleton variant="block" width="100%" height="var(--space-32)" />
      <Skeleton variant="block" width="100%" height="12rem" />
    </SkeletonGroup>
  );
}
