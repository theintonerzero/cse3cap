---
name: add-migration
description: Create or modify a database migration for the MySQL schema. Use for any schema change including new tables, columns, indexes, constraints or structural changes. Encodes the project's MySQL specific conventions such as uuid keys, datetime(6), CHECK constraints and generated columns, which differ from Laravel defaults.
---

# Adding a migration

The schema is a reviewed design, not a scratchpad. A migration that changes it needs an ADR.
A migration that contradicts it is a bug.

## Before writing anything

**Does this need an ADR?** New table, changed relationship, changed delete rule, changed
constraint: yes. New nullable column on an existing table for a feature already agreed: no.
When unsure, write the ADR. It is cheap and the register is a graded artifact.

**Announce it.** The database is shared on a VPS. Two people migrating at once conflict, and
a bad migration takes out everyone's environment. Say so in the channel before running.

**Read `db/01-schema.sql` first.** It carries inline comments explaining every unusual
choice. If your change contradicts one of them, you have found either a bug or a decision
you did not know about.

## Conventions that differ from Laravel defaults

**Primary keys are `char(36)` uuids**, not auto-increment integers.

```php
$table->char('id', 36)->primary()->default(new Expression('(UUID())'));
```

Ids appear in exported records and URLs. Sequential integers would leak row counts and let
someone enumerate other students' reflections. Every model needs `HasUuids`,
`$keyType = 'string'` and `$incrementing = false`.

**All timestamps are `DATETIME(6)`, never `TIMESTAMP`.** MySQL's `TIMESTAMP` stops working
in January 2038 and the product's headline claim is a record that outlives that. Values are
UTC by application convention.

```php
$table->dateTime('scored_at', 6)->default(new Expression('CURRENT_TIMESTAMP(6)'));
```

**Enums are `CHECK` constraints on varchar columns**, not MySQL `ENUM` types. Altering a real
enum type is awkward and hard to reverse.

```php
DB::statement("ALTER TABLE scores ADD CONSTRAINT ck_sc_role
  CHECK (scorer_role IN ('self','assessor','supervisor','employer'))");
```

**Generated columns are database owned.** `reflections.gig_key` and `sprint_key` coalesce a
null context id to a sentinel uuid, because MySQL has no `UNIQUE NULLS NOT DISTINCT` and
treats every null as distinct in a unique index. Without them a student could create
unlimited gig level reflections on one gig.

Never write to them. Never put them in `$fillable`. A violation surfaces as MySQL error
1062, which the API catches and renders as `409 DUPLICATE_REFLECTION`.

**Naming:** `fk_` foreign keys, `ak_` alternate keys (unique), `ix_` indexes, `ck_` checks.
Follow the existing names in the schema file.

**`frameworks.fw_key`** is named that way because `key` is reserved in MySQL. Watch for other
reserved words before naming a column.

## Delete rules are product decisions

Do not default to `CASCADE`.

`reflections.user_id` and `reflections.gig_id` use `ON DELETE RESTRICT` deliberately.
Deleting a gig must fail loudly rather than quietly wiping the reflections written about it.
Student ownership is enforced by this constraint, not by a policy document. Never weaken it
to make a test or a teardown easier. Fix the teardown instead.

`reflections.sprint_id` uses `SET NULL`, so reorganising sprints loosens a reflection's
context rather than blocking the change.

## Things CHECK constraints cannot express

The schema cannot enforce that a `scores.level_id` belongs to the competency of the entry
being scored, without denormalising a column onto `scores`. That check lives in the service
layer and is documented as a known limitation on the ERD legend. Do not try to solve it in a
migration without an ADR arguing for the denormalisation.

## After the migration

- Update `db/01-schema.sql` so the reference file matches reality.
- Update `docs/erd.png` and the ERD legend if the change is structural.
- Write the ADR if one is needed.
