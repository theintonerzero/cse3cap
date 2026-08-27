import type { ReactNode } from 'react';
import styles from './Chip.module.css';

export interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  on_click?: () => void;
}

export function Chip({
  children,
  selected = false,
  disabled = false,
  on_click,
}: ChipProps) {
  const class_name = selected ? `${styles.chip} ${styles.selected}` : styles.chip;

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
