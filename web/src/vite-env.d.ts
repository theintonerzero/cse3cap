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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
