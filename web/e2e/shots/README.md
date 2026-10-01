# Screenshot capture (HO-6)

`./run shots` from the repository root. Writes PNGs to `web/e2e/shots/output/`,
one per entry in `manifest.ts`, named `${id}.png`.

## Figure numbers are not real yet

COA4-102 links a Google Doc shot list. It is access-restricted and could not
be read while building this tool, so every id here is a descriptive stem
(`diary-home-loaded`), not the doc's actual figure number. Once the doc is
readable, renaming is a one-line edit per entry in `manifest.ts` — the `id`
field is the only thing that needs to change; nothing else in the pipeline
cares what it is called.

## Real vs fake

Read-only screens (Diary home, Gig detail, Review queue, Select framework,
Edit framework, History sheet) capture their `loaded` state against the real
seeded API, so the manual shows real data. Every write-flow screen (Entry
stepper in both modes, Export sheet, Submitted) and every `loading` / `empty`
/ `error` state on any screen captures against the fake API instead, so
nothing this tool does ever writes to the shared database.

A real-API shot needs a seeded token in the environment: `SHOTS_STUDENT_TOKEN`,
`SHOTS_ASSESSOR_TOKEN`, `SHOTS_SUPERVISOR_TOKEN`. With none set, those shots
skip themselves with a clear message rather than failing the run — the same
convention every `scripts/verify-*.sh`'s live half already uses. Never
re-seed the database to obtain a token; take one already printed from the
last real seed run.

## Coverage today

Not every screen has all four states yet, and neither sheet (History,
Export) has a mobile copy of its `loaded` shot. `manifest.test.ts` only
enforces that every *routed* screen has at least one shot; it does not (and
cannot, without a JSX parser this tool deliberately doesn't carry) enforce
full state × viewport coverage. Extending coverage is adding entries to
`manifest.ts`, never touching `capture.spec.ts`.

The `mask` field (criterion 3) is implemented and works on any shot where
a selector points to something sensitive. No masking demonstration entry was
added because the only content that needs masking on screen—the token input
(TokenGate.tsx)—is never included in the user manual. That screen is internal
dev-only tooling for entering seeded tokens during development, not something
students or assessors use in production. Once additional sensitive data
appears on screens that belong in the manual, a masking demonstration can be
added by creating a shot with a `mask` field that identifies its selectors.

## When to run this for real

Once, against the real seeded API, after the UI freeze on Wednesday 7
October. Again before submission, to catch anything that changed since.
