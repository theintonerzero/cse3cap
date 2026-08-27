import type { components } from '../../api/schema.ts';
import styles from './Badge.module.css';

/** The contract's ReflectionStatus, generated. Never hand-write this union. */
export type BadgeStatus = components['schemas']['ReflectionStatus'];

export interface BadgeProps {
  status: BadgeStatus;
}

const LABEL: Record<BadgeStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  assessed: 'Assessed',
};

export function Badge({ status }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[status]}`}>{LABEL[status]}</span>;
}
