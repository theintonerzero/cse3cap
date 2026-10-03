# Security reviews

`Stack-and-Build-Scope.md` §4.4 commits to a security review on every pull request that
touches scoring, submit or framework mutation, and to a review of the frontend and the API
seam. The commitment is per change, not once, so this file is appended to rather than
rewritten. Newest first.

Findings are raised as tickets rather than fixed inside the review. A review that quietly
fixes what it finds leaves no record that the class of problem existed.

---

## 2026-10-03 · Every finding re-verified, by reviewers who did not write them

**Reviewer:** Tony To, via Claude Code · **Tickets raised:** CAP-42, CAP-43, CAP-44 ·
**Commit reviewed:** `b8e2210`

### Scope

Every entry below, F1 to F10 and the CAP-31 and CAP-32 results, re-checked against current
`dev` by four fresh agents that had not written any of it: one each for the tokens (F1 to
F5), the PDF and evidence (F6 to F8), authorisation with F9, F10 and the pentest, and one
critic for what no entry ever looked at. The method and severity scale are Cloudflare's
`security-audit` skill (github.com/cloudflare/security-audit-skill), in its guidance mode.
Its rule that matters most here is that the agent checking a finding is never the agent
that found it.

### Method

Source only. Nothing in the repository was run, no deployed endpoint or shared service was
probed, and nothing was written to the shared database. The skill forbids running target
code without an OS-enforced sandbox, and this review had none. One read-only query was run
through `diary_ro`, quoted under F13. Every new claim below was re-read by hand before it
was written here.

The skill's severity anchors are stricter than the ones this file has used. A gap with no
reachable boundary violation is a hardening note, not a finding, and severity cannot exceed
demonstrated impact. Re-rating against them is most of what changed.

### Verdicts on the existing findings

| Finding | Was | Now | Why |
| --- | --- | --- | --- |
| F1 | High, fixed | **Fix verified** | `client.ts:153-155` still gates the token on `import.meta.env.DEV`. Two blind spots in the check below |
| F2 | Medium | **Hardening note, fix verified** | Sanctum 4.3.3's guard enforces a token's own `expires_at` when the global setting is null. No expiry matters only after a leak, which crosses no boundary by itself |
| F3 | Medium | **Informational** | This file already says it is not an escalation. There is no concrete damage to point to |
| F4 | Low | **Hardening note, fix verified** | And the 2026-10-03 method claim below it is wrong, see CAP-44 |
| F5 | Low, accepted | **Informational** | The same person already has that token in `web/.env` |
| F6 | Low, fixed | **Fix verified** | `PdfRenderer.php:37,43`. `chroot` is left at dompdf's default |
| F7 | Low, fixed | **Fix verified** | `StoreEvidenceRequest.php:30`, and the stepper's own `^https?://` guard |
| F8 | Low today | **Precondition, not a finding** | Still no route serves an evidence file back. One addition below |
| F9, F10 | Low, fixed | **Fixes verified** | Each test fails with its fix removed |

**Two claims in this file were wrong.**

- The CAP-32 entry says nothing in `web/` or `scripts/` parses a token's shape.
  `scripts/verify-app-shell.sh:98` does, with `[0-9]+\|[A-Za-z0-9]+`, and against an
  `rdiary_` token it extracts `7|rdiary`. Its live check will 401 the day the tokens are
  reissued, and CI skips that half. **CAP-44**, to merge before the reissue.
- The CAP-31 entry says not-yours is 404 everywhere it was probed. That holds for what was
  probed, but F12 is a route where it does not.

The CAP-31 framework gap is smaller than that entry states.
`FrameworkMutationTest::test_one_reflection_freezes_the_framework_everywhere` sends real
`PATCH` requests through the routes, middleware, policy and `assertEditable`. It is HTTP in
process. What it skips is a real bearer token, which the pentest covers elsewhere.

