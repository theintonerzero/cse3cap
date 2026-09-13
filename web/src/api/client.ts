/**
 * The typed API client. One fetch wrapper for the whole frontend.
 *
 * Three things it does so that no screen has to:
 *
 * 1. **Types every call from the contract.** `schema.ts` beside this file is
 *    generated from `docs/openapi.yaml` by `npm run gen:types` and is never
 *    edited by hand. The path, its parameters, the request body and the
 *    response all come from the operation, so a contract change that breaks a
 *    screen breaks the build instead of the screen. If the shape you need is
 *    not there, the contract is wrong and the contract is what you fix. See
 *    `docs/Frontend-and-Backend.md`.
 *
 * 2. **Attaches the bearer token and resolves the base URL**, from
 *    `VITE_API_BASE_URL`, so neither is repeated anywhere else. Point that at
 *    `http://localhost:4010` and every screen runs against the prism mock with
 *    no backend and no code change.
 *
 * 3. **Unwraps the error envelope once.** Every non-2xx response in this API is
 *    `{ error: { code, message, details } }`, and every one of them arrives at
 *    the caller as an `ApiError` whose `code` can be switched on. No component
 *    parses a response body.
 *
 * snake_case throughout, matching the database and the JSON. There is no
 * mapping layer here and nobody should add one.
 *
 * The client reflects business rules, it does not hold them. A disabled button
 * is a convenience; the 409 is the rule. The rule map is in `CLAUDE.md`.
 */
import type { components, paths } from './schema.ts';

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

/**
 * Every code the product can return, straight from the contract's enumeration.
 * Switch on this; never on `message`, which is prose meant for a person.
 */
export type ApiErrorCode = components['schemas']['Error']['error']['code'];

/**
 * The envelope's `details` bag. Deliberately untyped in the contract, because
 * what it carries differs per code: the submit gate puts `entry_ids` in it, the
 * framework guard puts `framework_id`. If a screen needs a field in here to be
 * typed, that is a gap in `docs/openapi.yaml`, not something to assert around.
 */
export type ApiErrorDetails = components['schemas']['Error']['error']['details'];

/**
 * What every failed call throws. One type, so a caller writes one catch.
 *
 *   try {
 *     await api.post('/reflections/{reflection_id}/submit', { path: { reflection_id } });
 *   } catch (error) {
 *     if (!(error instanceof ApiError)) throw error;
 *     switch (error.code) {
 *       case 'EVIDENCE_REQUIRED':  highlight(error.details.entry_ids); break;
 *       case 'NOT_DRAFT':          refresh(); break;
 *       default:                   notice(error.message);
 *     }
 *   }
 */
export class ApiError extends Error {
  /** The HTTP status, or 0 when the request never reached the API at all. */
  readonly status: number;

  /**
   * The contract's code, or `null` when the response was not the envelope: a
   * proxy error page, a body that is not JSON, or no response at all. `null`
   * means "off contract", which is a different problem from a rule refusing
   * you, so it is worth being able to tell the two apart.
   */
  readonly code: ApiErrorCode | null;

  readonly details: ApiErrorDetails;

  constructor(
    status: number,
    code: ApiErrorCode | null,
    message: string,
    details: ApiErrorDetails = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Is this the envelope? Checked rather than assumed, because the one case the
 * client cannot afford to guess about is the failure path.
 */
function isErrorEnvelope(value: unknown): value is components['schemas']['Error'] {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;

  const { error } = value as { error: unknown };
  if (typeof error !== 'object' || error === null) return false;

  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === 'string' && typeof message === 'string';
}

async function toApiError(response: Response, url: string): Promise<ApiError> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    // Not JSON. A gateway timeout page, a truncated body, an empty 502.
  }

  if (isErrorEnvelope(payload)) {
    const { code, message, details } = payload.error;
    return new ApiError(response.status, code, message, details ?? {});
  }

  return new ApiError(
    response.status,
    null,
    `${url} answered ${response.status} outside the error envelope.`,
    {},
  );
}

// --------------------------------------------------------------------------
// Configuration
// --------------------------------------------------------------------------

/**
 * Held in the module rather than passed to every call. The app shell owns it:
 * its token context calls `setAuthToken` once, and everything below reads it.
 *
 * `VITE_API_TOKEN` seeds it so the real API can be used before that shell
 * exists. `web/.env` is gitignored, which is the only reason putting a token
 * there is acceptable.
 *
 * **The seed is development-only, and the guard is the point.** Vite replaces
 * `import.meta.env.VITE_API_TOKEN` with a string literal at build time, so
 * without this a bearer token compiles into public JavaScript the moment any
 * shipped code path reads it. Nothing about the running site would look wrong.
 * `import.meta.env.DEV` is statically `false` in a production build, so the
 * whole branch and the value inside it are eliminated before the bundle is
 * written -- the leak becomes impossible rather than forbidden.
 *
 * In production the app shell is the only source of a token, which is what it
 * was always meant to be. Recorded as F1 in `docs/Security-Review.md`, and
 * held in place by `scripts/check-bundle-secrets.sh`.
 */
