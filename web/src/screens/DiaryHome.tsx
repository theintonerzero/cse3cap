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
import { Link, useSearchParams } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import type { paths } from '../api/schema.ts';
import {
  Badge,
  BottomSheet,
  Button,
  Chip,
  ErrorNotice,
  RadarPanel,
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
        <h1 className={styles.heading}>Your diary</h1>
        <LoadingState />
      </section>
    );
  }

  if (load.status === 'error') {
    return (
      <section>
        <h1 className={styles.heading}>Your diary</h1>
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
        <h1 className={styles.heading}>Your diary</h1>
        <NotAStudent display_name={me?.display_name ?? null} />
      </section>
    );
  }

  return (
    <section>
      <h1 className={styles.heading}>Your diary</h1>

      <ScopeChips gigs={mine} scope={scope} on_select={go_to} />

      {whole_record.length === 0 ? (
        <NothingWritten gigs={mine} />
      ) : (
        <>
          <ScopedRadar
            key={`${scope.gig_id ?? 'all'}:${scope.sprint_id ?? 'all'}`}
            gig_id={scope.gig_id}
            sprint_id={scope.sprint_id}
            gigs={mine}
          />
          <ReflectionList rows={rows} show_gig={scope.gig_id === null} gigs={mine} />
        </>
      )}

      <div className={styles.export_row}>
        <Button variant="secondary" full_width={false} on_click={() => setExportOpen(true)}>
          Export your record
        </Button>
      </div>

      <BottomSheet
        open={export_open}
        title="Export your record"
        onClose={() => setExportOpen(false)}
      >
        <ExportSheet reflections={whole_record} />
      </BottomSheet>
    </section>
  );
}

/**
 * What the export will contain, and nothing that requests one.
 *
 * CAP-18 owns the format selector, POST /exports, the poll loop with its
 * backoff, and the download -- five states of its own, not four. CAP-7's
 * criterion is that the link opens the sheet, so the button is here and
 * disabled with the ticket on it, the same way ReviewQueue's "Score this"
 * waits for CAP-13.
 *
 * The counts are of the whole record rather than the scope in view: the
 * export is the record, and a sheet that silently exported only the sprint
 * you happened to be filtered to would be the wrong kind of surprise.
 */
function ExportSheet({ reflections }: { reflections: ReflectionSummary[] }) {
  const counted = {
    draft: reflections.filter((row) => row.status === 'draft').length,
    submitted: reflections.filter((row) => row.status === 'submitted').length,
    assessed: reflections.filter((row) => row.status === 'assessed').length,
  };

  return (
    <div className={styles.sheet}>
      <p className={styles.empty_body}>
        Your whole record, every gig and every sprint, as one file. It is yours: it outlives
        the gig, the subject and the degree.
      </p>

      <ul className={styles.sheet_counts}>
        <li>
          {counted.assessed} assessed
          <Badge status="assessed" />
        </li>
        <li>
          {counted.submitted} submitted
          <Badge status="submitted" />
        </li>
        <li>
          {counted.draft} draft
          <Badge status="draft" />
        </li>
      </ul>

      <Button disabled>Request a JSON export</Button>
      <p className={styles.footnote}>
        CAP-18 wires this up, including the poll and the download.
      </p>
    </div>
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

  const counter_role =
    load.radar.axes.find((axis) => axis.counter_role !== null)?.counter_role ?? null;

  return (
    <div className={styles.radar_block}>
      <p className={styles.caption}>{radar_caption(scope, gigs, counter_role)}</p>
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
  const gig = gigs.find((candidate) => candidate.id === scope.gig_id);
  const sprints = gig ? chippable_sprints(gig, new Date()) : [];

  return (
    <div>
      <div className={styles.chip_row} role="group" aria-label="Scope">
        <Chip selected={scope.gig_id === null} on_click={() => on_select(ALL_GIGS)}>
          All gigs
        </Chip>
        {gigs.map((candidate) => (
          <Chip
            key={candidate.id}
            selected={scope.gig_id === candidate.id}
            on_click={() => on_select({ gig_id: candidate.id, sprint_id: null })}
          >
            {candidate.title}
          </Chip>
        ))}
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
            <Link className={styles.empty_link} to={`/gigs/${gig.id}`}>
              {gig.title}
            </Link>
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

function ReflectionList({
  rows,
  show_gig,
  gigs,
}: {
  rows: ReflectionSummary[];
  show_gig: boolean;
  gigs: Gig[];
}) {
  if (rows.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.empty_title}>Nothing in this part of your diary.</p>
        <p className={styles.empty_body}>
          You have written reflections elsewhere. Choose a wider scope above to see them.
        </p>
      </div>
    );
  }

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
  const meta = [
    show_gig ? (gig?.title ?? null) : null,
    row.framework_version,
    when(row),
  ].filter((part): part is string => part !== null);

  return (
    <li>
      <Link className={styles.row} to={`/reflections/${row.id}`}>
        <div className={styles.row_main}>
          <span className={styles.row_title}>{title}</span>
          <span className={styles.row_meta}>{meta.join(' · ')}</span>
        </div>
        <Badge status={row.status} />
        {/*
         * The character itself rather than a numeric HTML entity:
         * check-tokens.sh reads one as a raw hex colour and fails the
         * build, which its own header lists as a known false positive.
         */}
        <span className={styles.chevron} aria-hidden="true">
          {'›'}
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