F1's check has two blind spots, neither of which weakens the fix in `client.ts`. If
`VITE_API_TOKEN` is already set in the shell, Vite prefers it to `.env.production.local`, so
the canary is never compiled and `check-bundle-secrets.sh:70` passes without testing
anything. And the script knows only that one variable name.

F8 gains one condition for whichever ticket first serves evidence back: the rubric allowlist
checks the extension the uploader typed (`EvidenceController.php:65`), but `putFile` names
the stored file from its contents. An HTML file called `x.pdf` passes a PDF-only rubric and
is stored as `.html`. The served type must come from the server, never the stored name.

### Findings

#### F11 · Evidence and export files are never deleted, and nothing bounds them — needs validation

> **Raised as CAP-42 (COA4-112).**

`DELETE /evidence/{id}` deletes the row and never the file (`EvidenceController.php:57`), and
the `Evidence` model has no deleting hook. Deleting a reflection leaves every file the same
way. `max_file_bytes` is per file, there is no cap on files per entry, and there is no
`throttle` anywhere in `api/`. `POST /exports` writes a file per call and nothing prunes
them. So a student token can upload, delete and repeat, and what it leaves is invisible to
every API path. Two of the four reviewers reached this separately.

`Retention-and-Erasure.md` already notes that a deleted row leaves its file. That is this
root cause seen from erasure. Seen from here, it is unbounded disk use on the box that
runs the shared MySQL.

**What decides the severity** is whether `/var/www/diary/shared/storage` and the MySQL data
directory share a filesystem. The same device is Medium, because a shared service stops. A
separate device is Low. That needs a shell, the same one CAP-41 is waiting on, and the
check is a read-only `df -h` on both, written out in CAP-42.

#### F12 · A classmate counter-scoring gets 403 where 404 belongs — Informational

> **Raised as CAP-43 (COA4-113), where it is N1.**

`ReflectionPolicy::counterScore` (`ReflectionPolicy.php:94-96`) resolves a classmate on the
same gig as `student` and returns `deny`, a 403. `view` gives the same person 404. The 403
confirms that an entry id belongs to a reflection on one of their gigs. It needs an entry
UUID the API never shows a classmate, so the gain is small. The pentest probed a student on
her own entry and an assessor off his gig, not a classmate.

#### F13 · A user holding two roles on a gig could counter-score their own work — needs validation

> **Raised as CAP-43 (COA4-113), where it is N4.**

`gig_participants` is unique on `(gig_id, user_id, role)` (`01-schema.sql:73`), so one user
can hold two roles on a gig. `RoleResolver::for` returns `->value('role')` with no ordering,
and `counterScore` never checks that the caller is not the owner. Whichever row comes back
first decides.

No such user exists on the shared database:
`SELECT gig_id, user_id FROM gig_participants GROUP BY 1,2 HAVING COUNT(*) > 1` returned no
rows on 2026-10-03. And no endpoint writes participants. Whether Alumable can produce one is
the client's question. An owner check in `counterScore` is right either way.

#### F14 · Two existence checks answer before the policy — Informational

Not raised as a ticket on its own. It belongs with CAP-43 if that ticket's owner wants it.

`StoreReflectionRequest` and `StoreFrameworkAssignmentRequest` validate `exists:gigs`, so a
gig id that does not exist gets 400 where a real gig the caller is not on gets 404.
`ReflectionCreator::resolveContext` runs before `Gate::authorize`, and a sprint paired with
the wrong gig answers 400 with `details.sprint_gig_id`. That tells a non-participant which
gig the sprint belongs to.

### Hardening notes

None of these crosses a boundary on its own.

- **The draft rule lives in four places.** `ReflectionPolicy::update`'s docblock says "only
  while it is a draft" and the method does not check it. `EntryController`,
  `EvidenceController`, `ScoreController` and `ReflectionController::destroy` each carry
  their own copy. Every copy is present today, but this is the shape CAP-19 had.