let authToken: string | null = import.meta.env.DEV
  ? (import.meta.env.VITE_API_TOKEN ?? null)
  : null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

/**
 * What to do when the API says a token is no longer good.
 *
 * Acceptance criterion 5 of CAP-5: "a 401 anywhere clears the token and
 * returns to the token entry state". Anywhere is the point. Every request in
 * this app funnels through `send()` below, so this is the one place that can
 * honour it -- the alternative is every screen remembering to, which is the
 * same as it not happening.
 *
 * The shell's session provider registers this once. Nothing else should.
 */
let onUnauthorized: (() => void) | null = null;

export function setOnUnauthorized(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

function baseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;

  // Thrown at call time rather than on import, so the failure names itself
  // instead of taking the whole bundle down with a blank screen.
  if (!configured) {
    throw new Error(
      'VITE_API_BASE_URL is not set. web/.env needs one line:\n' +
        '  VITE_API_BASE_URL=http://localhost:8000/api/v1\n' +
        'scripts/setup.sh writes it. Restart the dev server after adding it.',
    );
  }

  return configured.replace(/\/+$/, '');
}

// --------------------------------------------------------------------------
// Reading the generated contract
// --------------------------------------------------------------------------
//
// Everything below is type-level only and disappears at build time. It exists
// so that a call names a path that exists, on a verb that path serves, with the
// parameters that operation declares, and gets back what the contract says it
// returns. Get this right once here and no screen has to think about it again.

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** The generated operation for a path and verb. */
type Operation<P extends keyof paths, M extends Method> = paths[P][M & keyof paths[P]];

/**
 * Only the paths that serve this verb. Every generated path carries every verb,
 * with the unsupported ones typed `never`, so `api.post('/auth/me')` has to be
 * ruled out here rather than discovered as a 405.
 */
type PathsWith<M extends Method> = {
  [P in keyof paths]: Operation<P, M> extends { responses: unknown } ? P : never;
}[keyof paths];

/** `never` for a slot the operation does not have; the generated type spells that `?: never`. */
type Present<T> = [Exclude<T, undefined>] extends [never] ? never : Exclude<T, undefined>;

type PathParamsOf<O> = O extends { parameters: { path?: infer T } } ? Present<T> : never;
type QueryParamsOf<O> = O extends { parameters: { query?: infer T } } ? Present<T> : never;

/** Required query, as on `/me/progress`, versus optional, as on `/reflections`. */
type QueryIsRequired<O> = O extends { parameters: { query: object } } ? true : false;

type JsonBodyOf<O> = O extends { requestBody: { content: { 'application/json': infer B } } }
  ? B
  : never;

/** Evidence upload takes either JSON or a file, so the wrapper takes a FormData too. */
type FormBodyOf<O> = O extends {
  requestBody: { content: { 'multipart/form-data': unknown } };
}
  ? FormData
  : never;

type BodyOf<O> = JsonBodyOf<O> | FormBodyOf<O>;

type OkStatus = 200 | 201 | 202 | 203 | 204;

type JsonOf<T> = T extends { content: { 'application/json': infer B } } ? B : void;

/** What a successful call resolves to. `void` for the 204s, which have no body. */
type ResultOf<O> = O extends { responses: infer R }
  ? JsonOf<R[Extract<keyof R, OkStatus>]>
  : never;

type CallOptions = {
  /** Passed to fetch, for a screen that unmounts while a request is in flight. */
  signal?: AbortSignal;
  /** Merged over the client's own headers. Rarely needed. */
  headers?: HeadersInit;
};

// `?: never` rather than omitting the key, so passing something the operation
// does not take is an error rather than an ignored property.
type PathOption<O> = [PathParamsOf<O>] extends [never]
  ? { path?: never }
  : { path: PathParamsOf<O> };

type QueryOption<O> = [QueryParamsOf<O>] extends [never]
  ? { query?: never }
  : QueryIsRequired<O> extends true
    ? { query: QueryParamsOf<O> }
    : { query?: QueryParamsOf<O> };

type BodyOption<O> = [BodyOf<O>] extends [never] ? { body?: never } : { body: BodyOf<O> };

type RequestOptions<O> = PathOption<O> & QueryOption<O> & BodyOption<O> & CallOptions;

type RequiredKeys<T> = {
  [K in keyof T]-?: object extends Pick<T, K> ? never : K;
}[keyof T];

/**
 * The options argument, optional when the operation needs nothing, so
 * `api.get('/auth/me')` reads the way it should and
 * `api.get('/gigs/{gig_id}')` will not compile without its id.
 */
type CallArgs<O> = [RequiredKeys<RequestOptions<O>>] extends [never]
  ? [options?: RequestOptions<O>]
  : [options: RequestOptions<O>];

// --------------------------------------------------------------------------
// The wrapper
// --------------------------------------------------------------------------

/** The shape the runtime works with, once the generics above have done their job. */
type LooseOptions = {
  path?: Record<string, string | number>;
  query?: Record<string, unknown>;
  body?: unknown;
  signal?: AbortSignal;
  headers?: HeadersInit;
};

