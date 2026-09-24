# Security reviews

`Stack-and-Build-Scope.md` §4.4 commits to a security review on every pull request that
touches scoring, submit or framework mutation, and to a review of the frontend and the API
seam. The commitment is per change, not once, so this file is appended to rather than
rewritten. Newest first.

Findings are raised as tickets rather than fixed inside the review. A review that quietly
fixes what it finds leaves no record that the class of problem existed.

---

## 2026-09-24 · The two entry steppers

**Reviewer:** Tony To · **Ticket:** CAP-24 · **Commit reviewed:** `809274a`

### Scope

The two screens the injection criterion was waiting on: the student's entry stepper (CAP-11,
#54) and the assessor's mode of the same screen (CAP-13, #56). They are the first screens
that render what a person typed at length: the narrative, the counter-score comment, the
evidence label and link, and the other person's display name. #56 also changed the routes,
the review queue and `Chip`. CAP-16, the edit-framework screen, has not started, so this
still is not the whole of CAP-24.

| Criterion | State |
| --- | --- |
| Token storage and exposure | Re-checked at `809274a`. Holds |
| Narrative, comment and evidence text rendered without injection | **Both steppers reviewed. Holds.** Read, not tested with hostile text on screen. See Method |
| No client-side role trust | Reviewed across both modes and the new landing redirect. Holds. F9 is the UI offering what the server refuses |
| Findings raised as tickets, sign-off recorded | F9 and F10 below. This entry |

### Method

Read `EntryStepper.tsx` in full as it stands after #56, with `entry-stepper-logic.ts`,
`routes.tsx`, `ReviewQueue.tsx` and `Chip.tsx`. Then followed every write the screen can make
to the policy that decides it: `ReflectionPolicy::update` for the narrative, evidence,
self-score and submit, and `ReflectionPolicy::counterScore` for the counter-score. Then read
the feature tests that hold those policies. Then ran:

- `scripts/verify-entry-stepper.sh`, 13 of 13, and `scripts/verify-assessor-stepper.sh`,
  23 of 23.
- `./run bundle-secrets` at `809274a`. Passes.
- A sweep of `web/src` for `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`,
  `document.write`, `window.open`, `console.` and both storage APIs.

**What was not done.** The 09-19 review put hostile text through the PDF and kept it as a
test. Doing the same on screen means writing `<script>` narratives into a reflection on the
shared db, which is five people's demo data, and `web/` has no test runner to do it in
isolation. So the injection result for the screens rests on reading: every value below
reaches the DOM as a JSX text child, which React escapes. That is a strong mechanism, but it
is a read, and a later `dangerouslySetInnerHTML` would not be caught by anything except the
sweep above being run again.

### Findings

#### F9 · The student route offers a reviewer edit controls the server will refuse — Low

> **Raised as CAP-36 (COA4-94).**

`EntryStepper` decides `read_only` from the mode and the status alone:

```ts
const read_only = mode === 'assessor' || reflection.status !== 'draft';
```

The permission matrix lets every reviewer on a gig read a reflection on it, drafts included
(`API-Specification.md`, "view a reflection"). So an assessor who opens
`/reflections/{id}` on a student's draft, by URL or by a link that lands there, gets the
student's mode: an editable narrative, self-score chips, and Add and Remove on the evidence.

Nothing gets through. Every one of those writes goes to `ReflectionPolicy::update`, which is
owner-only and answers a reviewer with 403 `ROLE_FORBIDDEN`. That is the design working: the
client is not trusted. But the assessor sees a box that looks like theirs to edit, types,
and gets an autosave error on every pause. It also contradicts the screen's own comment that
"an assessor never edits what the student wrote".

Fix in `web/`: add ownership to the condition, from the `owner` the reflection already
carries and the session's `me`. A student mode opened by someone who is not the owner then
renders read-only, the same as the assessor mode does.

#### F10 · A reviewer's refusal is tested on the narrative only — Low. **Fixed 2026-09-24**

