# web/

The React frontend. **No screen is built yet.** `src/App.tsx` still renders the word
`test`, and that is the entire user interface.

What does exist is `tokens.css` and the typed API client in `src/api/`, which everything
else is built on, plus six of the ten core components. The rest of the foundation, the
remaining core components, comes next.

The point of the scaffold existing before any of it was that the toolchain, the CI job and
the dev server are proven to work before anybody writes a screen, so the first real PR is
about the screen rather than about Vite.

## Running it

From this folder:

```bash
npm install
npm run dev          # http://localhost:5173
```

Or from the repository root, which also starts the backend and stops both together:

```bash
./run dev            # run.ps1 on Windows
./run web            # this folder only
```

`web/.env` needs one line, which `scripts/setup.sh` writes for you:

```
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

The backend is a separate server in `api/`, started separately. How the two fit together,
what crosses between them and what breaks quietly when they drift is
[`docs/Frontend-and-Backend.md`](../docs/Frontend-and-Backend.md). Read that before your
first change.

You do not need the backend running to build a screen. Mock the contract instead:

```bash
npx -y @stoplight/prism-cli mock docs/openapi.yaml    # http://localhost:4010
```

## Scripts

| Command             | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | Vite dev server with hot reload                              |
| `npm run build`     | Type-check with `tsc -b`, then production build into `dist/` |
| `npm run gen:types` | Regenerate `src/api/schema.ts` from `docs/openapi.yaml`      |
| `npm run lint`      | oxlint                                                       |
| `npm run format`    | Prettier, writing changes                                    |
| `npm run preview`   | Serve the built `dist/` locally                              |

CI runs `npm ci`, `npm run lint`, `npx prettier --check .` and `npm run build` on every
push. All four pass today; keep them passing.

## What to build, in order

Specified in [`docs/Stack-and-Build-Scope.md`](../docs/Stack-and-Build-Scope.md) 4.3. The
foundation comes before any screen:

1. ~~`src/tokens.css`: colour, spacing and radius as CSS variables, light and dark via
   `data-theme`.~~ Done. **No raw hex anywhere else in the codebase, ever.**
   `src/index.css` is nearly empty on purpose so this rule is not broken on day one.
2. ~~The typed API client in `src/api/`.~~ Done. See below.
3. Core components: Card, Button, Chip, Badge, Skeleton and ErrorNotice exist. TextArea,
   ProgressBar, BottomSheet (CAP-4) and RadarPanel (CAP-6) do not yet.
4. ~~App shell: router, token context, role-aware nav from `GET /auth/me`.~~ Done.
   See "Getting a token in" below.

Then the twelve screens. **Each ships four states: loaded, loading, empty, error.** Not
three. `/add-screen` carries the full checklist.

## The API client

`src/api/schema.ts` is generated from `docs/openapi.yaml` and is never edited by hand.
`src/api/client.ts` is the one fetch wrapper every screen uses:

```ts
import { api, ApiError } from './api/client.ts';