/**
 * Fills `{gig_id}` from `options.path` and appends the query.
 *
 * A missing path parameter is a mistake in the calling code, not something the
 * API can answer, so it throws a plain Error: it should reach a developer, not
 * an error state a user sees.
 */
function buildUrl(path: string, options: LooseOptions): string {
  const filled = path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = options.path?.[name];

    if (value === undefined || value === null || value === '') {
      throw new Error(`${path} needs a ${name} and did not get one.`);
    }

    return encodeURIComponent(String(value));
  });

  const url = new URL(baseUrl() + filled);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value === undefined || value === null) continue;

    for (const one of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, String(one));
    }
  }

  return url.toString();
}

/**
 * The single request path. Everything public below is sugar over this.
 *
 * Returns the raw Response so the one endpoint that answers with a file can
 * share the token, the base URL and the error handling with everything else.
 */
async function send(
  method: Method,
  path: string,
  options: LooseOptions,
): Promise<Response> {
  const url = buildUrl(path, options);

  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');

  if (authToken) {
    headers.set('Authorization', `Bearer ${authToken}`);
  }

  // FormData sets its own Content-Type, boundary and all. Setting it by hand
  // produces a body the server cannot parse, and the error blames the payload.
  const isForm = options.body instanceof FormData;

  if (options.body !== undefined && !isForm) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: method.toUpperCase(),
      headers,
      body:
        options.body === undefined
          ? undefined
          : isForm
            ? (options.body as FormData)
            : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (cause) {
    // An abort is the caller's own doing. Let it through as itself.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;

    throw new ApiError(
      0,
      null,
      `Could not reach the API at ${url}. Is it running?`,
      {},
      { cause },
    );
  }

  if (!response.ok) {
    const error = await toApiError(response, url);

    // The session is gone. Told before the error is thrown, so the shell has
    // already cleared the token by the time a screen's catch block runs and
    // nothing gets a chance to render half a page as a stranger. The error
    // is still thrown: the caller decides what to show, this only decides
    // who we are.
    if (error.status === 401) onUnauthorized?.();

    throw error;
  }

  return response;
}

/** The same, then the JSON body. Empty bodies, including every 204, give `undefined`. */
async function json(method: Method, path: string, options: LooseOptions): Promise<unknown> {
  const response = await send(method, path, options);
  const text = await response.text();

  if (text === '') return undefined;

  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new ApiError(
      response.status,
      null,
      `The API answered ${response.status} with a body that is not JSON.`,
      {},
      { cause },
    );
  }
}

// The casts live in `call` and in `blob`, and nowhere else. Inside them the path
// is a plain string; outside them it is the contract.
function call<M extends Method, P extends PathsWith<M>>(
  method: M,
  path: P,
  options: RequestOptions<Operation<P, M>> | undefined,
): Promise<ResultOf<Operation<P, M>>> {
  return json(method, path as string, (options ?? {}) as LooseOptions) as Promise<
    ResultOf<Operation<P, M>>
  >;
}

function get<P extends PathsWith<'get'>>(path: P, ...args: CallArgs<Operation<P, 'get'>>) {
  return call('get', path, args[0]);
}

function post<P extends PathsWith<'post'>>(
  path: P,
  ...args: CallArgs<Operation<P, 'post'>>
) {
  return call('post', path, args[0]);
}

function put<P extends PathsWith<'put'>>(path: P, ...args: CallArgs<Operation<P, 'put'>>) {
  return call('put', path, args[0]);
}

function patch<P extends PathsWith<'patch'>>(
  path: P,
  ...args: CallArgs<Operation<P, 'patch'>>
) {
  return call('patch', path, args[0]);
}

function del<P extends PathsWith<'delete'>>(
  path: P,
  ...args: CallArgs<Operation<P, 'delete'>>
) {
  return call('delete', path, args[0]);
}

/**
 * A GET that keeps the body as a file.
 *
 * For `/exports/{export_id}/download`, which the contract declares as
 * `application/json` with `format: binary`. That types as `string`, which is
 * not what arrives; it is a PDF or a JSON file to hand to the browser. Token,
 * base URL and error envelope are the same as every other call, `Accept` included:
 * it stays `application/json` so a refusal still comes back as the envelope rather
 * than as Laravel's HTML error page.
 */
async function blob<P extends PathsWith<'get'>>(
  path: P,
  ...args: CallArgs<Operation<P, 'get'>>
): Promise<Blob> {
  const response = await send('get', path as string, (args[0] ?? {}) as LooseOptions);
  return response.blob();
}

/**
 * The client. Every call is `api.<verb>(path, options)`, where the path is one
 * of the contract's and the options are that operation's.
 *
 *   await api.get('/auth/me');
 *   await api.get('/gigs/{gig_id}', { path: { gig_id } });
 *   await api.get('/reflections', { query: { status: 'draft' } });
 *   await api.post('/reflections', { body: { sprint_id } });
 *   await api.delete('/reflections/{reflection_id}', { path: { reflection_id } });
 *   await api.blob('/exports/{export_id}/download', { path: { export_id } });
 */
export const api = { get, post, put, patch, delete: del, blob };
