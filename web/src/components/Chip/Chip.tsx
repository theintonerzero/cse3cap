import type { ReactNode } from 'react';
import styles from './Chip.module.css';

export interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  on_click?: () => void;
  /**
   * Whose answer a selected chip is. `primary` (the default) is the
   * student's purple; `counter` is the assessor's green, the same colour the
   * radar draws the counter-score in, so green means the assessor everywhere.
   */
  tone?: 'primary' | 'counter';
}

export function Chip({
  children,
  selected = false,
  disabled = false,
  on_click,
  tone = 'primary',
}: ChipProps) {
  const selected_class = tone === 'counter' ? styles.selected_counter : styles.selected;
  const class_name = selected ? `${styles.chip} ${selected_class}` : styles.chip;

  return (
    <button
      type="button"
      className={class_name}
      aria-pressed={selected}
      disabled={disabled}
      onClick={on_click}
    >
      {children}
    </button>
  );
}
