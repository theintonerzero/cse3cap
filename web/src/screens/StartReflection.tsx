/**
 * Starts a reflection on one sprint and opens it in the stepper (CAP-39).
 *
 * Its own file since CAP-53, so the gig page's sprint rows and the diary
 * home's nudge are the one button. Which sprints may be started is not
 * decided here: the server allows any, and GigPolicy::createReflection
 * decides who. The ref, not just the disabled state, stops a double press
 * sending twice, because two clicks can land before React re-renders the
 * button disabled.
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import { Button } from '../components/index.ts';
import styles from './StartReflection.module.css';

const NO_RUBRIC = 'This gig has no rubric yet. Ask your supervisor to assign one.';

export function StartReflection({
  sprint_id,
  on_refresh,
  label = 'Start reflection',
}: {
  sprint_id: string;
  on_refresh: () => void;
  /** What the button says. The nudge names the sprint when it offers one of several. */
  label?: string;
}) {
  const navigate = useNavigate();
  const in_flight = useRef(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (in_flight.current) return;
    in_flight.current = true;
    setStarting(true);
    setError(null);
    try {
      const reflection = await api.post('/reflections', { body: { sprint_id } });
      navigate(`/reflections/${reflection.id}`);
    } catch (caught) {
      if (!(caught instanceof ApiError)) throw caught;
      switch (caught.code) {
        case 'DUPLICATE_REFLECTION':
          // Started somewhere else since this page loaded. Re-reading turns
          // the row (or the nudge) into what is true now.
          on_refresh();
          break;
        case 'FRAMEWORK_NOT_ASSIGNED':
          setError(NO_RUBRIC);
          break;
        default:
          setError(caught.message);
      }
    } finally {
      in_flight.current = false;
      setStarting(false);
    }
  }

  return (
    <div className={styles.start}>
      {/* Small (round 2c): a row action, sized like the diary's Gig
          details beside its picker, not a page's main button. */}
      <Button
        variant="secondary"
        size="sm"
        full_width={false}
        disabled={starting}
        on_click={start}
      >
        {starting ? 'Starting…' : label}
      </Button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
