# CAP-70: the learning record is the one place to export: plan

**Ticket:** CAP-70 (COA4-140). **Design:** Patrick's proposal, approved from the mockup on
12 October 2026. **Branch:** `feat/CAP-70-record-is-the-export`.

**Freeze:** built after the v1.0.0 code freeze (`2026-10-10-freeze-release-and-a3-docs.md`).
The pull request is opened, reviewed and left unmerged until Assessment 3 is submitted, by
the person's decision of 12 October.

## What changes

1. **Diary home.** The floating button is a link to `/record` named "Your learning record".
   The export sheet, its state and the bottom "Your learning record ›" link go.
2. **Learning record.** A "Yours to keep" panel at the top, under the heading and the
   counts, holds "Export your record", which opens the export sheet. The bottom Export
   record button and the summary's note go. Each gig's table puts every sprint's status in
   its column heading and shows the student's level and the assessor's side by side, each
   cell named for a screen reader ("You: level 3, assessor: level 2").
3. **Export sheet.** The sheet is titled "Export your record". A summary line of what the
   export holds, with counts by status, then PDF and JSON as two radio choices, each saying
   what it is for. The button names the format ("Export as PDF"). Ready: "Your PDF is
   ready", "Download PDF", "Export another format".

No endpoint, no schema, no business rule changes: `web/` only, plus docs.

## Tasks, in order, each red first

1. **Diary home.** `diary-home-layout.spec.ts`: the floating button is a link to `/record`;
   the diary has no export. Then `DiaryHome.tsx`, `FloatingAction` taking a link.
2. **Record: export at the top.** `learning-record.spec.ts`: the panel comes before the
   first gig and opens the sheet; the sheet's focus trap and 360px overflow move here from
   `accessibility.spec.ts` and `phone-width.spec.ts`, which open it from the diary today.
3. **Record: the grid.** `learning-record.spec.ts`: status in the column headings, cell
   names. Then `LearningRecord.tsx` and its CSS.
4. **Export sheet.** The format radios, the summary, the button and ready copy, through the
   specs that open it (`export-download.spec.ts` moves to `/record`). Then `ExportSheet.tsx`.
5. **Checks that name the old shape.** `scripts/verify-export-sheet.sh`,
   `scripts/verify-diary-home.sh`, `e2e/shots/manifest.ts` ready markers, `firefox.spec.ts`.
6. **Docs.** An ADR for moving export; `docs/Design-Inventory.md` rows `66:34`, `86:936`,
   `91:1316` and `142:2379`.
7. **Verify.** `./run e2e`, the build, `check-tokens`, `check-contrast`, the per-screen
   scripts, the impeccable detector; one batched look at 390 and 1280, light and dark.
