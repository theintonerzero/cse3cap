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
import type { ChangeEvent, FormEvent } from 'react';
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
import {
  accepted_types_hint,
  counter_scores_of,
  first_offending_index,
  format_bytes,
  is_offending,
  levels_for,
  self_score_of,
} from './entry-stepper-logic.ts';
import type {
  FrameworkDetail,
  ReflectionDetail,
  ReflectionEntry,
} from './entry-stepper-logic.ts';
import styles from './EntryStepper.module.css';

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

export function EntryStepper() {
  const { reflection_id } = useParams<{ reflection_id: string }>();
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);
  const [step, setStep] = useState(0);
  const [offending, setOffending] = useState<readonly string[] | null>(null);
  const [submit_error, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

      <EntryCard
        key={current.id}
        entry={current}
        framework={load.framework}
        read_only={read_only}
        offending={is_offending(current, offending)}
        on_change={update_entry}
      />

      {submit_error && (
        <p className={styles.submit_error} role="alert">
          {submit_error.message}
        </p>
      )}

      <div className={styles.nav}>
        <Button
          variant="secondary"
          full_width={false}
          disabled={current_index === 0}
          on_click={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </Button>

        {current_index < entries.length - 1 ? (
          <Button full_width={false} on_click={() => setStep((s) => s + 1)}>
            Next
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
}: {
  entry: ReflectionEntry;
  framework: FrameworkDetail;
  read_only: boolean;
  offending?: boolean;
  on_change: (next: ReflectionEntry) => void;
}) {
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
        label="Your reflection"
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
        <p className={styles.field_label}>Self-score</p>
        <div className={styles.level_row} role="group" aria-label="Self-score">
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
          counter_scores_of(entry).map((score) => (
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
