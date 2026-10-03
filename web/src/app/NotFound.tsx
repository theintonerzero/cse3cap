/**
 * What an unknown address renders.
 *
 * Replaces the build-time Placeholder, which told a user "Not built yet" --
 * every screen it stood in for is built. Rendered inside the app shell, so
 * the navigation is still there; the link is the obvious way back.
 */
import { Link } from 'react-router';

import styles from './NotFound.module.css';

export function NotFound() {
  return (
    <section className={styles.not_found}>
      <h1 className={styles.heading}>Page not found</h1>
      <p className={styles.note}>There is nothing at this address.</p>
      <Link className={styles.home} to="/">
        Back to the diary
      </Link>
    </section>
  );
}
