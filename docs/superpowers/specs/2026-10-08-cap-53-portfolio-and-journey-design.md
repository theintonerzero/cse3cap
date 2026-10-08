# CAP-53 · Portfolio and competency journey: design

**Ticket:** CAP-53 (COA4-123). **Date:** 2026-10-08. **Status:** agreed in conversation,
awaiting review of this document.

## Why

The client demo shows the diary on its own. Alumable already has a student portfolio made of
chapters and a skills profile where each skill links to its evidence. Four small additions
make the diary read like the same kind of product, using only the record the diary already
keeps:

1. **Competency journey**: one competency, sprint by sprint.
2. **Portfolio**: every assessed reflection as a chapter.
3. **"No reflection yet" nudge** on the diary home.
4. **"Sent for review"** in place of "Submitted" where the student reads it.

They ship as ordinary diary features, styled with the diary's tokens, not behind the demo flag.

## Constraints

- **No new endpoint, no contract change, no schema change, no reseed.** Every screen reads
  endpoints the API serves today. `docs/openapi.yaml` and `db/01-schema.sql` are untouched.
- **No Alumable API**, and nothing on the VPS changes. The shared MySQL is the only server-side
  piece; the API and web app run on each laptop (`./run dev`, `./run demo`).
- **No business rule is reimplemented in `web/`.** Which counter-score counts is the
  `v_entry_score` view's decision. Every number shown comes from `/me/progress` or
  `/me/radar`, never from picking among `entries[].scores` in the browser. Scores are read
  from entries only to show their comments and who wrote them, all of them, in order.
- **Students only, their own record.** The diary is the student's (CLAUDE.md). A gig on which
  the caller is not a student renders NotFound on these screens, as `/` already treats them.
- **Four states on every screen**: loaded, loading (skeletons), empty, error.
- **Starts after #119 and #120 merge.** Both change `routes.tsx`, `AppShell.tsx` and
  `DiaryHome.tsx`. ADR #61 is #120's, so this design's record is ADR #62.
- **Copy rules:** no "overdue" or "late" anywhere (`gig-timing.ts` header). Plain English.
- **Order of value:** journey, portfolio, nudge, wording. Each part ships on its own if time
  runs out.

## Existing pieces this builds on

| Need | Already there |
| --- | --- |
| Self and counter score per competency per sprint | `GET /me/progress?gig_id=` (one series per competency) |
| Per-sprint comparison for one reflection | `GET /me/radar?gig_id=&sprint_id=` |
| Level descriptors and competency names | `GET /frameworks/{framework_id}` (any signed-in user, FrameworkPolicy::view) |
| Narrative, evidence, every score with its scorer and comment | `GET /reflections/{id}` |
| A student's reflections, filtered | `GET /reflections?gig_id=` and `?status=assessed` |
| Gig, sprints, rubric, participants | `GET /gigs/{id}` |
| Whose reflections the diary shows | `diary-scope.ts` (`student_gigs`, `reflections_in_scope`) |
| Sprint windows in words | `gig-timing.ts` (`sprint_timing`, pinned by `scripts/verify-gig-detail.sh`) |
| Starting a reflection | `StartReflection` inside `GigDetail.tsx` (CAP-39) |
| Back arrow and bar title | `sections.ts`: any unknown diary path is `diary_deep`, so back goes to the diary home. No change needed. |

## 1. Competency journey

**Route:** `/gigs/:gig_id/competencies/:code`. A deeper diary screen, so the bar's back arrow
returns to the diary home and its remembered scope (`diary-return.ts`).

**Way in:** under the radar on the diary home, whenever one gig is in scope and the radar
loaded, a short list headed "Competencies": one row per radar axis, in axis order, showing the
competency's label and the two numbers the radar is drawing ("You 3 · Assessor 4", or "You 3"
with no counter yet). Each row links to that competency's journey for the gig in scope. Under
"All gigs" there is no radar and no list, as today.

**What it shows:**
- Heading: the competency's name, from the framework. Under it: the gig title and the rubric.
- One card per reflection the student has on this gig with a sprint, in sprint order. Each card:
  - "Sprint N" and the reflection's status badge.
  - The two numbers for that sprint from `/me/progress` ("You 3 · Assessor 4").
  - The descriptor of the level the counter-score names, or the self-score when there is no
    counter yet, from the framework: "Level 4: …". None when neither exists.
  - The narrative's opening, about 240 characters, cut at a word.
  - The evidence: links open in a new tab; files and images show their label only, since a
    file is fetched through the API by the stepper, not by URL.
  - Every counter-score comment on this entry, oldest first, with the scorer's name.
  - "Open reflection ›" to `/reflections/:id`.
- A reflection with no sprint (whole-gig) is left out; the journey is about sprints.

**Data:** first `GET /gigs/{id}`, `GET /reflections?gig_id=` and `GET /me/progress?gig_id=`
together; then `GET /frameworks/{gig.framework.id}` and `GET /reflections/{id}` for each
reflection on the gig with a sprint, together. Seeded students have three at most.

**States:**
- Loading: skeleton header and three skeleton cards.
- Empty: the competency exists but the student has no reflection on this gig with a sprint:
  "You have not written about <name> on this gig yet." with a link to the gig.
- Error: `ErrorNotice` with retry, for any failed read.
- NotFound: the gig is 404, the caller's role on it is not student, the gig has no rubric, or
  the code is not one of the rubric's competencies.

## 2. Portfolio

**Route:** `/portfolio`, a deeper diary screen (back to the diary home).

