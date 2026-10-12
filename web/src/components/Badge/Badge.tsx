import type { components } from '../../api/schema.ts';
import styles from './Badge.module.css';

/** The contract's ReflectionStatus, generated. Never hand-write this union. */
export type BadgeStatus = components['schemas']['ReflectionStatus'];

export type BadgeProps =
  | { status: BadgeStatus; kind?: never }
  /** ADR #64: marks text the AI sidecar wrote, so it never reads as the student's own.
   *  `inline` is the mark inside a control that asks the AI, so a person knows
   *  before they press it, and a screen reader hears it in the control's name. */
  | { kind: 'ai'; status?: never; inline?: boolean };

const LABEL: Record<BadgeStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  assessed: 'Assessed',
};

export function Badge(props: BadgeProps) {
  if (props.kind === 'ai') {
    const look = props.inline ? styles.ai_inline : `${styles.badge} ${styles.ai}`;
    return <span className={look}>AI</span>;
  }
  return (
    <span className={`${styles.badge} ${styles[props.status]}`}>{LABEL[props.status]}</span>
  );
}
