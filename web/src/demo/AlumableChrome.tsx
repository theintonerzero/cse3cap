/**
 * The Alumable surround chrome (CAP-51, ADR #60).
 *
 * A branded header and a bottom tab bar that frame the demo home, so stepping
 * from it into the diary feels like moving within one app. Only Gigs is real;
 * Chat and Profile are present but disabled, because the demo rebuilds none of
 * Alumable's other features (it is entry + home only). Demo-only.
 *
 * The header names who is signed in and offers Switch profile, which goes
 * back to the Alumable sign-in. The demo moves between four people, and Jane
 * and Noor share the student token slot, so the sign-in's named cards are the
 * only switcher that can tell them apart.
 */
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

import { useSession } from '../session/useSession.ts';
import logo from './assets/alumable-horizontal.png';
import styles from './AlumableChrome.module.css';

export function AlumableChrome({ children }: { children: ReactNode }) {
  const { me, leave } = useSession();
  const navigate = useNavigate();

  function switch_profile() {
    leave();
    navigate('/welcome');
  }

  return (
    <div data-brand="alumable" className={styles.frame}>
      <header className={styles.header}>
        <Link to="/home" className={styles.brand}>
          <img src={logo} alt="Alumable logo" className={styles.logo} />
        </Link>
        {me && (
          <div className={styles.who}>
            <span className={styles.name}>{me.display_name}</span>
            <button type="button" className={styles.switch} onClick={switch_profile}>
              Switch profile
            </button>
          </div>
        )}
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