**Way in:** a "Portfolio ›" link on the diary home, below the reflection list, shown once the
student has written anything.

**What it shows:** heading "Portfolio", a one-line intro ("Each assessed reflection is a
chapter of your record."), then one chapter per assessed reflection on a gig where the caller is
a student, newest first by `submitted_at`. Each chapter:
- Title "Sprint N · <gig title>" ("Whole gig · <gig title>" with no sprint).
- "Scored by <names>": the distinct scorers of the counter-scores in that reflection, in order
  of first score.
- One row per competency from `GET /me/radar?gig_id=&sprint_id=` for that reflection's scope:
  label, "You 3 · Assessor 4".
- The evidence across all entries, each labelled with its competency's short label; links as
  in the journey.
- "Open reflection ›".

A whole-gig reflection's chapter uses `GET /me/radar?gig_id=` only.

**Data:** `GET /reflections?status=assessed` and `GET /gigs` together; then, per chapter,
`GET /reflections/{id}` and its `/me/radar`, all together.

**States:**
- Loading: skeleton chapters.
- Empty: "No chapters yet. A reflection becomes a chapter once it has been assessed." with a
  link back to the diary.
- Error: `ErrorNotice` with retry. One failed read fails the screen; partial chapters are not
  worth the extra states at this size.
- A caller who is not a student anywhere gets the same "the diary is the student's own record"
  message the diary home gives.

## 3. "No reflection yet" nudge

On the diary home, when one gig is in scope: the earliest sprint (by ordinal) that has opened,
or has no dates, and has no reflection from this student is named in a small card above the
radar:

> **Sprint 3 has no reflection yet.** [Start reflection]

- The choice is a pure function, `first_unwritten_sprint(sprints, written_sprint_ids, today)`,
  added to `gig-timing.ts` and checked by `scripts/verify-gig-detail.sh` alongside the others:
  not-open sprints never count, the lowest ordinal wins, and it returns null when every opened
  sprint has a reflection.
- `StartReflection` moves out of `GigDetail.tsx` into its own file so both screens use the one
  component, with its double-press guard, its `DUPLICATE_REFLECTION` refresh and its
  `FRAMEWORK_NOT_ASSIGNED` message unchanged.
- It shows whatever else is on the screen, including above "Nothing in your diary yet".
- It never says overdue, late or due. A past sprint is named the same as an open one.

## 4. "Sent for review"

The status value stays `submitted` in the API, the schema and the route
`/reflections/:id/submitted`. Only what a person reads changes:

| Where | Now | Becomes |
| --- | --- | --- |
| `Badge` label for `submitted` (diary, export, gallery) | Submitted | Sent for review |
| `Submitted.tsx` heading, four places | Submitted | Sent for review |
| `Submitted.tsx` "has not been submitted yet" | has not been submitted yet | has not been sent for review yet |
| `DiaryHome.tsx` row date | Submitted 29 Aug | Sent 29 Aug |
| `gig-timing.ts` `sprint_progress` self column, submitted and assessed | Submitted | Sent for review |
| `history-log.ts` event label | Reflection submitted | Sent for review |
| `ExportSheet.tsx` count | N submitted | N sent for review |
| `EntryStepper.tsx` student button | Submit / Submitting… | Send for review / Sending… |

The assessor's "Submit scores" is unchanged: it is a different act. `verify-gig-detail.sh`,
the Playwright specs that read these strings, the User Manual text and the screenshot
manifest's captions change with them.

## Testing

- **Playwright, failing first** (ADR #42): one spec per part, each with its own ids and data,
  in the style of `diary-home.spec.ts`. Analytics responses (`/me/progress`, `/me/radar`) are
  served by the spec with `page.route`, as the existing radar specs do; the fake serves shapes,
  never rules.
- **The fake gains two shapes only:** the `status` filter on `GET /reflections`, mirroring
  `ReflectionController::index`'s `->when`, and nothing else. `GET /frameworks/:id` and
  `GET /reflections/:id` are already served.
- **Each spec asserts** the loaded content, the skeleton (with `api.hold`), the empty state,
  the error state with retry (with `api.fail`), NotFound where it applies, and that
  `api.unexpected` stays empty.
- **Pure function:** `first_unwritten_sprint` cases in `scripts/verify-gig-detail.sh`.
- **Gates:** `./run e2e`, `./run check`, `./run lint`; `node scripts/check-contrast.mjs` if a
  new colour pairing appears (none is planned: existing tokens only).
- **Visual check** of both new screens at a phone width and a desktop width, on seeded data
  (Jane, La Trobe gig) when the shared database is reachable, otherwise on the fake.

## Documentation

- **ADR #62**, "Portfolio and competency journey are read-only views over existing endpoints":
  why no new endpoint (time, the analytics-in-views rule, no contract churn five days from the
  deadline), the request count it costs, and the two endpoints it would take later. It also
  records the "Sent for review" wording as matching the host product's language.
- **`docs/Demo-Script.md`:** after the radar, Jane opens Communication's journey, then her
  portfolio. Noor starts her reflection from the nudge rather than through Gig details.
- **User Manual and screenshot manifest:** the new wording, and shots of the two new screens.

## Not in this

- New endpoints, aggregation in PHP, or caching. If the request count ever matters, ADR #62
  names the two endpoints that would replace it.
- A journey or portfolio for reviewers, or for a student other than the caller.
- A Portfolio item in the nav. The way in is from the diary home only, so the nav Patrick
  reviewed does not change.
- Sharing or exporting a portfolio. The JSON export already carries the whole record.
- Anything gamified (levels as achievements, streaks, points).
