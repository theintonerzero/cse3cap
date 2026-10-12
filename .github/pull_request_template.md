<!-- Title: a Conventional Commit with the ticket key, e.g. feat(web): start a reflection from the gig page (CAP-39) -->

## What and why

<!-- What changes for a user or a developer, and why. Link the Jira ticket. -->

## How it was verified

<!-- What you ran and what it printed. "Should work" is not a result. -->

## Checklist

- [ ] Targets `dev`, and CI passes
- [ ] An endpoint change updates `docs/openapi.yaml` in this PR
- [ ] A schema change, or a reversed decision, has an ADR in `docs/adr/`
- [ ] A new screen has its loaded, loading, empty and error states
- [ ] A change users would notice has a line under `[Unreleased]` in `CHANGELOG.md`
- [ ] No secrets, tokens or leftover debug
- [ ] A reviewer is requested
