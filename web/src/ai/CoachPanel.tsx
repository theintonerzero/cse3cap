import { ai, ApiError } from '../api/client.ts';
import { QuestionsPanel } from './QuestionsPanel.tsx';
import { default_refusal } from './refusal.ts';

/** The sidecar's own floor (ai/sidecar/routes_coach.py): under this, nothing is asked. */
const MIN_WORDS = 15;

export interface CoachPanelProps {
  reflection_id: string;
  entry_id: string;
  narrative: string;
  /** The narrative as Laravel last saved it, which is what the sidecar reads. */
  saved_narrative: string;
}

function refusal(error: unknown): string {
  const reason =
    error instanceof ApiError
      ? (error.details as { reason?: unknown } | null)?.reason
      : undefined;
  if (
    error instanceof ApiError &&
    error.code === 'VALIDATION_FAILED' &&
    reason === 'too_short'
  ) {
    return 'Write a few sentences first.';
  }
  return default_refusal(error);
}

/**
 * The reflection coach (ADR #64): two or three questions about a draft, on
 * request. It shows text only and offers no way to put words into the
 * narrative.
 */
export function CoachPanel({
  reflection_id,
  entry_id,
  narrative,
  saved_narrative,
}: CoachPanelProps) {
  const too_short = narrative.trim().split(/\s+/).filter(Boolean).length < MIN_WORDS;
  // Asking before the save lands would ask about the old text.
  const unsaved = narrative !== saved_narrative;
  return (
    <QuestionsPanel
      title="Questions to think about"
      ask_label="Ask me questions"
      ask={(signal) =>
        ai.post('/reflections/{reflection_id}/entries/{entry_id}/coach', {
          path: { reflection_id, entry_id },
          signal,
        })
      }
      disabled={too_short || unsaved}
      hint={too_short ? 'Write a few sentences first' : null}
      refusal={refusal}
    />
  );
}
