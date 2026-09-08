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

- **No approval is required to merge.** The `protected-branches` ruleset covers `main` and
  `dev`: it requires a pull request, forbids force pushes and deletion, and sets
  `required_approving_review_count` to `0`. Changed 2026-08-19 by team agreement. Five
  people on a semester timetable could not sustain a blocking approval, and the cost was
  finished work sitting unmerged for a fortnight.
- **Still open a pull request.** You cannot push to `dev` or `main` directly, and that part
  has not changed. The PR is how the team finds out what landed.
- **Request a reviewer anyway, then merge when you are ready.** A request nobody answers
  should not hold a branch. Requesting one costs nothing and is what makes review possible
  at all: a PR with no reviewer requested notifies no one, which is how four of them once
  sat for two weeks looking ignored when they had simply never been announced.
- Aim for review within 24h on anything you are asked to look at.
- Be specific and kind.
- Address review comments before merging if they arrive in time, and in a follow-up if they
  do not.
- Anything touching scoring, submission or framework mutation still gets a security review,
  per `docs/Stack-and-Build-Scope.md` §4.4. That is a commitment to do the review, not a
  gate on the merge. It may follow the merge, and it is recorded in
  `docs/Security-Review.md`.

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
