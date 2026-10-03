/**
 * The student's landing screen, and the first place the radar appears in
 * context.
 *
 * Two loads that do not wait on each other. Gigs and reflections are
 * fetched once, because the chips and the list are both filtered from them
 * in memory -- clicking a chip re-filters rather than refetching, so the
 * list does not blink. The radar is refetched per scope, because the server
 * is what computes it: a sprint gives that sprint's comparison, a gig the
 * latest within it, neither the latest across the record
 * (AnalyticsController::radar).
 *
 * Scope lives in the URL (ADR #27). Everything that decides what a scope
 * means is in diary-scope.ts, deliberately free of React.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import type { paths } from '../api/schema.ts';
import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  ErrorNotice,
  FloatingAction,
  LinkButton,
  RadarPanel,
  Select,
  Skeleton,
  SkeletonGroup,
} from '../components/index.ts';
import { useSession } from '../session/useSession.ts';
import {
  ALL_GIGS,
  chippable_sprints,
  params_for_scope,
  radar_caption,
  reflections_in_scope,
  rubric_line,
  scope_from_params,
  student_gigs,
  type Gig,
  type ReflectionSummary,
  type Scope,
} from './diary-scope.ts';
import styles from './DiaryHome.module.css';
import { ExportSheet } from './ExportSheet.tsx';

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; gigs: Gig[]; reflections: ReflectionSummary[] };

type Radar = paths['/me/radar']['get']['responses']['200']['content']['application/json'];

type RadarLoad =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'empty' }
  | { status: 'loaded'; radar: Radar };

/** The shape every failed call in this screen ends up in. */
function as_api_error(error: unknown, fallback: string): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, null, fallback);
}

export function DiaryHome() {
  const { me } = useSession();
  const [params, setParams] = useSearchParams();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);
  const [export_open, setExportOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      api.get('/gigs', { signal: controller.signal }),
      api.get('/reflections', { signal: controller.signal }),
    ])
      .then(([gigs, reflections]) => setLoad({ status: 'loaded', gigs, reflections }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({
          status: 'error',
          error: as_api_error(error, 'Something went wrong loading your diary.'),
        });
      });

    return () => controller.abort();
  }, [reload_key]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  /*
   * Replace rather than push: a student clicking along four sprint chips
   * should be one Back away from where they came from, not four.
   */
  const go_to = useCallback(
    (next: Scope) => setParams(params_for_scope(next), { replace: true }),
    [setParams],
  );

  if (load.status === 'loading') {
    return (
      <section>
        <LoadingState />
      </section>
    );
  }

  if (load.status === 'error') {
    return (
      <section>
        <ErrorNotice error={load.error} on_retry={retry} />
      </section>
    );
  }

  const mine = student_gigs(load.gigs);
  const scope = scope_from_params(params, load.gigs);
  const rows = reflections_in_scope(load.reflections, load.gigs, scope);
  const whole_record = reflections_in_scope(load.reflections, load.gigs, {
    gig_id: null,
    sprint_id: null,
  });

  /*
   * Every route stays reachable by URL, so an assessor can land here. The
   * diary is the student's own record and theirs is empty by definition;
   * saying so is better than an empty list that looks broken. A hidden nav
   * item is a convenience; this is the same convenience, one screen in.
   */
  if (mine.length === 0) {
    return (
      <section>
        <NotAStudent display_name={me?.display_name ?? null} />
      </section>
    );
  }

  return (
    <section className={styles.with_fab}>
      <ScopeChips gigs={mine} scope={scope} on_select={go_to} />

      {/*
       * Three ways to be empty, and they are not the same sentence. An
       * untouched record needs telling what to do next; a scope with
       * nothing in it needs telling the rest is elsewhere. The radar is
       * skipped in both: its own empty state would be a third box saying
       * what one of these already said.
       */}
      {whole_record.length === 0 && <NothingWritten gigs={mine} />}
      {whole_record.length > 0 && rows.length === 0 && <NothingInScope />}
      {rows.length > 0 && (
        <div className={styles.content}>
          {/*
           * Unscoped, GET /me/radar draws one rubric: the latest
           * reflection's (docs/openapi.yaml, /me/radar). Over two or more
           * gigs that is one gig labelled as all of them, so "All gigs"
           * asks for a choice instead (CAP-38). Over one gig, "all" is that
           * gig and the radar draws as it always has.
           */}
          {scope.gig_id === null && mine.length > 1 ? (
            <div className={styles.radar_block}>
              <RadarPanel state="prompt" message="Pick a gig to see its radar." />
            </div>
          ) : (
            <ScopedRadar
              key={`${scope.gig_id ?? 'all'}:${scope.sprint_id ?? 'all'}`}
              gig_id={scope.gig_id}
              sprint_id={scope.sprint_id}
              gigs={mine}
            />
          )}
          <ReflectionList rows={rows} show_gig={scope.gig_id === null} gigs={mine} />
        </div>
      )}

      <FloatingAction
        label="Export record"
        icon={<DownloadIcon />}
        on_click={() => setExportOpen(true)}
      />

      <BottomSheet
        open={export_open}
        title="Export record"
        onClose={() => setExportOpen(false)}
      >
        <ExportSheet reflections={whole_record} />
      </BottomSheet>
    </section>
  );
}

