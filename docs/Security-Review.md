# Security reviews

`Stack-and-Build-Scope.md` §4.4 commits to a security review on every pull request that
touches scoring, submit or framework mutation, and to a review of the frontend and the API
seam. The commitment is per change, not once, so this file is appended to rather than
rewritten. Newest first.

Findings are raised as tickets rather than fixed inside the review. A review that quietly
fixes what it finds leaves no record that the class of problem existed.

---

## 2026-09-08 · Token handling across the frontend and the API seam

**Reviewer:** Tony To · **Ticket:** CAP-24 · **Commit reviewed:** `4a60b2c`, plus PR #19

### Scope

CAP-24 has four acceptance criteria. Two are reviewable now and two are not, because the
screens they concern do not exist yet.

| Criterion | State |
| --- | --- |
| Token storage and exposure, including devtools and logs | Reviewed |
| Narrative, comment and evidence-filename text rendered without injection | **Deferred**, blocked on CAP-13 and CAP-16 |
| No client-side role trust | Reviewed against what exists; re-check as screens land |
| Findings raised as tickets, sign-off recorded | This entry |

Deferring the injection half is deliberate rather than an omission. There is no screen that
renders a narrative, a comment or an evidence filename, so there is nothing to review; the
same review run against an empty frontend would produce a clean result that means nothing.

### Findings

#### F1 · A seeded bearer token compiled into public JavaScript — High. **Fixed 2026-09-08**

> **Update, 2026-09-08, later the same day.** Two things changed after this was written.
>
> **It stopped being latent.** The analysis below was correct against `4a60b2c`: no shipped
> code path read the token, so Rollup dropped it. CAP-10 merged as #19 that afternoon, and
> `web/src/screens/ReviewQueue.tsx:14` imports `api`, not merely `ApiError` — which pulls the
> whole request path, and its own `review-queue.html` build entry ships it. A production
> build from `dev` at `a0a6c79` puts the token in `assets/components-*.js`. The trigger was
> CAP-10, not CAP-5 as predicted below.
>
> **It is fixed.** `web/src/api/client.ts` now gates the seed behind `import.meta.env.DEV`,
> and `scripts/check-bundle-secrets.sh` holds it there — the check was confirmed to fail
> against the vulnerable code and pass against the fix, and runs as part of `./run check`.
>
> The prediction below was wrong about *which* ticket would make it live, and that is the
> lesson worth keeping: a finding whose severity depends on someone else's merge should be
> fixed when found, not scheduled against a date you do not control.

`web/src/api/client.ts:141` seeds the auth token from `import.meta.env.VITE_API_TOKEN`, so
that a screen can be built against the real API before the app shell exists. Vite replaces
that expression with a **string literal at build time**.

It is not happening today, and the reason is accidental. No screen calls the API client yet,
so Rollup tree-shakes the request path out of the bundle entirely: `baseUrl()` is absent
from the build, and only `ApiError` survives, because the component gallery imports it. The
token is not in the bundle because nothing reads it.

That protection disappears with the first real API call, which is CAP-5 and CAP-7.

Demonstrated rather than assumed. With `VITE_API_TOKEN` set in `web/.env` and one live
reference to `getAuthToken()` added to a page, the built asset contains the value as a
literal:

```
is.code=t,this.details=r}},p=`FAKE-CANARY-TOKEN-9f3a2b1c`;function
```

The reference was reverted; the canary was never a real token.

**Impact.** Anyone who loads the page can read a working bearer token out of the JavaScript.
With F2 and F3 that credential is permanent and unscoped. Nothing about the running site
looks wrong, and no error is raised, so this fails silently and indefinitely.

**Recommended fix**, in order of how much it buys:

1. Make it structurally impossible in a production build, rather than a rule to remember:
   ```ts
   let authToken: string | null = import.meta.env.DEV
     ? (import.meta.env.VITE_API_TOKEN ?? null)
     : null;
   ```
   `import.meta.env.DEV` is `false` in any production build, so the branch and the token
   are eliminated before the bundle is written.
