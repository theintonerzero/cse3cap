# CAP-53 · Learning record and the reflection nudge: design

**Ticket:** CAP-53 (COA4-123). **Date:** 2026-10-09, revised from the 2026-10-08 draft.
**Status:** agreed in conversation, awaiting review of this document.

## Why

The diary was built from the team's Figma prototype, and two of that prototype's diary frames
were left out with no recorded reason (`docs/Design-Inventory.md`):

- **Your learning record, `86:936`.** A competency by sprint grid of self and assessor scores,
  one section per gig. The inventory row: "No per-framework sections with a competency by
  sprint grid of self and assessor scores. [TODO: Patrick] no recorded reason."
- **Reflection Diary hub, `66:34`.** A line at the top: "2 sprints need your reflection this
  week." The Home page card `1:135` carries the same due-sprint nudge.

Building both makes the client demo show the diary as the team designed it, and closes two
inventory gaps. The first draft of this spec also proposed a Portfolio screen and "Sent for
review" wording. Both are dropped: the inventory marks Alumable's profile and its Portfolio
tab as `host app` (`81:701`, `81:851`), and the prototype's own wording is "Submit entry" and
"Entry submitted".

## Constraints

- **No new endpoint, no contract change, no schema change, no migration, no reseed.**
  `docs/openapi.yaml` and `db/01-schema.sql` are untouched.
- **No business rule in `web/`.** Every score shown comes from `GET /me/progress`, which reads
  `v_radar` and so `v_entry_score`, where "the latest counter-score counts" lives. The browser
  never picks among `entries[].scores`.
- **Students only, their own record**, as the diary home already decides with `student_gigs`.
- **Four states on every screen.**
- **No "overdue", "late" or "due" judgement** (`gig-timing.ts` header). The nudge counts
  sprints that have opened and have nothing written; it does not say they are late.