/** An arrow into a tray. */
function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.5rem" height="1.5rem">
      <path
        d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The radar for one scope.
 *
 * Its own component and its own fetch because the scope decides it and the
 * list does not: clicking a sprint chip refetches this and re-filters the
 * list in memory. A 404 here is the API saying "nothing written in this
 * scope yet" (AnalyticsController::frameworkInScope), which is an empty
 * state, not an error -- rendering an error notice for it would tell a new
 * student their diary is broken on their first visit.
 *
 * It takes the scope as two ids rather than as an object, and the screen
 * gives it a `key` built from the same two. Both are deliberate: the ids
 * are stable values an effect can depend on honestly, where a fresh
 * `{ gig_id, sprint_id }` object every render could not be, and the key
 * remounts this on a scope change so the caption and the polygon are never
 * momentarily describing different things -- which is the exact ambiguity
 * criterion 2 exists to remove.
 */
function ScopedRadar({
  gig_id,
  sprint_id,
  gigs,
}: {
  gig_id: string | null;
  sprint_id: string | null;
  gigs: Gig[];
}) {
  const [load, setLoad] = useState<RadarLoad>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);
  const scope: Scope = { gig_id, sprint_id };

  useEffect(() => {
    const controller = new AbortController();
    const query = params_for_scope({ gig_id, sprint_id });

    api
      .get('/me/radar', { query, signal: controller.signal })
      .then((radar) => setLoad({ status: 'loaded', radar }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof ApiError && error.status === 404) {
          setLoad({ status: 'empty' });
          return;
        }
        setLoad({
          status: 'error',
          error: as_api_error(error, 'Something went wrong loading your radar.'),
        });
      });

    return () => controller.abort();
  }, [gig_id, sprint_id, reload_key]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  if (load.status === 'loading') return <RadarPanel state="loading" />;
  if (load.status === 'error') {
    return <RadarPanel state="error" error={load.error} on_retry={retry} />;
  }
  if (load.status === 'empty') {
    return (
      <div className={styles.radar_block}>
        <RadarPanel state="empty" />
        <p className={styles.caption}>Nothing scored in this scope yet.</p>
      </div>
    );
  }

  return (
    <div className={styles.radar_block}>
      <p className={styles.caption}>{radar_caption(scope, gigs)}</p>
      <RadarPanel
        state="loaded"
        scale={{
          min: load.radar.framework.scale_min,
          max: load.radar.framework.scale_max,
        }}
        axes={load.radar.axes}
      />
      <p className={styles.footnote}>
        {rubric_line(
          load.radar.framework.fw_key,
          load.radar.framework.scale_min,
          load.radar.framework.scale_max,
          gigs,
        )}
      </p>
    </div>
  );
}