2. Keep the deploy-time guard regardless: build with `VITE_API_TOKEN` unset and grep the
   built assets for a bearer-token shape, failing the deploy on a match. Already specified
   in the CAP-26 design, §"Secrets, and one trap".
3. Once the app shell lands, the token context is the only thing that should call
   `setAuthToken`, and `VITE_API_TOKEN` should be understood as a development convenience
   with no production meaning.

#### F2 · Tokens never expire — Medium

`api/config/sanctum.php:53` sets `'expiration' => null`. A token is valid until it is
manually revoked, and Sanctum stores only a hash, so a leaked token cannot be recognised
after the fact — only revoked wholesale by reissuing, which the README notes breaks
everyone's setup at once.

This is a defensible choice for three seeded demo tokens pinned in a team channel, and the
MVP holds no real student records. It stops being defensible the moment the demo is public,
which is CAP-26. Worth an explicit decision rather than a default.

#### F3 · Tokens carry every ability — Medium

`api/database/seeders/DemoSeeder.php:120` calls `$user->createToken('demo')` with no
abilities, so Sanctum grants `['*']`.

This is **not** a privilege escalation: authorisation resolves per user through
`RoleResolver` and the policies, so a student's token still cannot do an assessor's work.
What it costs is defence in depth. There is no way to issue a read-only token for a demo or
a screenshot session, and a leaked token can do everything its owner can, including delete.

#### F4 · No token prefix, so a leak is not machine-detectable — Low

`api/config/sanctum.php:68` leaves `token_prefix` empty. Sanctum supports a prefix precisely
so that secret scanners — GitHub push protection among them — can recognise a token in a
commit, a paste or a log. Setting it costs one environment variable and buys automated
detection of exactly the leak F1 describes.

#### F5 · A real token reaches disk during `./run verify` — Low, accepted

`scripts/verify-client.sh` builds bundles with the real token into `.verify-out/`. There is a
`cleanup()` trap on `EXIT`, `INT` and `TERM`, and the directory is gitignored, so it cannot
be committed. A `SIGKILL` leaves it behind. This is already noted in `.gitignore` and the
residual risk is a build artefact in a working tree. Recorded, not raised.

### What is already right

Worth stating, because a review that lists only faults implies the rest was not looked at.

- **The token is never persisted.** It lives in a module variable in `client.ts`, not in
  `localStorage`, `sessionStorage` or a cookie. The only `localStorage` use in the codebase
  is the theme (`web/src/theme.ts`). A payload that runs after a reload finds nothing stored.
- **The token is never in a URL.** It is set as an `Authorization` header and nowhere else,
  so it stays out of server access logs, browser history and `Referer`.
- **Nothing logs it.** There are no `Log::` or `logger()` calls in `api/app/`, and no
  `console.log` in the client. Error messages carry the URL, never the header.
- **No unsafe rendering exists yet.** No `dangerouslySetInnerHTML`, `innerHTML` or `eval`
  anywhere in `web/src`, so React's escaping is intact. This is what the deferred criterion
  will have to re-check once there is text to render.
- **No client-side role trust.** The review queue screen in PR #19 states that scoping by
  gig and role is the server's, and it does that: it renders what `/review-queue` returns and
  handles `ApiError`, rather than deciding anything from a role.
- **CORS names one origin** and `supports_credentials` is false, consistent with bearer
  tokens rather than cookies.

### Sign-off

The token half of CAP-24 is reviewed. F1 should be fixed before the first screen calls the
API, because after that the exposure is live and silent. F2, F3 and F4 are decisions for the
team rather than defects, and F2 in particular should be settled as part of CAP-26 rather
than inherited by it.

The injection half is not reviewed and CAP-24 should not be closed as though it were.
