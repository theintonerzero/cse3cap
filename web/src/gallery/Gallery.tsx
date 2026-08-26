/**
 * The scratch route CAP-3 asks for: every core component, in every state,
 * on one page, so a reviewer sees them at once instead of reading CSS.
 *
 * Open it with `npm run dev` at http://localhost:5173/gallery.html. It is
 * built rather than excluded, so a component that stops compiling fails CI,
 * but nothing in the product links to it.
 */
import { useState, type ReactNode } from 'react';

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
    </main>
  );
}
