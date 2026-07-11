# Contributing

## One-time setup

This repo's `.gitignore` covers project files only. OS and editor noise is yours to handle
globally. [Here's how](https://gist.github.com/subfuzion/db7f57fff2fb6998a16c).

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
