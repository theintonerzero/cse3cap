---
name: write-adr
description: Write an architecture decision record. Use when making or reversing any significant technical decision, changing the schema, changing the API contract, cutting scope, or superseding an earlier record. Encodes this project's ADR format, numbering, supersede rules and writing voice.
---

# Writing an ADR

Records are append only. A decision that changes later is never edited or deleted. A new
record supersedes it and the old one is marked. The trail is the point: it shows how the
design actually developed, which reads better than a design that appears to have been right
first time.

## When one is needed

- Changing the schema: a table, a relationship, a delete rule, a constraint
- Changing the API contract in a way that affects how something is modelled
- Choosing a library, framework or service
- Reversing or narrowing anything already recorded
- Cutting a feature from scope

Not needed for: implementing something already decided, a nullable column for an agreed
feature, or a bug fix.

When unsure, write it. The register is a graded artifact and a short record costs ten
minutes.

## Where

`docs/adr/architecture-decision-records.md`, appended to the end, with a line added to the
index at the top. Template in `docs/adr/TEMPLATE.md`. Numbering is sequential and never
reused.

## Format

```
ADR #N: Title
Status: Proposed | Accepted | Superseded by #M
Date: YYYY-MM-DD
Supersedes: #M   (omit if none)

Context:
What forces were at play, and what we knew at the time. Written so it still makes sense to
someone reading it in six months with no memory of the conversation.

Decision:
What we chose. Specific and unambiguous.

Consequences:
Positive:
What this buys us.

Negative:
What it costs. Be honest. A record with no downsides reads as marketing and will be
disbelieved.

Alternatives:
Option we did not take. Why not.

Second option we did not take. Why not.
```

## What makes a record good

**Honest negatives.** The most credible part of any record is the cost section. If you
cannot think of a downside, you have not thought about the decision hard enough.

**Alternatives written fairly.** State the genuinely reasonable option as genuinely
reasonable, then say why it lost. A strawman alternative makes the whole record look
motivated. ADR #12 in this project describes Blade with Livewire as less total work, which
is true, before explaining why it lost anyway.

**Context that ages well.** "We chose X because of Y" is only useful if Y is written down.
Someone reading later needs to know what was true at the time, not just what was decided.

## Superseding

Do not edit the old record beyond changing its Status line to `Superseded by #M`. The new
record lists what it supersedes and explains what changed. One new record can supersede
several old ones. ADR #10 supersedes five at once, from when the AI scope was cut and the
project moved back to MySQL.

## Voice

Match the existing records. Plain, direct, contractions fine, abbreviations like req, db and
prod used naturally. No em dashes or semicolons joining clauses; use full stops instead.
Alternatives are written as a statement then a reason, not as a bulleted list.
