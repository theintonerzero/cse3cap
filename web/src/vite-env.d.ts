/// <reference types="vite/client" />

/**
 * The environment variables this app reads, declared so they are typed rather
 * than `any`. Vite only exposes variables prefixed `VITE_`.
 *
 * `web/.env` is written by `scripts/setup.sh` and is gitignored.
 */
interface ImportMetaEnv {
  /**
   * Where the API lives, including the version prefix. No trailing slash.
   *
   *   VITE_API_BASE_URL=http://localhost:8000/api/v1   the real backend
   *   VITE_API_BASE_URL=http://localhost:4010          prism mock, no backend
   *
   * Optional here only because the type cannot express "set at runtime"; the
   * client refuses to make a request without it and says so.
   */
  readonly VITE_API_BASE_URL?: string;

  /**
   * A seeded bearer token, for working against the real API before the app
   * shell's token context exists. A development convenience, never a build
   * input: the running app takes its token from the shell, not from here.
   */
  readonly VITE_API_TOKEN?: string;

  /**
   * Demo shell flag (CAP-51). "1" turns on the Alumable-branded sign-in and
   * My Gigs home around the diary. Unset in every production build, where the
   * app is the diary with its own token entry. Demo-only, not product scope
   * (ADR #60).
   */
  readonly VITE_DEMO_SHELL?: string;

  /**
   * Demo personas, as a JSON array of { id, name, role_hint, slot, token }.
   * Lives only in a git-ignored env (web/.env.local), never in committed
   * source or a production bundle. Absent, the welcome falls back to the
   * seeded-token paste.
   */
  readonly VITE_DEMO_TOKENS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
