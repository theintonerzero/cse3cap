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
 * The one visual difference is the assessor's scale, which uses
 * LevelScale's tone="counter" (the radar's counter-score green).
 *
 * Evidence files are never given a link here. The contract's
 * /evidence/{evidence_id} only deletes -- there is no endpoint that serves
 * a file back -- and this ticket's own comment (Tony To, 2026-09-19) flags
 * that serving one inline would let an uploaded .html or .svg run script on
 * the API's origin. A file's label is plain text; only a `link` evidence
 * item gets an <a>, and it carries rel="noopener noreferrer" per the same
 * comment.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode, Ref, SetStateAction } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import {
  Badge,
  BottomSheet,
  Button,
  LevelScale,
  ErrorNotice,
  ProgressBar,
  Skeleton,
  SkeletonGroup,
  TextArea,
} from '../components/index.ts';
// The design system's own text box, borrowed by class rather than by
// component: TextArea autosaves, and a counter-score comment must travel
// once, with its level, in the POST. Same look, no new styles.
import button_styles from '../components/Button/Button.module.css';
import text_area_styles from '../components/TextArea/TextArea.module.css';
import { calibration_reviewer } from '../ai/calibration.ts';
import { CalibrationPanel } from '../ai/CalibrationPanel.tsx';
import { CoachPanel } from '../ai/CoachPanel.tsx';
import { RelatedDisclosure } from '../ai/RelatedDisclosure.tsx';
import { useAiStatus } from '../ai/useAiStatus.ts';
import type { TextAreaHandle } from '../components/TextArea/TextArea.tsx';
import { useSession } from '../session/useSession.ts';
import type { SessionUser } from '../session/useSession.ts';
import {
  accepted_types_hint,
  comment_expected,
  counter_score_failure,
  counter_scores_of,
  done_count,
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
  type ReflectionScore,
} from './entry-stepper-logic.ts';
import {
  kept_as_drafts,
  read_kept,
  settle_kept,
  write_kept,
  type KeptDraft,
} from './counter-drafts.ts';
import type {
  CounterDraft,
  SaveAllGap,
  FrameworkDetail,
  ReflectionDetail,
  ReflectionEntry,
  ReflectionStatus,
} from './entry-stepper-logic.ts';
import { sprint_dates, type DatedSprint } from './gig-timing.ts';
import styles from './EntryStepper.module.css';

/**
 * student  the owner writing a draft (CAP-11). The default, so CAP-11's
 *          route passes nothing.
 * assessor a supervisor or assessor reading a submitted reflection and
 *          counter-scoring it (CAP-13). Everything the student wrote is
 *          read-only; the level picker is the scorer's own.
 */
type StepperMode = 'student' | 'assessor';

/** How long the arrow keys must rest on a level before it is saved (CAP-66). */
const KEY_SETTLE_MS = 500;

