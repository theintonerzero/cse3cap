/**
 * The export sheet: the student's record leaving the system.
 *
 * Mounted inside the diary home's BottomSheet. Five states, not four,
 * and they are the sheet's own rather than the diary's:
 *
 *   idle      the selector and a summary of what the file will hold
 *   empty     nothing to export yet, so nothing to request
 *   building  requested; polling GET /exports/{id} on a backoff. Its own
 *             block with a live status, not the loading skeleton: the
 *             record is already loaded, what is in progress is the file
 *   ready     the job is complete, download it
 *   failed    an ApiError, a job the server marked failed, or a poll that
 *             gave up. Each says why in words, and offers to start again
 *
 * Every call goes through client.ts. The schedule that decides when to
 * poll next and when to stop lives in export-poll.ts, which is React-free
 * so verify-export-sheet.sh can compile and run it.
 *
 * The counts are of the whole record rather than the scope in view: the
 * export is the record, and a sheet that silently exported only the sprint
 * you happened to be filtered to would be the wrong kind of surprise.
 */
import { useEffect, useState } from 'react';

import { api, ApiError } from '../api/client.ts';
import type { paths } from '../api/schema.ts';
import { Badge, Button, Chip, ErrorNotice } from '../components/index.ts';
import type { ReflectionSummary } from './diary-scope.ts';
import {
  download_name,
  GIVE_UP_MESSAGE,
  next_delay_ms,
  should_give_up,
} from './export-poll.ts';
import styles from './ExportSheet.module.css';

type Export = paths['/exports']['post']['responses']['202']['content']['application/json'];
type Format = Export['format'];

type Job =
  | { status: 'idle' }
  | { status: 'building'; export_id: string; format: Format; polls: number }
  | { status: 'ready'; job: Export; downloading: boolean }
  | { status: 'failed'; error: ApiError | null; message: string };

export interface ExportSheetProps {
  reflections: ReflectionSummary[];
  /** Polling stops the moment the sheet closes. */
  open: boolean;
}

const FORMAT_COPY: Record<Format, string> = {
  pdf: 'A PDF: every reflection on its own page, with both score sets, the framework version it was scored against, and the radar.',
  json: 'JSON: the same record as data, for another system to read.',
};

/** The shape every failed call in this sheet ends up in. */
function as_api_error(error: unknown, fallback: string): ApiError {
  return error instanceof ApiError ? error : new ApiError(0, null, fallback);
}

/** summary is untyped in the contract, so read a count only if it is one. */
function count(summary: Export['summary'], key: string): number | null {
  const value = summary?.[key];
  return typeof value === 'number' ? value : null;
}

