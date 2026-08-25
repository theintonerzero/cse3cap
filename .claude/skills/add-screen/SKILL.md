---
name: add-screen
description: Build a new React screen or page in the frontend. Use when adding any user-facing view, route, or major component. Covers design tokens, the typed API client, the data-driven radar, and the four required states so a screen is never shipped as a happy path only.
---

# Adding a screen

`docs/Frontend-and-Backend.md` is the seam between `api/` and `web/`. Read it first if you
have not: it covers what crosses between the folders, why types are generated rather than
written, and the drift that does not announce itself.

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

`web/src/api/client.ts`. One wrapper, already built. Do not write a second one, and do not
call `fetch` directly from a component.

```ts
import { api, ApiError } from '../api/client.ts';

await api.get('/auth/me');                                        // no arguments
await api.get('/gigs/{gig_id}', { path: { gig_id } });            // path parameters
await api.get('/reflections', { query: { status: 'draft' } });    // query parameters
await api.post('/reflections', { body: { sprint_id } });          // JSON body
await api.patch('/entries/{entry_id}', { path: { entry_id }, body: { narrative } });
await api.delete('/reflections/{reflection_id}', { path: { reflection_id } });
await api.blob('/exports/{export_id}/download', { path: { export_id } });   // a file
```

`get` `post` `put` `patch` `delete` `blob`. The path string is the contract's, braces and
all: the wrapper fills them from `path` and appends `query`. Options also take `signal` for
a screen that unmounts mid-request, and `headers` when you genuinely need one.

The types are generated into `schema.ts` beside it and are **never edited**. Regenerate with
`npm run gen:types` after any pull that touched the contract. If the shape you need is not
there, the contract is wrong and the contract is what you fix.

**What will not compile,** which is the point: a path the contract does not declare, a verb
it does not serve, a missing or misspelled parameter, a camelCased field, a body on an
endpoint that takes none, a value outside an enum. You do not need to check these by hand.
`api.post('/exports', { body: { format: 'pdf' } })` is one of them: the contract enumerates
`[json]`, and PDF export is a later ticket.

### Errors

Every non-2xx response arrives as `ApiError`, already unwrapped. Never parse a response
body, and never switch on `message`.

```ts
try {
  await api.post('/reflections/{reflection_id}/submit', { path: { reflection_id } });
} catch (error) {
  if (!(error instanceof ApiError)) throw error;
  switch (error.code) {
    case 'EVIDENCE_REQUIRED':
    case 'NARRATIVE_REQUIRED':
      setOffending(error.details.entry_ids);   // the gate names the entries
      break;
    case 'NOT_DRAFT':
      refresh();
      break;
    default:
      setError(error.message);
  }
}
```

`error.code` is one of the contract's codes, or `null` when the response was not the
envelope at all. `error.status` is the HTTP status, or `0` when the request never reached
the API. That pair is what the error state renders: a specific message for a code you
handle, `error.message` for one you do not.

`error.details` is deliberately untyped, because its contents differ per code. If a screen
needs a field in there to be typed, that is a gap in `docs/openapi.yaml`.

### The token

The app shell owns it and calls `setAuthToken(token)` once. A screen never touches it.
Before the shell exists, put a seeded token in `web/.env` as `VITE_API_TOKEN`; that file is
gitignored, which is the only reason a token may go in it.

### Without a backend

`VITE_API_BASE_URL` decides where every call goes. Point it at the prism mock and build
screens with no backend running at all:

```bash
./run mock                                  # http://localhost:4010
```

Because the mock comes from the same file the real API is checked against, a screen built
that way works against the real thing.

### If you change the client

`./run verify` checks it against both servers and against the compiler. Run it.

## What is behind the API

`php artisan db:seed` in `api/` fills the database with a demo the screens are meant to be
built against. Use it. A screen built against an empty database gets its empty state right
and its loaded state wrong, and nobody finds out until the client demo.

Jane's token is the one to develop with. She is the only student on both gigs, so she is
the only one who exercises the scope selector and both rubrics.

| Looking for | Use |
| --- | --- |
| A finished record, two polygons on the radar | Jane, La Trobe gig, sprint 1 or 2, both `assessed` |
| The other rubric, seven point scale, six different axes | Jane, Data migration audit, sprint 1 |
| A reflection waiting on a reviewer | Jane, Data migration audit, sprint 2, `submitted` |
| A draft part-way through the stepper | Noor A, La Trobe sprint 1. Three narratives, two self-scores |
| A big calibration gap | Tom H, La Trobe sprint 1. Two levels over-confident on every axis |
| Almost no gap | Priya R, either sprint |
| A worklist with a part-scored row | Sam's `/review-queue`. Tom's sprint 2 is 2 of 6 |
| Coverage gaps | Noor A. Everyone with an assessed reflection has none |
| An empty state | Any sprint 3, or Sam's `/me/radar`, which is a 404 |

Sam is an assessor on the La Trobe gig only, so use his token to check that a screen scoped
to one gig does not leak the other. Dr Lee supervises both and counter-scores on SFIA.

The shapes are deliberate, not noise. If a chart you build looks like random data, suspect
the chart before the seed. `.claude/skills/seed-data` has the detail, and
`api/tests/Feature/ReflectionSeederTest.php` is what holds those properties in place.

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
to 7. Both must render through the same component with no code change. That is the entire
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
- Did you look at the loaded state against seeded data, not just the empty one?
- Zero raw hex or pixel values?
- Types generated, not hand-written?
- Radar props driven by the framework payload?
