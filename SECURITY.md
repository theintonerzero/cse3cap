# Security policy

## Supported versions

Security fixes go into the latest release. Older releases are not patched.

| Version | Supported |
| ------- | --------- |
| 1.1.x   | Yes       |
| 1.0.x   | No        |

## Reporting a vulnerability

Please report a vulnerability privately, not in a public issue or pull request.

Use GitHub's private reporting: the repository's **Security** tab, then **Report a
vulnerability**. Include what you found, how to reproduce it, the version or commit, and the
impact you expect. A minimal proof of concept helps more than a long description.

This is a university capstone maintained by a small team, so responses are best effort. We aim
to acknowledge a report within five working days, agree what it affects and how severe it is,
and say when a fix is expected. When it ships, the changelog credits the reporter, unless you
would rather not be named.

Please don't access other people's data, degrade the live demo, or run automated scans against
it. The live demo at `diary.darkovski.dev` runs on seeded fiction behind a password. Testing
against your own copy is easy: `./assess` runs the whole product locally
([`docs/Assessor-Guide.md`](docs/Assessor-Guide.md)).

## How the product is protected

- **Authentication.** Laravel Sanctum bearer tokens, issued per person, stored only as a hash,
  carrying a recognisable prefix and expiring after 60 days. The host platform signs people
  in, so this module has no password store and no login screen.
- **Authorisation.** Every action is checked in a policy, and a person's role is resolved on
  the server from their participation in the gig in question. A role is never taken from the
  client. Something that exists but is not yours answers `404`, so the API never confirms it
  exists.
- **Data in transit.** The database refuses unencrypted connections and verifies its
  certificate's name. The live demo is HTTPS only, with HSTS.
- **Integrity of the record.** Database constraints, not just application code, keep a
  student's record from being deleted with a gig, keep a framework read-only once anyone has
  been scored against it, and stop an assessor scoring the same entry twice.
- **The AI sidecar.** Off unless it is enabled, and it reads the API with each caller's own
  token, so it can see nothing they couldn't. It never writes to the product's database. See
  [`PRIVACY.md`](PRIVACY.md) for what it sends to Anthropic.
- **Secrets.** No secret is committed. CI checks the built bundle for tokens, and generated
  credentials on an assessor's machine stay in a git-ignored, owner-only folder.

Every review the team has done, with each finding and its fix, is in
[`docs/Security-Review.md`](docs/Security-Review.md).

## Known limitations

These are accepted for the capstone and listed in the [changelog](CHANGELOG.md):

- There is no rate limiting on the API (CAP-42).
- Evidence uploads accept any file type, and there is no download route yet. That becomes a
  high-severity concern the day one is added (F8).
- There is no erasure or anonymisation procedure ([`PRIVACY.md`](PRIVACY.md)).
- The live demo shares its host with the team's development database, with no backups and no
  monitoring ([`docs/Runbook.md`](docs/Runbook.md)).
