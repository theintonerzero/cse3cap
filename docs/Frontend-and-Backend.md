# How `api/` and `web/` fit together

Two folders, two languages, two dev servers, one product. This is the seam between them:
what crosses it, what generates what, and which things break quietly when they drift.

Read this before your first change in either folder.

## The shape

```
docs/openapi.yaml          the contract. Source of truth for the seam
      │
      ├──► api/            Laravel implements it.  php artisan serve  :8000
      │                    Routes are checked against the contract mechanically
      │
      └──► web/            React consumes it.      npm run dev        :5173
                           TypeScript types are GENERATED from it, never written
```

Neither folder imports from the other. Nothing is shared at the file level. The only thing
that couples them is `docs/openapi.yaml`, and that is deliberate: it is the one artefact
both sides can be checked against, so a disagreement is a build failure rather than a bug
report three weeks later.

## The contract is the agreement, not the documentation

`docs/openapi.yaml` is ranked above both codebases in `CLAUDE.md`'s sources of truth. If
the contract and an implementation disagree, the implementation is wrong.

This has a practical consequence people get wrong on their first PR:

> **If you change an endpoint, you change the contract in the same commit.** Not the same
> PR, the same commit. A contract that lags the code by even one merge is a contract the
> other half of the team is generating broken types from.

The backend already enforces its half. The operations the contract declares and the routes
the application serves are compared, and they currently agree exactly: 30 and 30.

## What crosses the seam

**Nothing but JSON over HTTP.** No shared package, no code generation into `api/`, no
server-rendered markup.

**Names do not get translated.** `snake_case` in the database, in the JSON, and in the
frontend types. There is no mapping layer and nobody should add one. A field is called
`counter_level` in MySQL, in the API response and in the React component. This looks wrong
to a TypeScript developer for about a day and then saves the whole project the class of bug
where a rename lands on one side only.

**Errors are one shape**, for every non-2xx response including 401 and 404:

```json
{ "error": { "code": "COMMENT_REQUIRED", "message": "...", "details": {} } }
```

The frontend unwraps this centrally, once, in the API client. Components receive a typed
error with a `code` they can switch on. No component parses a response body.

**Roles never cross.** The frontend does not tell the backend who the user is; it sends a
bearer token and the backend resolves the role from `gig_participants` for the gig in
question. A `role` field in a request body is a bug, not a feature. What the frontend *may*
do is read the role back from `GET /auth/me` to decide what to render, which is a display
concern and not an authorisation one.

## Types are generated, never written

This is the part that is easy to get wrong and expensive to unwind.

```bash
npx openapi-typescript docs/openapi.yaml -o web/src/api/schema.ts
```

Hand-writing a response interface in `web/` creates a second, silent source of truth that
agrees with the contract exactly until the day it does not. If the shape you need is not in
the generated types, **the contract is wrong and the contract is what you fix.**

This is not wired up yet. It is the first task of the frontend build, along with
`tokens.css`, and it is specified in `docs/Stack-and-Build-Scope.md` 4.3.

TypeScript is pinned to 6.x on purpose. TypeScript 7 is the native compiler rewrite and
openapi-typescript 7.13 crashes on it (openapi-ts issue #2841, open, no workaround). The
generator picks the compiler version here because the generated types are load-bearing.

## Running both

They are separate servers and neither proxies the other, so both have to be up. One
command from the repository root starts both and stops both:

```bash
./run dev                        # run.ps1 on Windows
```

Or two terminals, which is the same thing written out:

```bash
cd api && php artisan serve      # http://localhost:8000
cd web && npm run dev            # http://localhost:5173
```

`web/.env` needs one line, which `scripts/setup.sh` writes for you:

```
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

Cross-origin requests work because the backend allows the Vite dev origin explicitly.
`FRONTEND_URL` in `api/.env` is what that CORS configuration reads, so if you run Vite on a
port other than 5173 you have to change it there too. A request that fails with no useful
error in the browser console is this, nine times out of ten.

### Without a backend

You do not need `api/` running to build a screen. Mock the contract:

```bash
npx -y @stoplight/prism-cli mock docs/openapi.yaml   # http://localhost:4010
```

Point `VITE_API_BASE_URL` at that instead. Because the mock is generated from the same file
the real API is checked against, a screen built against it works against the real thing.

## Where each rule lives, so you do not implement it twice

Business rules live in `api/app/Services/`, once each. The frontend's job is to *reflect*
them, never to enforce them.

The counter-score comment rule is the clearest example. `Scoring.php` refuses a lower
counter-score without a comment and returns `409 COMMENT_REQUIRED`. The frontend should
absolutely disable the submit button and show the comment field, because making a user
submit to discover a requirement is bad design. But that button state is a *convenience*.
The rule is the 409. Never move the rule into the component, and never assume the backend
will not send that error because the UI prevents it.

The same holds for the submit gate, the level-in-competency check and the framework-in-use
guard. See the rule map in `CLAUDE.md`.

## What breaks quietly

These are the failures that do not announce themselves.

| Drift | How it shows up | What catches it |
| --- | --- | --- |
| Endpoint changed, contract not | Frontend types are right for an API that no longer exists | Route-vs-contract check, CI |
| Contract changed, types not regenerated | TypeScript compiles, runtime is wrong | Nothing. Regenerate on every pull |
| A field camelCased in `web/` | Value is `undefined`, renders blank | Code review. There is no mapping layer to blame |
| Vite on a port other than 5173 | CORS failure with an unhelpful console error | `FRONTEND_URL` in `api/.env` |
| A rule reimplemented in a component | Passes until the backend rule changes | Code review, and the rule map in `CLAUDE.md` |
| Raw hex in a component | Dark mode silently broken | Review against `web/src/tokens.css` |

## Which agent to use

`.claude/agents/` is tiered by what a mistake costs, and the seam has one on each side:

- **`backend-endpoint`** for anything in `api/`. It updates the contract in the same change.
- **`frontend-screen`** for anything in `web/`.
- **`contract-sync`** when the two have already drifted, or when a reviewer asks whether the
  contract still matches the code. This is the agent for the seam itself.

Skills: `/add-endpoint` and `/add-screen` carry the checklists for each side.

## See also

- [`docs/API-Specification.md`](API-Specification.md), the annotated contract
- [`docs/Stack-and-Build-Scope.md`](Stack-and-Build-Scope.md) 4.3, the frontend build order
- [`CLAUDE.md`](../CLAUDE.md), the rules and the business-rule map
- [`web/README.md`](../web/README.md), working inside the frontend folder
