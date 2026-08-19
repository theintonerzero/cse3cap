# Retention and erasure

How long the Reflection Diary keeps data, what a person can have deleted, and why some of
it cannot be deleted at all.

Written 2026-08-19 against `db/01-schema.sql`. If the schema and this document disagree,
the schema is right and this is a bug.

## Why this document exists

The product is built on a promise: the reflection record belongs to the student and
outlives the subject, the gig and the platform account. `ON DELETE RESTRICT` on
`reflections.user_id` is what turns that promise into something the database enforces
rather than something the application intends.

The same constraint is the reason a student cannot simply be erased. Those two facts are
the same fact, and a report that claims the first without stating the second is not
describing this system. This document states both.

## What is stored

The `users` table is deliberately thin:

```sql
CREATE TABLE users (
    id            CHAR(36)  NOT NULL DEFAULT (UUID()),
    external_ref  VARCHAR(191) NULL,            -- host platform user id
    display_name  VARCHAR(191) NOT NULL,
    created_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY ak_users_external_ref (external_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

No email address, no student number, no date of birth, no password. Identity lives in
Alumable; this database holds a pointer to it (`external_ref`) and a name to render on a
screen. That is not an accident of scope, it is the whole retention strategy: the smallest
amount of identifying data that still lets a record be shown to the person it belongs to.

The identifying material that does accumulate is the reflective writing itself.
`reflection_entries.narrative` is free text a student wrote about their own learning, and
`scores.comment` is what a supervisor wrote about them. Both can name people, employers
and incidents. Treat those two columns as the sensitive part of this database, not the
`users` row.

Uploaded evidence is a third category. `evidence` stores a URI rather than a blob, so
deleting a row here leaves the file wherever it was put. Any erasure procedure has to
reach the storage as well as the database.

## What the constraints do

Deletion behaviour is not uniform, and the differences are deliberate.

| Parent deleted | Behaviour | Why |
| --- | --- | --- |
| `users` ← `reflections.user_id` | **RESTRICT** | The record is the student's. Losing it because an account closed would defeat the product |
| `gigs` ← `reflections.gig_id` | **RESTRICT** | A reflection without its gig is uninterpretable |
| `users` ← `scores.scorer_user_id` | **RESTRICT** | A score with no scorer cannot be defended or audited |
| `levels` ← `scores.level_id` | **RESTRICT** | The level is what the score *means*. Losing it makes the number meaningless |
| `competencies` ← `reflection_entries.competency_id` | **RESTRICT** | Same reason |
| `gigs` ← `sprints`, `gig_participants` | CASCADE | Structure belonging to the gig, meaningless without it |
| `frameworks` ← `competencies` ← `levels` | CASCADE | A rubric is one object. Deleting half of it is never wanted |
| `reflections` ← `reflection_entries` ← `scores`, `evidence` | CASCADE | A reflection is one object |
| `reflections` ← `events` | CASCADE | History of a thing that no longer exists |
| `users` ← `exports` | CASCADE | An export is a convenience copy, not the record |
| `sprints` ← `reflections.sprint_id` | SET NULL | A reflection survives its sprint being reorganised |
| `users` ← `frameworks.created_by` | SET NULL | Authorship is nice to have, the rubric is not |
| `users` ← `events.actor_user_id` | SET NULL | The event still happened |
| `reflections` ← `exports.reflection_id` | SET NULL | The export file remains valid |

Read the RESTRICT rows together and the shape is clear: **anything that gives a score its
meaning cannot be deleted while the score exists.** That is what makes the record durable,
and it is also what makes a delete request hard.

## What a student can delete today

One thing. A reflection they own, while it is still a draft:

```
DELETE /reflections/{reflection_id}
```

Once submitted it is refused:

```json
{ "error": { "code": "NOT_DRAFT",
             "message": "A submitted reflection is part of the record and cannot be deleted.",
             "details": { "status": "submitted" } } }
```

This is the right default. A submitted reflection has been counter-scored by somebody else,
and letting a student withdraw it after a low counter-score would make the assessment
worthless. But it does mean a student who writes something they regret has no route to
remove it after submitting, and that is a real limitation to state rather than hide.

## What erasure means here

**A user row cannot be deleted once they have reflected or scored.** MySQL refuses it, by
design. Any erasure request therefore resolves to anonymisation, not deletion:

1. Set `users.external_ref = NULL`, breaking the link to the Alumable account.
2. Replace `users.display_name` with a non-identifying label.
3. Redact `reflection_entries.narrative` and `scores.comment` where the person asking is
   the author, since that is where identifying content actually lives.
4. Delete the underlying files for that user's `evidence` rows, at the storage layer.
5. Leave scores, levels and structure in place. Anonymised, they are still a valid record
   of what was assessed, and they are what other people's records depend on.

**None of this is implemented.** There is no erasure endpoint, no anonymisation command,
and no soft-delete column anywhere in the schema. Today the procedure is a manual SQL
session by whoever holds the credentials. For an MVP with three seeded users that is
defensible. For a product holding real students it is not, and it should be an explicit
item in whatever comes after this capstone.

## Retention period

Not set, deliberately. The product's stated purpose is a record that outlives the subject
and the graduation, so a fixed expiry would contradict it. What that means in practice,
and how it sits with the client's obligations, is a decision for Alumable and not one this
team can make on their behalf.

What the team can say is what the system does now: nothing expires, nothing is purged on a
schedule, and no job deletes anything. Growth is bounded by how much students write.

## Open questions for the client

These are not rhetorical. They need answers before this holds real student data.

- Who can request erasure, and who approves it? A student erasing their own narrative also
  changes what a supervisor was assessing.
- Does a supervisor's `scores.comment` belong to the supervisor or to the student it
  describes? The answer decides who may redact it.
- What happens to a record when Alumable itself closes an account? `external_ref` goes
  stale and nothing detects that.
- Where does evidence actually live, and who is responsible for deleting the file when the
  row goes? The schema stores a URI and stops there.
- Is there a legal retention floor for assessment records at La Trobe that would override a
  student's erasure request?

## See also

- [`db/01-schema.sql`](../db/01-schema.sql), the constraints themselves, with inline
  reasoning
- [`docs/adr/architecture-decision-records.md`](adr/architecture-decision-records.md), for
  why the record is student-owned
- [`docs/API-Specification.md`](API-Specification.md), for the delete endpoint and its
  refusal
