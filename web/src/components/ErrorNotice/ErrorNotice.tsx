/**
 * The error state every screen ships, rendering an ApiError the client has
 * already unwrapped. Switches on `code` for the four cases that carry
 * distinct meaning and falls back to the envelope's own message otherwise.
 *
 * It deliberately does NOT handle EVIDENCE_REQUIRED or NARRATIVE_REQUIRED.
 * Those carry details.entry_ids, and the entry stepper highlights the
 * offending competencies inline rather than showing a banner.
 */
import { ApiError } from '../../api/client.ts';
import { Button } from '../Button/Button.tsx';
import styles from './ErrorNotice.module.css';

export interface ErrorNoticeProps {
  error: ApiError;
  /** Rendered only when retrying could plausibly help. */
  on_retry?: () => void;
}

interface Copy {
  title: string;
  message: string;
  can_retry: boolean;
}

function copy_for(error: ApiError): Copy {
  // status 0 means the request never reached the API at all, which is the
  // one case where retrying is always worth offering.
  if (error.status === 0) {
    return {
      title: 'Cannot reach the server',
      message: 'Check your connection and try again.',
      can_retry: true,
    };
  }

  switch (error.code) {
    case 'UNAUTHENTICATED':
      return {
        title: 'Your session has ended',
        message: 'Your token is no longer valid. Enter it again to continue.',
        can_retry: false,
      };
    case 'ROLE_FORBIDDEN':
      return {
        title: 'You do not have access to this',
        message: error.message,
        can_retry: false,
      };
    case 'NOT_FOUND':
      return {
        title: 'Not found',
        message: error.message,
        can_retry: false,
      };
    default:
      return {
        title: 'Something went wrong',
        message: error.message,
        can_retry: true,
      };
  }
}

export function ErrorNotice({ error, on_retry }: ErrorNoticeProps) {
  const { title, message, can_retry } = copy_for(error);

  return (
    <div className={styles.notice} role="alert">
      <p className={styles.title}>{title}</p>
      <p className={styles.message}>{message}</p>
      {on_retry && can_retry && (
        <Button variant="secondary" full_width={false} on_click={on_retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
