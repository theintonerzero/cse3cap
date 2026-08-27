import type { ReactNode } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary';

export interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  type?: 'button' | 'submit';
  disabled?: boolean;
  /** Full width is the default, matching the design. Opt out for a button
   *  sitting inline beside other content, e.g. ErrorNotice's retry. */
  full_width?: boolean;
  on_click?: () => void;
}

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  disabled = false,
  full_width = true,
  on_click,
}: ButtonProps) {
  const class_name = [styles.button, styles[variant], full_width ? styles.full_width : null]
    .filter(Boolean)
    .join(' ');

  return (
    <button type={type} className={class_name} disabled={disabled} onClick={on_click}>
      {children}
    </button>
  );
}
