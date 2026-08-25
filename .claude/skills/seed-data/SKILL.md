---
name: seed-data
description: Create or modify demo and seed data for the shared database. Use when adding or changing users, gigs, sprints, reflections or scores in the Laravel seeders under api/database/seeders. Encodes which of the two seeders a change belongs in, the shaped-score approach, written narratives, and the rules for a database five people share.
---

# Seed data

The seed data is what everyone develops against and what gets demonstrated. Random data
makes the radar chart meaningless and the demo unconvincing, so it is built deliberately.

## Read this before you add a row

There are two seeders and putting a change in the wrong one breaks the test suite.

| File | Holds | Runs as |
| --- | --- | --- |
| `DemoSeeder` | The cast. Jane, Sam, Dr Lee, two gigs, their sprints, participants, rubric assignments, the three tokens. | `php artisan db:seed --class=DemoSeeder` |
| `ReflectionSeeder` | The record. Three more students, nine reflections, narratives, scores, evidence. Calls `DemoSeeder` first. | `php artisan db:seed` |

**Never seed a reflection from `DemoSeeder`.** Ten feature test classes call
`$this->seed(DemoSeeder::class)` in `setUp` and then write the reflection they are about to
assert on. `AnalyticsTest` alone does it for Jane on La Trobe sprint 1 in ten of its
thirteen tests. `reflections` has a unique key on `(user_id, gig_key, sprint_key)`, so a
seeded reflection on that sprint is a 1062 in every one of them. `DemoSeeder` is the test
fixture. Keep it minimal: something added there is added to ten tests. See ADR #37.

Anything about the demo goes in `ReflectionSeeder`, including new students.

## The database is shared

MySQL runs on one VPS. Everyone sees the same rows.

- **Treat existing seeds as fixed reference data.** Create new rows to experiment. Editing
  the seeds changes what everyone else sees, including mid-demo.
- **Announce reseeds in the channel** before running them.
- Seeds must be **idempotent or explicitly destructive**, never half applied.

## Build rows by calling the services, not by inserting them

`ReflectionSeeder` builds every reflection through `ReflectionCreator`, `SubmitGate` and
`Scoring`, the same classes the controllers call. Do the same for anything you add.

It costs speed and buys three things. The seed obeys the submit gate, the comment rule and
the level-in-competency rule by construction, and keeps obeying them when those rules
change. Every reflection arrives with its events already written, so the History sheet has
real data without the seeder knowing what an event is. And it cannot produce a state the
API could not, which is the failure mode raw inserts have: demo data that quietly disagrees
with the product.

Roles are resolved with `RoleResolver` rather than named in the spec, for the same reason
they are never read from a request.

**Never write `gig_key` or `sprint_key`.** They are database-generated, absent from
`$fillable`, and MySQL refuses the write with error 3105. Timestamps are backdated through
the query builder naming only the timestamp columns, never through the model.

## Dependency order

```
frameworks -> competencies -> levels
users -> gigs -> sprints -> gig_participants
framework_assignments
reflections -> reflection_entries -> scores, evidence
events, exports
```

`reflections.framework_version` is a snapshot copied at creation. Set it from the framework
row; never leave it blank or derive it later. `ReflectionCreator` already does this.

## Scores are shaped, not random

Uniform random levels produce a radar that looks like noise and says nothing. Shaped scores
produce a chart that tells a story, which is the whole point of the visualisation.

Each student in `ReflectionSeeder::PLAN` carries three arrays in rubric position order:

- `ability` is their hidden true level per competency.
- `self_bias` is how far above it they rate themselves. Students rate themselves
  optimistically, and that optimism is what the calibration gap view exists to surface.
- `counter_nudge` is where the assessor disagrees with the truth. Small, and not always in
  the same direction.

Self is `ability + self_bias`, counter is `ability + counter_nudge`, both clamped to the
levels the competency actually has. The calibration gap is the difference between the two
arrays, so it is a deliberate shape rather than noise.

The four shapes already there, which a new student should differ from rather than repeat:

| Student | Shape | What it makes demonstrable |
| --- | --- | --- |
| Jane N | Improving across sprints, optimism shrinking as she improves | The progress chart, and both rubrics: she is the only student on SFIA |
| Priya R | Well calibrated, polygons almost coincide | That the gap view is measuring something, not always firing |
| Tom H | Two levels over-confident, every counter-score below his own | The comment-required rule, and a big honest gap |
| Noor A | Three days in. Three narratives, two self-scores, nothing submitted | Coverage gaps, and a stepper part-way through |

## Narratives are written, not generated

Do not use lorem ipsum or faker's paragraph output. Narratives are read aloud at demos and
shown in screenshots, and word salad undermines everything around it.

`ReflectionSeeder::NARRATIVES` is a pool per competency code, three per La Trobe competency
and two per SFIA skill, reused across students by an offset on each spec. A good one is
specific and shows the competency being claimed:

> When the tagger kept mis-classifying reflections I stopped tuning prompts and checked the
> rubric mapping instead, which turned out to be the real fault.

A narrative that does not match the competency it sits under is worse than none, so add to
the pool for that code rather than to a general list. Counter-score comments are pooled by
whether the score is below, level with or above the student's own, because that is what an
assessor is actually writing about.

Faker is fine for names, dates and company names. Not for the reflections.

## Coverage

Seed at least one row of every state a screen can render, or empty states never get tested.
What the two seeders currently give you:

- [x] Reflections at `draft`, `submitted` and `assessed`
- [x] A student on two gigs, so the diary scope selector has something to switch between
- [x] A gig with future sprints not yet open
- [x] Entries with and without evidence
- [x] At least one counter-score lower than the self score, with its required comment
- [x] Both frameworks assigned somewhere, so the framework switch can be demonstrated
- [x] A submitted reflection part-way through one reviewer's queue, so the worklist has a
      progress column worth rendering
- [x] A student with coverage gaps, and one with none
- [ ] One framework copy owned by the supervisor and not in use, so the editor is
      reachable. Not seeded: it would change `GET /frameworks` from two rows to three and
      break `FrameworksTest`. `scripts/smoke.sh` creates one on every run, so the shared
      database has several

## Leave smoke somewhere to write

`scripts/smoke.sh` writes a reflection as Jane on the first sprint of the La Trobe gig she
has not used, so `ReflectionSeeder` deliberately leaves her third one alone. Fill it and
smoke's entire write path becomes a skipped warning that still reports a pass.

This cuts both ways on a database smoke has already run against. Idempotency is per student
and per sprint, so a sprint that already has a reflection is left alone, and three smoke
runs fill all three of Jane's La Trobe sprints. Seeding after that skips her La Trobe
reflections and leaves the demo showing placeholder narratives. Check before seeding a
shared instance, and delete her smoke reflections if they are in the way.

## The three tokens

Three seeded users with Sanctum tokens, one per role: student, assessor, and supervisor
which also covers the educator screens. `DemoSeeder` issues them and prints the plain text
once, because Sanctum stores only a hash and it cannot be recovered afterwards. Pin them in
the team channel. Keep them stable: reissuing breaks everyone's setup at once. The extra
students `ReflectionSeeder` adds get no tokens, deliberately.

## Determinism

Every team member's database should look identical, so a radar screenshotted for slides
matches what everyone else sees. There is no seeded random generator: the profiles are
explicit arrays and the narratives are picked by a fixed offset, which is a stronger
guarantee than a seeded PRNG and easier to read.

Where something has to vary, derive it from a stable value rather than from an id. The
per-student timestamp nudge uses `crc32(display_name)`, because ids differ per database.

## Prove it

`api/tests/Feature/ReflectionSeederTest.php` asserts the properties the demo depends on:
every status present, both scales, the three calibration shapes, the narratives being
prose, no blank counter-score comments, the generated columns untouched, the timeline in
order, and idempotency. Add to it when you add to the seeder. It seeds in `setUp`, which
costs about fifteen seconds per test, so group assertions by theme rather than writing one
test per fact.