- **It goes live on merge.** The live demo on `accord` deploys `dev` (CAP-54, ADR #62). With no
  migration, nothing else changes on the box. `./run demo` on a laptop picks it up the same way.
- **Existing tokens only.** Self is `--color-primary` and assessor is `--color-success`, as on
  the radar. Both on `--color-surface` are already in `scripts/check-contrast.mjs`.
- **Deadline.** Merged by 12 October to count as built in the Assessment 3 report. The nudge is
  smaller and independent, so it goes first.

## 1. The nudge, on the diary home

**Rule.** A sprint needs a reflection when it has opened, or has no dates, and this student has
no reflection on it. A pure function in `gig-timing.ts`:

```ts
export function sprints_needing_reflection<
  S extends DatedSprint & { id: string; ordinal: number },
>(sprints: S[], written_sprint_ids: ReadonlySet<string>, today: Date): S[];
```

It returns them in ordinal order. `sprint_timing(...).state === 'not_open'` is the only state
left out. `scripts/verify-gig-detail.sh` checks it with the other gig-timing functions.

**What the student sees.** A short card above the radar: the sentence in `--color-primary` on
`--color-surface`, like the frame's purple line, with the button beside it. On the page's own
background `--color-primary` passes AA only at large sizes, so the card is what makes the
normal-size text pass:

| Scope    | Sprints needing one | Shows                                                                                                     |
| -------- | ------------------- | --------------------------------------------------------------------------------------------------------- |
| One gig  | none                | nothing                                                                                                   |
| One gig  | one                 | "Sprint 3 needs your reflection." and **Start reflection**                                                |
| One gig  | two or more         | "2 sprints need your reflection." and **Start Sprint 1**                                                  |
| All gigs | none                | nothing                                                                                                   |
| All gigs | one or more         | "N sprint(s) need(s) your reflection. Pick a gig to start." No button: there is no single gig to start in |

The button starts the earliest. It is `StartReflection`, moved out of `GigDetail.tsx` into
`web/src/screens/StartReflection.tsx` with its double-press guard, its `DUPLICATE_REFLECTION`
refresh and its `FRAMEWORK_NOT_ASSIGNED` message unchanged, and a `label` prop so the diary can
name the sprint. GigDetail renders it exactly as before.

It needs no new request: `GET /gigs` and `GET /reflections` are already loaded. It shows above
"Nothing in your diary yet" too, so a new student gets one obvious first action.

## 2. Your learning record

**Route:** `/record`. Under `sections.ts` an unknown diary path is `diary_deep`, so the bar says
"Reflection Diary" and back returns to the diary home. No change there.

**Way in:** a "Your learning record ›" link on the diary home, under the reflection list,
whenever the student has written anything.

**Layout, following `86:936`:**

1. Heading **Your learning record**.
2. A summary card: "N reflections · M gigs", then "K rubrics · since <earliest gig start>",
   then the note "Yours to keep. Export it whenever you like." (The frame's "stays available
   after graduation" is the host app's promise, not something the diary can make.)
3. One section per gig the student has a reflection on, in the order `GET /gigs` returns them:
   - A small uppercase label: the rubric's name.
   - A card: the gig title, "N sprints" on the right, then a table:
     - Header row: "Competency", then "S1" to "Sn" for every sprint on the gig.
     - One row per competency, in rubric order, labelled with its short label.
     - Each cell "3/4": self in `--color-primary`, assessor in `--color-success`. A missing
       value is "–". A sprint with no reflection is "–" alone.
   - Under the table: "self / assessor" in the two colours, and "levels 1–4 · – not yet" with
     the rubric's own scale.
   - "Open the N reflections ›", to the diary home scoped to that gig (`/?gig_id=<id>`).
4. A muted note: "Scores from different rubrics aren't compared. Each section uses its own
   scale."
5. **Export record**, opening the existing `ExportSheet` in a `BottomSheet`, as the diary home
   does.

The table is a real `<table>` with a `<caption>` (the gig title) and `scope` on its headers,
and scrolls sideways inside its card when a gig has more sprints than fit on a phone.

**Data.** `GET /gigs` and `GET /reflections` together. Then, for each gig in the record,
`GET /me/progress?gig_id=` and `GET /frameworks/{gig.framework.id}` together. Rows and labels
come from the framework's competencies, in `position` order, so a competency with nothing
scored still gets its row. Cells come from progress, matched by competency `code` and
`sprint_ordinal`. The scale comes from the framework's `scale`. Jane has two gigs, so five
requests in all.

**States:**

- **Loading:** a skeleton summary card and two skeleton sections.
- **Empty:** a student with no reflection on any gig: "Your record starts with your first
  reflection." and a link back to the diary.
- **Error:** `ErrorNotice` with retry. One failed read fails the screen.
- **Not a student anywhere:** the diary home's "The diary is the student's own record" message.

## Testing

- **Playwright, failing first** (ADR #42). One spec per part, with its own ids, in the style of
  `diary-home.spec.ts`. `/me/progress` and `/me/radar` are served by the spec with
  `page.route`, as the existing radar specs do. The fake serves shapes, never rules, and needs
  nothing new.
- **The nudge spec:** one gig with one, two and no sprints needing a reflection; All gigs;
  pressing the button posts `POST /reflections` with the earliest sprint and lands in the
  stepper; a not-yet-open sprint is never counted; GigDetail's own Start reflection still works.
- **The record spec:** the grid's cells, "–" for a missing value and a missing sprint, the
  scale line, two sections for two gigs, the link to the scoped diary, Export opening the sheet,
  loading with `api.hold`, error and retry with `api.fail`, empty, not a student, the diary's
  link in, and the back arrow. One phone-width check that the page does not scroll sideways.
- **The pure function:** cases in `scripts/verify-gig-detail.sh`, east and west of UTC as the
  existing cases run.
- **Gates:** `./run e2e`, `./run lint`, `./run verify-gig`, `npm run build` in `web/`,
  `python3 scripts/check-docs.py`, `node scripts/check-contrast.mjs`.
- **A look** at both at a phone width and a desktop width on seeded data (Jane), through
  `./run demo` when the shared database is reachable, otherwise on the fake.

## Documentation

- **ADR**, next free number (ADR #62 is the live demo's, and HO-9 plans two more): "The
  learning record reads the analytics endpoints and adds none". Why no endpoint (the
  progress endpoint already returns the grid, the deadline, no contract churn), what it costs
  (two requests per gig), and the endpoint that would replace them later.
- **`docs/Design-Inventory.md`:** `86:936` becomes `changed` with the record's route and what
  still differs; `66:34` notes the nudge is built. Counts updated.
- **`docs/Stack-and-Build-Scope.md` §4.3:** the screen list gains the learning record.
- **`docs/Demo-Script.md`:** section 1 opens the learning record after the radar; section 2's
  Noor starts her reflection from the nudge.
- **`docs/CHANGELOG.md`:** a line under the current sprint's Added.

## Not in this

- A Portfolio screen, the Profile page, or anything else the inventory marks `host app`.
- "Sent for review" wording.
- A per-competency detail page. HO-9's "From your earlier sprints" already shows a student
  their own earlier entries for a competency, in the stepper.
- New endpoints, aggregation in PHP, caching.
- The record for a reviewer, or for anyone but the signed-in student.
- New screenshots in `web/e2e/shots/manifest.ts`. A follow-up, if the handover report wants
  the record pictured.
