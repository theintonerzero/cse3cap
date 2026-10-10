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
   *  real paragraph ends. Clamped to at least 1, so 0 or a negative value
   *  cannot lie about how many bars appear. */
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

  const line_count = Math.max(1, lines);

  if (variant === 'text' && line_count > 1) {
    return (
      <span className={styles.lines} aria-hidden="true">
        {Array.from({ length: line_count }, (_, index) => (
          <span
            key={index}
            className={`${styles.skeleton} ${styles.text}`}
            // The short last line is a DEFAULT for the ragged end of a real
            // paragraph, not an override: a caller-supplied width wins on
            // every line, including the last.
            style={{
              ...style,
              width: width ?? (index === line_count - 1 ? '60%' : undefined),
            }}
          />
        ))}
      </span>
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
  // No aria-busy: it tells assistive tech to withhold the region's content
  // until busy flips back to false, and this group never flips it -- it
  // unmounts when loading finishes. Left on, it can suppress the very
  // "Loading" announcement role="status" exists to make.
  return (
    <div role="status">
      <span className={styles.sr_only}>{label}</span>
      {children}
    </div>
  );
}