- **A supervisor can assign another supervisor's framework copy.** `GigPolicy::assignFramework`
  checks the role on the gig, not who owns the framework. Until a reflection freezes it, the
  owner's edits change the other gig's rubric. Whether that is intended is a product call.
- **The demo can be held by slow uploads.** Caddy accepts a 101 MiB body on `/api/*` before
  any token is checked. The pool has five workers and no `request_terminate_timeout`, and
  exports render in the request because the queue is `sync`. Whether Caddy buffers the body
  first is not in the repository. Reproduce it on a local copy of the two config files,
  never on the VPS.
- **CI** has no top-level `permissions:` block, and `shivammathur/setup-php@v2` is pinned by
  a moving tag rather than a commit.
- **`diary_app`** is the demo's account and every developer's. The Runbook has people
  migrate with it, which implies DDL on the data the demo serves. `SHOW GRANTS FOR
  'diary_app'@'%'` settles it.
- **No `Content-Security-Policy`** in the Caddyfile. Injection is already under test, so
  this would be a second layer.
- **`'serve' => true`** on the private `local` disk registers a signed `/storage/{path}`
  route that nothing signs for. Caddy sends `/storage/*` to the frontend anyway, but `false`
  says what is meant.
- **Sign-out is client-side.** There is no logout route, so forgetting a token in the tab
  revokes nothing on the server.
- **Whether Caddy logs the `Authorization` header** depends on its version (2.5 and later
  redact it). That is a `caddy version` on the box.

### What is already right

- **Every route has a guard.** All 33 are behind `auth:sanctum`, and each one that touches
  a resource either calls a policy or runs a query scoped to the caller.
- **The business rules hold from source.** Counter-scoring twice is 409 `ALREADY_SCORED`
  through the unique index. A draft cannot be counter-scored, and a submitted reflection
  cannot be edited, self-scored or deleted. A level from another competency is refused on
  both score endpoints. No generated column is fillable.
- **Exports reach their owner only**, the student's own supervisor included, and carry
  nothing above what the student may see.
- **The deploy kit refuses the obvious mistakes.** It will not ship a `.env` with
  `APP_DEBUG=true`, a `VITE_API_TOKEN`, or an `APP_KEY` or database password in the built
  frontend. Caddy serves `web/dist` and sends only `/api/*` to PHP. `.env`, storage and
  `.git` sit outside both roots.
- **A 500 leaks nothing.** The exception handler maps fixed messages, and an unmapped
  `QueryException` falls through to Laravel's generic page with debug off.
- **CI runs on `pull_request`, never `pull_request_target`**, and uses no secrets.

### Sign-off

Every fix in this file still holds. Four ratings were too high for what the findings
demonstrate, and two claims were wrong. One is corrected by CAP-44, and the other is
answered by F12. F11 is the one that matters, and its severity waits on a `df` nobody can
run yet. That makes three things blocked on the same shell access: CAP-26, CAP-41 and CAP-42.

CAP-31 stays In Review. F12 is a counterexample to its criterion "Not-yours returns 404
rather than 403, everywhere", and that ticket's own last criterion says what does not hold
is raised, not passed.

---

## 2026-10-03 · Security posture: tokens, the VPS and the dependency tree

**Reviewer:** Tony To · **Ticket:** CAP-32 · **Commit reviewed:** `09a03c5`

### Scope

The token findings F2, F3 and F4 from the 2026-09-08 entry, decided rather than left open
before CAP-26 puts the demo on a public URL. The VPS controls ADR #21 relies on, verified
instead of assumed. The dependency tree against ADR #31. Git history, for credentials of the
kind F1 found in a bundle.

### Method

- **Tokens.** Read `api/config/sanctum.php` and `DemoSeeder::issueTokens`, and checked that
  nothing in `web/` or `scripts/` parses a token's shape (the frontend only trims it). The
  decision is ADR #46 and the change is tested in `api/tests/Feature/TokenPostureTest.php`.
  That test goes through the real Sanctum guard with a bearer header, not `actingAs`.
