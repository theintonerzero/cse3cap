# Privacy

What personal data the Reflection Diary handles, where it goes, how long it stays, and what
can be removed. This describes the software as built at v1.1.1. It is not a privacy notice
for any deployment: whoever runs the product, Alumable or a university, owes its own users
that.

The detail behind this page, against the schema, is
[`docs/Retention-and-Erasure.md`](docs/Retention-and-Erasure.md).

## What the product stores

| Data | Where | Sensitivity |
| --- | --- | --- |
| A person's display name, and the host platform's id for them (`external_ref`) | `users` | Identifying, deliberately minimal: no email, no student number, no password |
| Who is on which gig, and in what role | `gig_participants` | Low |
| A student's reflections: free text about their own work | `reflection_entries.narrative` | **High.** It can name people, employers and incidents |
| Scores, and a reviewer's comment on a student | `scores` | **High** for the comment, for the same reason |
| Evidence: links, and uploaded files | `evidence`, and file storage | As sensitive as what was uploaded |
| An append-only history of submissions and assessments | `events` | Low |
| A log of exports, and the export files themselves | `exports`, and file storage | As sensitive as the record |

The product sets no tracking or analytics cookies. The live demo's password gate sets one
cookie, `diary_gate`, so it does not ask again for seven days. In the browser, a signed-in
person's token is kept in that tab's session storage, and an assessor's unsent counter-score
draft in local storage, so it survives a reload. Neither leaves their machine.

## The AI sidecar

The AI features are optional, separate from the product, and off unless whoever runs it turns
them on ([ADR #64](docs/adr/architecture-decision-records.md)). When they are on:

- **A student's narrative, and a reviewer's search text, are sent to Anthropic's API** to ask
  questions, find themes and compare reflections. Anthropic's own commercial terms then
  govern that data.
- The sidecar keeps its own small database, `diary_ai`: numeric embeddings derived from each
  narrative, usage and spend totals, cached themes and rate-limit counters. It holds no names,
  emails or narrative text, and nothing it makes is written into the product's record.
- Every control that sends anything to the AI carries an **AI** mark, so a person knows before
  they use it.

## How long data is kept

No retention period is set, on purpose. The product exists to be a record that outlives the
subject and graduation, so nothing expires, nothing is purged on a schedule, and no job deletes
anything. How that fits the obligations of whoever runs it is their decision to make.

## Deleting data

- A student can edit or delete their own draft, and its evidence, until they submit it.
- Once someone has reflected or scored, their user row cannot be deleted: the database
  refuses, so that a record can't be erased by accident or by deleting a gig.
- An erasure request therefore means anonymisation: unlinking the host account, replacing
  the name, redacting the text they wrote, and deleting their files. **None of that is
  automated yet.** It is a manual procedure for whoever holds the database credentials, and
  the open questions it raises are listed in
  [`docs/Retention-and-Erasure.md`](docs/Retention-and-Erasure.md).

## Demo and test data

Everything in the seeded demo, on the live demo and on an assessor's machine, is fiction
written by the team. An assessor's copy keeps its database, generated passwords and any
Anthropic key on their own machine, and nothing in it reaches the team's servers.

## Questions

Raise a question about how the software handles data as an issue on the repository. Report
anything that looks like a security problem privately instead, as [`SECURITY.md`](SECURITY.md)
describes.
