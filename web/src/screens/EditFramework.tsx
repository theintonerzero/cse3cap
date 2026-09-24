/**
 * CAP-16. Copy a rubric, rename its competencies, reword its descriptors.
 *
 * Copy-then-edit is the only editing model (ADR #16). Saving POSTs a copy of
 * the base and PATCHes the copy; the base never changes, and neither does
 * anything already scored against it. The screen says so before anyone
 * types, because ADR #16 is explicit that copying must be obvious rather
 * than surprising.
 *
 * Deliberately narrow. Renaming and rewording ONLY: there is no control for
 * adding or removing a competency, changing how many levels one has, or
 * starting a rubric from nothing -- not even a disabled one. A rubric with a
 * different shape is a different rubric. The shape is stated once, in prose.
 *
 * The file policy (comment_required, evidence_required, accepted file types,
 * size) is also PATCHable on a copy, and is also not here: the ticket names
 * the base, the name, competencies and descriptors, and nothing else.
 *
 * short_label IS here, as "Radar label". It is the radar's axis label, so a
 * competency renamed without it keeps its old name on every chart.
 *
 * The base comes from the route, so the page is linkable and the selector is
 * just navigation. Select framework links every row here as "Copy and edit";
 * in_use does not gate that, because the base is only ever read.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import { Button, Card, ErrorNotice, Skeleton, SkeletonGroup } from '../components/index.ts';
import { group_frameworks, type Framework } from './framework-groups.ts';
import {
  NAME_MAX,
  SHORT_LABEL_MAX,
  apply_edit,
  draft_from,
  is_dirty,
  missing_text,
  owed_by,
  pending_edits,
  set_competency,
  set_level,
  type Edit,
  type FrameworkDetail,
  type FrameworkDraft,
} from './framework-edit.ts';
import styles from './EditFramework.module.css';

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; frameworks: Framework[]; base: FrameworkDetail };

export function EditFramework() {
  const { framework_id } = useParams<{ framework_id: string }>();
  const navigate = useNavigate();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);

  useEffect(() => {
    // The router only matches this screen with an id, so there is always
    // one; the guard is for the type, not for a real case.
    if (!framework_id) return;

    const controller = new AbortController();
    const signal = controller.signal;

    Promise.all([
      api.get('/frameworks', { signal }),
      api.get('/frameworks/{framework_id}', { path: { framework_id }, signal }),
    ])
      .then(([frameworks, base]) => setLoad({ status: 'loaded', frameworks, base }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({
          status: 'error',
          error:
            error instanceof ApiError
              ? error
              : new ApiError(0, null, 'Something went wrong loading this rubric.'),
        });
      });

    return () => controller.abort();
  }, [framework_id, reload_key]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  // Back to the skeletons here, in the event, rather than in the effect:
  // a synchronous setState inside an effect is a cascading render.
  const choose_base = useCallback(
    (id: string) => {
      setLoad({ status: 'loading' });
      void navigate(`/frameworks/${id}/edit`, { replace: true });
    },
    [navigate],
  );

  return (
    <section>
      <Link className={styles.back} to="/frameworks">
        {'‹'} Frameworks
      </Link>
      <h1 className={styles.heading}>Copy and edit a rubric</h1>
      <p className={styles.sub}>
        Saving makes a new rubric of your own. The one it is based on does not change, and
        nothing already scored against it moves.
      </p>

      {load.status === 'loading' && <LoadingState />}
      {load.status === 'error' && (
        <div className={styles.block}>
          <ErrorNotice error={load.error} on_retry={retry} />
        </div>
      )}
      {load.status === 'loaded' && (
        <Editor
          key={load.base.id}
          base={load.base}
          frameworks={load.frameworks}
          on_choose_base={choose_base}
        />
      )}
    </section>
  );
}

type Save =
  | { status: 'idle' }
  | { status: 'saving'; done: number; total: number }
  // error is null when nothing came back wrong over HTTP: the copy arrived
  // but is not this draft's shape. SaveOutcome says that in its own words.
  | { status: 'failed'; error: ApiError | null }
  | { status: 'frozen'; error: ApiError }
  | { status: 'saved' };

function Editor({
  base,
  frameworks,
  on_choose_base,
}: {
  base: FrameworkDetail;
  frameworks: Framework[];
  on_choose_base: (id: string) => void;
}) {
  const [draft, setDraft] = useState<FrameworkDraft>(() => draft_from(base));
  // The copy as the server holds it, once there is one. Every landed PATCH
  // is folded in, so pending_edits against it is exactly what is still owed.
  const [copy, setCopy] = useState<FrameworkDetail | null>(null);
  const [save, setSave] = useState<Save>({ status: 'idle' });

  const edit = (next: FrameworkDraft) => {
    setDraft(next);
    // A new keystroke after "Saved" means there is something unsaved again.
    if (save.status === 'saved') setSave({ status: 'idle' });
  };

  const missing = missing_text(draft);
  // owed_by, not pending_edits: this runs in render, where a throw is a
  // blank page. null with a copy means the copy is not this draft's shape.
  const owed = copy === null ? null : owed_by(copy, draft);
  const mismatched = copy !== null && owed === null;
  const saving = save.status === 'saving';
  const can_save =
    !saving &&
    save.status !== 'frozen' &&
    !mismatched &&
    missing.length === 0 &&
    owed?.length !== 0;

  async function run(change: Edit) {
    switch (change.kind) {
      case 'framework':
        await api.patch('/frameworks/{framework_id}', {
          path: { framework_id: change.id },
          body: change.body,
        });
        return;
      case 'competency':
        await api.patch('/competencies/{competency_id}', {
          path: { competency_id: change.id },
          body: change.body,
        });
        return;
      case 'level':
        await api.patch('/levels/{level_id}', {
          path: { level_id: change.id },
          body: change.body,
        });
        return;
    }
  }

  // `from` is the copy to finish, or null to make one. Passed rather than
  // read from state so "Save to a fresh copy" can clear it and save in the
  // same press.
  async function save_draft(from: FrameworkDetail | null) {
    let current = from;

    try {
      if (current === null) {
        setSave({ status: 'saving', done: 0, total: 0 });
        current = await api.post('/frameworks', {
          body: { based_on_framework_id: base.id, name: draft.name.trim() },
        });
        setCopy(current);
      }

      const edits = pending_edits(current, draft);
      for (const [index, next] of edits.entries()) {
        setSave({ status: 'saving', done: index, total: edits.length });
        await run(next);
        current = apply_edit(current, next);
        setCopy(current);
      }

      setSave({ status: 'saved' });
    } catch (error: unknown) {
      // Every request above rejects with an ApiError, including one that
      // never reached the server (status 0). Anything else is pending_edits
      // refusing a copy of the wrong shape -- not a transport failure, so it
      // must not be dressed as one: ErrorNotice reads status 0 as "Cannot
      // reach the server".
      if (!(error instanceof ApiError)) {
        setSave({ status: 'failed', error: null });
        return;
      }

      // The guard firing mid-edit: somebody assigned the new copy to a gig
      // and a reflection was scored against it between the POST and now.
      // It is frozen for good, so retrying against it can never succeed.
      if (error.code === 'FRAMEWORK_IN_USE') {
        setSave({ status: 'frozen', error });
        return;
      }

      setSave({ status: 'failed', error });
    }
  }

  // Keeps every keystroke; only abandons the copy that can no longer change.
  // That copy stays listed under Saved copies, in use, which is true.
  function save_to_fresh_copy() {
    setCopy(null);
    void save_draft(null);
  }

  const { templates, copies } = group_frameworks(frameworks);
  const dirty = is_dirty(base, draft);
  const empty = base.competencies.length === 0;

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="based-on">
          Based on
        </label>
        <select
          id="based-on"
          className={styles.control}
          value={base.id}
          disabled={copy !== null || saving}
          onChange={(event) => on_choose_base(event.target.value)}
        >
          <optgroup label="Templates">
            {templates.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </optgroup>
          {copies.length > 0 && (
            <optgroup label="Saved copies">
              {copies.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.fw_key})
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {copy !== null ? (
          <p className={styles.hint}>
            Your copy already exists, so its base is fixed. To start from another rubric, go
            back to Frameworks.
          </p>
        ) : (
          dirty && (
            <p className={styles.hint}>Choosing a different rubric discards your edits.</p>
          )
        )}
      </div>

      {empty ? (
        <div className={styles.empty}>
          <p className={styles.empty_title}>Nothing to rename.</p>
          <p className={styles.empty_body}>
            {base.name} has no competencies, so a copy of it would have nothing to edit.
            Choose another rubric above to base your copy on.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="copy-name">
              Name of your copy
            </label>
            <input
              id="copy-name"
              className={styles.control}
              value={draft.name}
              maxLength={NAME_MAX}
              disabled={saving}
              onChange={(event) => edit({ ...draft, name: event.target.value })}
            />
          </div>

          <p className={styles.shape}>
            {draft.competencies.length} competencies, scored {base.scale.min} to{' '}
            {base.scale.max}. The number of competencies and levels stays as it is: a rubric
            with a different shape is a different rubric.
          </p>

          <ol className={styles.competencies}>
            {draft.competencies.map((competency) => (
              <li key={competency.code}>
                <Card>
                  <fieldset className={styles.fieldset} disabled={saving}>
                    <legend className={styles.legend}>
                      {competency.code}
                      {competency.category && ` · ${competency.category}`}
                    </legend>

                    <div className={styles.pair}>
                      <div className={styles.field}>
                        <label className={styles.label} htmlFor={`name-${competency.code}`}>
                          Competency name
                        </label>
                        <input
                          id={`name-${competency.code}`}
                          className={styles.control}
                          value={competency.name}
                          maxLength={NAME_MAX}
                          onChange={(event) =>
                            edit(
                              set_competency(draft, competency.code, {
                                name: event.target.value,
                              }),
                            )
                          }
                        />
                      </div>
                      <div className={styles.field}>
                        <label
                          className={styles.label}
                          htmlFor={`label-${competency.code}`}
                        >
                          Radar label
                        </label>
                        <input
                          id={`label-${competency.code}`}
                          className={styles.control}
                          value={competency.short_label}
                          maxLength={SHORT_LABEL_MAX}
                          placeholder={competency.name}
                          onChange={(event) =>
                            edit(
                              set_competency(draft, competency.code, {
                                short_label: event.target.value,
                              }),
                            )
                          }
                        />
                      </div>
                    </div>

                    {competency.levels.map((level) => {
                      const id = `level-${competency.code}-${level.level_value}`;
                      return (
                        <div key={level.level_value} className={styles.field}>
                          <label className={styles.label} htmlFor={id}>
                            Level {level.level_value}
                          </label>
                          <textarea
                            id={id}
                            className={`${styles.control} ${styles.descriptor}`}
                            value={level.descriptor}
                            onChange={(event) =>
                              edit(
                                set_level(
                                  draft,
                                  competency.code,
                                  level.level_value,
                                  event.target.value,
                                ),
                              )
                            }
                          />
                        </div>
                      );
                    })}
                  </fieldset>
                </Card>
              </li>
            ))}
          </ol>

          <div className={styles.footer}>
            <SaveOutcome
              save={save}
              copy={copy}
              owed={owed}
              on_fresh_copy={save_to_fresh_copy}
            />

            {missing.length > 0 && (
              <p className={styles.hint}>
                Needs text before it can save: {missing.join(', ')}.
              </p>
            )}

            <Button disabled={!can_save} on_click={() => void save_draft(copy)}>
              {saving
                ? save.total > 0
                  ? `Saving ${save.done + 1} of ${save.total}…`
                  : 'Copying…'
                : copy === null
                  ? 'Save as a new copy'
                  : 'Save changes to your copy'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * What the last press of Save came to. Each failure says whether a copy
 * exists, because that decides what pressing Save again will do.
 */