const me = await api.get('/auth/me');
const gig = await api.get('/gigs/{gig_id}', { path: { gig_id } });
const drafts = await api.get('/reflections', { query: { status: 'draft' } });
await api.post('/reflections', { body: { sprint_id } });
const file = await api.blob('/exports/{export_id}/download', { path: { export_id } });
```

The path has to be one the contract declares, on a verb it serves, with the parameters that
operation takes, and what comes back is what the contract says. A field the contract does
not have is a compile error rather than `undefined` at runtime.

Every non-2xx response arrives as an `ApiError` with the envelope already unwrapped, so a
caller switches on `code` and never parses a body:

```ts
try {
  await api.post('/reflections/{reflection_id}/submit', { path: { reflection_id } });
} catch (error) {
  if (!(error instanceof ApiError)) throw error;
  switch (error.code) {
    case 'EVIDENCE_REQUIRED':
      highlight(error.details.entry_ids);
      break;
    case 'NOT_DRAFT':
      refresh();
      break;
    default:
      notice(error.message);
  }
}
```

`error.code` is `null`, with `status` 0, when the request never reached the API at all.

**Regenerate after every pull that touched the contract**, with `npm run gen:types`.
Nothing catches a stale `schema.ts` yet; that guard is CAP-25.

`./run verify` from the repository root checks all of this: that regenerating changes
nothing, that the bad calls above are compile errors, and that the client behaves against
the real API and the prism mock. Run it after any change to `client.ts` or the contract.

The bearer token lives in the module, and **the app shell is the only thing that sets it**.
`web/src/session/SessionProvider.tsx` calls `setAuthToken` once per token and nothing else
should; `./run verify-shell` checks that.

## Getting a token in

There is no login screen (ADR #15). On first load the app asks for one of the three seeded
tokens. `php artisan db:seed` prints each one once; it does not write them to a file.
Save that output as `~/reflection-diary-tokens.txt` yourself -- that is the convention the
check scripts under `scripts/` read from, not something the seeder produces. Paste one into
the matching slot and you are that user; the header switches between whichever slots you
have filled.

Tokens are held in `sessionStorage`, so each browser tab is its own identity and a reload
keeps you signed in. Two tabs can be two different people at once, which is how you look at
a student's reflection and an assessor's queue side by side.

A 401 from any request clears the token and returns to that screen.

`VITE_API_TOKEN` in `web/.env` is still compiled into the bundle at build time, whatever it
is set to, regardless of whether anything reads it back out. It no longer decides what
token this app sends, though: `SessionProvider` calls `setAuthToken` on every boot with the
session's own token -- `null` when nothing is stored -- which overwrites whatever
`VITE_API_TOKEN` seeded before any request leaves. It predates the shell and is now pure
liability: inert at runtime, still present in the shipped bundle. Removing it is tracked as
finding F1 (CAP-24), not something this ticket touches.

## The components

`src/components/<Name>/<Name>.tsx` beside a colocated `<Name>.module.css`,
re-exported from `src/components/index.ts`. Import from the barrel:

```ts
import {
  Badge,
  Button,
  Card,
  Chip,
  ErrorNotice,
  Skeleton,
  SkeletonGroup,
} from './components/index.ts';
```

**See them all at once.** `npm run dev`, then
[localhost:5173/gallery.html](http://localhost:5173/gallery.html): every
component in every state, with a theme toggle. It is a second Vite entry
point rather than a route, because there is no router until CAP-5. Add a
section to `src/gallery/Gallery.tsx` whenever you add a component.

Two rules that are not obvious:

- **Props are snake_case**, like everything else that crosses the seam.
- **Never a `px` value, in CSS or in a `.tsx`.** `scripts/check-tokens.sh`
  reads both. Use `rem`, `em`, `%` or a token. This catches
  `<Skeleton width="200px" />` as well as a stylesheet.

## Conventions that are not negotiable

- **snake_case** in types and props, matching the API and the database. There is no mapping
  layer and nobody should add one.
- **No raw hex, no magic pixel values.** Everything from `tokens.css`.
- **The radar takes axes and scale as props.** Never hardcoded to six axes or a four-point
  scale; frameworks are swappable and that is the point of the product.
- **Business rules live in the backend.** A disabled button is a convenience, the 409 is the
  rule. See the rule map in [`CLAUDE.md`](../CLAUDE.md).

## Versions, and one pin that matters

React 19, Vite 8, TypeScript 6.

TypeScript is **pinned to 6.x deliberately**. TypeScript 7 is the native compiler rewrite
and openapi-typescript 7.13 crashes on it (openapi-ts issue #2841, open, no workaround).
The generated types are load-bearing here, so the generator picks the compiler version. Do
not bump it to 7 without checking that issue first.

For the same reason openapi-typescript is **not in `devDependencies`**. It declares
`peer typescript@^5.x`, so `npm install` refuses it against the 6.x pin, and the only way
to keep it would be `--legacy-peer-deps` across the whole project. `gen:types` runs it
through `npx` at a pinned version instead, the same way `./run mock` runs prism and
`./run check` runs redocly. ADR #36 has the reasoning. Do not "fix" this by installing it.

Linting is oxlint, which is what the current Vite template ships. The scope document says
ESLint; if the team wants ESLint specifically, that is a swap to make deliberately rather
than by accident.
