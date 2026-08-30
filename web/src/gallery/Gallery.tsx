/**
 * The scratch route CAP-3 asks for: every core component, in every state,
 * on one page, so a reviewer sees them at once instead of reading CSS.
 *
 * Open it with `npm run dev` at http://localhost:5173/gallery.html. It is
 * built rather than excluded, so a component that stops compiling fails CI,
 * but nothing in the product links to it.
 */
import { useState, type ReactNode } from 'react';

import { ApiError } from '../api/client.ts';
import {
  Badge,
  Button,
  Card,
  Chip,
  ErrorNotice,
  RadarPanel,
  Skeleton,
  SkeletonGroup,
  type RadarAxis,
} from '../components/index.ts';
import { getStoredTheme, setTheme, type Theme } from '../theme.ts';
import styles from './Gallery.module.css';

// Sourced from db/01-schema.sql's actual seeded rows, not invented. The
// point of these two fixtures is proving axis count and scale both come
// from props -- six axes at 1-4 below, six DIFFERENT axes at 1-7 further
// down -- not simulating unevenness the real SFIA seed does not have yet
// (see db/01-schema.sql's own comment: per-skill narrowing isn't in).
const latrobe_axes: RadarAxis[] = [
  { code: 'contribution', short_label: 'Contrib.', position: 1, self: 3, counter: 2 },
  { code: 'communication', short_label: 'Comms', position: 2, self: 4, counter: 3 },
  { code: 'collaboration', short_label: 'Collab.', position: 3, self: 3, counter: 3 },
  { code: 'agile', short_label: 'Agile', position: 4, self: 2, counter: 2 },
  { code: 'continuous', short_label: 'Cont. imp.', position: 5, self: 3, counter: 4 },
  { code: 'leadership', short_label: 'Leadership', position: 6, self: 2, counter: 1 },
];

const sfia_axes: RadarAxis[] = [
  { code: 'PROG', short_label: 'PROG', position: 1, self: 5, counter: 4 },
  { code: 'DESN', short_label: 'DESN', position: 2, self: 4, counter: 5 },
  { code: 'TEST', short_label: 'TEST', position: 3, self: 6, counter: 5 },
  { code: 'DATM', short_label: 'DATM', position: 4, self: 3, counter: 3 },
  { code: 'RLMT', short_label: 'RLMT', position: 5, self: 5, counter: 6 },
  { code: 'METL', short_label: 'METL', position: 6, self: 4, counter: 4 },
];

// Self scored, counter not yet -- the realistic "insufficient" case.
// RadarPanel draws the self polygon alone with a caption for this one.
// (Zero scores on both series is not shown separately here: RadarPanel
// treats it identically to state="empty" -- see RadarPanel.tsx.)
const insufficient_axes: RadarAxis[] = latrobe_axes.map((a) => ({ ...a, counter: null }));

function initial_theme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{title}</h2>
      <div className={styles.row}>{children}</div>
    </section>
  );
}

export default function Gallery() {
  const [theme, set_theme_state] = useState<Theme>(initial_theme);
  const [scope, set_scope] = useState('all');

  function toggle_theme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    set_theme_state(next);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Core components</h1>
        <button
          className={styles.toggle}
          onClick={toggle_theme}
          aria-pressed={theme === 'dark'}
        >
          {theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
        </button>
      </header>
      <Section title="Badge">
        <Badge status="draft" />
        <Badge status="submitted" />
        <Badge status="assessed" />
      </Section>
      <Section title="Card">
        <Card>Plain surface</Card>
        <Card accent="peach">Peach</Card>
        <Card accent="mint">Mint</Card>
        <Card accent="cream">Cream</Card>
        <Card accent="coral">Coral</Card>
        <Card accent="pink">Pink</Card>
        <Card accent="lavender">Lavender</Card>
        <Card accent="evidence">Evidence</Card>
      </Section>
      <Section title="Chip">
        <Chip selected={scope === 'all'} on_click={() => set_scope('all')}>
          All gigs
        </Chip>
        <Chip selected={scope === 'latrobe'} on_click={() => set_scope('latrobe')}>
          La Trobe
        </Chip>
        <Chip selected={scope === 'audit'} on_click={() => set_scope('audit')}>
          Data migration audit
        </Chip>
        <Chip disabled>Sprint 3 (disabled)</Chip>
      </Section>
      <Section title="Button">
        <div className={styles.column}>
          <Button>Submit reflection</Button>
          <Button variant="secondary">Back</Button>
          <Button disabled>Submitting…</Button>
          <Button variant="secondary" disabled>
            Back (disabled)
          </Button>
          <Button full_width={false}>Inline width</Button>
        </div>
      </Section>
      <Section title="Skeleton">
        <div className={styles.stack}>
          <Skeleton />
          <Skeleton variant="text" lines={3} />
          <Skeleton variant="block" />
          <Skeleton variant="circle" />
          <Skeleton variant="text" width="40%" />
          <SkeletonGroup label="Loading your diary">
            <Card>
              <Skeleton variant="text" width="60%" />
              <Skeleton variant="text" lines={2} />
            </Card>
          </SkeletonGroup>
        </div>
      </Section>
      <Section title="ErrorNotice">
        <div className={styles.stack}>
          <ErrorNotice
            error={new ApiError(0, null, 'The request never reached the API.')}
            on_retry={() => undefined}
          />
          <ErrorNotice
            error={new ApiError(401, 'UNAUTHENTICATED', 'Bearer token missing or invalid.')}
            on_retry={() => undefined}
          />
          <ErrorNotice
            error={
              new ApiError(403, 'ROLE_FORBIDDEN', 'You are not an assessor on this gig.')
            }
          />
          <ErrorNotice
            error={new ApiError(404, 'NOT_FOUND', 'That reflection does not exist.')}
          />
          <ErrorNotice
            error={
              new ApiError(409, 'NOT_DRAFT', 'This reflection has already been submitted.')
            }
            on_retry={() => undefined}
          />
          <ErrorNotice
            error={new ApiError(500, null, 'The API answered outside the error envelope.')}
          />
        </div>
      </Section>
      <Section title="RadarPanel">
        <div className={styles.stack}>
          <RadarPanel state="loading" />
          <RadarPanel
            state="error"
            error={new ApiError(500, null, 'The API answered outside the error envelope.')}
          />
          <RadarPanel state="empty" />
          <RadarPanel state="loaded" scale={{ min: 1, max: 4 }} axes={insufficient_axes} />
          <RadarPanel state="loaded" scale={{ min: 1, max: 4 }} axes={latrobe_axes} />
          <RadarPanel state="loaded" scale={{ min: 1, max: 7 }} axes={sfia_axes} />
        </div>
      </Section>
    </main>
  );
}