/**
 * Criterion 1: all gigs or one gig, and sprint chips only once a gig is in
 * scope. Chips are Chip components rather than links because they write the
 * URL through the router; the URL is still the state, and a shared link
 * still restores it.
 */
function ScopeChips({
  gigs,
  scope,
  on_select,
}: {
  gigs: Gig[];
  scope: Scope;
  on_select: (next: Scope) => void;
}) {
  const navigate = useNavigate();
  const gig = gigs.find((candidate) => candidate.id === scope.gig_id);
  const sprints = gig ? chippable_sprints(gig, new Date()) : [];

  return (
    <div>
      {/* A dropdown, not a chip per gig (CAP-38): a row of chips grows a
          line per gig on a phone, and a long title wraps inside its pill.
          A native select scales to any number of gigs and opens the phone's
          own picker. Same on_select either way, so the URL is unchanged. */}
      <div className={styles.gig_picker}>
        <Select
          id="diary-gig"
          label="Gig"
          value={scope.gig_id ?? ''}
          on_change={(value) =>
            on_select(value === '' ? ALL_GIGS : { gig_id: value, sprint_id: null })
          }
        >
          <option value="">All gigs</option>
          {gigs.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </Select>
      </div>

      {gig && sprints.length > 0 && (
        <div className={styles.chip_row} role="group" aria-label="Sprint">
          <Chip
            selected={scope.sprint_id === null}
            on_click={() => on_select({ gig_id: gig.id, sprint_id: null })}
          >
            All sprints
          </Chip>
          {sprints.map((sprint) => (
            <Chip
              key={sprint.id}
              selected={scope.sprint_id === sprint.id}
              on_click={() => on_select({ gig_id: gig.id, sprint_id: sprint.id })}
            >
              Sprint {sprint.ordinal}
            </Chip>
          ))}
        </div>
      )}

      {/*
       * The only way into the gig detail screen (CAP-8) from anywhere a
       * student actually goes. It cannot live on a list row: the row is
       * already a Link to a reflection, and a link inside a link is
       * invalid markup and unusable with a screen reader. It cannot live
       * in the nav either, because /gigs/:gig_id needs an id and the nav
       * has no single gig to name. It belongs here because this is where
       * "one gig is in scope" becomes true, and it closes the loop -- the
       * gig screen links into the scoped diary, this comes back.
       *
       * CAP-3's Button rather than a styled link, and "Gig details"
       * rather than a sentence: it is a destination the student chooses,
       * and it sits beside the export Button, which is the same kind of
       * control. Styling an anchor to look like a button would be a
       * second button in the codebase, which is how the two drift. The
       * cost is that it cannot be opened in a new tab -- the same cost
       * the export Button already pays.
       *
       * Absent under "All gigs", which addresses no single gig. A brand
       * new student with nothing written reaches the same screen through
       * NothingWritten below, which has linked there since CAP-7 -- but
       * only while they have written nothing, which is why that link is
       * not enough on its own.
       */}
      {gig && (
        <p className={styles.about_gig}>
          <Button
            variant="secondary"
            full_width={false}
            on_click={() => navigate(`/gigs/${gig.id}`)}
          >
            Gig details
          </Button>
        </p>
      )}
    </div>
  );
}

/**
 * Shaped like the loaded screen, not a spinner: a chip row, the radar, and
 * three list rows, so the layout does not jump when data arrives.
 */
function LoadingState() {
  return (
    <SkeletonGroup label="Loading your diary">
      <div className={styles.chip_row}>
        <Skeleton variant="block" width="var(--space-64)" height="var(--space-32)" />
        <Skeleton variant="block" width="var(--space-64)" height="var(--space-32)" />
      </div>
      <div className={styles.radar_skeleton}>
        <Skeleton variant="circle" width="14rem" height="14rem" />
      </div>
      <ul className={styles.list}>
        {[0, 1, 2].map((row) => (
          <li key={row} className={styles.row}>
            <Skeleton variant="text" lines={2} width="60%" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** Criterion 5: empty says what to do next. */
function NothingWritten({ gigs }: { gigs: Gig[] }) {
  return (
    <div className={styles.empty}>
      <p className={styles.empty_title}>Nothing in your diary yet.</p>
      <p className={styles.empty_body}>
        A reflection belongs to a sprint: you write one short piece per competency, score
        yourself, and someone on the gig scores you back. Open a gig and pick a sprint to
        write your first.
      </p>
      <ul className={styles.empty_gigs}>
        {gigs.map((gig) => (
          <li key={gig.id}>
            <LinkButton to={`/gigs/${gig.id}`} variant="secondary">
              {gig.title}
            </LinkButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotAStudent({ display_name }: { display_name: string | null }) {
  return (
    <div className={styles.empty}>
      <p className={styles.empty_title}>The diary is the student&rsquo;s own record.</p>
      <p className={styles.empty_body}>
        {display_name ? `${display_name}, you are ` : 'You are '}
        not a student on any gig, so there is nothing to show here. The work waiting on you
        is in the review queue.
      </p>
    </div>
  );
}

function NothingInScope() {
  return (
    <div className={styles.empty}>
      <p className={styles.empty_title}>Nothing in this part of your diary.</p>
      <p className={styles.empty_body}>
        You have written reflections elsewhere. Choose a wider scope above to see them.
      </p>
    </div>
  );
}

function ReflectionList({
  rows,
  show_gig,
  gigs,
}: {
  rows: ReflectionSummary[];
  show_gig: boolean;
  gigs: Gig[];
}) {
  return (
    <ul className={styles.list}>
      {rows.map((row) => (
        <ReflectionRow key={row.id} row={row} show_gig={show_gig} gigs={gigs} />
      ))}
    </ul>
  );
}

function ReflectionRow({
  row,
  show_gig,
  gigs,
}: {
  row: ReflectionSummary;
  show_gig: boolean;
  gigs: Gig[];
}) {
  const gig = gigs.find((candidate) => candidate.id === row.gig_id);
  const title = row.sprint_ordinal == null ? 'Whole gig' : `Sprint ${row.sprint_ordinal}`;
  // "Rubric v1" rather than a bare "v1": inside one gig the gig title
  // drops out of this line, and a lone version string left at the front of
  // it reads as a stray number.
  const meta = [
    show_gig ? (gig?.title ?? null) : null,
    `Rubric ${row.framework_version}`,
    when(row),
  ].filter((part): part is string => part !== null);

  return (
    <li>
      <Link className={styles.row} to={`/reflections/${row.id}`}>
        <div className={styles.row_main}>
          <span className={styles.row_title}>{title}</span>
          <span className={styles.row_meta}>{meta.join(' · ')}</span>
        </div>
        {/*
         * Badge and chevron travel together at the right edge. Left as
         * three space-between children, the badge lands mid-row on a wide
         * screen and reads as though it belongs to nothing.
         */}
        <span className={styles.row_end}>
          <Badge status={row.status} />
          {/*
           * The character itself rather than a numeric HTML entity:
           * check-tokens.sh reads one as a raw hex colour and fails the
           * build, which its own header lists as a known false positive.
           */}
          <span className={styles.chevron} aria-hidden="true">
            {'›'}
          </span>
        </span>
      </Link>
    </li>
  );
}

/** "Submitted 29 Aug" once it is in, "Started 17 Aug" while it is a draft. */
function when(row: ReflectionSummary): string {
  const stamp = row.submitted_at ?? row.created_at;
  const label = row.submitted_at ? 'Submitted' : 'Started';
  const date = new Date(stamp).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });

  return `${label} ${date}`;
}
