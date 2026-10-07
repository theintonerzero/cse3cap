/**
 * The Alumable surround chrome (CAP-51, ADR #60).
 *
 * A branded header and a bottom tab bar that frame the demo home, so stepping
 * from it into the diary feels like moving within one app. Only Gigs is real;
 * Chat and Profile are present but disabled, because the demo rebuilds none of
 * Alumable's other features (it is entry + home only). Demo-only.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import logo from './assets/alumable-horizontal.png';
import styles from './AlumableChrome.module.css';

export function AlumableChrome({ children }: { children: ReactNode }) {
  return (
    <div data-brand="alumable" className={styles.frame}>
      <header className={styles.header}>
        <Link to="/home" className={styles.brand}>
          <img src={logo} alt="Alumable logo" className={styles.logo} />
        </Link>
      </header>

      <div className={styles.body}>{children}</div>

      <nav aria-label="Alumable" className={styles.tabs}>
        <Link to="/home" className={`${styles.tab} ${styles.active}`} aria-current="page">
          Gigs
        </Link>
        <button type="button" className={styles.tab} disabled>
          Chat
        </button>
        <button type="button" className={styles.tab} disabled>
          Profile
        </button>
      </nav>
    </div>
  );
}
