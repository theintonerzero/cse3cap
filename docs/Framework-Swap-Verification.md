# Verifying the framework swap

**Date:** 2026-09-08 · **Ticket:** CAP-20 · **Commit verified:** `2407e94`

Definition of done item 5 reads: "Switching a gig to SFIA 9 changes the axes, the scale, and
every level descriptor with no code change." This is the record of testing that, including
the parts of it that turned out not to be testable.

Reproduce with `./run swap`, which runs `scripts/verify-framework-swap.sh` against a running
API. It needs Jane's token, because she is the only seeded student on both rubrics.

## Result

15 checks, all passing, against the real API on the shared database.

```
==> One student, two gigs, two rubrics
  ok     GET /gigs is 200
  ok     a gig carrying latrobe6
  ok     a gig carrying sfia9
  ok     the two gigs point at different frameworks

==> The rubric is data: same endpoint, different competencies and scale
  ok     latrobe6 competencies are its own
  ok     sfia9 competencies are its own
  ok     latrobe6 has four levels per competency
  ok     sfia9 has seven
  ok     the codes differ entirely

==> The radar reads its axes and scale from whichever rubric the gig has
  ok     latrobe6 radar scale is 1-4
  ok     sfia9 radar scale is 1-7
  ok     the scale actually changed with the rubric
  ok     latrobe6 radar axes are its competencies
  ok     sfia9 radar axes are its skills
  note   both rubrics have 6 axes, so this swap cannot show the axis count is data-driven

==> A gig keeps the rubric it was given
  ok     a second rubric on a gig is refused

15 passed
```

## What this proves

**The rubric is data, not code.** `GET /frameworks/{id}` and `GET /me/radar` are one
implementation each. Called against the La Trobe gig they answer with six La Trobe
competencies on a 1–4 scale; called against the SFIA gig they answer with `PROG, DESN, TEST,
DATM, RLMT, METL` on a 1–7 scale. The competency codes, the human labels, the level
descriptors and the scale all follow the gig's assignment.

No code was changed to make that happen, which is the claim the product rests on. Nothing in
`api/` or `web/` was touched for this ticket beyond adding the verification script itself.

**A gig keeps the rubric it was given.** A second assignment is refused, consistent with
ADR #33 and the unique key added in ADR #35. The swap is a per-gig decision taken once.

## What this does not prove, and cannot against the current seed

The ticket's acceptance criteria assume properties the seeded data does not have. Recorded
here rather than quietly passed over, because a verification that claims more than it tested
is worse than none.

**1. That the axis count is not hardcoded.** Both frameworks have exactly six competencies.
No swap between them can ever change the number of axes, so only half of CLAUDE.md's rule —
"never hardcoded to six axes or a four-point scale" — is exercised. The scale half is proven;
the axis half is not, and would need a third framework with a different competency count.

**2. That skills valid over part of the scale render correctly.** CAP-20 states that "each
skill is valid over only part of the seven levels, so the ranges are uneven per competency".
That is not true of the seed: all six SFIA competencies carry all seven levels.
`db/01-schema.sql` seeds them with a `CROSS JOIN` and says why in a comment above it — real
SFIA restricts each skill to a subrange, deferred until Alumable supplies their mapping.
There is currently nothing uneven for the radar to cope with.

**3. That the radar could cope if there were.** This is the finding worth acting on.
`v_framework_scale` groups by `framework_id` and returns one `scale_min`/`scale_max` for the
whole framework, and the `/me/radar` contract carries that single pair with no per-axis
range. So a skill valid only over levels 5–7, scored at its floor of 5, plots at five sevenths
of the radius and reads as mediocre when it is in fact the minimum that skill can hold.

The stepper is unaffected: it reads levels per competency from `GET /frameworks/{id}`, where
the real ranges do arrive. The flattening is specific to the radar.

**4. SFIA cannot be corrected in place.** It is already referenced by two reflections on the
"Data migration audit" gig, so it is permanently read-only (`409 FRAMEWORK_IN_USE`). Its
ranges cannot be narrowed by anyone; correcting them means a new framework.

**5. There is no `POST /gigs`.** The ticket asks for "a new gig, not an edited seed", but gigs
mirror Alumable through `external_ref` and the API deliberately does not create them. A new
gig can only come from a seeder. Verification therefore ran against the existing SFIA gig,
which is seeded reference data rather than an edited seed, and satisfies the intent of that
criterion — nothing was mutated to make the test pass.

## What should happen next

**Decide on finding 3.** Either the flattened scale is accepted, and the radar's caption says
what the scale means, or per-competency ranges should reach the radar — a change to
`v_radar`, the contract and the frontend, which is an ADR and a ticket of its own, not
something to slip into this one.

**Someone should chase Alumable for the SFIA skill-to-level mapping.** The schema has been
waiting on it since it was written, and findings 2 and 3 both stay theoretical until it
arrives. Once it does, the corrected framework is a new one, seeded alongside the existing
SFIA rather than replacing it.

**Do not narrow the seeded SFIA ranges.** Out of scope per the scope document, and blocked by
the framework-in-use rule regardless.

## Outstanding for this ticket

The screenshot for the client demo. The component gallery already renders `RadarPanel` with
both fixtures — six axes at 1–4 and six different axes at 1–7 — at
`web/src/gallery/Gallery.tsx:258-260`, so `./run web` and `localhost:5173/gallery.html` shows
the swap visually without needing the stepper, which does not exist yet (CAP-11).
