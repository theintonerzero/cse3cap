/**
 * A page's one primary action, floating at the bottom right (CAP-38 R5).
 * Full label at the top of the page; once the page scrolls past 4rem it
 * shrinks to its icon so it stops covering the list, and grows back at the
 * top. The label never leaves the DOM, so the accessible name is constant.
 *
 * A passive scroll listener rather than an IntersectionObserver: a fixed
 * element has no in-flow sentinel of its own.
 *
 * An action is a button (`on_click`); a destination is a link (`to`), so it
 * is announced and opened as one (CAP-70: the diary's opens the record).
 */
import { useEffect, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { Link } from 'react-router';
import styles from './FloatingAction.module.css';

export type FloatingActionProps = {
  label: string;
  icon: ReactNode;
} & (
  | { on_click: () => void; to?: never; ref?: Ref<HTMLButtonElement> }
  | { to: string; on_click?: never; ref?: never }
);

function past_threshold(): boolean {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return window.scrollY > rem * 4;
}

export function FloatingAction(props: FloatingActionProps) {
  const { label, icon } = props;
  const [compact, setCompact] = useState(past_threshold);

  useEffect(() => {
    const update = () => setCompact(past_threshold());
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  const class_name = compact ? `${styles.fab} ${styles.compact}` : styles.fab;
  const content = (
    <>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.label}>{label}</span>
    </>
  );

  if (props.to !== undefined) {
    return (
      <Link to={props.to} className={class_name}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={props.ref} type="button" className={class_name} onClick={props.on_click}>
      {content}
    </button>
  );
}
