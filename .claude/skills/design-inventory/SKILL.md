---
name: design-inventory
description: Check, create or refresh docs/Design-Inventory.md, the record of every Figma prototype frame and what the build did with it. Use when someone asks whether a screen was designed, what changed from the prototype, when a screen is added, renamed or cut, when the Figma file changes, or when SMD section 3.7 of the handover report needs its prototype-to-build table.
---

# The design inventory

The Figma prototype is where the screens started, and it lives outside this repository. A
maintainer who only has the repository cannot see it, and several plans point at design
files that were never committed (`docs/05_figma_frames.pdf`, `docs/06_figma_diary_frames.pdf`,
`~/projects/alumable-diary`). `docs/Design-Inventory.md` is the bridge. It names every frame
by its Figma node ID, says what was built from it, and cites the file or decision that
proves it.

It is a record, not a spec. Where the inventory, the Figma file and the code disagree, the
code wins and the inventory is the bug.

## Hard rules

**Text only. Designs stay out of git.** No PNG, PDF or SVG exports of Figma frames in the
repository. This is the team's standing rule, recorded in the CAP-7 and CAP-8 plans. A row
points at a frame by name and node ID; anyone with the link opens it in Figma. Changing this
rule needs an ADR, not a skill.

**Never invent a mapping.** Every row cites evidence: a file path in `web/src/`, a route in
`web/src/app/routes.tsx`, an ADR number, a section of `docs/Stack-and-Build-Scope.md`, a
plan in `docs/superpowers/plans/`, or a Jira key. If you cannot find evidence, write
`[TODO: owner]` in the row and list it in your report. Do not guess why something changed.
"Changed" with no recorded reason gets a TODO, not a plausible story.

**Read before you judge.** Do not mark a frame `built` from its name alone. Open the frame
(Figma MCP `get_design_context` or `get_screenshot` on the node ID) and open the component,
and compare what each shows.

**Do not touch screens, plans or ADRs.** This work edits `docs/Design-Inventory.md`, the
README documents table, the CLAUDE.md skills table, `docs/CHANGELOG.md` and this skill's
snapshot. Plans are history as executed and are never rewritten. If the inventory shows a
decision with no ADR, report it; `/write-adr` is a separate change.

**Public repository.** No client emails, no project brief, no rubric text, no tokens, no
personal details beyond the fictional names already in the prototype.

**Writing style.** Australian English, sentence case headings, short active sentences, no
em dashes. Do not use: delve, crucial, harness, pivotal, bolster, facilitate, robust,
cutting-edge, landscape, seamless, comprehensive. The handover report quotes this document.

## Statuses

Use exactly these. They are the column the handover report's section 3.7 is built from.

| Status | Means | Evidence required |
| --- | --- | --- |
| `built` | The screen exists and does what the frame shows | Component path and route |
| `changed` | The screen exists but a user would notice a difference | Component path, one sentence on what changed, the reason with its source |
| `dropped` | In the module's scope in the design, not built | The ADR or `Stack-and-Build-Scope.md` §5 line that cut it, else a TODO |
| `host app` | Shows Alumable's own platform, not the diary module, so nothing was due | A line saying which part of the host app it is |

`host app` is not `dropped`. Calling the home, earn or learn pages "dropped" would tell the
client the team failed to build things that were never asked for.

## Phase 0: check what exists

1. Run `git ls-files docs/Design-Inventory.md`. If it exists, you are refreshing: read it,
   keep its rows, and change only what the evidence now contradicts.
2. Run `grep -rniE "figma|prototype|frame" --include=*.md --include=*.ts --include=*.tsx .`
   (excluding `node_modules`) and note every reference. These are your leads and your list
   of legacy pointers.
3. Report what you found before writing anything: whether the inventory exists, how many
   frames, how many built screens, and the legacy pointers.

## Phase 1: the frames

If the Figma MCP server is connected, read the file live: `get_metadata` with file key
`uzBUfJiF1Ei8l2iUlW0n93` and node `0:1`, then list the top-level frames. Compare with
`frames-snapshot.md` in this folder. Report any frame added, renamed or deleted, and update
the snapshot in the same change.

If it is not connected, use `frames-snapshot.md` and say in the document that the frame
list is the 3 October 2026 snapshot. To connect it for next time:
`claude mcp add --transport http figma https://mcp.figma.com/mcp`, then `/mcp` to sign in.

