/**
 * A page's one primary action, floating at the bottom right (CAP-38 R5).
 * Full label at the top of the page; once the page scrolls past 4rem it
 * shrinks to its icon so it stops covering the list, and grows back at the
 * top. The label never leaves the DOM, so the accessible name is constant.
 *
 * A passive scroll listener rather than an IntersectionObserver: a fixed
 * element has no in-flow sentinel of its own.
 */
import { useEffect, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import styles from './FloatingAction.module.css';

export interface FloatingActionProps {
  label: string;
  icon: ReactNode;
  on_click: () => void;
  ref?: Ref<HTMLButtonElement>;
}

function past_threshold(): boolean {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return window.scrollY > rem * 4;
}

export function FloatingAction({ label, icon, on_click, ref }: FloatingActionProps) {
  const [compact, setCompact] = useState(past_threshold);

  useEffect(() => {
    const update = () => setCompact(past_threshold());
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      className={compact ? `${styles.fab} ${styles.compact}` : styles.fab}
      onClick={on_click}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.label}>{label}</span>
    </button>
  );
}
