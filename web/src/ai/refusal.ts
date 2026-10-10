import { ApiError } from '../api/client.ts';

/** What most refusals from the sidecar say: busy, or not available. */
export function default_refusal(error: unknown): string {
  if (error instanceof ApiError && error.code === 'AI_RATE_LIMITED') {
    return 'You’ve asked a lot just now. Try again in a minute.';
  }
  return 'Questions aren’t available right now';
}