- **VPS, from outside.** `nc -z rddb.darkovski.dev 3306` connects. Through the read-only
  account: `@@require_secure_transport = 1`, MySQL 9.7.2, and this session's `Ssl_cipher` is
  `TLS_AES_128_GCM_SHA256`. The per-account `REQUIRE SSL` could not be read: `mysql.user` is
  denied to `diary_ro`, as it should be, and the server-wide setting refuses unencrypted
  connections regardless.
- **VPS, needing a shell.** Whether fail2ban still watches the MySQL log and bans in
  `DOCKER-USER` cannot be seen from outside, and nobody has confirmed shell access. Raised as
  **CAP-41** rather than assumed.
- **Dependencies.** `docs/Dependency-Register.md`, generated at `09a03c5` by `./run deps`
  from `composer audit` and `npm audit`: 117 Composer and 116 npm packages, **no
  advisories**. No Dependabot pull request is open, as all five were merged on 2026-10-03.
- **History.** gitleaks over every ref (263 commits with a diff; merges have none), redacted:
  no leaks. Then a grep of every added line in `git log --all -p` for the shapes generic
  scanners miss: Sanctum tokens, `APP_KEY=base64:`, `DB_PASSWORD`/`MYSQL_*PASSWORD`
  assignments, private keys, Atlassian and GitHub tokens. The only hits are fixtures: the CI
  service container's password `ci`, `scripts/deploy.test.py`'s test values, a blank
  placeholder in `docs/Deployment.md` and a `case` pattern in `scripts/setup.sh`. The only
  env file ever committed apart from the examples is `web/.env.production`, which holds
  `VITE_API_BASE_URL=/api/v1` and nothing else.

### Findings

No new findings. F2, F3 and F4 are decided below and marked where they are listed. One control
is unverified, and that gap is CAP-41.

- **F2: tokens expire.** `DemoSeeder` issues each token 60 days out. The global setting stays
  null so nothing already issued dies at once.
- **F3: every ability, on purpose.** A scoped token would need a `tokenCan()` check outside
  the policies, a second place authorisation lives.
- **F4: tokens carry `rdiary_`.** A leaked one is caught by secret scanning.

### What is already right

- The server refuses unencrypted connections outright, not just per account. A client that
  forgets the CA fails rather than silently connecting in the clear.
- `diary_ro` cannot read `mysql.user`. The read-only account is read-only on the data and
  blind to the grant tables.
- No credential has ever been committed, across every branch.

### Sign-off

The token decisions are Proposed, as ADR #46, until the team accepts them. They reach the
shared database only when the three tokens are reissued. The seeder skips a user who already
has one, so until then the live tokens are unprefixed and never expire. Reissuing is
announced, then done once: revoke the `demo` tokens, run `php artisan db:seed`, and pin the
new ones. CAP-32 is done when ADR #46 is accepted and the tokens are reissued. CAP-41 is
separate, and blocked on shell access.

---

## 2026-10-03 · The permission matrix, probed over HTTP

**Reviewer:** Tony To · **Ticket:** CAP-31 · **Commit reviewed:** `09a03c5`

### Scope

Whether the running API refuses what the capability table in `docs/api-reference.html` says
it refuses. That's six rows, four roles, and real bearer tokens, not `Sanctum::actingAs`. The
test suite asserts what its authors believed. CAP-19 merged green with its central criterion
false, which is why this was asked for separately.

### Method

`scripts/pentest.sh` (`./run pentest`) ran against a local `php artisan serve` on the shared
database, with the three seeded tokens. It is written so a hole cannot do damage there:

- It probes refusals and reads only.
- Writes aimed at someone else's work target submitted or assessed reflections.
- Framework edits send the current value back unchanged.
- The one create a hole could let through is deleted again if it lands.

It finds every id through the API, so it runs against any team member's database.

**36 probes, 36 hold, 0 break.** By row:

