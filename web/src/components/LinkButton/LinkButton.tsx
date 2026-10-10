import type { ReactNode, Ref } from 'react';
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
  /** Button's small size (CAP-38 round 3). The default renders as before. */
  size?: 'md' | 'sm';
  /**
   * A file to save rather than a page to open (CAP-56): renders a plain
   * <a href download> to `to` (a blob: URL), named this. The user's own click
   * starts the download, which every browser honours, in a frame or not.
   */
  download?: string;
  ref?: Ref<HTMLAnchorElement>;
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
  size = 'md',
  download,
  ref,
}: LinkButtonProps) {
  const class_name = [
    button_styles.button,
    variant === 'quiet' ? styles.quiet : button_styles[variant],
    size === 'sm' ? button_styles.sm : null,
    full_width ? button_styles.full_width : null,
    styles.link,
  ]
    .filter(Boolean)
    .join(' ');

  const chevron = back && (
    <span className={styles.chevron} aria-hidden="true">
      ‹
    </span>
  );

  if (download !== undefined) {
    return (
      <a className={class_name} href={to} download={download} ref={ref}>
        {chevron}
        {children}
      </a>
    );
  }

  return (
    <Link className={class_name} to={to} ref={ref}>
      {chevron}
      {children}
    </Link>
  );
}
