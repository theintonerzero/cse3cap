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
  BottomSheet,
  Button,
  Card,
  Chip,
  ErrorNotice,
  ProgressBar,
  Skeleton,
  SkeletonGroup,
  TextArea,
} from '../components/index.ts';
import { getStoredTheme, setTheme, type Theme } from '../theme.ts';
import styles from './Gallery.module.css';

function initial_theme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/* TextArea saves through a promise the caller supplies. There is no API
   behind the gallery, so these are timers: long enough that "Saving…" is
   actually readable before it resolves, rather than a flicker. */
function save_succeeds(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 900));
}

function save_fails(): Promise<void> {
  return new Promise((_resolve, reject) => setTimeout(reject, 900));
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
  const [narrative, set_narrative] = useState('');
  const [unsaved_narrative, set_unsaved_narrative] = useState('');
  const [sheet_open, set_sheet_open] = useState(false);

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
      <Section title="TextArea">
        <div className={styles.stack}>
          <TextArea
            label="What did you do this sprint?"
            placeholder="Describe the work, not the feelings about it."
            value={narrative}
            onChange={set_narrative}
            onSave={save_succeeds}
          />
          <TextArea
            label="A save that fails"
            placeholder="Type here to watch the status go to 'Could not save'."
            value={unsaved_narrative}
            onChange={set_unsaved_narrative}
            onSave={save_fails}
          />
          <TextArea
            label="Disabled, as it is in assessor mode"
            value="The student's narrative, read only to the assessor."
            onChange={() => undefined}
            onSave={save_succeeds}
            disabled
          />
        </div>
      </Section>
      <Section title="ProgressBar">
        <div className={styles.stack}>
          <ProgressBar current={0} total={6} />
          <ProgressBar current={3} total={6} />
          <ProgressBar current={6} total={6} />
          <ProgressBar current={2} total={6} label="Entries" />
        </div>
      </Section>
      <Section title="BottomSheet">
        <div className={styles.column}>
          <Button full_width={false} on_click={() => set_sheet_open(true)}>
            Open the sheet
          </Button>
        </div>
        <BottomSheet
          open={sheet_open}
          onClose={() => set_sheet_open(false)}
          title="Sprint 2 history"
        >
          <div className={styles.stack}>
            <Card accent="mint">
              <Badge status="assessed" />
              <p>Counter-scored by Dr Lee, 12 August.</p>
            </Card>
            <Card accent="cream">
              <Badge status="submitted" />
              <p>Submitted by Jane N, 9 August.</p>
            </Card>
            <Button variant="secondary" on_click={() => set_sheet_open(false)}>
              Close
            </Button>
          </div>
        </BottomSheet>
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
    </main>
  );
}
