# Contributing

## One-time setup

This repo's `.gitignore` covers project files only. OS and editor noise is yours to handle
globally. [Here's how](https://gist.github.com/subfuzion/db7f57fff2fb6998a16c).

Setup for the app itself, the shared database and Claude Code is in the
[README](README.md#getting-started).

## Branches

| Branch                                                                     | From   | Into   | Notes                                   |
| -------------------------------------------------------------------------- | ------ | ------ | --------------------------------------- |
| `main`                                                                     |        |        | Releases only, each one tagged. Protected. |
| `dev`                                                                      | `main` | `main` | Integration. Protected. Default branch. |
| `feat/*` `fix/*` `refactor/*` `perf/*` `docs/*` `test/*` `build/*` `ci/*` `chore/*` `style/*` | `dev`  | `dev`  | One Jira ticket each.                   |
| `release/vX.Y.Z`                                                           | `dev`  | `dev`  | The changelog and version bump for a release. |

Name a branch `<type>/<JIRA-KEY>-<description>`, with the Jira key in capitals and the type from
the commit types below.

Example: `feat/CAP-39-start-reflection`

## Commits

Commits follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

| Type | For | Changelog section |
| --- | --- | --- |
| `feat` | A new capability for a user | Added (or Changed, if it alters one) |
| `fix` | A bug fix | Fixed |
| `perf` | Faster, with no change in behaviour | Changed |
| `refactor` | Restructured, with no change in behaviour | none |
| `docs` | Documentation only | none, unless it changes what users are told |
| `test` | Tests only | none |
| `build` | Images, dependencies, the build | none, or Security for a security update |
| `ci` | CI configuration | none |
| `chore` | Anything else that touches no product code | none |
| `style` | Formatting only | none |
| `revert` | Reverting an earlier commit | whatever the reverted change was under |
| `release` | The changelog and version bump for a release | none |

**Scopes** name the part of the product: `api`, `web`, `ai`, `db`, `deploy`, `docs`, `scripts`.
Leave the scope out when a change spans several.

**The description** is imperative or a plain statement, lower case, with no full stop:
`fix(api): pdf exports render again`.

**Breaking changes** add `!` after the type or scope, and a `BREAKING CHANGE:` footer saying
what breaks and how to move to the new behaviour:

```text
feat(api)!: return scores as rows, not columns

BREAKING CHANGE: GET /reflections/{id} returns scores[] instead of self_score and
assessor_score. Read the row whose scorer_class is "self" for the old self_score.
```

**Attribution.** A commit an agent helped write ends with a `Co-Authored-By:` footer.

## Pull requests

The title is a Conventional Commit with the ticket key on the end, because a squash merge makes
it the commit on `dev`:

```text
feat(web): start a reflection from the gig page (CAP-39)
```

- Targets `dev`.
- CI passes.
- Link the Jira ticket.
- **Does one thing.** If the title needs an "and", split the ticket.
- Adds its line to `[Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md) when users would notice the
  change, under the section its type maps to.
- No secrets, no leftover debug.

## Releases

The project uses [semantic versioning](https://semver.org/spec/v2.0.0.html). A `fix` makes a
patch release, a `feat` a minor one, and a breaking change a major one.

1. Branch `release/vX.Y.Z` from `dev`. In `CHANGELOG.md`, rename `[Unreleased]` to the version
   and date, open a new empty `[Unreleased]`, and update the comparison links at the bottom.
   Bump `web/package.json` and `ai/pyproject.toml`, and their lockfiles, to the version.
   Regenerate the dependency register with `./run deps`.
2. Pull request `release: vX.Y.Z` into `dev`, and merge it once CI passes.
3. Pull request `dev` into `main`, titled `release: vX.Y.Z`. Merge it with a merge commit, not a
   squash, so `main` keeps `dev`'s history.
4. Tag the merge commit on `main` as `vX.Y.Z`, and publish a GitHub release whose notes are that
   version's changelog entry.

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

**A plan somebody else will execute gets a comment on its ticket.** Plans live in
`docs/superpowers/plans/`, which nobody browses. Until CAP-15 every plan here was written and
executed by the same person, so this never mattered; the moment one is handed over, the Jira
comment linking to it is the only thing connecting the two. Include how to start -- the
branch name and the first command -- because the reader has none of the context the writer
had.
