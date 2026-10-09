import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';

import { ai, ApiError } from '../api/client.ts';
import type { components as aiComponents } from '../api/ai-schema.ts';
import { Badge, Button, Chip, Skeleton, SkeletonGroup } from '../components/index.ts';
import { useSession } from '../session/useSession.ts';
import styles from './CohortSearch.module.css';
import { reviewed_gigs, type ReviewedGig } from './reviewed-gigs.ts';

type Result = aiComponents['schemas']['SearchResults']['results'][number];

type Search =
  | { kind: 'idle' }
  | { kind: 'loading'; q: string }
  | { kind: 'loaded'; q: string; results: Result[] }
  | { kind: 'error'; q: string; message: string };

export interface CohortSearchProps {
  /** Whether the sidecar serves recurring themes as well as search. */
  themes: boolean;
}

/**
 * Cohort search and recurring themes (ADR #64), at the top of the review
 * queue. Search by meaning across the submitted and assessed reflections on
 * the gigs this person reviews; a row opens the reviewer's stepper at the
 * competency it matched. Asked on submit, never per keystroke. With nothing
 * searched, a few recurring themes per gig, each one a search.
 */
export function CohortSearch({ themes }: CohortSearchProps) {
  const { me } = useSession();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<Search>({ kind: 'idle' });
  const inflight = useRef<AbortController | null>(null);
  const field_id = useId();
  const gigs = reviewed_gigs(me);

  useEffect(() => () => inflight.current?.abort(), []);

  function run(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setSearch({ kind: 'loading', q: trimmed });
    ai.get('/search', { query: { q: trimmed }, signal: controller.signal })
      .then((reply) => {
        if (!controller.signal.aborted)
          setSearch({ kind: 'loaded', q: trimmed, results: reply.results });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const busy = error instanceof ApiError && error.code === 'AI_RATE_LIMITED';
        setSearch({
          kind: 'error',
          q: trimmed,
          message: busy
            ? 'You’ve searched a lot just now. Try again in a minute.'
            : 'Search isn’t available right now',
        });
      });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    run(query);
  }

  function clear() {
    inflight.current?.abort();
    setQuery('');
    setSearch({ kind: 'idle' });
  }

  function choose(theme: string) {
    setQuery(theme);
    run(theme);
  }

  return (
    <section className={styles.panel} aria-labelledby={`${field_id}-label`}>
      <form role="search" className={styles.form} onSubmit={submit}>
        <div className={styles.label_row}>
          <label id={`${field_id}-label`} className={styles.label} htmlFor={field_id}>
            Search reflections by meaning
          </label>
          <Badge kind="ai" />
        </div>
        <div className={styles.field_row}>
          <input
            id={field_id}
            className={styles.input}
            type="search"
            value={query}
            maxLength={200}
            placeholder="e.g. raising blockers"
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="submit" full_width={false} disabled={!query.trim()}>
            Search
          </Button>
        </div>
      </form>

      {search.kind === 'idle' && themes && gigs.length > 0 && (
        <div className={styles.themes}>
          {gigs.map((gig) => (
            <ThemeRow key={gig.gig_id} gig={gig} on_choose={choose} />
          ))}
        </div>
      )}

      {search.kind !== 'idle' && (
        <div className={styles.results}>
          <div className={styles.results_head}>
            {search.kind === 'loaded' && search.results.length > 0 && (
              <p className={styles.count}>
                {search.results.length === 1
                  ? '1 entry'
                  : `${search.results.length} entries`}{' '}
                for “{search.q}”
              </p>
            )}
            <Button variant="secondary" size="sm" full_width={false} on_click={clear}>
              Clear
            </Button>
          </div>
          {search.kind === 'loading' && (
            <SkeletonGroup label="Searching reflections">
              <ul className={styles.list}>
                {[0, 1, 2].map((n) => (
                  <li key={n} className={styles.skeleton_row}>
                    <Skeleton variant="text" lines={3} />
                  </li>
                ))}
              </ul>
            </SkeletonGroup>
          )}
          {search.kind === 'loaded' && search.results.length === 0 && (
            <p className={styles.note}>Nothing matches that yet. Try other words.</p>
          )}
          {search.kind === 'loaded' && search.results.length > 0 && (
            <ul className={styles.list}>
              {search.results.map((result) => (
                <ResultRow key={result.entry_id} result={result} />
              ))}
            </ul>
          )}
          {search.kind === 'error' && (
            <p className={styles.note} role="status">
              {search.message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ResultRow({ result }: { result: Result }) {
  const sprint = result.sprint_ordinal != null ? ` · Sprint ${result.sprint_ordinal}` : '';
  return (
    <li>
      <Link
        className={styles.row}
        to={`/review-queue/reflections/${result.reflection_id}?entry=${result.entry_id}`}
      >
        <span className={styles.row_head}>
          <span className={styles.student}>{result.student_name}</span>
          <span className={styles.meta}>
            {' '}
            · {result.gig_title}
            {sprint}
          </span>
        </span>
        <span className={styles.competency}>{result.competency_name}</span>
        <span className={styles.excerpt}>{result.excerpt}</span>
      </Link>
    </li>
  );
}

type Themes = { kind: 'loading' } | { kind: 'loaded'; themes: string[] } | { kind: 'gone' };

/**
 * One gig's recurring themes. Optional, like similar reflections: none found
 * and none reachable both leave no row.
 */
function ThemeRow({
  gig,
  on_choose,
}: {
  gig: ReviewedGig;
  on_choose: (theme: string) => void;
}) {
  const [state, setState] = useState<Themes>({ kind: 'loading' });
  const label = `Recurring themes, ${gig.gig_title}`;

  useEffect(() => {
    const controller = new AbortController();
    ai.get('/gigs/{gig_id}/themes', {
      path: { gig_id: gig.gig_id },
      signal: controller.signal,
    })
      .then((reply) => setState({ kind: 'loaded', themes: reply.themes }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ kind: 'gone' });
      });
    return () => controller.abort();
  }, [gig.gig_id]);

  if (state.kind === 'loading') {
    return (
      <SkeletonGroup label="Finding themes">
        <div className={styles.chip_skeletons}>
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} variant="block" width="8rem" height="2.75rem" />
          ))}
        </div>
      </SkeletonGroup>
    );
  }
  if (state.kind === 'gone' || state.themes.length === 0) return null;

  return (
    <div className={styles.theme_row} role="group" aria-label={label}>
      <p className={styles.theme_label}>
        Recurring themes <span className={styles.meta}>· {gig.gig_title}</span>
      </p>
      <div className={styles.chips}>
        {state.themes.map((theme) => (
          <Chip key={theme} on_click={() => on_choose(theme)}>
            {theme}
          </Chip>
        ))}
      </div>
    </div>
  );
}
