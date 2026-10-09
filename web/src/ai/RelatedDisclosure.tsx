import { useEffect, useId, useState } from 'react';

import { ai, api } from '../api/client.ts';
import type { components as aiComponents } from '../api/ai-schema.ts';
import { BottomSheet, Skeleton, SkeletonGroup } from '../components/index.ts';
import styles from './RelatedDisclosure.module.css';

type Related = aiComponents['schemas']['RelatedEntries']['entries'][number];

type Earlier =
  { kind: 'loading' } | { kind: 'loaded'; narrative: string } | { kind: 'error' };

export interface RelatedDisclosureProps {
  reflection_id: string;
  entry_id: string;
  /** Changes each time the narrative is saved, so the list follows what was written. */
  saved: number;
}

const heading = (row: Related) => `Sprint ${row.sprint_ordinal} · ${row.competency_name}`;

/**
 * Similar past reflections (ADR #64): the student's own earlier entries that
 * read like this one, collapsed under the narrative. Optional by design, so
 * nothing found and nothing reachable look the same: no disclosure at all.
 * A row opens the earlier entry read-only in a sheet; closing it hands focus
 * back to the row, and the stepper never moves.
 */
export function RelatedDisclosure({
  reflection_id,
  entry_id,
  saved,
}: RelatedDisclosureProps) {
  const [rows, setRows] = useState<Related[] | null>(null);
  const [first_done, setFirstDone] = useState(false);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<Related | null>(null);
  const [earlier, setEarlier] = useState<Earlier>({ kind: 'loading' });
  const list_id = useId();

  useEffect(() => {
    const controller = new AbortController();
    ai.get('/reflections/{reflection_id}/entries/{entry_id}/related', {
      path: { reflection_id, entry_id },
      signal: controller.signal,
    })
      .then((reply) => setRows(reply.entries))
      // An error keeps whatever was found before: it is a suggestion, not a field.
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setFirstDone(true);
      });
    return () => controller.abort();
  }, [reflection_id, entry_id, saved]);

  useEffect(() => {
    if (!shown) return;
    const controller = new AbortController();
    api
      .get('/reflections/{reflection_id}', {
        path: { reflection_id: shown.reflection_id },
        signal: controller.signal,
      })
      .then((reflection) => {
        const entry = reflection.entries.find(
          (candidate) => candidate.id === shown.entry_id,
        );
        setEarlier(
          entry ? { kind: 'loaded', narrative: entry.narrative ?? '' } : { kind: 'error' },
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setEarlier({ kind: 'error' });
      });
    return () => controller.abort();
  }, [shown]);

  function show(row: Related) {
    setEarlier({ kind: 'loading' });
    setShown(row);
  }

  if (!first_done) {
    return (
      <div className={styles.related}>
        <SkeletonGroup label="Looking for earlier reflections">
          <Skeleton variant="text" lines={1} />
        </SkeletonGroup>
      </div>
    );
  }

  if (!rows || rows.length === 0) return null;

  return (
    <div className={styles.related}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={list_id}
        onClick={() => setOpen((was) => !was)}
      >
        <svg
          className={styles.chevron}
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" />
        </svg>
        From your earlier sprints ({rows.length})
      </button>
      <ul className={styles.rows} id={list_id} hidden={!open}>
        {rows.map((row) => (
          <li key={row.entry_id}>
            <button type="button" className={styles.row} onClick={() => show(row)}>
              <span className={styles.row_head}>{heading(row)}</span>
              <span className={styles.excerpt}>{row.excerpt}</span>
            </button>
          </li>
        ))}
      </ul>

      <BottomSheet
        open={shown !== null}
        title={shown ? heading(shown) : undefined}
        onClose={() => setShown(null)}
      >
        {earlier.kind === 'loading' && (
          <SkeletonGroup label="Loading that reflection">
            <Skeleton variant="text" lines={4} />
          </SkeletonGroup>
        )}
        {earlier.kind === 'loaded' && <p className={styles.earlier}>{earlier.narrative}</p>}
        {earlier.kind === 'error' && (
          <p className={styles.earlier_error} role="status">
            That reflection couldn’t be opened just now.
          </p>
        )}
      </BottomSheet>
    </div>
  );
}
