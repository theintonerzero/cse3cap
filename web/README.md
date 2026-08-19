# web/

The React frontend. **Nothing is built yet.** `src/App.tsx` renders the word `test` and
that is the entire application.

The point of it existing in this state is that the toolchain, the CI job and the dev server
are proven to work before anybody writes a screen, so the first real PR is about the screen
rather than about Vite.

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

| Command           | What it does                                                 |
| ----------------- | ------------------------------------------------------------ |
| `npm run dev`     | Vite dev server with hot reload                              |
| `npm run build`   | Type-check with `tsc -b`, then production build into `dist/` |
| `npm run lint`    | oxlint                                                       |
| `npm run format`  | Prettier, writing changes                                    |
| `npm run preview` | Serve the built `dist/` locally                              |

CI runs `npm ci`, `npm run lint`, `npx prettier --check .` and `npm run build` on every
push. All four pass today; keep them passing.

## What to build, in order

Specified in [`docs/Stack-and-Build-Scope.md`](../docs/Stack-and-Build-Scope.md) 4.3. The
foundation comes before any screen:

1. `src/tokens.css`: colour, spacing and radius as CSS variables, light and dark via
   `data-theme`. **No raw hex anywhere else in the codebase, ever.** `src/index.css` is
   nearly empty on purpose so this rule is not broken on day one.
2. The typed API client in `src/api/`, with types generated from the contract:
   `npx openapi-typescript docs/openapi.yaml -o src/api/schema.ts`. Never hand-write a
   response type.
3. Core components: Card, Button, Chip, Badge, TextArea, ProgressBar, BottomSheet,
   RadarPanel, Skeleton, ErrorNotice.
4. App shell: router, token context, role-aware nav from `GET /auth/me`.

Then the twelve screens. **Each ships four states: loaded, loading, empty, error.** Not
three. `/add-screen` carries the full checklist.

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

Linting is oxlint, which is what the current Vite template ships. The scope document says
ESLint; if the team wants ESLint specifically, that is a swap to make deliberately rather
than by accident.
