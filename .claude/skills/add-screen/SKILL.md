---
name: add-screen
description: Build a new React screen or page in the frontend. Use when adding any user-facing view, route, or major component. Covers design tokens, the typed API client, the data-driven radar, and the four required states so a screen is never shipped as a happy path only.
---

# Adding a screen

A screen is not done when it renders data. It is done when it renders correctly with no
data, slow data, and broken data as well.

## The four states, not three

Every screen ships **loaded, loading, empty, and error**. A PR with only the happy path is
not finished, and the empty state is usually the first thing a real user sees.

**Loading** uses skeletons that match the shape of the content, not a spinner. A spinner
tells the user nothing about what is coming.

**Empty** is a designed state with an action, not a blank area. The empty diary is a new
student's first impression: it should say what the diary is for and offer the first entry.

**Error** surfaces the error envelope's `message`, and switches on `code` where the code
carries specific meaning. The submit gate returns `details.entry_ids`, so the entry stepper
should highlight the offending competencies rather than showing a generic failure.

## Tokens, never raw values

All colour, spacing and radius come from CSS variables in `web/src/tokens.css`. No hex
values, no magic pixel numbers in components.

```css
/* yes */   background: var(--color-surface); padding: var(--space-16);
/* no  */   background: #FFFFFF; padding: 16px;
```

Light and dark are both supported through a `data-theme` attribute, which only works if
every value is a token. One hardcoded colour breaks dark mode silently.

## The API client

One typed fetch wrapper in `web/src/api/`. Types are generated from `docs/openapi.yaml` with
openapi-typescript. Never hand-write a response type — if the shape you need is not in the
generated types, the contract is wrong and that is the thing to fix.

The wrapper attaches the bearer token and unwraps the error envelope centrally, so components
handle a typed error rather than parsing JSON.

Until an endpoint exists, develop against the mock: `prism mock docs/openapi.yaml`.

## Reusable components first

Check `web/src/components/` before building anything. The core set is Card, Button, Chip,
Badge, TextArea, ProgressBar, BottomSheet, RadarPanel, Skeleton, ErrorNotice.

If you need a variant of an existing component, extend it with a prop rather than copying
it. Two nearly identical components drift within a fortnight.

The entry stepper and the assessor stepper are **one component with a mode prop**, not two
builds. Same layout, same progress bar; assessor mode makes the narrative and evidence read
only, shows the student's self-score, and requires a comment when scoring lower.

## The radar is data driven

`RadarPanel` takes axes and scale as props. Never hardcode six axes or a four point scale. La
Trobe's rubric has six competencies scored 1 to 4; SFIA 9 has different competencies scored 1
to 7. Both must render through the same component with no code change — that is the entire
point of the framework engine.

The radar's caption changes with scope: whole record shows the latest score per competency, a
single sprint shows a true self versus assessor comparison. An unlabelled radar is ambiguous,
so the caption is not decoration.

When every assessor value is null, hide the second polygon rather than drawing a flat shape
at zero.

## Roles

Role-aware navigation comes from `/auth/me` participations. The same user can be a student on
one gig and an assessor on another, so role is per gig, never global.

Client side role checks are for UX only. The server enforces authorisation. Never rely on
hiding a button as a security measure.

## Before you say it is done

- All four states implemented?
- Zero raw hex or pixel values?
- Types generated, not hand-written?
- Radar props driven by the framework payload?
