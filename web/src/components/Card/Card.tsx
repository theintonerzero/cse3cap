import type { ReactNode } from 'react';
import styles from './Card.module.css';

/**
 * One of CAP-1's decorative --color-accent-* tints.
 *
 * Decorative is the operative word: never encode status in an accent. A
 * reflection's state is a Badge, which uses semantic tokens.
 */
export type CardAccent =
  'peach' | 'mint' | 'cream' | 'coral' | 'pink' | 'lavender' | 'evidence';

export interface CardProps {
  children: ReactNode;
  accent?: CardAccent;
}

export function Card({ children, accent }: CardProps) {
  const class_name = accent ? `${styles.card} ${styles[accent]}` : styles.card;
  return <div className={class_name}>{children}</div>;
}
