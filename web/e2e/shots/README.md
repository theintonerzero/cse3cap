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

Three of the real-sourced shots also need a real seeded id this tool has no
way to discover on its own, since it only navigates and reads: `SHOTS_GIG_ID`
(a gig `SHOTS_STUDENT_TOKEN`'s user participates in, for `gig-detail-loaded`
and `history-sheet-loaded`) and `SHOTS_FRAMEWORK_ID` (a framework
`SHOTS_SUPERVISOR_TOKEN`'s user may open, for `edit-framework-loaded`). With
either unset, just those shots (and their mobile copies) skip with a clear
message, same as a missing token.

## Coverage today

Every screen now has all four states: `loaded`, `loading`, `empty` and
`error` (CAP-21 extended HO-6's original two worked examples, Diary Home and
Entry Stepper, to the remaining seven screens, proving the fake-API
techniques — `hold()`, empty arrays, `fail()` — generalise). Two documented,
deliberate exceptions: Export Sheet has no `loading` entry, because it takes
`reflections` as a prop already loaded by its parent and never fetches on
its own mount (see its manifest entry); and assessor-mode Entry Stepper has
no `loading`/`empty`/`error` entries of its own, reusing student mode's,
since only the `loaded` view differs between the two modes. `manifest.test.ts`
only enforces that every _routed_ screen has at least one shot; it does not
(and cannot, without a JSX parser this tool deliberately doesn't carry)
enforce full state × viewport coverage. Extending coverage is almost always
adding entries to `manifest.ts` alone — `capture.spec.ts`'s `open` field
accepting an array (for a state that needs more than one interaction to
reach, e.g. Export Sheet's `failed` state needing two clicks) is the one
documented exception where this diff did touch it.
The Sign-in screen is not routed (rendered by AppShell when there is no token),
so it is not covered by the completeness check.

Select Framework and Edit Framework each have a generic 500 `error`-state demo
now, but neither has a `FRAMEWORK_IN_USE`-specific one. `FRAMEWORK_IN_USE`
(the one business-rule refusal either screen's save path can return) is
contract-valid only on the three PATCH routes a save makes
(`docs/openapi.yaml`'s `updateFramework`, `updateCompetency`, `updateLevel`),
never on the GET routes either screen's own load calls — and a real-API shot
in this tool is a read-only navigation, never a save. There is no route this
tool can reach where that refusal is genuine, so no shot depicts it.

The Sign-in screen (token-entry-masked) demonstrates criterion 3 (`mask`
field). The shot navigates to `/` with no token planted (`no_token` on the
scenario, since the fake always plants one by default) so TokenGate renders
its clean, first-run state rather than a 401's rejection banner, clicks the
"Student +" chip to open the token entry form, fills a dummy value in so the
mask has something to cover, and masks the resulting input field
(id="token-input") with a solid redaction box in the screenshot. This shows
the manual how to sign in without revealing an actual token. TokenGate is
the product's actual authentication mechanism (ADR #15: no traditional login
screen)—students and assessors see it on first use and when their session
expires; a 401 lands them back on this same screen, but with the rejection
banner showing, which is deliberately not what this figure demonstrates.

## When to run this for real

Once, against the real seeded API, after the UI freeze on Wednesday 7
October. Again before submission, to catch anything that changed since.