export function ExportSheet({ reflections, open }: ExportSheetProps) {
  const [format, setFormat] = useState<Format>('pdf');
  const [job, setJob] = useState<Job>({ status: 'idle' });

  const empty = reflections.length === 0;
  const busy = job.status === 'building' || (job.status === 'ready' && job.downloading);

  async function request() {
    try {
      const created = await api.post('/exports', { body: { format } });
      // On a sync queue the job has already run and the 202 says so.
      setJob(
        created.status === 'complete'
          ? { status: 'ready', job: created, downloading: false }
          : created.status === 'failed'
            ? failed_job()
            : { status: 'building', export_id: created.id, format, polls: 0 },
      );
    } catch (error) {
      setJob({
        status: 'failed',
        error: as_api_error(error, 'The export could not be requested.'),
        message: '',
      });
    }
  }

  // The poll. One timer per attempt; the effect re-runs as `polls` climbs,
  // so each delay is decided by export-poll.ts rather than a fixed interval.
  useEffect(() => {
    if (job.status !== 'building' || !open) return;

    const attempt = job.polls + 1;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const polled = await api.get('/exports/{export_id}', {
          path: { export_id: job.export_id },
        });
        if (cancelled) return;
        if (polled.status === 'complete') {
          setJob({ status: 'ready', job: polled, downloading: false });
        } else if (polled.status === 'failed') {
          setJob(failed_job());
        } else if (should_give_up(attempt + 1)) {
          // Still pending after the last poll the schedule allows.
          setJob({ status: 'failed', error: null, message: GIVE_UP_MESSAGE });
        } else {
          setJob({ ...job, polls: attempt });
        }
      } catch (error) {
        if (cancelled) return;
        setJob({
          status: 'failed',
          error: as_api_error(error, 'Lost track of the export.'),
          message: '',
        });
      }
    }, next_delay_ms(attempt));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [job, open]);

  async function download() {
    if (job.status !== 'ready') return;
    setJob({ ...job, downloading: true });
    try {
      const file = await api.blob('/exports/{export_id}/download', {
        path: { export_id: job.job.id },
      });
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = download_name(job.job.id, job.job.format);
      anchor.click();
      URL.revokeObjectURL(url);
      setJob({ ...job, downloading: false });
    } catch (error) {
      setJob({
        status: 'failed',
        error: as_api_error(error, 'The file could not be downloaded.'),
        message: '',
      });
    }
  }

  return (
    <div className={styles.sheet}>
      <p className={styles.lead}>
        Your whole record, every gig and every sprint, as one file. It is yours: it outlives
        the gig, the subject and the degree.
      </p>

      <Summary reflections={reflections} />

      {empty && (
        <p className={styles.empty}>
          Nothing to export yet. Your first reflection is what starts the record.
        </p>
      )}

      {!empty && job.status !== 'ready' && job.status !== 'failed' && (
        <>
          <div className={styles.formats} role="group" aria-label="Format">
            <Chip
              selected={format === 'pdf'}
              disabled={busy}
              on_click={() => setFormat('pdf')}
            >
              PDF
            </Chip>
            <Chip
              selected={format === 'json'}
              disabled={busy}
              on_click={() => setFormat('json')}
            >
              JSON
            </Chip>
          </div>
          <p className={styles.format_copy}>{FORMAT_COPY[format]}</p>
        </>
      )}

      {!empty && job.status === 'idle' && (
        <Button on_click={request}>Request a {format.toUpperCase()} export</Button>
      )}

      {job.status === 'building' && (
        <div className={styles.building} role="status" aria-live="polite">
          <span className={styles.pulse} aria-hidden="true" />
          <div>
            <p className={styles.building_title}>
              Building your {job.format.toUpperCase()}
            </p>
            <p className={styles.building_detail}>
              {job.polls === 0
                ? 'Requested. Checking shortly.'
                : `Still building. Checked ${job.polls} ${job.polls === 1 ? 'time' : 'times'}.`}
            </p>
          </div>
        </div>
      )}

      {job.status === 'ready' && (
        <div className={styles.ready}>
          <p className={styles.ready_title}>Your {job.job.format.toUpperCase()} is ready</p>
          <JobSummary job={job.job} />
          <Button on_click={download} disabled={job.downloading}>
            {job.downloading ? 'Downloading' : 'Download'}
          </Button>
          <button
            type="button"
            className={styles.link}
            onClick={() => setJob({ status: 'idle' })}
          >
            Request another
          </button>
        </div>
      )}

      {job.status === 'failed' && (
        <div className={styles.failed}>
          {job.error ? (
            <ErrorNotice error={job.error} />
          ) : (
            <p className={styles.failed_message} role="alert">
              {job.message}
            </p>
          )}
          <Button variant="secondary" on_click={() => setJob({ status: 'idle' })}>
            Start again
          </Button>
        </div>
      )}
    </div>
  );
}

function failed_job(): Job {
  return {
    status: 'failed',
    error: null,
    message: 'The export failed to build. Nothing was saved; request another.',
  };
}

/** What the export will hold: the record's counts by status. */
function Summary({ reflections }: { reflections: ReflectionSummary[] }) {
  const counted = {
    assessed: reflections.filter((row) => row.status === 'assessed').length,
    submitted: reflections.filter((row) => row.status === 'submitted').length,
    draft: reflections.filter((row) => row.status === 'draft').length,
  };

  return (
    <ul className={styles.counts}>
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
  );
}

/** What actually went into the file, as the server counted it. */
function JobSummary({ job }: { job: Export }) {
  const parts = [
    [count(job.summary, 'reflections'), 'reflections'],
    [count(job.summary, 'sprints'), 'sprints'],
    [count(job.summary, 'scores'), 'scores'],
    [count(job.summary, 'files'), 'evidence items'],
  ].filter((pair): pair is [number, string] => pair[0] !== null);

  if (parts.length === 0) return null;

  return (
    <p className={styles.job_summary}>
      {parts.map(([n, label]) => `${n} ${label}`).join(' · ')}
    </p>
  );
}
