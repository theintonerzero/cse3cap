import type { ReactNode, Ref } from 'react';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary';
export type ButtonSize = 'md' | 'sm';

export interface ButtonProps {
  children: ReactNode;
  variant?: ButtonVariant;
  /** `sm` sits beside a form control at the same height, with small text. */
  size?: ButtonSize;
  type?: 'button' | 'submit';
  disabled?: boolean;
  /** Full width is the default, matching the design. Opt out for a button
   *  sitting inline beside other content, e.g. ErrorNotice's retry. */
  full_width?: boolean;
  on_click?: () => void;
  /** For moving focus to a button that appeared after a state change. */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
  full_width = true,
  on_click,
  ref,
}: ButtonProps) {
  const class_name = [
    styles.button,
    styles[variant],
    size === 'sm' ? styles.sm : null,
    full_width ? styles.full_width : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      ref={ref}
      type={type}
      className={class_name}
      disabled={disabled}
      onClick={on_click}
    >
      {children}
    </button>
  );
}