function SaveOutcome({
  save,
  copy,
  owed,
  on_fresh_copy,
}: {
  save: Save;
  copy: FrameworkDetail | null;
  owed: Edit[] | null;
  on_fresh_copy: () => void;
}) {
  if (save.status === 'saved' && copy !== null) {
    return (
      <p className={styles.saved} role="status">
        Saved as {copy.name}. It is listed under <Link to="/frameworks">Saved copies</Link>.
      </p>
    );
  }

  if (save.status === 'frozen' && copy !== null) {
    return (
      <div className={styles.outcome} role="alert">
        <p className={styles.refused}>
          {copy.name} was used to score a reflection before these edits reached it, so it
          can no longer change. {save.error.message}
        </p>
        <Button variant="secondary" full_width={false} on_click={on_fresh_copy}>
          Save to a fresh copy
        </Button>
      </div>
    );
  }

  if (save.status === 'failed') {
    return (
      <div className={styles.outcome}>
        <p className={styles.hint}>
          {copy === null
            ? 'Nothing was saved.'
            : owed === null
              ? `A copy, ${copy.name}, was made, but it does not have the competencies of the rubric it was copied from, so your edits cannot be put on it.`
              : `Your copy, ${copy.name}, exists, but ${owed.length} of your edits have not reached it yet. Saving again finishes them on the same copy rather than making another.`}
        </p>
        {save.error && <ErrorNotice error={save.error} />}
      </div>
    );
  }

  return null;
}

/** Shaped like the form: the two fields, then a few competency cards. */
function LoadingState() {
  return (
    <SkeletonGroup label="Loading rubric">
      <div className={styles.form}>
        <Skeleton variant="block" height="var(--space-48)" />
        <Skeleton variant="block" height="var(--space-48)" />
        {[0, 1, 2].map((card) => (
          <Skeleton key={card} variant="block" height="calc(var(--space-64) * 3)" />
        ))}
      </div>
    </SkeletonGroup>
  );
}
