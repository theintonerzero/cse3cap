/**
 * The session, as every screen sees it.
 *
 * Split from SessionProvider.tsx so a consumer importing the hook does not
 * pull the provider's module graph in with it, and so the two do not have to
 * import each other.
 */
import { createContext, useContext } from 'react';

import type { ApiError } from '../api/client.ts';
import type { components } from '../api/schema.ts';
import type { SlotId, TokenSlots } from './tokens.ts';

/** Straight from the contract. Never hand-written. */
export type SessionUser = components['schemas']['Me'];

/**
 * The shell's four states, which are the same four every screen ships.
 *
 *   no_token  nothing usable is stored. The token entry state
 *   loading   a token is stored and GET /auth/me has not answered yet
 *   error     it answered with something other than a 401
 *   ready     `me` is populated
 *
 * A 401 is not one of these: it resolves to `no_token`, because that is
 * exactly what a 401 means here and criterion 5 says so.
 */
export type SessionState = 'no_token' | 'loading' | 'error' | 'ready';

export interface Session {
  state: SessionState;
  /** Populated only when `state` is `ready`. */
  me: SessionUser | null;
  /** Populated only when `state` is `error`. */
  error: ApiError | null;
  /** Which slots have a token pasted in, for the switcher to render. */
  slots: TokenSlots;
  active_slot: SlotId | null;
  /** Store a token in a slot, make it active, and resolve it. */
  sign_in_with: (slot: SlotId, token: string) => void;
  /** Make an already-filled slot active and resolve it. */
  switch_to: (slot: SlotId) => void;
  /** Forget the active token. What a 401 does, and what the header offers. */
  sign_out: () => void;
  /** Try GET /auth/me again after an error that was not a 401. */
  retry: () => void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);

  if (!session) {
    throw new Error('useSession was called outside <SessionProvider>. Wrap the app in it.');
  }

  return session;
}
