import type { components } from '../../api/schema.ts';
import styles from './Badge.module.css';

/** The contract's ReflectionStatus, generated. Never hand-write this union. */
export type BadgeStatus = components['schemas']['ReflectionStatus'];

export type BadgeProps =
  | { status: BadgeStatus; kind?: never }
  /** ADR #64: marks text the AI sidecar wrote, so it never reads as the student's own. */
  | { kind: 'ai'; status?: never };

const LABEL: Record<BadgeStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  assessed: 'Assessed',
};

export function Badge(props: BadgeProps) {
  if (props.kind === 'ai') {
    return <span className={`${styles.badge} ${styles.ai}`}>AI</span>;
  }
  return (
    <span className={`${styles.badge} ${styles[props.status]}`}>{LABEL[props.status]}</span>
  );
}
