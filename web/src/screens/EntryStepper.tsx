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
 * Assessor mode (CAP-13) is this same screen with mode="assessor", mounted
 * at /review-queue/reflections/:reflection_id. Every entry renders
 * read-only; CounterScorePanel adds the scorer's own level and comment.
 * Every rule behind it lives in api/app/Services/Scoring.php. The screen
 * reflects what the POST returns, including the flip to assessed, and
 * never triggers anything itself. It adds no styles of its own: every
 * class it uses already existed for CAP-11, so both modes look the same.
 * The one visual difference is the assessor's chips, which use Chip's
 * tone="counter" (the radar's counter-score green).
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
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import {
  Badge,
  Button,
  Chip,
  ErrorNotice,
  ProgressBar,
  Skeleton,
  SkeletonGroup,
  TextArea,
} from '../components/index.ts';
// The design system's own text box, borrowed by class rather than by
// component: TextArea autosaves, and a counter-score comment must travel
// once, with its level, in the POST. Same look, no new styles.
import text_area_styles from '../components/TextArea/TextArea.module.css';
import { useSession } from '../session/useSession.ts';
import type { SessionUser } from '../session/useSession.ts';
import {
  accepted_types_hint,
  comment_expected,
  counter_score_failure,
  counter_scores_of,
  EMPTY_DRAFT,
  first_offending_index,
  first_unscored_index,
  format_bytes,
  is_offending,
  levels_for,
  missing_before_save_all,
  my_counter_score_of,
  scored_by_count,
  self_score_of,
} from './entry-stepper-logic.ts';
import type {
  CounterDraft,
  FrameworkDetail,
  ReflectionDetail,
  ReflectionEntry,
  ReflectionStatus,
} from './entry-stepper-logic.ts';
import styles from './EntryStepper.module.css';

/**
 * student  the owner writing a draft (CAP-11). The default, so CAP-11's
 *          route passes nothing.
 * assessor a supervisor or assessor reading a submitted reflection and
 *          counter-scoring it (CAP-13). Everything the student wrote is
 *          read-only; the level picker is the scorer's own.
 */
type StepperMode = 'student' | 'assessor';

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; reflection: ReflectionDetail; framework: FrameworkDetail };

function as_api_error(error: unknown, fallback: string): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, null, fallback);
}

// Defence in depth: StoreEvidenceRequest already enforces `url:http,https`
// server-side on the only path that creates a `link` evidence row (CAP-34,
// closing F7 in docs/Security-Review.md). This render-time check means a
// `link` item that somehow carries a non-http(s) uri -- a seed, a bulk
// import, a future bug -- still renders as plain text here rather than a
// clickable href, instead of trusting that guarantee unconditionally.
const HREF_SCHEME = /^https?:\/\//i;

