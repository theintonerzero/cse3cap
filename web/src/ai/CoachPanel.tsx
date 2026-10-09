import { useEffect, useId, useRef, useState } from 'react';

import { ai, ApiError } from '../api/client.ts';
import { Badge, Button, Skeleton, SkeletonGroup } from '../components/index.ts';
import styles from './CoachPanel.module.css';

/** The sidecar's own floor (ai/sidecar/routes_coach.py): under this, nothing is asked. */
const MIN_WORDS = 15;

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; questions: string[] }
  | { kind: 'error'; message: string };

export interface CoachPanelProps {
  reflection_id: string;
  entry_id: string;
  narrative: string;
  /** The narrative as Laravel last saved it, which is what the sidecar reads. */
  saved_narrative: string;
}

function refusal(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Questions aren’t available right now';
  if (error.code === 'AI_RATE_LIMITED')
    return 'You’ve asked a lot just now. Try again in a minute.';
  const reason = (error.details as { reason?: unknown } | null)?.reason;
  if (error.code === 'VALIDATION_FAILED' && reason === 'too_short') {
    return 'Write a few sentences first.';
  }
  return 'Questions aren’t available right now';
}

/**
 * The reflection coach (ADR #64): two or three questions about a draft, on
 * request. It shows text only and offers no way to put words into the
 * narrative. Mounted per competency, so a reply that arrives after the
 * student has moved on is dropped with the panel it was asked from.
 */
export function CoachPanel({
  reflection_id,
  entry_id,
  narrative,
  saved_narrative,
}: CoachPanelProps) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const inflight = useRef<AbortController | null>(null);
  const hint_id = useId();
  const title_id = useId();
  const too_short = narrative.trim().split(/\s+/).filter(Boolean).length < MIN_WORDS;
  // Asking before the save lands would ask about the old text.
  const unsaved = narrative !== saved_narrative;

  useEffect(() => () => inflight.current?.abort(), []);

  function ask() {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setState({ kind: 'loading' });
    ai.post('/reflections/{reflection_id}/entries/{entry_id}/coach', {
      path: { reflection_id, entry_id },
      signal: controller.signal,
    })
      .then((reply) => {
        if (!controller.signal.aborted)
          setState({ kind: 'loaded', questions: reply.questions });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'error', message: refusal(error) });
      });
  }

  if (state.kind === 'loading') {
    return (
      <div className={styles.inset}>
        <SkeletonGroup label="Finding questions">
          <Skeleton variant="text" lines={3} />
        </SkeletonGroup>
      </div>
    );
  }

  if (state.kind === 'loaded') {
    return (
      <section className={styles.inset} aria-labelledby={title_id}>
        <div className={styles.head}>
          <p className={styles.title} id={title_id}>
            Questions to think about
          </p>
          <Badge kind="ai" />
        </div>
        <ul className={styles.questions}>
          {state.questions.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" full_width={false} on_click={ask}>
            Ask again
          </Button>
          <Button
            variant="secondary"
            size="sm"
            full_width={false}
            on_click={() => setState({ kind: 'idle' })}
          >
            Hide
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.ask}>
      <Button
        variant="secondary"
        size="sm"
        full_width={false}
        disabled={too_short || unsaved}
        described_by={too_short ? hint_id : undefined}
        on_click={ask}
      >
        Ask me questions
      </Button>
      {too_short && (
        <p className={styles.hint} id={hint_id}>
          Write a few sentences first
        </p>
      )}
      {state.kind === 'error' && (
        <p className={styles.error} role="status">
          {state.message}
        </p>
      )}
    </div>
  );
}
