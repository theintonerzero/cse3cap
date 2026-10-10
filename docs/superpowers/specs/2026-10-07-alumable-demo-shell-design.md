# Alumable demo shell — design

A thin, flag-gated demo harness that makes the finished Reflection Diary read as
a feature living inside Alumable, for the client demo to David Yip. It adds an
Alumable-branded entry and a gig home around the diary we already have. It
reconstructs none of Alumable's own features, changes no product code path, and
touches neither the schema nor the API contract.

Decided with the team on 2026-10-07. Brainstormed from the request "bring
Alumable's features around our diary for a full end-to-end demo." Two things
shaped the answer. Rebuilding Alumable's own features is neither possible nor
useful here: they are Alumable's, they live on Alumable's platform, and almost
none of them touch the diary's story. And the diary is not half-built: it is an
end-to-end app with its own gigs, sprints, server-resolved roles, scoring and a
written 15-minute demo in `docs/Demo-Script.md`. So the work is framing, not
reconstruction.

## What the demo needs, and what it does not

The diary already runs the whole student → assessor → supervisor story against
seeded data. The gap for a CEO is that it opens on "paste a token," not on
anything that looks like Alumable. This harness closes that gap and nothing more.

- **Build:** an Alumable sign-in, an Alumable "My Gigs" home, and the Alumable
  chrome that frames them, all over the diary's real data and real auth.
- **Do not build:** chat, contracts, profiles, gig discovery or apply, payments,
  real SSO, or any Alumable backend. The non-Gigs items in the bottom nav are
  cosmetic and disabled. None of this serves the diary story, and most of it is
  explicitly out of scope in CLAUDE.md.

## It is a harness, not product

One environment flag, `VITE_DEMO_SHELL`, decides which entry the app shows.

- **Off (the default, and every production build):** the app is exactly today's
  diary. `TokenGate` is the entry, and nothing in this design is reachable.
- **On:** the Alumable entry replaces `TokenGate`, and the three screens below
  become reachable.

The flag keeps the harness out of the product build, keeps it removable in one
place, and draws a hard line a reviewer can see. It matters because CLAUDE.md
records that the product has no login screen (ADR #15): sign-in comes from
Alumable through the `external_ref` columns, not from us. A demo sign-in that
contradicts that rule is only safe if it is unmistakably a demo and cannot leak
into production. That is a decision to append, so this design ships with one new
ADR recording "Alumable demo shell: flag-gated, demo-only, not product scope,"
and the brand-asset decision below travels in the same ADR.

## The three screens, and the chrome

Each screen ships the four states CLAUDE.md requires — loaded, loading
(skeletons), empty, error — and goes through `/add-screen` and `frontend-design`
when built. No screen hand-writes a type, calls `fetch`, or holds a raw hex
colour; all three are repo rules the harness keeps.

### `/welcome` — Sign in with Alumable

Alumable's brand: the orange wordmark, the horizontal logo, a one-line tagline.
Below it, one card per demo persona, matching `docs/Demo-Script.md`: Jane N and
Noor A (students), Sam O (assessor), Dr Lee (supervisor). Choosing a persona
signs that persona in and lands on `/home`.

Token handoff is one click. The seeded Sanctum tokens are read from a
git-ignored local env (`VITE_DEMO_TOKENS`, a persona → token map), so a presenter
clicks a face and is in. The tokens never enter the committed source or a
production build. When the env is absent — a fresh checkout, or the flag off —
the welcome screen falls back to the existing paste mechanic, dressed as personas,
so the harness still works without secrets present. This reuses
`sign_in_with(slot, token)` unchanged; the slots stay the labels they already are
and still decide nothing. Roles continue to resolve server-side from
`gig_participants` and arrive only through `GET /auth/me`.

### `/home` — My Gigs

`GET /gigs` already returns everything this screen needs: `org_name` (already
"Alumable" in the data), `title`, `starts_on`/`ends_on`, `my_role`, the sprint
list, the framework, and `reflection_summary` with its draft / submitted /
assessed counts. The screen renders those as Alumable-style gig cards — org,
title, dates, a role badge, and a progress bar from `reflection_summary`. Each
card opens that gig's existing diary flow at `gigs/:gig_id`.

Empty state: a signed-in persona on no gigs. Loading: card skeletons. Error: the
shared `ErrorNotice` with retry. All three already have precedent in the diary.

### Alumable chrome

A branded frame — header with the horizontal logo, a bottom tab bar with Gigs
active and Chat / Profile present but disabled — wrapping `/welcome` and `/home`
so the surround feels like an app rather than two pages. The diary keeps its own
`AppShell` and nav once a gig is opened; the Alumable chrome is the surround, not
a replacement for the diary's frame. Returning from the diary goes to `/home`
rather than the token screen, by repointing the existing `diary-return` / `leave`
destination when the flag is on.

## Theming

Alumable's brand — orange `#FFA33C`, the logo set, rounded radii —
becomes a scoped token set under `data-brand="alumable"`, applied only within the
shell. It does not overwrite the diary's product tokens, so the diary looks
exactly as it does today once a gig is open; only the surround is Alumable-orange.
Colours are defined as variables in `tokens.css` (or a demo token file it
imports), never as raw hex in a component, per the frontend rules.

## Data flow

All real, no new endpoint, no backend change:

```
/welcome  (persona → token)
   → SessionProvider   GET /auth/me        (who, and role per gig)
   → /home             GET /gigs           (the persona's real gigs)
   → GigDetail         GET /gigs/{gig_id}  (existing)
   → diary screens     (existing: stepper, review queue, frameworks, export)
```

The harness adds screens and a theme and a flag. It adds no route to the API, no
column to the schema, no rule to a service. Everything it shows is the diary's
own data under Alumable's skin.

## Brand assets

Alumable's logos — horizontal, circle and icon — live under a demo-flagged path
(`web/src/demo/assets/`), loaded only when `VITE_DEMO_SHELL` is on. They are
Alumable's property, used with the client's permission for this demo; the ADR
records that, and the flag keeps them out of the product build.

## Testing

A Playwright spec in `web/e2e/` (ADR #42) drives the real screens against the
existing fake API in `web/e2e/fake-api.ts`, which already models `/auth/me` and
`/gigs`. The spec walks `/welcome` → pick a persona → `/home` → open a gig →
assert the diary mounts. Because the harness adds no backend rule, there is
nothing to test in `api/`; the fake API is not extended with a new rule, only
exercised through the new screens.

## Run target

The flag makes this deploy-agnostic. `./run dev` against the shared database
shows it on a laptop today, which is what `docs/Demo-Script.md` already assumes.
If the hosted-deploy blocker (CAP-26, SSH host access) clears, the same build
deploys with the flag on. The design assumes neither.

## Out of scope / explicitly not done

- Rebuilding any of Alumable's own features (they are Alumable's, and
  irrelevant to the diary story).
- Any change to the diary product: its schema, its contract, its services, its
  policies, its existing screens' behaviour.
- A real Alumable backend, real SSO, or real data behind the surround. The
  surround is a skin over the diary's own data; nothing fake is presented as a
  real Alumable service.

## Open questions

None blocking. The one judgement call left for build time is how literally the
`/home` card and the chrome copy Alumable's exact spacing and iconography; the
answer is "recognisably Alumable, not pixel-perfect," and it improves if David
supplies the real brand kit, which is worth asking him for in parallel.
