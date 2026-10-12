/**
 * Your learning record (CAP-53, Figma 86:936): the student's whole record
 * as one competency by sprint table per gig, self/assessor in each cell.
 *
 * Every number is GET /me/progress's, which reads v_radar and so
 * v_entry_score, where "the latest counter-score counts" lives. Nothing
 * here chooses among scores. Rows come from the gig's framework rather
 * than from progress, so a competency nothing has scored yet still has its
 * row; the framework also carries the scale the section's legend names.
 *
 * Reads only: GET /gigs and /reflections, then per gig in the record
 * /me/progress and /frameworks/{id}. Two requests per gig is the cost of
 * adding no endpoint (see the ADR CAP-53 added).
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import type { components, paths } from '../api/schema.ts';
import {
  BottomSheet,
  Button,
  ErrorNotice,
  Skeleton,
  SkeletonGroup,
} from '../components/index.ts';
import {
  reflections_in_scope,
  student_gigs,
  type Gig,
  type ReflectionSummary,
} from './diary-scope.ts';
import { ExportSheet } from './ExportSheet.tsx';
import { by_ordinal, format_full_date } from './gig-timing.ts';
import styles from './LearningRecord.module.css';

type Progress =
  paths['/me/progress']['get']['responses']['200']['content']['application/json'];
type FrameworkDetail = components['schemas']['FrameworkDetail'];

interface RecordSection {
  gig: Gig;
  framework: FrameworkDetail;
  progress: Progress;
  reflections: ReflectionSummary[];
}

type Load =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'not_student' }
  | {
      status: 'loaded';
      sections: RecordSection[];
      record: ReflectionSummary[];
    };

export function LearningRecord() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [reload_key, setReloadKey] = useState(0);
  const [export_open, setExportOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    async function read(): Promise<Load> {
      const [gigs, reflections] = await Promise.all([
        api.get('/gigs', { signal }),
        api.get('/reflections', { signal }),
      ]);
      const mine = student_gigs(gigs);
      if (mine.length === 0) return { status: 'not_student' };

      // The student's own, as the diary home decides it: a reflection
      // returned to them as a reviewer on another gig is not theirs.
      const record = reflections_in_scope(reflections, gigs, {
        gig_id: null,
        sprint_id: null,
      });
      const written = mine.filter(
        (gig) => gig.framework !== null && record.some((row) => row.gig_id === gig.id),
      );

      const sections = await Promise.all(
        written.map(async (gig): Promise<RecordSection> => {
          const [progress, framework] = await Promise.all([
            api.get('/me/progress', { query: { gig_id: gig.id }, signal }),
            api.get('/frameworks/{framework_id}', {
              path: { framework_id: gig.framework!.id },
              signal,
            }),
          ]);
          return {
            gig,
            framework,
            progress,
            reflections: record.filter((row) => row.gig_id === gig.id),
          };
        }),
      );

      return { status: 'loaded', sections, record };
    }

    read()
      .then(setLoad)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoad({
          status: 'error',
          error:
            error instanceof ApiError
              ? error
              : new ApiError(0, null, 'Something went wrong loading your record.'),
        });
      });

    return () => controller.abort();
  }, [reload_key]);

  const retry = useCallback(() => {
    setLoad({ status: 'loading' });
    setReloadKey((key) => key + 1);
  }, []);

  if (load.status === 'loading') return <LoadingState />;

  if (load.status === 'error') {
    return (
      <section className={styles.page}>
        <h1 className={styles.heading}>Your learning record</h1>
        <ErrorNotice error={load.error} on_retry={retry} />
      </section>
    );
  }

  if (load.status === 'not_student') {
    return (
      <section className={styles.page}>
        <h1 className={styles.heading}>Your learning record</h1>
        <div className={styles.empty}>
          <p className={styles.empty_title}>The diary is the student&rsquo;s own record.</p>
          <p className={styles.empty_body}>
            You are not a student on any gig, so there is no record to show here.
          </p>
        </div>
      </section>
    );
  }

  if (load.sections.length === 0) {
    return (
      <section className={styles.page}>
        <h1 className={styles.heading}>Your learning record</h1>
        <div className={styles.empty}>
          <p className={styles.empty_title}>
            Your record starts with your first reflection.
          </p>
          <p className={styles.empty_body}>
            Each sprint you reflect on adds a column of self and assessor scores here.
          </p>
          <Link className={styles.empty_link} to="/">
            Back to your diary
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.heading}>Your learning record</h1>
        <Summary sections={load.sections} />
      </div>
      {/* CAP-70: the one place an export starts, at the top rather than
          under every gig. */}
      <section className={styles.keep} aria-label="Keep your record">
        <p className={styles.keep_text}>Yours to keep. Export it whenever you like.</p>
        <Button on_click={() => setExportOpen(true)}>
          <DownloadIcon />
          Export your record
        </Button>
        <p className={styles.keep_hint}>
          A PDF to read and share, or JSON for another system.
        </p>
      </section>
      {load.sections.map((section) => (
        <RecordTable key={section.gig.id} section={section} />
      ))}
      <p className={styles.note}>
        Scores from different rubrics aren&rsquo;t compared. Each section uses its own
        scale.
      </p>
      <BottomSheet
        open={export_open}
        title="Export your record"
        onClose={() => setExportOpen(false)}
      >
        <ExportSheet reflections={load.record} />
      </BottomSheet>
    </section>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * "3 reflections · 2 gigs · 2 rubrics · since 3 August 2026". Counted from
 * the sections, so the numbers describe what is on the page (CAP-62).
 */
