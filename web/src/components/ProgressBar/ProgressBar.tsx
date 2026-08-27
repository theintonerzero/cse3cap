import styles from './ProgressBar.module.css';

export interface ProgressBarProps {
  current: number;
  total: number;
  /** The noun before the count, e.g. "Competency 3 of 6". */
  label?: string;
}

export function ProgressBar({ current, total, label = 'Competency' }: ProgressBarProps) {
  const clampedTotal = Math.max(total, 1);
  const clampedCurrent = Math.min(Math.max(current, 0), clampedTotal);
  const percent = (clampedCurrent / clampedTotal) * 100;
  const text = `${label} ${clampedCurrent} of ${clampedTotal}`;

  return (
    <div className={styles.wrapper}>
      <span className={styles.text}>{text}</span>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={clampedCurrent}
        aria-valuemin={0}
        aria-valuemax={clampedTotal}
        aria-label={text}
      >
        <div className={styles.fill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
