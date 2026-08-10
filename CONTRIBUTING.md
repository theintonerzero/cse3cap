# Contributing

## One-time setup

This repo's `.gitignore` covers project files only. OS and editor noise is yours to handle
globally. [Here's how](https://gist.github.com/subfuzion/db7f57fff2fb6998a16c).

Setup for the app itself, the shared database and Claude Code is in the
[README](README.md#getting-started).

## Branches

| Branch                                                                     | From   | Into   | Notes                                   |
| -------------------------------------------------------------------------- | ------ | ------ | --------------------------------------- |
| `main`                                                                     |        |        | Release. Protected.                     |
| `dev`                                                                      | `main` | `main` | Integration. Protected. Default branch. |
| `feat/*` `fix/*` `refactor/*` `chore/*` `style/*` `docs/*` `test/*` `ci/*` | `dev`  | `dev`  | One Jira ticket each.                   |

Name them as `<type>/<JIRA-KEY>-<description>`. Capitalise the Jira key.

Example: `feat/CAP-12-user-login`

## Commits

```text
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types: `feat` `fix` `refactor` `chore` `style` `docs` `test` `ci`

```text
feat(auth): add login form
```

## Pull requests

`<type>(<scope>): <description> (<JIRA-KEY>)`

```text
feat(auth): user login (CAP-12)
```

- Targets `dev`.
- CI passes.
- Link the Jira ticket.
- **Does one thing.** If the title needs an "and", split the ticket.
- No secrets, no leftover debug.

## Review

- **1 approval from someone else.** No self-merging.
- Aim for review within 24h.
- Be specific and kind.
- Address review comments before merging.
- Anything touching scoring, submission or framework mutation gets a security review.

## Things that travel with the change

**Endpoint changes update the contract.** `docs/openapi.yaml` is the agreement between
frontend and backend, and the frontend mocks against it. A PR that adds, removes or
reshapes an endpoint updates the contract in the same PR, not afterwards.

**Schema and decision changes need an ADR.** Anything that alters the schema, the contract,
or reverses a choice already recorded gets a new record in `docs/adr/`. Supersede the old
one, never rewrite or delete it. The template is in `docs/adr/TEMPLATE.md`.

**Migrations are announced before they run.** The database is shared, so a bad migration
takes out everyone's environment rather than just yours. Say so in the channel first.

**New screens ship four states.** Loaded, loading, empty and error. A PR with only the
happy path is not finished.
