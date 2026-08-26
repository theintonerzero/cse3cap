/**
 * The scratch route CAP-3 asks for: every core component, in every state,
 * on one page, so a reviewer sees them at once instead of reading CSS.
 *
 * Open it with `npm run dev` at http://localhost:5173/gallery.html. It is
 * built rather than excluded, so a component that stops compiling fails CI,
 * but nothing in the product links to it.
 */
import { useState, type ReactNode } from 'react';

import { Badge, Button, Card, Chip, Skeleton, SkeletonGroup } from '../components/index.ts';
import { getStoredTheme, setTheme, type Theme } from '../theme.ts';
import styles from './Gallery.module.css';

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
        <div className={styles.column}>
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
    </main>
  );
}
