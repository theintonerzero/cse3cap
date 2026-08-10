---
name: seed-data
description: Create or modify demo and seed data for the shared database. Use when adding or changing users, gigs, sprints, reflections, scores or frameworks in db/02-seed.sql or Laravel seeders. Encodes the shaped-score approach, written narratives, and the rules for a database five people share.
---

# Seed data

The seed data is what everyone develops against and what gets demonstrated. Random data
makes the radar chart meaningless and the demo unconvincing, so it is built deliberately.

## The database is shared

MySQL runs on one VPS. Everyone sees the same rows.

- **Treat existing seeds as fixed reference data.** Create new rows to experiment. Editing
  the seeds changes what everyone else sees, including mid-demo.
- **Announce reseeds in the channel** before running them.
- Seeds must be **idempotent or explicitly destructive**, never half applied.

## Dependency order

```
frameworks -> competencies -> levels
users -> gigs -> sprints -> gig_participants
framework_assignments
reflections -> reflection_entries -> scores, evidence
events, exports
```

`reflections.framework_version` is a snapshot copied at creation. Set it from the framework
row; never leave it blank or derive it later.

## Scores must be shaped, not random

Uniform random levels produce a radar that looks like noise and says nothing. Shaped scores
produce a chart that tells a story, which is the whole point of the visualisation.

Give each fake student a hidden ability profile: a "true" level per competency. Then:

- **Self-scores** sample near the true value with a slight upward bias. Students tend to rate
  themselves optimistically, and that optimism is exactly what the calibration gap view
  exists to surface.
- **Assessor scores** sample near the true value with less noise and no bias.
- **Vary by student.** One well calibrated, one consistently over-confident, one improving
  across sprints. Three different shapes make the demo far more convincing than three
  identical ones.

The result is that `v_calibration_gap` returns meaningful numbers and the radar shows two
polygons that diverge in interesting places rather than randomly.

## Narratives are written, not generated

Do not use lorem ipsum or faker's paragraph output. Narratives are read aloud at demos and
shown in screenshots, and word salad undermines everything around it.

Write ten to fifteen genuine reflections and reuse them across students. A good one is
specific and shows the competency being claimed:

> When the tagger kept mis-classifying reflections I stopped tuning prompts and checked the
> rubric mapping instead, which turned out to be the real fault.

Faker is fine for names, emails, dates and company names. Not for the reflections.

## Coverage

Seed at least one row of every state a screen can render, or empty states never get tested:

- Reflections at `draft`, `submitted` and `assessed`
- A student on two gigs, so the diary scope selector has something to switch between
- A gig with future sprints not yet open
- Entries with and without evidence
- At least one counter-score lower than the self score, with its required comment
- Both frameworks assigned somewhere, so the framework switch can be demonstrated
- One framework copy owned by the supervisor and not in use, so the editor is reachable

## The three tokens

Three seeded users with documented Sanctum tokens, one per role: student, assessor, and
supervisor which also covers the educator screens. Token values go in `db/02-seed.sql` and
are pinned in the team channel. Keep them stable. Changing them breaks everyone's setup at
once.

## Determinism

Seed the random generator with a fixed value so every team member's database looks
identical. When someone screenshots the radar for slides, it should match what everyone else
sees.
