import type { ReactNode } from 'react';
import { Link } from 'react-router';

import button_styles from '../Button/Button.module.css';
import styles from './LinkButton.module.css';

export type LinkButtonVariant = 'primary' | 'secondary' | 'quiet';

export interface LinkButtonProps {
  to: string;
  children: ReactNode;
  variant?: LinkButtonVariant;
  full_width?: boolean;
  /** A leading chevron for a way back, hidden from screen readers. */
  back?: boolean;
}

/**
 * A link that looks like a button (CAP-38). Going somewhere is a link's job,
 * so it stays one: screen readers announce a link, middle-click opens a tab.
 * Only the look is Button's. Replaces a Button wrapped in a Link, which nests
 * two interactive elements and gives a keyboard two stops for one action.
 */
export function LinkButton({
  to,
  children,
  variant = 'primary',
  full_width = false,
  back = false,
}: LinkButtonProps) {
  const class_name = [
    button_styles.button,
    variant === 'quiet' ? styles.quiet : button_styles[variant],
    full_width ? button_styles.full_width : null,
    styles.link,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Link className={class_name} to={to}>
      {back && (
        <span className={styles.chevron} aria-hidden="true">
          ‹
        </span>
      )}
      {children}
    </Link>
  );
}
