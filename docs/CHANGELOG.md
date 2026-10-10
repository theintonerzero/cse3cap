# Changelog

Notable changes to the Alumable Reflection Diary. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

v1.0.0 is the first tagged release. Nothing was tagged before it, so the history leading up to
it is grouped by sprint instead of by version, with the pull request for each change. Ticket
keys are the repository's `CAP-n`; Jira holds the same tickets as `COA4-n` (ADR #38).

## [1.0.0] - 2026-10-10

`dev` merged to `main` and tagged `v1.0.0` (CAP-30).

### What 1.0.0 contains

- A Laravel 13 API on MySQL 9.7: thirty-one endpoints, all eight business rules in their own
  service classes, authorisation in policies, and one error envelope for every failure.
  Contract in `docs/openapi.yaml`.
- A React 19 frontend: the diary home with its radar and the sprints that need a reflection,
  the gig page and its history, the entry stepper for students and assessors with one row of
  levels, the submitted confirmation, the review queue, your learning record, framework
  selection and copy-then-edit, deleting a copy until it is assigned, and export to JSON and
  PDF.
- A swappable rubric: La Trobe's six competencies and SFIA 9 run through the same code
  (`docs/Framework-Swap-Verification.md`).
- Demo data shaped to show calibration gaps, three seeded tokens in place of a login
  (ADR #15) with a one-click demo sign-in for presenting (ADR #61), and a runbook and client
  demo script (`docs/Runbook.md`, `docs/Demo-Script.md`).
- A live demo on the VPS behind a password gate, on its own database (ADR #62).
- An optional AI sidecar in `ai/` (Python, its own contract `docs/ai-openapi.yaml` and database
  `diary_ai`), off unless `AI_ENABLED` is set. It asks students questions and finds related
  reflections; it never writes a score or a reflection (ADR #64).

### Known limitations at 1.0.0

- No login screen. Access is three seeded Sanctum tokens (ADR #15), which carry every
  ability on purpose (ADR #46). Tokens issued from 1.0.0 carry the prefix `rdiary_` and
  expire after 60 days. The tokens on the shared database predate that and have neither
  until the team reissues them (CAP-32).
- No rule yet for serving evidence files, and any file type is accepted (F8). It becomes
  high severity the day a download lands.
- No live Alumable integration. The `external_ref` columns are empty because the team never
  had access to the platform.
- No erasure or anonymisation. The `RESTRICT` constraints make deleting a student a
  deliberate act, and none of it is implemented (`docs/Retention-and-Erasure.md`).
- The seeded SFIA 9 copy uses levels 1 to 7 for every skill until Alumable supplies the real
  ranges. The radar keeps one scale per framework (ADR #41,
  `docs/Framework-Swap-Verification.md`).
- `GET /me/calibration` and `/me/coverage` are built and tested, but no screen shows them.
  `/me/progress` is shown by your learning record (ADR #63).
- The live demo runs on the same VPS as the team's shared database, with no backups and no
  monitoring (`docs/Runbook.md`). The host-install procedure in ADR #45 was never run; the
  containers in ADR #62 replaced it.
- With `AI_ENABLED` on, a student's narrative and a reviewer's search text are sent to
  Anthropic's API, and the sidecar keeps embeddings in `diary_ai`
  (`docs/Retention-and-Erasure.md`). It is off by default, and the demo runs on seeded
  fiction.
- Deleting evidence or a reflection leaves its stored files behind, an entry has no limit on
  evidence items, export files are never pruned, and the API has no rate limit (CAP-42).
- The seeded gigs run 3 August to 26 October 2026, so after that the demo shows only past
  gigs.

## Sprint 5: 30 September to 13 October 2026

### Added
- Your learning record at `/record`: a competency by sprint table of self and assessor scores
  per gig, from the prototype's frame `86:936` (#128, #130, CAP-53, CAP-62, ADR #63).
- The diary home names the sprints that need a reflection and starts the earliest, from the
  prototype's hub frame `66:34` (#128, #130, CAP-53, CAP-62).
- A demo sign-in for the client demo: with `VITE_DEMO_SHELL` on, a one-click profile picker
  replaces the token prompt in the dev server only, and `./run demo` checks the shared
  database is reachable and fills it from the tokens file (#114, #115, #120, CAP-51,
  ADR #61).
- The live demo on the VPS, in containers behind a password gate, on its own resettable
  database, deploying `dev` automatically with health checks and rollback (#122, CAP-54,
  ADR #62), and `/phone`, which shows it in a phone frame for presenting (#123, #127,
  CAP-55).
- The AI sidecar, off unless `AI_ENABLED` is set: a reflection coach and similar past
  reflections for students, a calibration coach on an assessed reflection, and cohort search
  with recurring themes for reviewers. It asks and finds; it never writes a score or a
  reflection (#132, #134, #135, #136, #138, HO-9, CAP-67, ADR #64). Deployed on the live
  demo, ready to switch on, with an evaluation script (#140, CAP-69).
- The PDF export looks like the Reflection Diary (#133, CAP-65).
- The ERD is drawn from a source in the repository, `docs/erd.mmd`, and rendered by
  `./run erd` (#105, CAP-27).
- A supervisor can delete a framework copy they made, until a gig has it as its rubric:
  `DELETE /frameworks/{framework_id}`, 409 `FRAMEWORK_ASSIGNED` once assigned, and a
  confirmed delete on the edit framework screen (#111, CAP-50, ADR #59).
- Design inventory: every Figma prototype frame by node ID, what the build did with it and
  why, and the `/design-inventory` skill that refreshes it (#90, CAP-40).
- A demo deploy kit whoever holds the VPS can run, with a documented rollback (#88, CAP-26,
  ADR #45). The demo is not deployed yet: that needs a shell on the box.
- `./run pentest` probes the permission matrix over HTTP with refusals and reads, plus one
  export of Jane's own record, so it is safe against the shared database (#92, CAP-31). A
  classmate probe followed in #99.
- `docs/Architecture.md`: the system and request-path diagrams, checked against the code (#85).
- CI runs the smoke test over HTTP in the Backend job (#86), runs the offline checks that had
  only been run by hand (#82), and fails when the docs stop describing the repository through
  `./run docs` (#84).
- The runbook's handover section: who holds which asset, the database certificate that
  expires on 9 November 2026, backups and credential rotation (#83, CAP-30).
- Two dated `docs/Security-Review.md` entries: token posture, VPS controls and a history sweep
  (#93), then every finding re-verified by reviewers who did not write it (#95, CAP-32).
- A student can start a reflection from the gig page. Until then nothing in the UI created
  one (#80, CAP-39).
- Runbook and client demo script (#72, CAP-30).
- Generated dependency, licence and advisory register, rebuilt by `./run deps` (#76, #77,
  CAP-32).
- CI fails when `web/src/api/schema.ts` is stale against the contract, or when Laravel's routes
  and the contract's operations disagree (#71, CAP-25).
- Automated screenshot capture for the User Manual (#73, HO-6).
- Screenshot evidence that every screen has its loaded, loading, empty and error states (#74,
  CAP-21).
- Accessibility and responsive pass: an AA-compliant palette, a table equivalent for the radar,
  and a focus trap in the bottom sheet (#75, CAP-23).
- Agents may set a Jira ticket's assignee, points and sprint, never its wording (#69, ADR #44).

### Fixed
- The reflection editor keeps every edit: the last one is saved on leaving a competency and
  before Submit, a late save no longer wipes text typed meanwhile, and Submit waits for every
  save and re-sends a failed one (#141, CAP-52).
- `./run shots` covers the learning record again, so the User Manual's screenshots can be
  taken (#142, CAP-53).
- No production build can carry the demo sign-in or its tokens (#117, CAP-51, finding F15).
- The export downloads in every browser; Download is a real link to the file (#124, #125,
  CAP-56).
- On a phone the app bar shows who is signed in, and the 404 page has a way back (#126,
  CAP-57).
- The stepper's progress bar leaves room above the card, and a focused text box stays above
  the phone's sticky bar (#129, CAP-61).
- The entry stepper is read-only for anyone but the reflection's owner. A reviewer was being
  offered controls the server then refused (#70, CAP-36, finding F9). Its test now tries the
  writes instead of only checking the controls are disabled (#79).
- Counter-scoring answers 404 to a classmate rather than 403, and refuses the reflection's
  owner whatever role they hold. One person has one role per gig, and the student role wins
  (#99, CAP-43, ADR #47, findings F12 and F13).
- The verify scripts read an `rdiary_` token, and every token reader takes the newest line
  through one helper (#96, #97, CAP-44, CAP-45).
- A reviewer and a stranger are refused on `DELETE /reflections/{id}`, now under test (#91).
- `./run db-tls`, the deploy's proof that the database session is encrypted, failed on every
  run with a MySQL syntax error, because `SHOW ... LIKE ?` cannot take a placeholder (CAP-26).

### Changed
- A polish pass over every screen (#131, CAP-63).
- A rubric's levels are one row of numbers instead of a stack of pills, with a legend of
  names and numbers (#137, #139, CAP-66, CAP-68, ADR #65).
- CI runs `./run verify` against the seeded API after the smoke test, and a skipped live
  half fails it rather than passing quietly (#112, CAP-50).
- Assigning a rubric to a gig is supervisor only. An employer now gets 403, and the framework
  screens show NotFound to anyone who supervises no gig (#100, CAP-46, ADR #48).
- `docs/Stack-and-Build-Scope.md` §4.3 matches the gig page as built, and ADR #49 records
  that an entry and a counter-score have no draft-then-submit and no save popups (#98,
  CAP-47).
- Seeded tokens carry the prefix `rdiary_` and expire after 60 days, and their abilities stay
  `*` (#93, CAP-32, ADR #46). The shared database keeps its old tokens until the team reissues
  them.
- The README, this changelog and the handover documents were checked against the code and
  corrected (#78, #81, #94). `ReflectionController` lost a `RoleResolver` it never used (#87).
- Dependency updates: Laravel 13.25 to 13.34, which cleared four Composer advisories; React
  19.3; React Router 8.4; Vite 8.3; `@types/node` 26, pinned back to ^24 to match Node 24
  (#82); GitHub Actions checkout and setup-node v7, cache v6, upload-artifact v7 (#68, #33,
  #53, #9, #66).

## Sprint 4: 14 to 27 September 2026

### Added
- Gig detail screen (#43, CAP-8).
- Select framework screen (#46, CAP-15) and edit framework screen, copy then edit (#62,
  CAP-16).
- PDF export with dompdf (#44, CAP-17), and the export sheet that requests, polls and
  downloads it (#45, CAP-18).
- Entry stepper for students (#54, CAP-11) and assessors (#56, CAP-13).
- History sheet on the gig page (#61, CAP-14).
- Submitted confirmation screen (#65, CAP-12).
- Browser checks with Playwright against a fake API (#63, ADR #42).
- Injection tests across every screen that renders typed text, and the frontend security
  review signed off (#67, CAP-24).
- Tests that a reviewer is refused on every reflection write, not just the narrative (#60,
  CAP-37).

### Fixed
- The PDF export embeds no document JavaScript (#48, CAP-33).
- Evidence links are limited to http and https (#49, CAP-34).
- The last authorisation checks outside `api/app/Policies/` moved in (#50, #51, CAP-19,
  ADR #40).

## Sprint 3: 24 August to 12 September 2026

### Added
- Typed API client generated from the contract (#13, CAP-2).
- Demo reflections at every status, with shaped scores (#14, CAP-9).
- Design tokens as CSS variables (#15, CAP-1).
- Core components: Card, Button, Chip, Badge, Skeleton and ErrorNotice (#18, CAP-3);
  TextArea, ProgressBar and BottomSheet (#16, #22, CAP-4); RadarPanel (#20, CAP-6).
- Review queue screen (#19, #38, CAP-10).
- App shell: router, token context and role-aware navigation (#30, CAP-5).
- Diary home: scope chips, captioned radar and entry list (#32, CAP-7).
- The framework swap proved end to end with SFIA 9 (#26, #39, #55, CAP-20).
- Demo deployment design and a read-only host check (#23, CAP-26).
- Jira as the source of truth for ticket state, reached by agents through an MCP server
  (#35, #40, #42, ADR #38).

### Fixed
- Every permission-matrix row backed by a policy method, and one home for the reviewer roles
  (#17, #36, CAP-19).

### Security
- A production build can no longer carry a bearer token (#28, CAP-24 finding F1).
- Token handling review of the frontend and the API seam (#24, CAP-24).

## Between Sprint 1 and Sprint 3: 3 to 23 August 2026

No sprint was open on the board for these three weeks. The backend was built in them.

### Added
- The API, its MySQL schema and its OpenAPI contract (#4).
- Task runner (`./run`), the shared-database and docs-location guards, agent configuration,
  and the web scaffold (#3, #5).
- The seventh business rule (#6).
- Dependabot on the three real manifests (#7).

## Sprint 1: 20 July to 2 August 2026

Discovery, design and the technical foundation: the brief, personas, the ERD, the
architecture decision records from ADR #1, and the repository itself (#1, #2). Tracked in
Jira as COA4-1 to COA4-52.
