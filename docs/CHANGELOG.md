# Changelog

Notable changes to the Alumable Reflection Diary. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

v1.0.0 is the first tagged release. Nothing was tagged before it, so the history leading up to
it is grouped by sprint instead of by version, with the pull request for each change. Ticket
keys are the repository's `CAP-n`; Jira holds the same tickets as `COA4-n` (ADR #38).

## [Unreleased]

Becomes **1.0.0**, planned for 12 October 2026: `dev` merged to `main` and tagged (CAP-30).

### What 1.0.0 contains

- A Laravel 13 API on MySQL 9.7: thirty endpoints, all seven business rules in their own
  service classes, authorisation in policies, and one error envelope for every failure.
  Contract in `docs/openapi.yaml`.
- A React 19 frontend: the diary home with its captioned radar, the gig page and its history,
  the entry stepper for students and assessors, the submitted confirmation, the review queue,
  framework selection and copy-then-edit, and export to JSON and PDF.
- A swappable rubric: La Trobe's six competencies and SFIA 9 run through the same code
  (`docs/Framework-Swap-Verification.md`).
- Demo data shaped to show calibration gaps, three seeded tokens in place of a login
  (ADR #15), and a runbook and client demo script (`docs/Runbook.md`, `docs/Demo-Script.md`).

### Known limitations at 1.0.0

- No login screen. Access is three seeded Sanctum tokens (ADR #15). Tokens never expire,
  carry every ability and have no prefix a secret scanner can match (F2 to F4 in
  `docs/Security-Review.md`).
- No rule yet for serving evidence files, and any file type is accepted (F8). It becomes
  high severity the day a download lands.
- No live Alumable integration. The `external_ref` columns are empty because the team never
  had access to the platform.
- No erasure or anonymisation. The `RESTRICT` constraints make deleting a student a
  deliberate act, and none of it is implemented (`docs/Retention-and-Erasure.md`).
- The seeded SFIA 9 copy uses levels 1 to 7 for every skill until Alumable supplies the real
  ranges. Whether the radar should show each skill's own range is ADR #41, still open
  (`docs/Framework-Swap-Verification.md`).
- `GET /me/progress`, `/me/calibration` and `/me/coverage` are built and tested, but no
  screen shows them yet.
- No deployed instance. The demo deployment is designed but not built
  (`docs/superpowers/specs/2026-09-06-demo-deployment-design.md`).
- The seeded gigs run 3 August to 26 October 2026, so after that the demo shows only past
  gigs.
- Each `./run smoke` leaves a renamed framework copy in the database it runs against.

## Sprint 5: 30 September to 13 October 2026

### Added
- Design inventory: every Figma prototype frame by node ID, what the build did with it and
  why, and the `/design-inventory` skill that refreshes it (CAP-40).
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
- The entry stepper is read-only for anyone but the reflection's owner. A reviewer was being
  offered controls the server then refused (#70, CAP-36, finding F9). Its test now tries the
  writes instead of only checking the controls are disabled (#79).

### Changed
- Dependency updates: Laravel 13.25 to 13.34, which cleared four Composer advisories; React
  19.3; React Router 8.4; Vite 8.3; `@types/node` 26; GitHub Actions checkout and setup-node v7,
  cache v6, upload-artifact v7 (#68, #33, #53, #9, #66).

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