/** "A and B", "A, B and C": names a shared scale by who is on it. */
function list_of(parts: string[]): string {
  return parts.length < 2
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Applies `change` to the entry as it is now, not as a caller last saw it:
 * a save that comes back late patches only the field it owns, so text typed
 * while it was in flight survives (CAP-52). */
type EntryUpdate = (
  entry_id: string,
  change: (entry: ReflectionEntry) => ReflectionEntry,
) => void;

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
  // ADR #64: which AI features this deployment serves, asked once per session.
  // Null (off, unreachable, or this build has no sidecar) renders no AI element.
  const ai_features = useAiStatus();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);
  const [step, setStep] = useState(0);
  const [search_params] = useSearchParams();
  const wanted_entry = search_params.get('entry');

  // Back and Next move to another competency, and two
  // competencies' chips can look nearly the same. So a move goes to the
  // top and puts focus on the new competency's name, which a screen reader
  // then reads out (round 2b). Opening the page or saving does not.
  // A count of moves rather than a flag: a flag left set would make a
  // later save's step change move focus.
  const [moves, setMoves] = useState(0);
  const go_to_step = useCallback((next: SetStateAction<number>) => {
    setStep(next);
    setMoves((count) => count + 1);
  }, []);
  useEffect(() => {
    if (moves === 0) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    document
      .querySelector<HTMLElement>('[data-competency-name]')
      ?.focus({ preventScroll: true });
  }, [moves]);
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
  // Whose kept work has been read back (`${me_id}:${reflection_id}`), so
  // nothing is written over it before it has been (round 3, ADR #57).
  const restored = useRef<string | null>(null);
  // The narrative box, so Submit can ask it to send an edit still waiting
  // out its debounce (CAP-52).
  const narrative_ref = useRef<TextAreaHandle>(null);
  // Narrative saves in flight, from any card. A card that unmounts sends its
  // last words as it goes, and Submit must wait for those too, not only for
  // the card on screen (CAP-52).
  const pending_saves = useRef(new Set<Promise<void>>());
  // Entries whose newest narrative save was refused. A card that has left the
  // screen cannot retry it, and Submit must not post without it. Saves for one
  // entry can overlap (the debounce starts a new one while an old one is in
  // flight), so only the newest save's outcome counts, never settle order.
  const failed_saves = useRef(new Set<string>());
  const latest_save = useRef(new Map<string, Promise<void>>());
  const track_save = useCallback((entry_id: string, saving: Promise<void>) => {
    pending_saves.current.add(saving);
    latest_save.current.set(entry_id, saving);
    const settle = (failed: boolean) => {
      pending_saves.current.delete(saving);
      if (latest_save.current.get(entry_id) !== saving) return;
      latest_save.current.delete(entry_id);
      if (failed) failed_saves.current.add(entry_id);
      else failed_saves.current.delete(entry_id);
    };
    saving.then(
      () => settle(false),
      () => settle(true),
    );
  }, []);
  // What "Submit scores" found missing, shown in a pop-up until "Okay",
  // which goes to the first of them (round 3, Patrick 2026-10-05).
  const [missing, setMissing] = useState<SaveAllGap[] | null>(null);
  // The gig, for the heading: its title, and its sprints, because the
  // reflection detail leaves sprint_ordinal out (the API loads the sprint
  // only for lists). A second, optional read; the screen works without it.
  const [gig, setGig] = useState<HeadingGig | null>(null);
  const heading = stepper_heading(mode, load, gig);
  const dates = sprint_window(load, gig);

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
            if (reflection.gig_id) {
              api
                .get('/gigs/{gig_id}', {
                  path: { gig_id: reflection.gig_id },
                  signal: controller.signal,
                })
                .then((detail) => setGig({ title: detail.title, sprints: detail.sprints }))
                // Without the title the heading still names the sprint.
                .catch(() => undefined);
            }
            // An assessor lands on the first entry they still owe a score,
            // so a part-scored reflection does not reopen on finished work.
            if (mode === 'assessor' && me_id) {
              // A search result names the competency it matched (ADR #64);
              // otherwise the first one still owed.
              const named = reflection.entries.findIndex((e) => e.id === wanted_entry);
              setStep(named >= 0 ? named : first_unscored_index(reflection.entries, me_id));
              // Unfinished work kept on this device comes back with the
              // reflection (round 3, ADR #57). What's on screen wins.
              const kept = kept_as_drafts(
                reflection.entries,
                framework,
                read_kept(me_id, reflection.id),
                me_id,
              );
              setDrafts((current) => ({ ...kept, ...current }));
              restored.current = `${me_id}:${reflection.id}`;
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
  }, [reflection_id, reload_key, mode, me_id, wanted_entry]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  const update_entry = useCallback<EntryUpdate>((entry_id, change) => {
    setLoad((current) => {
      if (current.status !== 'loaded') return current;
      return {
        ...current,
        reflection: {
          ...current.reflection,
          entries: current.reflection.entries.map((entry) =>
            entry.id === entry_id ? change(entry) : entry,
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

  // Every change is kept on this device, once the kept work has been read
  // back. A score sent is dropped from drafts, so the last one sent clears
  // the key.
  useEffect(() => {
    if (mode !== 'assessor' || !me_id || !reflection_id) return;
    if (restored.current !== `${me_id}:${reflection_id}`) return;
    // Which are ready to send, for the review queue's Entries bar.
    const waiting = new Set(
      load.status === 'loaded'
        ? missing_before_save_all(
            load.reflection.entries,
            load.framework,
            drafts,
            me_id,
          ).map((gap) => gap.entry.id)
        : [],
    );
    const kept: Record<string, KeptDraft> = {};
    for (const [entry_id, draft] of Object.entries(drafts)) {
      if (draft.level_id !== null || draft.comment.trim() !== '') {
        kept[entry_id] = {
          level_id: draft.level_id,
          comment: draft.comment,
          // A score the server refused isn't ready, until it is sent again.
          done: load.status === 'loaded' && !waiting.has(entry_id) && draft.error === null,
        };
      }
    }
    write_kept(me_id, reflection_id, kept);
  }, [mode, me_id, reflection_id, drafts, load]);

  // One counter-score, POSTed. "Submit scores" sends each through here, so
  // a score is sent from one place only. Resolves
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
      // Kept work says so now, not from the effect below, which stops
      // running if the reviewer has left mid-way through Submit scores.
      if (reflection_id) settle_kept(me.id, reflection_id, entry.id, true);
      setDrafts((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
      return true;
    } catch (caught) {
      const api_error = as_api_error(caught, 'Could not save that score.');
      const failure = counter_score_failure(api_error.code);
      if (reflection_id) settle_kept(me.id, reflection_id, entry.id, false);
      update_draft(entry.id, {
        error: api_error.message,
        comment_forced: draft.comment_forced || failure === 'comment',
      });
      if (failure === 'closed' || failure === 'already_scored') refresh();
      return false;
    }
  };

  // "Submit scores": nothing is sent until every competency the caller
  // has not scored has what it needs (missing_before_save_all). Then each
  // is POSTed in rubric order, one at a time. The first failure stops the
  // run on that competency, with its message. Scores already sent stay
  // sent, because a score cannot be taken back (ADR #34).
  const save_all = async () => {
    if (load.status !== 'loaded' || !me) return;
    const { reflection: current_reflection, framework } = load;
    const gaps = missing_before_save_all(
      current_reflection.entries,
      framework,
      drafts,
      me.id,
    );
    if (gaps.length > 0) {
      setMissing(gaps);
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
      await narrative_ref.current?.flush();
      const settled = await Promise.allSettled([...pending_saves.current]);
      if (settled.some((result) => result.status === 'rejected')) throw new Error();
      // Words a left card could not save are sent again, here, before the
      // reflection becomes unchangeable.
      for (const entry_id of [...failed_saves.current]) {
        const on_screen = load.reflection.entries.find((e) => e.id === entry_id);
        await api.patch('/entries/{entry_id}', {
          path: { entry_id },
          body: { narrative: on_screen?.narrative ?? '' },
        });
        failed_saves.current.delete(entry_id);
      }
    } catch {
      setSubmitError(
        new ApiError(
          0,
          null,
          'Your last edit did not save, so nothing was submitted. Check the connection and try again.',
        ),
      );
      setSubmitting(false);
      return;
    }

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
      <section className={styles.page}>
        <h1 className={styles.heading}>{heading}</h1>
        <LoadingState />
      </section>
    );
  }

  if (load.status === 'error') {
    return (
      <section className={styles.page}>
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
      <section className={styles.page}>
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
  // Nor does anyone but the owner: every reviewer on the gig can open a
  // draft here in student mode, and the server would refuse each write (F9,
  // CAP-36). Until the session knows who this is, me_id is null, so it
  // stays read-only rather than briefly offering controls.
  const is_owner = me_id !== null && reflection.owner.id === me_id;
  const read_only = mode === 'assessor' || reflection.status !== 'draft' || !is_owner;
  const current_index = Math.min(step, entries.length - 1);
  const current = entries[current_index];
  const scoring_open = mode === 'assessor' && reflection.status === 'submitted';
  const left_to_score = me_id ? entries.length - scored_by_count(entries, me_id) : 0;

  return (
    <section className={styles.page}>
      <h1 className={styles.heading}>{heading}</h1>
      {dates && <p className={styles.sprint_dates}>{dates}</p>}
      <div className={styles.status_row}>
        {/* The student's status matters to the student. An assessor only
            ever scores submitted work, so on their screen the badge would
            only repeat that; the notices below say it in words when the
            status is anything else (Patrick, PR #56). */}
        {mode !== 'assessor' && <Badge status={reflection.status} />}
        {mode === 'assessor' && (
          <p className={styles.counter_score}>
            {reflection.owner.display_name}
            {me_id && (
              <>
                {' '}
                &middot; you have scored{' '}
                {done_count(entries, load.framework, drafts, me_id)} of {entries.length}
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

      {/* Its own space below, as every block on this page has (CAP-61). */}
      <div className={styles.progress}>
        <ProgressBar
          current={current_index + 1}
          total={entries.length}
          label="Competency"
        />
      </div>

      <EntryCard
        key={current.id}
        entry={current}
        framework={load.framework}
        read_only={read_only}
        offending={is_offending(current, offending)}
        on_update={update_entry}
        narrative_ref={narrative_ref}
        track_save={track_save}
        mode={mode}
        owner_name={reflection.owner.display_name}
        viewer_id={me_id}
        viewer_is_owner={is_owner}
        coach_reflection_id={!read_only && ai_features?.has('coach') ? reflection.id : null}
        related_reflection_id={
          !read_only && ai_features?.has('related') ? reflection.id : null
        }
        calibration_reflection_id={
          mode !== 'assessor' &&
          is_owner &&
          reflection.status === 'assessed' &&
          ai_features?.has('calibration')
            ? reflection.id
            : null
        }
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
            owner_name={reflection.owner.display_name}
          />
        )}
      </EntryCard>

      {submit_error && (
        <p className={styles.submit_error} role="alert">
          {submit_error.message}
        </p>
      )}

      {/* Navigation waits for an in-flight counter-score: stepping away
          would unmount the panel and lose the error it is about to show. */}
      <div className={styles.nav}>
        <Button
          variant="secondary"
          full_width={false}
          disabled={current_index === 0 || counter_saving}
          on_click={() => go_to_step((s) => Math.max(0, s - 1))}
        >
          Back
        </Button>

        {current_index < entries.length - 1 ? (
          <Button
            full_width={false}
            disabled={counter_saving}
            on_click={() => go_to_step((s) => s + 1)}
          >
            Next
          </Button>
        ) : scoring_open && left_to_score > 0 ? (
          <Button
            full_width={false}
            disabled={counter_saving}
            on_click={() => void save_all()}
          >
            {saving_all ? 'Submitting…' : 'Submit scores'}
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

      {/* What "Submit scores" is still waiting on, as a pop-up rather than a
          card under the button, which on a phone is off-screen (round 3,
          Patrick 2026-10-05). Nothing was sent. "Okay" goes to the first
          gap in rubric order, at its top with focus on its name, the way
          Back and Next arrive. Any other close just closes. */}
      <BottomSheet
        open={missing !== null}
        title="Some scores are missing"
        onClose={() => setMissing(null)}
      >
        <p className={styles.missing_lead}>Nothing was sent. Still to do:</p>
        <ul className={styles.missing_list}>
          {missing?.map((gap) => (
            <li key={gap.entry.id}>
              {gap.entry.competency_name} ({gap.index + 1} of {entries.length}){' '}
              {gap.needs === 'score'
                ? 'still needs a score.'
                : 'needs a comment to go with its score.'}
            </li>
          ))}
        </ul>
        <Button
          on_click={() => {
            const first = missing?.[0]?.index ?? current_index;
            setMissing(null);
            go_to_step(first);
          }}
        >
          Okay
        </Button>
      </BottomSheet>
    </section>
  );
}

/** Shaped like the loaded screen: a progress bar and one card, not a spinner. */
function LoadingState() {
  return (
    <SkeletonGroup label="Loading this reflection">
      <div className={styles.loading}>
        <Skeleton variant="block" width="100%" height="var(--space-32)" />
        <Skeleton variant="block" width="100%" height="12rem" />
      </div>
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
  on_update,
  narrative_ref,
  track_save,
  mode,
  owner_name,
  viewer_id = null,
  coach_reflection_id = null,
  viewer_is_owner = true,
  related_reflection_id = null,
  calibration_reflection_id = null,
  children,
}: {
  entry: ReflectionEntry;
  framework: FrameworkDetail;
  read_only: boolean;
  offending?: boolean;
  on_update: EntryUpdate;
  narrative_ref: Ref<TextAreaHandle>;
  /** Registers a save so Submit can wait for it after this card is gone. */
  track_save: (entry_id: string, saving: Promise<void>) => void;
  mode: StepperMode;
  owner_name: string;
  /** Who is looking, so assessor mode can leave their own score to the panel. */
  viewer_id?: string | null;
  /** Whether the person reading is the student whose card this is. */
  viewer_is_owner?: boolean;
  /** ADR #64: the reflection to coach on, when this card may show the coach. */
  coach_reflection_id?: string | null;
  /** ADR #64: the reflection to find earlier, similar entries for, when shown. */
  related_reflection_id?: string | null;
  /** ADR #64: the assessed reflection to ask calibration questions about, when shown. */
  calibration_reflection_id?: string | null;
  /** The assessor's own score, last in the card so it reads after the evidence. */
  children?: ReactNode;
}) {
  const self_label = mode === 'assessor' ? `${owner_name}'s self-score` : 'Self-score';
  const [narrative_error, setNarrativeError] = useState<string | null>(null);
  const [score_error, setScoreError] = useState<string | null>(null);
  // What Laravel holds, which is what the sidecar reads: the coach waits for
  // it to match the screen, and similar reflections are looked up again when
  // it changes, not on every keystroke.
  const [saved_narrative, setSavedNarrative] = useState(entry.narrative ?? '');
  const calibration_with = calibration_reflection_id ? calibration_reviewer(entry) : null;
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
        const saving = api
          .patch('/entries/{entry_id}', {
            path: { entry_id: entry.id },
            body: { narrative: value },
          })
          .then(() => {});
        track_save(entry.id, saving);
        await saving;
        setSavedNarrative(value);
      } catch (error) {
        const api_error = as_api_error(error, 'Could not save that.');
        setNarrativeError(api_error.message);
        throw api_error; // TextArea's own status turns "failed" on a rejection.
      }
    },
    [entry.id, track_save],
  );

  // CAP-66: the scale shows a choice at once. A tap saves at once; arrow keys
  // save once they stop, so stepping from 1 to 4 sends one save, not three.
  const [pending_level, setPendingLevel] = useState<string | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // A keyboard choice not yet sent. Leaving the scale or the card sends it
  // now rather than dropping it: a student who arrows to a level and presses
  // Next or Submit at once still has that level saved.
  const waiting = useRef<string | null>(null);
  // Only the latest save's answer counts: two answered out of order must not
  // leave the scale, or an error, showing the earlier one.
  const save_seq = useRef(0);
  const save_level = useCallback(
    async (level_id: string) => {
      const seq = ++save_seq.current;
      setScoreError(null);
      try {
        const score = await api.put('/entries/{entry_id}/scores/self', {
          path: { entry_id: entry.id },
          body: { level_id },
        });
        if (seq !== save_seq.current) return;
        on_update(entry.id, (current) => ({
          ...current,
          scores: [...current.scores.filter((s) => s.scorer_class !== 'self'), score],
        }));
      } catch (error) {
        if (seq !== save_seq.current) return;
        setScoreError(as_api_error(error, 'Could not save that score.').message);
      } finally {
        // The scale shows what was saved from here on, or what was there before.
        setPendingLevel((pending) => (pending === level_id ? null : pending));
      }
    },
    [entry.id, on_update],
  );

  const flush = useCallback(() => {
    clearTimeout(settle.current);
    const level_id = waiting.current;
    waiting.current = null;
    if (level_id) void save_level(level_id);
  }, [save_level]);
  const flush_latest = useRef(flush);
  useEffect(() => {
    flush_latest.current = flush;
  }, [flush]);
  useEffect(() => () => flush_latest.current(), []);

  const choose_level = useCallback(
    (level_id: string, how: 'pointer' | 'key') => {
      clearTimeout(settle.current);
      setPendingLevel(level_id);
      if (how === 'pointer') {
        waiting.current = null;
        void save_level(level_id);
      } else {
        waiting.current = level_id;
        settle.current = setTimeout(flush, KEY_SETTLE_MS);
      }
    },
    [save_level, flush],
  );

  const narrative = (
    <>
      <TextArea
        label={mode === 'assessor' ? `${owner_name} wrote` : 'Your reflection'}
        value={entry.narrative ?? ''}
        onChange={(value) =>
          on_update(entry.id, (current) => ({ ...current, narrative: value }))
        }
        onSave={save_narrative}
        ref={narrative_ref}
        disabled={read_only}
        placeholder="What did you do, and what did you learn from it?"
      />
      {narrative_error && (
        <p className={styles.field_error} role="alert">
          {narrative_error}
        </p>
      )}
    </>
  );

  // Everyone else's score on this entry, oldest first. In assessor mode the
  // viewer's own is shown by the panel instead, so it is left out here.
  const counters = read_only
    ? counter_scores_of(entry)
        .filter((score) => mode !== 'assessor' || score.scorer?.id !== viewer_id)
        .sort((a, b) => a.scored_at.localeCompare(b.scored_at))
    : [];
  // CAP-66: on the student's own read-only card, their score and the
  // reviewers' share one scale (ADR #65), where they used to be two lists.
  const shared = mode !== 'assessor' && counters.length > 0;
  const name_of = (score: ReflectionScore) => score.scorer?.display_name ?? 'Counter-score';

  const self_score_row = (
    <div className={styles.levels}>
      {shared ? (
        <LevelScale
          label={list_of([
            viewer_is_owner ? 'Your score' : `${owner_name}'s score`,
            ...counters.map((score) => `${name_of(score)}'s`),
          ])}
          levels={levels}
          marks={[
            ...(self_score
              ? [
                  {
                    level_id: self_score.level_id,
                    // Someone else reading the student's card is not "you".
                    who: viewer_is_owner ? 'You' : owner_name,
                    tone: 'primary' as const,
                  },
                ]
              : []),
            ...counters.map((score) => ({
              level_id: score.level_id,
              who: name_of(score),
              tone: 'counter' as const,
            })),
          ]}
        />
      ) : (
        <LevelScale
          label={self_label}
          levels={levels}
          value={pending_level ?? self_score?.level_id ?? null}
          on_change={read_only ? undefined : choose_level}
          on_leave={flush}
        />
      )}
      {score_error && (
        <p className={styles.field_error} role="alert">
          {score_error}
        </p>
      )}
    </div>
  );

  // The counter-scores, each with its comment, read-only. Their own block
  // now, after the narrative, so each person's score sits beside their own
  // words (round 2b).
  const comment_of = (score: ReflectionScore) => {
    if (!score.comment) return null;
    const comment_id = `counter-comment-${score.id}`;
    return (
      <div key={comment_id} className={text_area_styles.field}>
        <label className={text_area_styles.label} htmlFor={comment_id}>
          {name_of(score)}'s comment
        </label>
        <textarea
          id={comment_id}
          className={text_area_styles.textarea}
          value={score.comment}
          disabled
          readOnly
        />
      </div>
    );
  };

  const counter_scores = shared ? (
    // The scores are on the shared scale above; what follows the reflection
    // is each reviewer's comment, the words behind their score.
    counters.some((score) => score.comment) && (
      <div className={styles.counter_block}>{counters.map(comment_of)}</div>
    )
  ) : (
    <>
      {counters.map((score) => {
        // The way the assessor sees another reviewer's saved score (Patrick,
        // PR #56): the score on its own scale in the counter-score green, and
        // the comment in its box, read-only (CAP-38, CAP-66).
        const who = `${name_of(score)}'s`;
        return (
          <div key={score.id} className={styles.counter_block}>
            <LevelScale
              label={`${who} score`}
              levels={levels}
              tone="counter"
              value={score.level_id}
            />
            {comment_of(score)}
          </div>
        );
      })}
    </>
  );

  return (
    <div className={offending ? `${styles.card} ${styles.card_offending}` : styles.card}>
      {/* Focus lands here after Back or Next (tabIndex -1: focusable by
          script, not a Tab stop). */}
      <p className={styles.competency_name} data-competency-name tabIndex={-1}>
        {entry.competency_name}
      </p>

      {/* Score first, then the words behind it, for both people and in
          both views: self-score, reflection, then the counter-score and its
          comment below. Patrick, round 2b, extending PR #56's assessor order
          to the student, whose screen used to lead with the narrative
          (CAP-11): the score is the first choice either of them makes. */}
      {self_score_row}
      {narrative}
      {coach_reflection_id && (
        <CoachPanel
          reflection_id={coach_reflection_id}
          entry_id={entry.id}
          narrative={entry.narrative ?? ''}
          saved_narrative={saved_narrative}
        />
      )}
      {related_reflection_id && (
        <RelatedDisclosure
          reflection_id={related_reflection_id}
          entry_id={entry.id}
          saved_narrative={saved_narrative}
        />
      )}
      {counter_scores}
      {calibration_reflection_id && calibration_with && (
        <CalibrationPanel
          reflection_id={calibration_reflection_id}
          entry_id={entry.id}
          reviewer_name={calibration_with}
        />
      )}

      <EvidenceList
        entry={entry}
        framework={framework}
        read_only={read_only}
        on_update={on_update}
      />

      {children}
    </div>
  );
}

/** The site a link goes to, for the line under its label. */
function host_of(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
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
  on_update,
}: {
  entry: ReflectionEntry;
  framework: FrameworkDetail;
  read_only: boolean;
  on_update: EntryUpdate;
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
        on_update(entry.id, (current) => ({
          ...current,
          evidence: current.evidence.filter((e) => e.id !== evidence_id),
        }));
      } catch (deleteError) {
        setError(as_api_error(deleteError, 'Could not remove that.').message);
      }
    },
    [entry.id, on_update],
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
        on_update(entry.id, (current) => ({
          ...current,
          evidence: [...current.evidence, evidence],
        }));
        setLabel('');
        setUri('');
        setAddingLink(false);
      } catch (addError) {
        setError(as_api_error(addError, 'Could not attach that link.').message);
      }
    },
    [entry.id, label, uri, on_update],
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
        on_update(entry.id, (current) => ({
          ...current,
          evidence: [...current.evidence, evidence],
        }));
      } catch (addError) {
        setError(as_api_error(addError, 'Could not attach that file.').message);
      }
    },
    [entry.id, on_update],
  );

  return (
    <div className={styles.evidence}>
      <p className={styles.field_label}>Evidence</p>

      {read_only && entry.evidence.length === 0 && (
        <p className={styles.evidence_hint}>No evidence attached.</p>
      )}

      {entry.evidence.length > 0 && (
        <ul className={styles.evidence_list}>
          {entry.evidence.map((item) => (
            <li key={item.id} className={`${styles.evidence_row} ${styles.evidence_item}`}>
              {item.kind === 'link' && HREF_SCHEME.test(item.uri) ? (
                <>
                  <span className={styles.evidence_icon} aria-hidden="true">
                    ↗
                  </span>
                  {/* The site name sits beside the link, not in it, so the
                      link's name is still just its label (CAP-38). */}
                  <span className={styles.evidence_text}>
                    <a href={item.uri} target="_blank" rel="noopener noreferrer">
                      {item.label}
                    </a>
                    <span className={styles.evidence_host}>{host_of(item.uri)}</span>
                  </span>
                </>
              ) : (
                <span className={styles.evidence_text}>{item.label}</span>
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
              {/* A label, so the file picker opens from it, with Button's own
                  look: the same control as "Add a link" beside it (CAP-63). */}
              <label
                className={`${button_styles.button} ${button_styles.secondary} ${styles.file_button}`}
              >
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
 * The scale uses tone="counter", the radar's counter-score green, so the
 * assessor's choice reads apart from the student's purple one above it.
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
  owner_name,
}: {
  entry: ReflectionEntry;
  framework: FrameworkDetail;
  me: SessionUser;
  open: boolean;
  /** This session's own save just flipped the reflection to assessed. */
  completed: boolean;
  draft: CounterDraft;
  /** "Submit scores" is sending. */
  saving: boolean;
  on_draft: (patch: Partial<CounterDraft>) => void;
  /** The student, whose own level is marked on the assessor's scale (CAP-66). */
  owner_name: string;
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
  const comment_id = `comment-${entry.id}`;

  // Closed, not ours, nothing to say: render nothing at all, so the card's
  // spacing is exactly the student view's rather than gaining an empty row.
  if (!mine && !open && !draft.error) return null;

  return (
    <div className={`${styles.levels} ${styles.counter_block}`}>
      {mine ? (
        <>
          {/* Presented exactly as the student's self-score row above: the
              same chips, greyed, with the chosen level selected, and the
              comment kept in its box, read-only. */}
          <LevelScale
            label="Your score"
            levels={levels}
            tone="counter"
            value={mine.level_id}
          />
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
          // No Save here (round 3, ADR #57): the pick and the comment stay
          // open until "Submit scores" sends every competency at once.
          <div className={styles.levels}>
            {/* Kept on this device until "Submit scores" (ADR #57), so a
                keyboard choice needs no settling: nothing is sent. */}
            <LevelScale
              label="Your score"
              levels={levels}
              tone="counter"
              value={draft.level_id}
              on_change={(level_id) => on_draft({ level_id })}
              disabled={saving}
              marker={
                self_score ? { level_id: self_score.level_id, who: owner_name } : null
              }
            />

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
          </div>
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

/** What the heading and the line under it need from GET /gigs/{gig_id}. */
interface HeadingGig {
  title: string;
  sprints: (DatedSprint & { id: string; ordinal: number })[];
}

/**
 * "15 Aug – 28 Aug" under the heading (round 2c, Patrick): which stretch
 * of the gig this reflection covers. From the gig's sprints, the same way
 * the gig page words it (sprint_dates); null until the gig has loaded, or
 * for a whole-gig reflection or an undated sprint.
 */
function sprint_window(load: Load, gig: HeadingGig | null): string | null {
  if (load.status !== 'loaded' || !gig) return null;
  const sprint = gig.sprints.find(
    (candidate) => candidate.id === load.reflection.sprint_id,
  );
  return sprint ? sprint_dates(sprint) : null;
}

/**
 * "<Gig> · Sprint N" once both are known (round 2b, Patrick): the page says
 * which piece of work it is. The sprint's number comes from the reflection
 * when it carries one and from the gig's sprints otherwise; GET
 * /reflections/{id} leaves sprint_ordinal out today. Until the number is
 * known the heading does not guess: the gig's title alone, or the screen's
 * plain name. A reflection with no sprint is a whole-gig one.
 */
function stepper_heading(mode: StepperMode, load: Load, gig: HeadingGig | null): string {
  const plain = mode === 'assessor' ? 'Score reflection' : 'Reflection';
  if (load.status !== 'loaded') return plain;
  const { sprint_id, sprint_ordinal } = load.reflection;
  if (!sprint_id) return gig?.title ?? 'Whole gig';

  const ordinal =
    sprint_ordinal ??
    gig?.sprints.find((sprint) => sprint.id === sprint_id)?.ordinal ??
    null;
  if (ordinal === null) return gig?.title ?? plain;
  return gig ? `${gig.title} · Sprint ${ordinal}` : `Sprint ${ordinal}`;
}