function Summary({ sections }: { sections: RecordSection[] }) {
  const reflections = sections.reduce(
    (count, section) => count + section.reflections.length,
    0,
  );
  const rubrics = new Set(sections.map((section) => section.framework.id)).size;
  const starts = sections
    .map((section) => section.gig.starts_on)
    .filter((date): date is string => date !== null)
    .sort();

  return (
    <p className={styles.summary}>
      {plural(reflections, 'reflection', 'reflections')} ·{' '}
      {plural(sections.length, 'gig', 'gigs')} · {plural(rubrics, 'rubric', 'rubrics')}
      {starts.length > 0 && ` · since ${format_full_date(starts[0])}`}
    </p>
  );
}

const STATUS_LABEL: Record<ReflectionSummary['status'], string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  assessed: 'Assessed',
};

/**
 * One gig: a heading over its rubric and scale, then the table. Each sprint's
 * column says where that sprint's reflection stands (CAP-70); a cell is the
 * student's level beside the assessor's, from progress, "–" for a missing
 * half and "–" alone for a sprint with no reflection. A real table, so a
 * screen reader can move by row and column, and each cell is read as a
 * sentence rather than "3 slash 4".
 */
function RecordTable({ section }: { section: RecordSection }) {
  const { gig, framework, progress, reflections } = section;
  const sprints = by_ordinal(gig.sprints);
  const competencies = [...framework.competencies].sort((a, b) => a.position - b.position);
  const series = new Map(progress.competencies.map((row) => [row.code, row.series]));
  const status_of = new Map(reflections.map((r) => [r.sprint_ordinal, r.status]));
  const heading_id = `record-${gig.id}`;
  const opens =
    reflections.length === 1
      ? 'Open the reflection ›'
      : `Open the ${reflections.length} reflections ›`;

  return (
    <section className={styles.section} aria-labelledby={heading_id}>
      <div className={styles.section_head}>
        <h2 id={heading_id} className={styles.gig_title}>
          {gig.title}
        </h2>
        <p className={styles.rubric}>
          {framework.name} · levels {framework.scale.min}–{framework.scale.max}
        </p>
      </div>
      <div className={styles.card}>
        <div className={styles.legend}>
          <span className={styles.keys}>
            <span className={styles.key}>
              <span className={`${styles.dot} ${styles.dot_self}`} aria-hidden="true" />
              You
            </span>
            <span className={styles.key}>
              <span className={`${styles.dot} ${styles.dot_counter}`} aria-hidden="true" />
              Assessor
            </span>
          </span>
          <span className={styles.scale}>– not yet</span>
        </div>
        {/* Focusable and named (CAP-62): Safari does not focus a scroll box
            on its own, so without this a wide table cannot be scrolled from
            the keyboard. */}
        <div
          className={styles.scroller}
          tabIndex={0}
          role="region"
          aria-label={`${gig.title}, scores by sprint`}
        >
          <table className={styles.table}>
            <caption className={styles.sr_only}>{gig.title}</caption>
            <thead>
              <tr>
                <th scope="col" className={styles.col_competency}>
                  Competency
                </th>
                {sprints.map((sprint) => {
                  const status = status_of.get(sprint.ordinal);
                  return (
                    <th
                      key={sprint.id}
                      scope="col"
                      aria-label={
                        status
                          ? `Sprint ${sprint.ordinal}, ${status}`
                          : `Sprint ${sprint.ordinal}`
                      }
                    >
                      <span className={styles.sprint_head}>
                        <span className={styles.sprint_no}>S{sprint.ordinal}</span>
                        {status && (
                          <span className={`${styles.status} ${styles[status]}`}>
                            {STATUS_LABEL[status]}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {competencies.map((competency) => {
                const points = series.get(competency.code) ?? [];
                return (
                  <tr key={competency.id}>
                    <th scope="row" className={styles.row_label}>
                      {competency.short_label ?? competency.name}
                    </th>
                    {sprints.map((sprint) => {
                      const point = points.find((p) => p.sprint_ordinal === sprint.ordinal);
                      return (
                        <td key={sprint.id} className={styles.cell}>
                          <Cell
                            self={point?.self ?? null}
                            counter={point?.counter ?? null}
                            found={point !== undefined}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Link className={styles.open_link} to={`/?gig_id=${gig.id}`}>
          {opens}
        </Link>
      </div>
    </section>
  );
}

function Cell({
  self,
  counter,
  found,
}: {
  self: number | null;
  counter: number | null;
  found: boolean;
}) {
  if (!found || (self === null && counter === null)) {
    return (
      <>
        <span aria-hidden="true">–</span>
        <span className={styles.sr_only}>not yet</span>
      </>
    );
  }
  return (
    <>
      <span aria-hidden="true">
        <span className={self === null ? styles.missing : styles.self}>{self ?? '–'}</span>
        <span className={styles.slash}>/</span>
        <span className={counter === null ? styles.missing : styles.counter}>
          {counter ?? '–'}
        </span>
      </span>
      <span className={styles.sr_only}>
        {`You: ${self === null ? 'not yet' : `level ${self}`}, assessor: ${
          counter === null ? 'not yet' : `level ${counter}`
        }`}
      </span>
    </>
  );
}

/** An arrow into a tray. */
function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="1.25rem" height="1.25rem" aria-hidden="true">
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

/** Shaped like the loaded screen: the heading, the keep panel and two sections. */
function LoadingState() {
  return (
    <section className={styles.page}>
      <SkeletonGroup label="Loading your learning record">
        <div className={styles.head}>
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="80%" />
        </div>
        <div className={styles.keep}>
          <Skeleton variant="text" lines={1} />
          <Skeleton variant="block" height="var(--size-fab)" />
        </div>
        {[0, 1].map((n) => (
          <div key={n} className={styles.card}>
            <Skeleton variant="block" height="var(--space-64)" />
            <Skeleton variant="text" lines={4} />
          </div>
        ))}
      </SkeletonGroup>
    </section>
  );
}
