import { ai } from '../api/client.ts';
import { QuestionsPanel } from './QuestionsPanel.tsx';

export interface CalibrationPanelProps {
  reflection_id: string;
  entry_id: string;
  /** Who gave the counter-score the student's differs from. Shown, never sent to Claude. */
  reviewer_name: string;
}

/**
 * The calibration coach (ADR #64): on an assessed reflection, where the
 * student and their reviewer chose different levels, questions about why
 * they might see it differently. Only after assessment, so it cannot
 * influence a self-score, and never saying who is right.
 */
export function CalibrationPanel({
  reflection_id,
  entry_id,
  reviewer_name,
}: CalibrationPanelProps) {
  return (
    <QuestionsPanel
      title={`Why might you and ${reviewer_name} see this differently?`}
      ask_label="Think about the difference"
      ask={(signal) =>
        ai.post('/reflections/{reflection_id}/entries/{entry_id}/calibration', {
          path: { reflection_id, entry_id },
          signal,
        })
      }
    />
  );
}