| Row | Probed | Result |
| --- | --- | --- |
| Create, edit, submit, delete own reflection; self-score; evidence | Jane on someone else's reflection: read, edit narrative, self-score, add evidence, submit, delete. Sam and Dr Lee editing, self-scoring and deleting what they can see. Sam starting a reflection | **Holds.** Every not-yours is 404 `NOT_FOUND`. Every can-see-but-not-yours-to-do is 403 `ROLE_FORBIDDEN` |
| View a reflection | Sam on the gig he is not on: a reflection, its history, the gig, the filtered list. Each list scoped to its caller. Dr Lee on Jane's (allowed) | **Holds.** 404s, and no row of the other gig in any list |
| Counter-score, review queue | Jane's queue, Jane counter-scoring her own entry, Sam counter-scoring off his gig | **Holds.** Empty queue, 403, 404 |
| Create and edit frameworks | Jane and Sam copying. Dr Lee editing an in-use framework, competency and level. Jane editing Dr Lee's own copy | **Holds, with a gap below.** 403 throughout |
| Assign a framework | Jane and Sam assigning | **Holds.** 403 |
| Analytics and export | Jane's radar (allowed). Sam and Dr Lee reaching Jane's export and its download | **Holds.** 404 to anyone but the owner, her supervisor included |
| No token, a made-up token | read and write | **Holds.** 401 `UNAUTHENTICATED` |

IDOR, as the ticket names it: Jane reading another student's reflection is 404. Sam reaching
the gig he is not on is 404. A student counter-scoring her own entry is 403.

### Findings

No new findings. Not-yours is 404 everywhere it was probed, and no 403 leaks that a resource
exists.

**One gap, stated rather than passed.** The three framework-edit probes were refused by
*ownership* (403), because the frameworks in use on the shared database are the seeded base
rubrics, which Dr Lee does not own. The in-use rule itself (409 `FRAMEWORK_IN_USE` on an
owned copy that a reflection references) is not reached over HTTP here. Reaching it would
mean making one of Dr Lee's copies in use, which writes to the shared database.
`api/tests/Feature/FrameworkMutationTest::test_one_reflection_freezes_the_framework_everywhere`
proves it through all three edit endpoints: framework, competency and level.

### What is already right

- The 404 versus 403 rule is applied consistently, including on exports, where a supervisor
  of the student still gets 404.
