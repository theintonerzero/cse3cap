/**
 * What an unknown address renders.
 *
 * Replaces the build-time Placeholder, which told a user "Not built yet" --
 * every screen it stood in for is built. Rendered inside the app shell, so
 * the navigation is still there; the link is the obvious way back.
 */
import { LinkButton } from '../components/index.ts';

import styles from './NotFound.module.css';

export function NotFound() {
  return (
    <section className={styles.not_found}>
      <h1 className={styles.heading}>Page not found</h1>
      <p className={styles.note}>There is nothing at this address.</p>
      {/* A full-size tap target (CAP-57): a 19px text link was the only way
          back, and hard to hit with a thumb. */}
      <div className={styles.home}>
        <LinkButton to="/" variant="secondary">
          Back to the diary
        </LinkButton>
      </div>
    </section>
  );
}