> **Fixed in CAP-37, PR #60.** `ReflectionWritePathTest` now refuses an assessor (403) and
> a stranger (404) on the self-score, evidence add and remove, and submit, and checks
> nothing changed. Each test was red with its controller's `Gate::authorize` line removed.

`ReflectionWritePathTest::test_nobody_else_writes_on_someone_elses_reflection` has Sam, an
assessor, PATCH Jane's narrative and asserts 403. The self-score PUT, evidence POST and
DELETE, and submit reach the same policy, and reading the controllers confirms they call
`Gate::authorize('update', …)` or `('submit', …)`. But no test holds any of them. A
controller that later drops its `authorize` line would pass every test that exists, and F9
means the UI now sends exactly those requests as a reviewer.

Fix in `api/tests/`: the same two-actor shape as the existing test (an assessor gets 403,
a stranger gets 404), once for each of those four writes.

### What is already right

- **Every piece of typed text in both modes is rendered as text.** The narrative is a
  textarea value. The counter-score comment, the evidence label, the scorer's and the
  owner's display names, the competency name and each level descriptor are JSX text
  children. Descriptors and competency names are also typed text, by whoever copies and
  edits a framework (CAP-16), and they are escaped here the same way.
- **One `href` in the whole screen, and it is guarded twice.** A `link` evidence item gets an
  `<a>` only if its uri matches `^https?://`, on top of the server's `url:http,https` (F7).
  It carries `rel="noopener noreferrer"` and `target="_blank"`. A file or image item's label
  is plain text with no link at all.
- **F8's condition holds.** Neither ticket added an endpoint that serves an evidence file.
  #56 touched only `web/`, `scripts/` and `run`. So an uploaded `.html` or `.svg` still has
  no way back to a browser. F8 stays open for the day a download is built.
- **Mode is a route, not a role, and the server does not care which one was picked.**
  Anyone can load `/review-queue/reflections/{id}`. A student doing so on their own
  reflection gets a counter-score panel whose POST `counterScore` refuses with 403, held by
  `ScoringTest::test_a_student_cannot_counter_score_even_their_own`.
- **The new landing redirect is a convenience.** `Home` sends a user with no student role to
  the review queue. The diary stays reachable by URL, and the analytics behind it filter to
  the caller's own id.
- **The comment hint is a hint.** `comment_expected` only disables Save early. The rule is
  `Scoring.php`'s, which answers 400 `COMMENT_REQUIRED`, and the screen switches on that code
  rather than on its own guess (`verify-assessor-stepper.sh` §3).
