/**
 * What a route renders until its ticket is built.
 *
 * Names the screen and the ticket that will replace it, so an unbuilt route
 * is obviously unbuilt rather than looking like a broken one. Every one of
 * these is deleted by the ticket named on it.
 */
import styles from './Placeholder.module.css';

export interface PlaceholderProps {
  screen: string;
  ticket: string;
}

export function Placeholder({ screen, ticket }: PlaceholderProps) {
  return (
    <section className={styles.placeholder}>
      <h1 className={styles.heading}>{screen}</h1>
      <p className={styles.note}>Not built yet. {ticket} replaces this.</p>
    </section>
  );
}
