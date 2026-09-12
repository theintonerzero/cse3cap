/**
 * The only thing in this codebase that calls setAuthToken.
 *
 * It holds the bearer token, calls GET /auth/me exactly once per token on
 * boot, and exposes the user (acceptance criterion 2). Screens read the
 * result through useSession and never touch the token themselves -- see
 * /add-screen, "The app shell owns it and calls setAuthToken(token) once. A
 * screen never touches it."
 *
 * What comes back is the caller's participations: which gigs they are on and
 * what role they hold on each. That is the only role information the client
 * has, it arrives per gig rather than globally, and it is resolved
 * server-side from gig_participants. The client never decides a role itself
 * (criterion 3).
 *
 * "Once on boot" means once per token, not once per render: the effect below
 * depends on the token and on an explicit retry, and on nothing else. In
 * development you will see two requests on first load, because StrictMode
 * mounts every component twice on purpose to surface exactly this kind of
 * bug. The AbortController means the first is cancelled rather than racing
 * the second, and a production build mounts once. If you see two requests in
 * a production build, that is a real defect; two in `npm run dev` is not.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, ApiError, setAuthToken, setOnUnauthorized } from '../api/client.ts';
import {
  clear_active_token,
  get_active_slot,
  get_active_token,
  get_slots,
  set_active_slot,
  set_slot_token,
  type SlotId,
  type TokenSlots,
} from './tokens.ts';
import {
  SessionContext,
  type Session,
  type SessionState,
  type SessionUser,
} from './useSession.ts';

export function SessionProvider({ children }: { children: ReactNode }) {
  // Read once on mount rather than on every render: sessionStorage is
  // synchronous and cheap, but a render-time read makes the first paint
  // depend on storage being available, and it can refuse.
  const [slots, setSlots] = useState<TokenSlots>(() => get_slots());
  const [active_slot, setActiveSlotState] = useState<SlotId | null>(() => get_active_slot());
  const [token, setToken] = useState<string | null>(() => get_active_token());

  const [state, setState] = useState<SessionState>(() =>
    get_active_token() ? 'loading' : 'no_token',
  );
  const [me, setMe] = useState<SessionUser | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [retry_key, setRetryKey] = useState(0);

  const forget = useCallback(() => {
    clear_active_token();
    setAuthToken(null);
    setSlots(get_slots());
    setActiveSlotState(null);
    setToken(null);
    setMe(null);
    setError(null);
    setState('no_token');
  }, []);

  // A 401 from any request in the app, not just this one. `forget` is a
  // useCallback with an empty dependency array over stable references
  // (module-level imports and useState setters), so its identity never
  // changes and this effect only ever runs once. Registered directly rather
  // than through a ref: cleanup and the next setup run back-to-back with no
  // await between them, so there is no gap for an in-flight request to
  // observe the module variable as null. Unregistering on unmount just stops
  // a dead provider from being called.
  useEffect(() => {
    setOnUnauthorized(forget);
    return () => setOnUnauthorized(null);
  }, [forget]);

  // One call per token. `token` and `retry_key` are the only things that
  // should cause another: not a re-render, not a route change.
  useEffect(() => {
    setAuthToken(token);

    if (!token) {
      setState('no_token');
      setMe(null);
      setError(null);
      return;
    }

    const controller = new AbortController();

    setState('loading');
    setError(null);

    api
      .get('/auth/me', { signal: controller.signal })
      .then((user) => {
        setMe(user);
        setState('ready');
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;

        // A 401 has already been handled: the client fired onUnauthorized
        // before throwing, so `forget` has run and the state is no_token.
        // Rendering an error over the top of that would be wrong -- the
        // token entry state IS the answer to a 401.
        if (cause instanceof ApiError && cause.status === 401) return;

        setError(
          cause instanceof ApiError
            ? cause
            : new ApiError(0, null, 'Something went wrong signing you in.'),
        );
        setState('error');
      });

    return () => controller.abort();
  }, [token, retry_key]);

  const sign_in_with = useCallback((slot: SlotId, value: string) => {
    set_slot_token(slot, value);
    set_active_slot(slot);
    setSlots(get_slots());
    setActiveSlotState(slot);
    setToken(get_active_token());
  }, []);

  const switch_to = useCallback((slot: SlotId) => {
    set_active_slot(slot);
    setActiveSlotState(slot);
    setToken(get_active_token());
  }, []);

  const retry = useCallback(() => setRetryKey((key) => key + 1), []);

  const value = useMemo<Session>(
    () => ({
      state,
      me,
      error,
      slots,
      active_slot,
      sign_in_with,
      switch_to,
      sign_out: forget,
      retry,
    }),
    [state, me, error, slots, active_slot, sign_in_with, switch_to, forget, retry],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
