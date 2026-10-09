import { useEffect, useId, useRef, useState } from 'react';

import { Badge, Button, Skeleton, SkeletonGroup } from '../components/index.ts';
import styles from './QuestionsPanel.module.css';
import { default_refusal } from './refusal.ts';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; questions: string[] }
  | { kind: 'error'; message: string };

export interface QuestionsPanelProps {
  /** Heads the questions once they arrive, and names their region. */
  title: string;
  /** The quiet button that asks. Nothing is asked until it is pressed. */
  ask_label: string;
  ask: (signal: AbortSignal) => Promise<{ questions: string[] }>;
  disabled?: boolean;
  /** Says why the button is disabled, when it is. */
  hint?: string | null;
  /** The sentence an error shows. */
  refusal?: (error: unknown) => string;
}

/**
 * Questions from the sidecar (ADR #64), on request, as plain text with the AI
 * badge: idle, loading, loaded and error. Shared by the reflection coach and
 * the calibration coach, which differ in what they ask and when they may.
 * Mounted per competency, so a reply that arrives after the student has
 * moved on is dropped with the panel it was asked from.
 */
export function QuestionsPanel({
  title,
  ask_label,
  ask,
  disabled = false,
  hint = null,
  refusal = default_refusal,
}: QuestionsPanelProps) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const inflight = useRef<AbortController | null>(null);
  const hint_id = useId();
  const title_id = useId();

  useEffect(() => () => inflight.current?.abort(), []);

  function run() {
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    setState({ kind: 'loading' });
    ask(controller.signal)
      .then((reply) => {
        if (!controller.signal.aborted)
          setState({ kind: 'loaded', questions: reply.questions });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
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
            {title}
          </p>
          <Badge kind="ai" />
        </div>
        <ul className={styles.questions}>
          {/* By position: the same question can come back twice. */}
          {state.questions.map((question, index) => (
            <li key={index}>{question}</li>
          ))}
        </ul>
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" full_width={false} on_click={run}>
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
        disabled={disabled}
        described_by={hint ? hint_id : undefined}
        on_click={run}
      >
        {ask_label}
      </Button>
      {hint && (
        <p className={styles.hint} id={hint_id}>
          {hint}
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