- Lists are scoped in the query, not filtered afterwards (ADR #40). Sam's lists contain
  nothing from the gig he is not on, rather than hiding it after fetching it.
- Every refusal arrives in the error envelope with its documented code.

### Sign-off

CAP-31's criteria are met, apart from the framework gap above, which the test suite covers.
`./run pentest` can be rerun by anyone, against any seeded database, before a release.

---

## 2026-09-29 · The last three screens, and injection under test

**Reviewer:** Tony To · **Ticket:** CAP-24 · **Commit reviewed:** `8318624`

### Scope

Everything the 09-24 entry left open. Three screens merged since: edit framework (CAP-16,
#62), where a supervisor types the competency names and level descriptors every stepper
then shows; the history sheet on the gig page (CAP-14, #61); and the submitted confirmation
(CAP-12, #65). And the gap the 09-24 entry admitted: the steppers' injection result rested
on reading, because `web/` had no way to put hostile text on a screen without writing it
into the shared db. ADR #42 (#63) gave it one, a browser check against a fake API.

With CAP-16 merged, every screen the MVP has is built, so this entry is CAP-24's sign-off.

| Criterion | State |
| --- | --- |
| Token storage and exposure | Re-checked at `8318624`. Holds |
| Narrative, comment and evidence text rendered without injection | **Every screen that renders typed text, under test.** Holds |
| No client-side role trust | Reviewed across the three new screens. Holds |
| Findings raised as tickets, sign-off recorded | No new findings. Every open one has a ticket: F2 to F4 in CAP-32, F9 in CAP-36. This entry |

### Method

`web/e2e/injection.spec.ts` drives four screens in Chromium against `web/e2e/fake-api.ts`,
which now also serves a reflection's detail, a gig's reflections and a reflection's events.
`web/e2e/hostile.ts` puts one payload in every field a person types: the narrative, both
evidence labels, a `javascript:` evidence link, the counter-score comment, every display
name, a rubric's competency names, radar labels and descriptors, the gig's title, and an
event type the history sheet has never heard of.

```
<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>
```

The `<script>` half on its own would prove nothing, because a script added through
`innerHTML` never runs. The `<img>` half does run, and it is what makes a sink visible.

| Screen | Typed text on it |
| --- | --- |
| Student stepper | competency name, narrative, descriptors, counter-score scorer and comment, both evidence labels, the `javascript:` link |
| Assessor stepper | the owner's name, in the status line and in two field labels |
| Edit framework | a rubric's names and descriptors as fields, its name as an option, and the copy's name the supervisor types, shown back after a save |
| Gig page and history | the gig title, the event actor, an unknown event type |

Each test asserts every field is on the page as literal text, so it really was rendered, and
then that nothing became markup: no `img[src="x"]` in the DOM, and `window.__pwned` still
undefined.

**Each test was then shown to fail.** For each screen, one text sink was swapped for
`dangerouslySetInnerHTML` and that screen's test run, then the file was restored:

| Mutation | Result |
| --- | --- |
| `EntryStepper.tsx`, a file evidence label | red: the label is no longer text on the page |
| `EntryStepper.tsx`, the owner's name in the assessor status line | red: the name is no longer text |
| `EditFramework.tsx`, `Saved as {copy.name}` | red: "Saved as . It is listed under Saved copies." |
| `HistorySheet.tsx`, the event actor | red: the actor is no longer text |

Each of those went red on its literal-text assertion before reaching the markup check. So
the markup check was also run alone against the history mutation, and it went red on its own:
one `img[src="x"]` in the DOM where none is allowed.

Around the specs: a sweep of `web/src` for `dangerouslySetInnerHTML`, `innerHTML`, `eval`,
`new Function`, `document.write`, `window.open`, `console.` and both storage APIs, which
found none outside the session and theme files that were already reviewed; `./run check`;
and every request the three new screens can send followed to the policy that decides it.

### Findings

None new. F9 (CAP-36) is still open and still not a way in: the student route offers a
reviewer controls the server refuses. F8 stays open for the day an evidence download is
built. None of these screens serves a file.

### What is already right

- **No screen renders typed text as markup.** Not argued from reading this time. Every field
  above is under a test that fails against a sink, and it runs in CI on every pull request.
- **A supervisor's wording reaches the steppers only as text.** Edit framework is the one
  place a person authors what everyone else then reads, and it shows that wording only as
  field values, option text and one message. Every stepper test above already carries
  hostile rubric wording.
- **The history sheet never renders `metadata`.** The contract lets it hold anything, and the
  sheet reads only the event type, the actor and the time. An unknown type is shown by name,
  as text.
- **The three new screens trust no role.** `GigDetail` asks for a student's reflections and
  offers History only when the server's `my_role` says student, and the events it then reads
  pass `ReflectionPolicy::view`. `Submitted` reads participants' roles only to name who will
  review. `EditFramework` checks no role at all: `POST /frameworks` passes
  `FrameworkPolicy::create`, and every competency and level `PATCH` passes
  `FrameworkPolicy::update`, whose in-use and owner rules live in `FrameworkEditing`.
- **Tokens are where they were.** In `sessionStorage` per tab. The browser checks sign in
  with a placeholder the fake never reads, so no credential goes near a browser, including in
  CI.

### Sign-off

All four criteria are reviewed against every screen the MVP has and hold. The injection
criterion is now held by `web/e2e/injection.spec.ts` rather than by a reviewer's reading, and
each of its tests has been shown to fail against the sink it guards. CAP-24 is done. What
stays open is recorded as tickets: F9 as CAP-36, F2 to F4 as CAP-32, and F8 as a condition on
whichever ticket first serves an evidence file.

---

## 2026-09-24 · The two entry steppers

> **Superseded in part by 2026-09-29.** The injection result below rested on reading. It is
> now under test for both steppers, and for the screens built since.

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

#### F9 · The student route offers a reviewer edit controls the server will refuse — Low. **Fixed 2026-09-30**

> **Raised as CAP-36 (COA4-94), fixed there.** `read_only` now also turns on for anyone who
> is not the reflection's owner, and while `me` is still loading. `web/e2e/stepper-ownership.spec.ts`
> opens Jane's draft as Sam and finds no editable control and no write sent, and
> `scripts/verify-entry-stepper.sh` asserts the condition. Both were red with the ownership
> term removed.
>
> **Corrected 2026-10-03.** "No write sent" was asserted after the page loaded, before
> anything had been tried, so it proved only that loading writes nothing. The spec now also
> force-clicks every self-score chip as Sam and asserts that no request left the page. With
> the ownership term removed, that test alone fails on two `PUT /entries/:id/scores/self`.

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

> **Re-rated 2026-10-03: a precondition, not a finding.** Still no route serves a file back.
> The condition gains one line: the stored name's extension comes from the file's contents,
> not the name the uploader typed. See the re-verification entry, and F11 for files that are
> never deleted.

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

> **Raised as CAP-32 (COA4-90), decided 2026-10-03 (ADR #46, Proposed).** Seeded tokens now
> expire 60 days after issue; the global setting stays null. Live once the tokens are reissued.
>
> **Re-rated 2026-10-03: a hardening note.** No expiry matters only after a leak. See the
> re-verification entry.

`api/config/sanctum.php:53` sets `'expiration' => null`. A token is valid until it is
manually revoked, and Sanctum stores only a hash, so a leaked token cannot be recognised
after the fact — only revoked wholesale by reissuing, which the README notes breaks
everyone's setup at once.

This is a defensible choice for three seeded demo tokens pinned in a team channel, and the
MVP holds no real student records. It stops being defensible the moment the demo is public,
which is CAP-26. Worth an explicit decision rather than a default.

#### F3 · Tokens carry every ability — Medium

> **Raised as CAP-32 (COA4-90), decided 2026-10-03 (ADR #46, Proposed).** Kept `['*']` on
> purpose: an ability check would be a second place authorisation lives.
>
> **Re-rated 2026-10-03: informational.** See the re-verification entry.

`api/database/seeders/DemoSeeder.php:120` calls `$user->createToken('demo')` with no
abilities, so Sanctum grants `['*']`.

This is **not** a privilege escalation: authorisation resolves per user through
`RoleResolver` and the policies, so a student's token still cannot do an assessor's work.
What it costs is defence in depth. There is no way to issue a read-only token for a demo or
a screenshot session, and a leaked token can do everything its owner can, including delete.

#### F4 · No token prefix, so a leak is not machine-detectable — Low

> **Raised as CAP-32 (COA4-90), fixed 2026-10-03 (ADR #46).** New tokens carry `rdiary_`.
> Live for the seeded three once they are reissued.
>
> **Re-rated 2026-10-03: a hardening note.** `scripts/verify-app-shell.sh` cannot read a
> prefixed token yet. That is CAP-44, and it must merge before the reissue.

`api/config/sanctum.php:68` leaves `token_prefix` empty. Sanctum supports a prefix precisely
so that secret scanners — GitHub push protection among them — can recognise a token in a
commit, a paste or a log. Setting it costs one environment variable and buys automated
detection of exactly the leak F1 describes.

#### F5 · A real token reaches disk during `./run verify` — Low, accepted

> **Re-rated 2026-10-03: informational.** The same person already holds that token in
> `web/.env`.

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
