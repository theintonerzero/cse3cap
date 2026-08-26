/**
 * The loading primitive for every screen in the product. No spinners: a
 * skeleton matching the shape of what is coming tells the user something,
 * and a spinner tells them nothing.
 *
 * Two pieces, and screens want both:
 *
 *   <SkeletonGroup>            the accessibility, once
 *     <Skeleton variant="text" lines={3} />
 *     <Skeleton variant="block" />
 *   </SkeletonGroup>
 *
 * Every Skeleton is aria-hidden, because a screen reader should hear
 * "Loading" once from the group rather than a description of each bar.
 */
import type { CSSProperties, ReactNode } from 'react';
import styles from './Skeleton.module.css';

export type SkeletonVariant = 'text' | 'block' | 'circle';

export interface SkeletonProps {
  variant?: SkeletonVariant;
  /** Number of bars, for `text` only. The last is drawn short, the way a
   *  real paragraph ends. */
  lines?: number;
  /**
   * A CSS length: a percentage, `ch`, `em`, `rem`, or a `var(--space-*)`.
   *
   * NEVER `px`. scripts/check-tokens.sh fails the build on any pixel value
   * outside tokens.css, and it reads .tsx as well as .css, so a pixel width
   * passed here breaks CI rather than merely breaking the convention.
   */
  width?: string;
  /** As `width`. Defaults come from the variant, so most callers pass none. */
  height?: string;
}

export interface SkeletonGroupProps {
  children: ReactNode;
  /** Announced while the region is busy. */
  label?: string;
}

export function Skeleton({ variant = 'text', lines = 1, width, height }: SkeletonProps) {
  const style: CSSProperties = {};
  if (width) style.width = width;
  if (height) style.height = height;

  if (variant === 'text' && lines > 1) {
    return (
      <div className={styles.lines} aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => (
          <span
            key={index}
            className={`${styles.skeleton} ${styles.text}`}
            style={{ ...style, width: index === lines - 1 ? '60%' : style.width }}
          />
        ))}
      </div>
    );
  }

  return (
    <span
      className={`${styles.skeleton} ${styles[variant]}`}
      style={style}
      aria-hidden="true"
    />
  );
}

export function SkeletonGroup({ children, label = 'Loading' }: SkeletonGroupProps) {
  return (
    <div role="status" aria-busy="true">
      <span className={styles.sr_only}>{label}</span>
      {children}
    </div>
  );
}