- **The counter-score is never rewritten.** POST only, never PUT or PATCH (ADR #34), and the
  flip to assessed is read from the 201 body rather than set by the screen.
- **Tokens and storage are as they were.** Tokens in `sessionStorage` per tab, the theme alone
  in `localStorage`, no `console` call anywhere in `web/src`, and no token in a production
  build.

### Sign-off

The injection criterion is now reviewed for both screens that render narratives, comments
and evidence, and holds, on reading rather than on a hostile-text test. The token and
role-trust criteria hold across both modes. F9 and F10 are raised as tickets. Neither is a
way in. One is a UI that offers what the server refuses, and the other is a test that
should exist.

CAP-24 stays open for CAP-16, the edit-framework screen, which is the last screen to render
typed text and the one that lets a supervisor author it.

---

## 2026-09-19 · The merged screens and the PDF export

**Reviewer:** Tony To · **Ticket:** CAP-24 · **Commit reviewed:** `c661b5c`

### Scope

Since the token review, five screens and a new server-side renderer have merged: the app
shell (CAP-5, #30), diary home (CAP-7, #32), gig detail (CAP-8, #43), the export sheet
(CAP-18, #45) and select framework (CAP-15, #46), plus the PDF export (CAP-17, #44). CAP-13
and CAP-16 have not started, so this is still not the whole of CAP-24, but it is most of
the frontend the ticket will ever cover, and the PDF export is a surface the ticket did not
anticipate.

| Criterion | State |
| --- | --- |
| Token storage and exposure | Re-checked against the five screens. Holds |
| Narrative, comment and evidence text rendered without injection | **PDF export: reviewed and tested.** Screens: none of the merged ones render that text; still deferred to CAP-11 and CAP-13 |
| No client-side role trust | Reviewed across all five screens and the shell. Holds |
| Findings raised as tickets, sign-off recorded | F6 to F8 below; this entry |

### Method

Read every file under `web/src/screens/`, `web/src/session/` and `web/src/app/`, the two
export templates, `PdfRenderer`, `BuildExport` and the evidence write path. Then tested
rather than read wherever the answer could be tested:

- **The PDF templates were rendered with hostile text in every person-typed field** — gig
  title, framework name, competency name, narrative, evidence label and link, scorer name,
  comment, radar axis label — each carrying a `<script>`, an `<img onerror>` and a
  `javascript:` anchor. No markup survived, all of it arrived as escaped text, and the
  rendered PDF carries no `/JavaScript` or `/URI` action. That probe is now
  `api/tests/Feature/ExportRenderingTest.php`. It was confirmed to fail when the narrative
  line is switched to `{!! !!}`: two of its three tests go red, and the PDF test catches it
  independently because the injected anchor becomes a live `/URI` link in the file.
- **The evidence link validation was fed dangerous schemes.** `javascript:alert(1)`,
  `javascript://%0aalert(1)`, `data:text/html,…`, `vbscript://` and `file:///` are all
  rejected by `StoreEvidenceRequest`; `https://` is accepted. See F7 for why that is less
  settled than it looks.
- **`./run bundle-secrets` re-run at `c661b5c`**, now that four screens import `api`
  rather than the one that triggered F1. Passes.

### Findings

#### F6 · dompdf's PDF JavaScript is on by default — Low. **Fixed 2026-09-19**

> **Fixed in CAP-33, PR #48.** `PdfRenderer` sets `isJavascriptEnabled` to false, and
> `api/tests/Feature/PdfRendererTest.php` feeds dompdf a raw `text/javascript` script and
> asserts no `/JavaScript` action reaches the file. It was red against the default and is
> green with the option off.

`api/app/Exports/PdfRenderer.php` turns remote assets off, correctly, and leaves
`isJavascriptEnabled` at dompdf's default of `true`. With it on, a
`<script type="text/javascript">` element in the rendered HTML is embedded in the PDF as
document JavaScript, which some readers execute on open.

It is not reachable today: every value in both templates is escaped, and the new test holds
that. So this is defence in depth, one line, and it removes the consequence of the one
`{!! !!}` someone eventually adds to keep a narrative's line breaks:

```php
$options->set('isJavascriptEnabled', false);
```

#### F7 · The evidence link allowlist is Laravel's, not ours — Low. **Fixed 2026-09-19**

> **Fixed in CAP-34, PR #49.** The rule is `url:http,https`, and the contract says so.
> `ReflectionWritePathTest::test_an_evidence_link_must_be_http_or_https` refuses
> `javascript:`, `data:` and `ftp://` with a 400. It was red before the change, and the
> scheme that got through was `ftp://`, which Laravel's default list accepts. The `rel`
> on the rendered link is still CAP-11's, and is noted on that ticket.

`StoreEvidenceRequest` validates `uri` with the bare `url` rule. That rejects `javascript:`
today because Laravel's built-in protocol list does not include it, which is a property of
the framework version rather than a decision this codebase made. CAP-11 and CAP-13 will
render that value as a link, and a `javascript:` href on a student's evidence, opened by an
assessor, is stored XSS against the assessor's token.

React 19 refuses `javascript:` URLs in `href`, so there are two layers, and neither is
ours. Make it explicit:

```php
'uri' => ['required_if:kind,link', 'nullable', 'url:http,https', 'max:2048'],
```

with a feature test that posts `javascript:alert(1)` and expects a 400. Whoever builds the
evidence link in CAP-11 should also render it with `rel="noopener noreferrer"`.

#### F8 · Evidence files: any type, and no rule yet for serving them — Low today, High the day a download lands

`EvidenceController::storeFile` accepts any extension when the rubric's
`accepted_file_types` is null, which it is for the seeded rubrics, so an `.html` or `.svg`
upload is stored. That is harmless now for one reason only: **no endpoint serves an evidence
file.** They sit on the private `local` disk under a random name and nothing reads them
back.

The first endpoint that does — CAP-11 or CAP-13 showing an assessor the student's file is
the obvious candidate — turns a stored `.html` or `.svg` into script running on the API
origin, if it is served inline with its own content type. So this is a condition on that
ticket rather than a defect now: the download must send
`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, and a
`Content-Type` decided by the server rather than taken from the upload.

Related and minor: `BuildExport` puts a file's storage path
(`evidence/<entry-id>/<random>.pdf`) into the student's PDF as its "uri". That is not a
secret, but it means nothing to a reader and exposes the disk layout. The label and size
would serve the reader better.

### What is already right

- **Every piece of person-typed text in the PDF is escaped**, in both the page and the SVG
  radar, and a test now holds it. Remote assets are off, so a crafted value cannot make the
  renderer fetch anything, and dompdf's PHP evaluation is off by default and not enabled.
- **No unsafe rendering sink in `web/src`.** Still no `dangerouslySetInnerHTML`,
  `innerHTML`, `eval` or `new Function`. The text the screens render — gig titles, display
  names, framework names, competency labels in the radar — all goes through JSX, which
  escapes it.
- **Every link is built from server-issued UUIDs**, never from free text:
  `/gigs/${gig.id}`, `/reflections/${row.id}`, `/frameworks/${framework.id}/edit`. The one
  value read from the URL, `?gig_id=` and `?sprint_id=` on the diary home, is only ever
  matched against the user's own gigs and dropped if it does not match
  (`diary-scope.ts`'s `scope_from_params`).
- **The export download keeps the token out of the URL.** `ExportSheet` fetches the file
  through `api.blob` with the `Authorization` header and hands the browser an object URL.
  The download name comes from the server's id, not from anything a person typed, and the
  API sends it as an attachment with a fixed content type.
- **No client-side role trust.** Four places read a role and all four are conveniences with
  the server behind them:

  | Client | Decides | Server enforcement |
  | --- | --- | --- |
  | `AppShell` `nav_items_for` | which nav items show | every route stays reachable by URL, by design |
  | `framework-groups.ts` `assignable_gigs` | which gigs the assign picker lists | `GigPolicy::assignFramework`, 404 off the gig, 403 for the wrong role |
  | `framework-groups.ts` `is_editable` | whether Edit shows | `FrameworkEditing`, 409 `FRAMEWORK_IN_USE` |
  | `GigDetail` `is_student` | sprint rows or calendar | `GET /reflections` applies `Reflection::visibleTo($user)` before any filter |

  Every one of those roles is the `my_role` or `participations` that `/auth/me` and
  `/gigs/{id}` resolve through `RoleResolver`. Nothing reads the token slot labels in
  `session/tokens.ts` as roles, and the file says in capitals that nothing may.
- **Tokens are in `sessionStorage`, per tab**, and a 401 empties the slot rather than just
  deselecting it. No `console` call anywhere in `web/src`. `localStorage` still holds only
  the theme.

### Sign-off

The token and role-trust criteria are reviewed against everything built so far and hold.
The injection criterion is reviewed for the PDF export and held by a test. It is **not**
reviewed for the screens that will render narratives, comments and evidence, because those
are CAP-11 and CAP-13 and neither exists. F7 and F8 are written for exactly those two
tickets, and they are cheaper to act on before the screens are built than after.

CAP-24 stays open. What remains is CAP-11, CAP-13 and CAP-16 once they land, plus F6 to F8
raised as tickets.

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

- **The token lives in `sessionStorage`, scoped to the tab.** CAP-5 persists the three
  seeded tokens there so a reload keeps a tab signed in and two tabs can hold two
  identities side by side; `client.ts` still holds the active one in a module variable for
  the request path. Nothing goes in `localStorage`, whose only use in the codebase remains
  the theme (`web/src/theme.ts`). A payload that runs after a reload finds that tab's own
  token, not nothing.
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
