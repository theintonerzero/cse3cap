import type { ReactNode } from 'react';

import styles from './Select.module.css';

export interface SelectProps {
  id: string;
  label: string;
  value: string;
  on_change: (value: string) => void;
  /** The `<option>` and `<optgroup>` elements, as a native select takes them. */
  children: ReactNode;
  disabled?: boolean;
  /** Keep the label for screen readers but not on screen. */
  hide_label?: boolean;
}

/**
 * A native select with a visible label (CAP-38). Native on purpose: a phone
 * opens its own picker, and the keyboard and screen-reader behaviour come
 * free. Lifted from Edit Framework's "Based on" field so there is one
 * dropdown look, not two.
 */
export function Select({
  id,
  label,
  value,
  on_change,
  children,
  disabled = false,
  hide_label = false,
}: SelectProps) {
  return (
    <div className={styles.field}>
      <label className={hide_label ? styles.hidden_label : styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.wrap}>
        <select
          id={id}
          className={styles.select}
          value={value}
          disabled={disabled}
          onChange={(event) => on_change(event.target.value)}
        >
          {children}
        </select>
        <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
}