## Phase 2: the built side

Build the list of everything a user can see, from these sources only:

- `web/src/app/routes.tsx`: every route and its component
- `web/src/screens/`: includes the two sheets with no route (`HistorySheet`, `ExportSheet`)
- `web/src/session/TokenGate.tsx`: the sign-in screen AppShell renders with no token
- `docs/Stack-and-Build-Scope.md` §4.3: the ten screens and §5, what is out of scope
- `web/e2e/shots/manifest.ts`: the HO-6 screenshot ids for each screen, which the report
  pairs with the frames

`web/gallery.html` is a developer tool, not a user screen. Leave it out.

## Phase 3: map frames to the build

Work through every frame. For each one, open the frame and the candidate component, decide
the status, and cite the evidence. These leads are already recorded in the repository and
are a starting point, not a conclusion. Verify each one.

- The gig page: the CAP-8 plan maps "My Gig → Overview" to `GigDetail` and says this frame
  is the host app's gig page with the diary card inside it, and the history sheet on the
  same frame is CAP-14.
- Three user types in the design (student, host, educator), four roles in the schema:
  educator maps to `supervisor` (ADR #17).
- "Based on" plus "your copy" in the edit framework frames became copy-then-edit (ADR #16).
- User Selection, the screen that picks a view: the build uses three seeded tokens through
  `TokenGate` instead of a login (ADR #15).
- The two "Change framework" frames: changing a gig's rubric once assigned is out of scope
  (ADR #33, `Stack-and-Build-Scope.md` §5).
- Framework creation from scratch is out of scope, which bears on the "New template" frames.

Duplicate frame names exist (see the snapshot's Note column). Give each its own row, told
apart by node ID, and say how the two differ if you can see it.

## Phase 4: reverse check, no orphans

Every route, both sheets and the sign-in screen must appear in at least one row, or in the
"Built with no frame" table with a one-line reason and its source. A built screen with no
frame is a normal finding (the review queue may be one), not an error to hide.

## Phase 5: write the document

Path: `docs/Design-Inventory.md`. Use this structure.

```markdown
# Design inventory: Figma prototype to build

One paragraph: what this is, that the code wins where it disagrees, and how to refresh it
(the `/design-inventory` skill).

## Source

| | |
| --- | --- |
| Figma file | link, file key, page |
| Frames | count, and whether read live or from the snapshot, with the date |
| Owner of the Figma file | name, or [TODO: owner] |
| Viewing | whether the link is set to "anyone with the link can view", or [TODO: owner] |

## Status key

The four statuses and what each means.

## Frames

| Role | Frame | Node ID | Built as (route or component) | Status | What changed and why | Evidence |

One row per frame, ordered student, host, educator, in user flow order, not canvas order.

## Built with no frame

| Screen | Route or component | Why there is no frame | Evidence |

## Legacy design pointers

| Pointer in the repository | Where it appears | What it refers to now |

Each reference to a design file that is not in git, mapped to a node ID where you can tell.

## Counts

Totals per status, so the handover report can quote them.
```

Then, in the same change:

- Add a row to the README documents table: `docs/Design-Inventory.md`, "Every Figma frame
  and what the build did with it".
- Replace the bare "Figma" in the README stack table's Design row with a link to the
  inventory.
- Add a row to the CLAUDE.md skills table: "Any question about the design or a prototype
  frame" → `/design-inventory`.
- Add a line under `[Unreleased]` in `docs/CHANGELOG.md`.

## Phase 6: verify and hand over

Before claiming it is done, check and quote the output:

- every node ID in `frames-snapshot.md` (or the live list) appears in the Frames table
- every route path in `routes.tsx`, both sheets and `TokenGate` appear somewhere
- no image or PDF was added: `git status --porcelain | grep -iE '\.(png|jpe?g|pdf|svg)$'`
  returns nothing
- the count of `[TODO` lines, each listed by owner in your report
- `npx prettier --check docs/Design-Inventory.md`

Work on a `docs/<ticket>-design-inventory` branch off `dev`. CONTRIBUTING asks for one Jira
ticket per branch: load `/jira-tickets` to find the ticket covering SMD 3.7 or the
inventory. Do not invent a key; if none exists, ask. Open a PR into `dev` and request a
reviewer.

Finish with a short report: counts per status, every TODO with its owner, frames that
changed since the snapshot, and any decision you found with no ADR.