export function EntryStepper({ mode = 'student' }: { mode?: StepperMode }) {
  const { reflection_id } = useParams<{ reflection_id: string }>();
  const navigate = useNavigate();
  const { me } = useSession();
  const me_id = me?.id ?? null;
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);
  const [step, setStep] = useState(0);
  const [offending, setOffending] = useState<readonly string[] | null>(null);
  const [submit_error, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set only when this session's own POST reported completed_the_reflection.
  // The flip itself is the server's (Scoring::flipIfComplete); this only
  // decides which notice to show.
  const [completed_here, setCompletedHere] = useState(false);
  const [counter_saving, setCounterSaving] = useState(false);
  const [saving_all, setSavingAll] = useState(false);
  // The assessor's unsaved picks, per entry id (see CounterDraft). Held
  // here, not in the panel, so skipping a step does not throw them away.
  const [drafts, setDrafts] = useState<Record<string, CounterDraft>>({});
  // Set once "Save all scores" has been pressed: from then the list of what
  // is still missing shows, and stays current as the assessor fills it in.
  const [save_all_tried, setSaveAllTried] = useState(false);
  const heading = mode === 'assessor' ? 'Score reflection' : 'Reflection';

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
          .then((framework) => {
            setLoad({ status: 'loaded', reflection, framework });
            // An assessor lands on the first entry they still owe a score,
            // so a part-scored reflection does not reopen on finished work.
            if (mode === 'assessor' && me_id) {
              setStep(first_unscored_index(reflection.entries, me_id));
            }
          }),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({
          status: 'error',
          error: as_api_error(error, 'Something went wrong loading this reflection.'),
        });
      });

    return () => controller.abort();
  }, [reflection_id, reload_key, mode, me_id]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  const update_entry = useCallback((next: ReflectionEntry) => {
    setLoad((current) => {
      if (current.status !== 'loaded') return current;
      return {
        ...current,
        reflection: {
          ...current.reflection,
          entries: current.reflection.entries.map((entry) =>
            entry.id === next.id ? next : entry,
          ),
        },
      };
    });
  }, []);

  // A 201 from POST /entries/{id}/scores: the entry gains the score, and the
  // reflection takes whatever status the server says it now has.
  const record_counter_score = useCallback(
    (next: ReflectionEntry, status: ReflectionStatus, completed: boolean) => {
      setLoad((current) => {
        if (current.status !== 'loaded') return current;
        return {
          ...current,
          reflection: {
            ...current.reflection,
            status,
            entries: current.reflection.entries.map((entry) =>
              entry.id === next.id ? next : entry,
            ),
          },
        };
      });
      if (completed) setCompletedHere(true);
    },
    [],
  );

  // After a 409 the page is stale: someone else closed the reflection, or
  // this entry already carries our score from another tab. Refetch without
  // a skeleton so the panel's message stays on screen while the stored
  // state replaces the stale one. A failure here is not reported a second
  // time: the panel is already showing why the save did not happen.
  const refresh = useCallback(() => {
    if (!reflection_id) return;
    api
      .get('/reflections/{reflection_id}', { path: { reflection_id } })
      .then((reflection) =>
        setLoad((current) =>
          current.status === 'loaded' ? { ...current, reflection } : current,
        ),
      )
      .catch(() => undefined);
  }, [reflection_id]);

  const update_draft = useCallback((entry_id: string, patch: Partial<CounterDraft>) => {
    setDrafts((current) => ({
      ...current,
      [entry_id]: { ...(current[entry_id] ?? EMPTY_DRAFT), ...patch },
    }));
  }, []);

  // One counter-score, POSTed. The single Save and "Save all scores" both
  // come through here, so a score is sent from one place only. Resolves
  // true when the server took it; on failure the message goes into that
  // entry's draft, where the panel shows it.
  const save_entry = async (
    entry: ReflectionEntry,
    draft: CounterDraft,
  ): Promise<boolean> => {
    if (!me || !draft.level_id) return false;
    update_draft(entry.id, { error: null });

    try {
      const { reflection_status, completed_the_reflection, ...score } = await api.post(
        '/entries/{entry_id}/scores',
        {
          path: { entry_id: entry.id },
          body: {
            level_id: draft.level_id,
            comment: draft.comment.trim() !== '' ? draft.comment : null,
          },
        },
      );
      // The 201 is a bare Score; the entry's embedded scores also carry
      // the scorer. It is the caller, so the session already knows who.
      record_counter_score(
        {
          ...entry,
          scores: [
            ...entry.scores,
            { ...score, scorer: { id: me.id, display_name: me.display_name } },
          ],
        },
        reflection_status,
        completed_the_reflection,
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
      return true;
    } catch (caught) {
      const api_error = as_api_error(caught, 'Could not save that score.');
      const failure = counter_score_failure(api_error.code);
      update_draft(entry.id, {
        error: api_error.message,
        comment_forced: draft.comment_forced || failure === 'comment',
      });
      if (failure === 'closed' || failure === 'already_scored') refresh();
      return false;
    }
  };

  const save_one = async (entry: ReflectionEntry) => {
    setCounterSaving(true);
    try {
      await save_entry(entry, drafts[entry.id] ?? EMPTY_DRAFT);
    } finally {
      setCounterSaving(false);
    }
  };

  // "Save all scores": nothing is sent until every competency the caller
  // has not scored has what it needs (missing_before_save_all). Then each
  // is POSTed in rubric order, one at a time. The first failure stops the
  // run on that competency, with its message. Scores already sent stay
  // sent, because a score cannot be taken back (ADR #34).
  const save_all = async () => {
    if (load.status !== 'loaded' || !me) return;
    const { reflection: current_reflection, framework } = load;
    setSaveAllTried(true);
    if (
      missing_before_save_all(current_reflection.entries, framework, drafts, me.id).length >
      0
    ) {
      return;
    }

    setCounterSaving(true);
    setSavingAll(true);
    try {
      for (const [index, entry] of current_reflection.entries.entries()) {
        if (my_counter_score_of(entry, me.id) !== null) continue;
        const saved = await save_entry(entry, drafts[entry.id] ?? EMPTY_DRAFT);
        if (!saved) {
          setStep(index);
          return;
        }
      }
    } finally {
      setCounterSaving(false);
      setSavingAll(false);
    }
  };

  const submit = useCallback(async () => {
    if (!reflection_id || load.status !== 'loaded') return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await api.post('/reflections/{reflection_id}/submit', { path: { reflection_id } });
      navigate(`/reflections/${reflection_id}/submitted`);
    } catch (error) {
      const api_error = as_api_error(error, 'Could not submit this reflection.');
      setSubmitError(api_error);

      const raw_ids = api_error.details.entry_ids;
      if (Array.isArray(raw_ids)) {
        const ids = raw_ids.filter((id): id is string => typeof id === 'string');
        setOffending(ids);
        const index = first_offending_index(load.reflection.entries, ids);
        if (index !== null) setStep(index);
      }
    } finally {
      setSubmitting(false);
    }
  }, [reflection_id, navigate, load]);

  if (load.status === 'loading') {
    return (
      <section>
        <h1 className={styles.heading}>{heading}</h1>
        <LoadingState />
      </section>
    );
  }

  if (load.status === 'error') {
    return (
      <section>
        <h1 className={styles.heading}>{heading}</h1>
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
        <h1 className={styles.heading}>{heading}</h1>
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

  // An assessor never edits what the student wrote, whatever the status.
  const read_only = mode === 'assessor' || reflection.status !== 'draft';
  const current_index = Math.min(step, entries.length - 1);
  const current = entries[current_index];
  const scoring_open = mode === 'assessor' && reflection.status === 'submitted';
  const left_to_score = me_id ? entries.length - scored_by_count(entries, me_id) : 0;
  const save_all_gaps =
    scoring_open && save_all_tried && me_id
      ? missing_before_save_all(entries, load.framework, drafts, me_id)
      : [];

  return (
    <section>
      <h1 className={styles.heading}>{heading}</h1>
      <div className={styles.status_row}>
        <Badge status={reflection.status} />
        {mode === 'assessor' && (
          <p className={styles.counter_score}>
            {reflection.owner.display_name}
            {me_id && (
              <>
                {' '}
                &middot; you have scored {scored_by_count(entries, me_id)} of{' '}
                {entries.length}
              </>
            )}
          </p>
        )}
      </div>

      {/* The screen's own designed notice (the empty state's block), reused
          so an assessor's "nothing to do here" reads the way a student's
          does. */}
      {mode === 'assessor' && reflection.status === 'draft' && (
        <div className={styles.status_row}>
          <div className={styles.empty} role="status">
            <p className={styles.empty_title}>Not submitted yet.</p>
            <p className={styles.empty_body}>
              {reflection.owner.display_name} is still writing this reflection, so there is
              nothing to score.
            </p>
          </div>
        </div>
      )}
      {mode === 'assessor' && reflection.status === 'assessed' && (
        <div className={styles.status_row}>
          <div className={styles.empty} role="status">
            {completed_here ? (
              <>
                <p className={styles.empty_title}>That was the last one.</p>
                <p className={styles.empty_body}>
                  Every competency now has a counter-score, so this reflection is assessed
                  and has left the review queue.
                </p>
              </>
            ) : (
              <>
                <p className={styles.empty_title}>Assessed.</p>
                <p className={styles.empty_body}>
                  Every competency has a counter-score. Counter-scores close with the
                  reflection, so this is a read-only record of what was scored.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      <ProgressBar current={current_index + 1} total={entries.length} label="Competency" />

      <EntryCard
        key={current.id}
        entry={current}
        framework={load.framework}
        read_only={read_only}
        offending={is_offending(current, offending)}
        on_change={update_entry}
        mode={mode}
        owner_name={reflection.owner.display_name}
        viewer_id={me_id}
      >
        {mode === 'assessor' && me && (
          <CounterScorePanel
            entry={current}
            framework={load.framework}
            me={me}
            open={reflection.status === 'submitted'}
            completed={completed_here}
            draft={drafts[current.id] ?? EMPTY_DRAFT}
            saving={counter_saving}
            on_draft={(patch) => update_draft(current.id, patch)}
            on_save={() => void save_one(current)}
          />
        )}
      </EntryCard>

      {submit_error && (
        <p className={styles.submit_error} role="alert">
          {submit_error.message}
        </p>
      )}

      {/* What "Save all scores" is still waiting on, next to the button
          that asked, in the screen's own notice block. It stays current as
          the assessor fills things in, and disappears once nothing is
          missing. */}
      {save_all_gaps.length > 0 && (
        <div className={styles.evidence_add}>
          <div className={styles.empty} role="alert">
            <p className={styles.empty_title}>Nearly there.</p>
            <p className={styles.empty_body}>
              {save_all_gaps.length === 1
                ? 'Save all is waiting on one competency, so nothing was sent:'
                : `Save all is waiting on ${save_all_gaps.length} competencies, so nothing was sent:`}
            </p>
            <ul className={styles.evidence_list}>
              {save_all_gaps.map((gap) => (
                <li key={gap.entry.id} className={styles.evidence_row}>
                  <span>
                    {gap.entry.competency_name} ({gap.index + 1} of {entries.length}){' '}
                    {gap.needs === 'score'
                      ? 'still needs a score.'
                      : 'needs a comment to go with its score.'}
                  </span>
                  <Button
                    variant="secondary"
                    full_width={false}
                    on_click={() => setStep(gap.index)}
                  >
                    Go to {gap.entry.competency_name}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Navigation waits for an in-flight counter-score: stepping away
          would unmount the panel and lose the error it is about to show. */}
      <div className={styles.nav}>
        <Button
          variant="secondary"
          full_width={false}
          disabled={current_index === 0 || counter_saving}
          on_click={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </Button>

        {current_index < entries.length - 1 ? (
          <Button
            full_width={false}
            disabled={counter_saving}
            on_click={() => setStep((s) => s + 1)}
          >
            Next
          </Button>
        ) : scoring_open && left_to_score > 0 ? (
          <Button
            full_width={false}
            disabled={counter_saving}
            on_click={() => void save_all()}
          >
            {saving_all ? 'Saving all…' : 'Save all scores'}
          </Button>
        ) : mode === 'assessor' ? (
          <Button
            full_width={false}
            disabled={counter_saving}
            on_click={() => navigate('/review-queue')}
          >
            Back to the queue
          </Button>
        ) : (
          !read_only && (
            <Button full_width={false} disabled={submitting} on_click={submit}>
              {submitting ? 'Submitting…' : 'Submit'}
            </Button>
          )
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

/**
 * One competency: its name, narrative, self-score and evidence. `read_only`
 * is already a parameter here so CAP-13 (the assessor stepper) can pass
 * `true` and reuse this exact card for a submitted reflection's counter-
 * scoring view, rather than this ticket guessing at a `mode` prop nothing
 * exercises yet.
 */
function EntryCard({
  entry,
  framework,
  read_only,
  offending = false,
  on_change,
  mode,
  owner_name,
  viewer_id = null,
  children,
}: {
  entry: ReflectionEntry;
  framework: FrameworkDetail;
  read_only: boolean;
  offending?: boolean;
  on_change: (next: ReflectionEntry) => void;
  mode: StepperMode;
  owner_name: string;
  /** Who is looking, so assessor mode can leave their own score to the panel. */
  viewer_id?: string | null;
  /** The assessor's own score, last in the card so it reads after the evidence. */
  children?: ReactNode;
}) {
  const self_label = mode === 'assessor' ? `${owner_name}'s self-score` : 'Self-score';
  const [narrative_error, setNarrativeError] = useState<string | null>(null);
  const [score_error, setScoreError] = useState<string | null>(null);
  const levels = levels_for(framework, entry.competency_id);
  const self_score = self_score_of(entry);

  const save_narrative = useCallback(
    async (value: string) => {
      setNarrativeError(null);
      try {
        // The saved value is not echoed back into state: the TextArea's own
        // onChange already wrote the student's keystrokes there as they
        // typed, and that is authoritative. Echoing this response would
        // revert an edit typed during this request's own round trip.
        await api.patch('/entries/{entry_id}', {
          path: { entry_id: entry.id },
          body: { narrative: value },
        });
      } catch (error) {
        const api_error = as_api_error(error, 'Could not save that.');
        setNarrativeError(api_error.message);
        throw api_error; // TextArea's own status turns "failed" on a rejection.
      }
    },
    [entry.id],
  );

  const choose_level = useCallback(
    async (level_id: string) => {
      setScoreError(null);
      try {
        const score = await api.put('/entries/{entry_id}/scores/self', {
          path: { entry_id: entry.id },
          body: { level_id },
        });
        const others = entry.scores.filter((existing) => existing.scorer_class !== 'self');
        on_change({ ...entry, scores: [...others, score] });
      } catch (error) {
        setScoreError(as_api_error(error, 'Could not save that score.').message);
      }
    },
    [entry, on_change],
  );

  return (
    <div className={offending ? `${styles.card} ${styles.card_offending}` : styles.card}>
      <p className={styles.competency_name}>{entry.competency_name}</p>

      <TextArea
        label={mode === 'assessor' ? `${owner_name} wrote` : 'Your reflection'}
        value={entry.narrative ?? ''}
        onChange={(value) => on_change({ ...entry, narrative: value })}
        onSave={save_narrative}
        disabled={read_only}
        placeholder="What did you do, and what did you learn from it?"
      />
      {narrative_error && (
        <p className={styles.field_error} role="alert">
          {narrative_error}
        </p>
      )}

      <div className={styles.levels}>
        <p className={styles.field_label}>{self_label}</p>
        <div className={styles.level_row} role="group" aria-label={self_label}>
          {levels.map((level) => (
            <Chip
              key={level.id}
              selected={self_score?.level_id === level.id}
              disabled={read_only}
              on_click={() => choose_level(level.id)}
            >
              {level.level_value} &middot; {level.descriptor}
            </Chip>
          ))}
        </div>
        {score_error && (
          <p className={styles.field_error} role="alert">
            {score_error}
          </p>
        )}
        {read_only &&
          counter_scores_of(entry)
            // In assessor mode the viewer's own score is shown by the panel
            // as greyed chips, so it is not repeated here as a text line.
            .filter((score) => mode !== 'assessor' || score.scorer?.id !== viewer_id)
            .map((score) => (
              <p key={score.id} className={styles.counter_score}>
                {score.scorer?.display_name ?? 'Counter-score'}: level {score.level_value}
                {score.comment && <> &mdash; &ldquo;{score.comment}&rdquo;</>}
              </p>
            ))}
      </div>

      <EvidenceList
        entry={entry}
        framework={framework}
        read_only={read_only}
        on_change={on_change}
      />

      {children}
    </div>
  );
}

/**
 * Attach and remove evidence. A `link` item is the only kind that ever gets
 * a clickable URL (rel="noopener noreferrer", per the ticket's security
 * comment) -- a `file` or `image` item's label is plain text, because the
 * contract has nothing that serves a file back and this screen does not
 * invent one.
 */
function EvidenceList({
  entry,
  framework,
  read_only,
  on_change,
}: {
  entry: ReflectionEntry;
  framework: FrameworkDetail;
  read_only: boolean;
  on_change: (next: ReflectionEntry) => void;
}) {
  const [adding_link, setAddingLink] = useState(false);
  const [label, setLabel] = useState('');
  const [uri, setUri] = useState('');
  const [error, setError] = useState<string | null>(null);
  const hint = accepted_types_hint(framework.accepted_file_types);

  const remove = useCallback(
    async (evidence_id: string) => {
      setError(null);
      try {
        await api.delete('/evidence/{evidence_id}', { path: { evidence_id } });
        on_change({
          ...entry,
          evidence: entry.evidence.filter((e) => e.id !== evidence_id),
        });
      } catch (deleteError) {
        setError(as_api_error(deleteError, 'Could not remove that.').message);
      }
    },
    [entry, on_change],
  );

  const add_link = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setError(null);
      try {
        const evidence = await api.post('/entries/{entry_id}/evidence', {
          path: { entry_id: entry.id },
          body: { kind: 'link', label, uri },
        });
        on_change({ ...entry, evidence: [...entry.evidence, evidence] });
        setLabel('');
        setUri('');
        setAddingLink(false);
      } catch (addError) {
        setError(as_api_error(addError, 'Could not attach that link.').message);
      }
    },
    [entry, label, uri, on_change],
  );

  const add_file = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      setError(null);
      try {
        const form = new FormData();
        form.append('label', file.name);
        form.append('file', file);
        const evidence = await api.post('/entries/{entry_id}/evidence', {
          path: { entry_id: entry.id },
          body: form,
        });
        on_change({ ...entry, evidence: [...entry.evidence, evidence] });
      } catch (addError) {
        setError(as_api_error(addError, 'Could not attach that file.').message);
      }
    },
    [entry, on_change],
  );

  return (
    <div className={styles.evidence}>
      <p className={styles.field_label}>Evidence</p>

      {entry.evidence.length > 0 && (
        <ul className={styles.evidence_list}>
          {entry.evidence.map((item) => (
            <li key={item.id} className={styles.evidence_row}>
              {item.kind === 'link' && HREF_SCHEME.test(item.uri) ? (
                <a href={item.uri} target="_blank" rel="noopener noreferrer">
                  {item.label}
                </a>
              ) : (
                <span>{item.label}</span>
              )}
              {item.size_bytes !== null && (
                <span className={styles.evidence_size}>
                  {format_bytes(item.size_bytes)}
                </span>
              )}
              {!read_only && (
                <Button
                  variant="secondary"
                  full_width={false}
                  on_click={() => remove(item.id)}
                >
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!read_only && (
        <div className={styles.evidence_add}>
          {adding_link ? (
            <form className={styles.evidence_form} onSubmit={add_link}>
              <input
                className={styles.evidence_input}
                aria-label="Evidence label"
                placeholder="Label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
              <input
                className={styles.evidence_input}
                type="url"
                aria-label="Link URL"
                placeholder="https://..."
                value={uri}
                onChange={(event) => setUri(event.target.value)}
              />
              <Button type="submit" full_width={false} disabled={!label || !uri}>
                Add link
              </Button>
            </form>
          ) : (
            <div className={styles.evidence_actions}>
              <Button
                variant="secondary"
                full_width={false}
                on_click={() => setAddingLink(true)}
              >
                Add a link
              </Button>
              <label className={styles.file_button}>
                Attach a file
                <input
                  type="file"
                  className={styles.file_input}
                  accept={framework.accepted_file_types?.map((t) => `.${t}`).join(',')}
                  onChange={add_file}
                />
              </label>
            </div>
          )}
          {hint && (
            <p className={styles.evidence_hint}>
              Accepted: {hint}, up to {format_bytes(framework.max_file_bytes)}.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className={styles.field_error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The scorer's own counter-score for one entry (CAP-13).
 *
 * POST, not PUT: a second attempt is an error, not an update, and there is
 * no way to change a score once given (ADR #34). So this renders one of
 * three things: the form, the caller's saved score (the same chips and
 * text box, greyed, the way the student's self-score reads), or nothing
 * when the reflection is not open for scoring.
 *
 * Controlled: the level, comment and last error live in the stepper's
 * per-entry draft, so stepping away and back keeps them, and the stepper
 * sends the score (save_entry) whether it came from this Save or from
 * "Save all scores". Any error shows under all three states, because a 409
 * changes which one is showing and the reason must not go with it.
 *
 * The comment hint (comment_expected) only disables the button early. The
 * rule is Scoring.php's, and a 400 COMMENT_REQUIRED marks the box required
 * whatever the hint said.
 *
 * Chips use tone="counter", the radar's counter-score green, so the
 * assessor's row reads apart from the student's purple one above it.
 */
function CounterScorePanel({
  entry,
  framework,
  me,
  open,
  completed,
  draft,
  saving,
  on_draft,
  on_save,
}: {
  entry: ReflectionEntry;
  framework: FrameworkDetail;
  me: SessionUser;
  open: boolean;
  /** This session's own save just flipped the reflection to assessed. */
  completed: boolean;
  draft: CounterDraft;
  /** A counter-score is in flight, from this Save or from Save all. */
  saving: boolean;
  on_draft: (patch: Partial<CounterDraft>) => void;
  on_save: () => void;
}) {
  const levels = levels_for(framework, entry.competency_id);
  const self_score = self_score_of(entry);
  const mine = my_counter_score_of(entry, me.id);
  const chosen = levels.find((level) => level.id === draft.level_id) ?? null;

  const comment_required =
    draft.comment_forced ||
    comment_expected(
      framework,
      self_score?.level_value ?? null,
      chosen?.level_value ?? null,
    );
  const has_comment = draft.comment.trim() !== '';
  const can_save = chosen !== null && !saving && (!comment_required || has_comment);
  const comment_id = `comment-${entry.id}`;

  // Closed, not ours, nothing to say: render nothing at all, so the card's
  // spacing is exactly the student view's rather than gaining an empty row.
  if (!mine && !open && !draft.error) return null;

  return (
    <div className={styles.levels}>
      {mine ? (
        <>
          {/* Presented exactly as the student's self-score row above: the
              same chips, greyed, with the chosen level selected, and the
              comment kept in its box, read-only. */}
          <p className={styles.field_label}>Your score</p>
          <div className={styles.level_row} role="group" aria-label="Your score">
            {levels.map((level) => (
              <Chip
                key={level.id}
                tone="counter"
                selected={mine.level_id === level.id}
                disabled
              >
                {level.level_value} &middot; {level.descriptor}
              </Chip>
            ))}
          </div>
          {mine.comment && (
            <div className={text_area_styles.field}>
              <label className={text_area_styles.label} htmlFor={comment_id}>
                Why this score
              </label>
              <textarea
                id={comment_id}
                className={text_area_styles.textarea}
                value={mine.comment}
                disabled
                readOnly
              />
            </div>
          )}
          <p className={styles.counter_score}>
            You scored this competency. A score, once given, stands.
          </p>
          {/* Said here as well as in the notice above the progress bar,
              which is off-screen on a phone by the time Save is pressed. */}
          {completed && (
            <p className={styles.counter_score} role="status">
              That was the last one, so the reflection is now assessed.
            </p>
          )}
        </>
      ) : (
        open && (
          <form
            className={styles.levels}
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              on_save();
            }}
          >
            <p className={styles.field_label}>Your score</p>
            <div className={styles.level_row} role="group" aria-label="Your score">
              {levels.map((level) => (
                <Chip
                  key={level.id}
                  tone="counter"
                  selected={draft.level_id === level.id}
                  disabled={saving}
                  on_click={() => on_draft({ level_id: level.id })}
                >
                  {level.level_value} &middot; {level.descriptor}
                </Chip>
              ))}
            </div>

            <div className={text_area_styles.field}>
              <label className={text_area_styles.label} htmlFor={comment_id}>
                Why this score{comment_required ? ' (required)' : ' (optional)'}
              </label>
              <textarea
                id={comment_id}
                className={text_area_styles.textarea}
                maxLength={4000}
                value={draft.comment}
                aria-required={comment_required}
                disabled={saving}
                onChange={(event) => on_draft({ comment: event.target.value })}
              />
            </div>

            <div className={styles.evidence_actions}>
              <Button type="submit" full_width={false} disabled={!can_save}>
                {saving ? 'Saving…' : 'Save score'}
              </Button>
            </div>
          </form>
        )
      )}

      {draft.error && (
        <p className={styles.field_error} role="alert">
          {draft.error}
        </p>
      )}
    </div>
  );
}
