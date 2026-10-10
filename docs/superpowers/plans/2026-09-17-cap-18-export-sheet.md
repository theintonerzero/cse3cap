# CAP-18 Export sheet — Implementation Plan

> **For agentic workers:** Executed inline (executing-plans). Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED SKILL:** Load `/add-screen` before the first file. It carries the four-states rule, the typed-client rule and the token rule this plan assumes.

**Goal:** The export sheet CAP-7 left disabled on the diary home does the whole job: pick PDF or JSON, see what the export will hold, request it, watch it build, download the file, and be told plainly when it will not arrive.

**Architecture:** The sheet moves out of `DiaryHome.tsx` into its own screen file, `ExportSheet.tsx`, still mounted inside the diary's `BottomSheet`. Everything that decides *when to poll next* and *when to give up* is a React-free module, `export-poll.ts`, so the backoff schedule is compiled and executed by a check rather than grepped for. All calls go through `api` from `client.ts`; the download uses `api.blob` and an object URL. No new endpoint, no contract change: CAP-17 already put `pdf` in the enum and regenerated the types.

**Tech Stack:** React 19, TypeScript, React Router 8, CSS modules over `tokens.css`. No new dependencies.

**Ticket:** COA4-76 (`project = COA4 AND summary ~ "CAP-18"`). To Do, assigned to Jesse, 5 points. Acceptance criteria reproduced per task. Depends on CAP-4 (client, merged) and CAP-17 (pdf, merged as #44).

## Global Constraints

- Every API call goes through `web/src/api/client.ts`. No `fetch`, no response parsing, no hand-written response interface. `./run verify` and `verify-diary-home.sh` both grep for this.
- `web/src/api/schema.ts` is generated; never edited. Types come from `paths[...]`.
- No raw hex or pixel values; tokens from `tokens.css` only (`scripts/check-tokens.sh`).
- snake_case for API fields and, per the existing screens, for props and locals.
- Five states in the sheet, named in the component: `idle` (loaded: selector + summary), `empty` (nothing to export), `building` (in progress: requested, polling; visually its own thing, not a skeleton), `ready` (download), `failed` (error: an `ApiError`, a job that reports `failed`, or a poll that gave up). `loading` skeleton is the diary's and stays there; the sheet is only reachable once the record is loaded.
- Polling: the schedule and the give-up rule live once, in `export-poll.ts`. Backoff 1s, 2s, 4s, 8s, then 8s, capped; give up after 10 polls (about 62s) with a readable message. Polling stops when the sheet closes or the screen unmounts.
- The summary counts are of the whole record, not the scope in view (CAP-7's rule; keep it).
- Checks live in `scripts/verify-export-sheet.sh`, wired as `./run verify-export`. `verify-diary-home.sh` must keep passing.
- Commit messages `type(web): what and why (CAP-18)` with the two trailers.

## File map

| File | Responsibility |
| --- | --- |
| `web/src/screens/export-poll.ts` | Create. Pure: `next_delay_ms(attempt)`, `should_give_up(attempt)`, `download_name(id, format)`, `GIVE_UP_MESSAGE`, `MAX_POLLS`. No imports. |
| `web/src/screens/ExportSheet.tsx` | Create. The sheet: format selector, summary, request/poll/download, five states. |
| `web/src/screens/ExportSheet.module.css` | Create. Sheet styles moved from `DiaryHome.module.css` plus the new ones. |
| `web/src/screens/DiaryHome.tsx` | Modify. Delete the stub `ExportSheet`; import the real one. |
| `web/src/screens/DiaryHome.module.css` | Modify. Remove `.sheet`, `.sheet_counts` (moved). |
| `scripts/verify-export-sheet.sh` | Create. Static invariants + compiled backoff check + live request/poll/download when a server and token exist. |
| `run` | Modify. `verify-export)` entry. |
| `docs/Stack-and-Build-Scope.md` | Modify. Tick the Export sheet line. |

---

### Task 1: The poll schedule, React-free

**Criterion:** "Polling backs off and eventually gives up with a readable error rather than spinning forever."

- [ ] Create `web/src/screens/export-poll.ts`:

```ts
/**
 * When to ask the server about an export again, and when to stop asking.
 *
 * Import-free on purpose: scripts/verify-export-sheet.sh compiles this
 * file on its own and runs the schedule, because "backs off and gives up"
 * cannot be seen by clicking around a sync queue, where every export is
 * complete by the time the 202 arrives.
 */

/** Polls after the request itself. Ten is about a minute on this schedule. */
export const MAX_POLLS = 10;

const FIRST_DELAY_MS = 1_000;
const MAX_DELAY_MS = 8_000;

/** 1s, 2s, 4s, 8s, 8s, ... `attempt` is 1 for the first poll. */
export function next_delay_ms(attempt: number): number {
  const doubled = FIRST_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  return Math.min(doubled, MAX_DELAY_MS);
}

export function should_give_up(attempt: number): boolean {
  return attempt > MAX_POLLS;
}

export const GIVE_UP_MESSAGE =
  'This is taking longer than usual. The export may still finish on its own; close this and try again in a few minutes.';

export function download_name(export_id: string, format: 'json' | 'pdf'): string {
  return `reflection-diary-${export_id}.${format}`;
}
```

- [ ] Commit: `feat(web): the export poll schedule as a pure module (CAP-18)`.

### Task 2: The sheet

**Criteria:** "PDF and JSON selector, plus a summary of what the export includes." · "Request, receive 202 with a job id, poll GET /exports/{id}, download." · "Five states here, not four."

- [ ] Create `web/src/screens/ExportSheet.tsx` with:
  - Props: `{ reflections: ReflectionSummary[]; open: boolean }`. `open` is what stops the poll when the sheet closes.
  - `type Export = paths['/exports']['post']['responses']['202']['content']['application/json']`.
  - `type Job = { status: 'idle' } | { status: 'building'; export_id: string; polls: number } | { status: 'ready'; job: Export } | { status: 'failed'; error: ApiError | null; message: string }`. `empty` is derived: `reflections.length === 0`.
  - Format selector: two `Chip`s (`PDF`, `JSON`), `selected` toggles; default `pdf`.
  - Summary: the CAP-7 counts list, plus one line naming the format's shape ("A PDF: every reflection on its own page, both score sets, the radar." / "JSON: the same record as data, for another system to read.").
  - Request: `api.post('/exports', { body: { format } })` → if `status === 'complete'` go straight to `ready` (sync queue); else `building` with `polls: 0`.
  - Poll effect: while `building && open`, `setTimeout(next_delay_ms(polls + 1))` then `api.get('/exports/{export_id}')`; `complete` → `ready`; `failed` → `failed` with copy "The export failed to build. Request another."; still pending → `polls + 1`, and if `should_give_up(polls + 1)` → `failed` with `GIVE_UP_MESSAGE`. Cleanup clears the timer. An `ApiError` from the poll → `failed` with that error.
  - Ready: the job's `summary` (reflections, sprints, scores, files) and a Download button: `api.blob('/exports/{export_id}/download')` → `URL.createObjectURL` → `<a download={download_name(...)}>` click → revoke. A blob `ApiError` → `failed`.
  - Failed: `ErrorNotice` when there is an `ApiError`, otherwise the message in the notice's own styling; "Start again" resets to `idle`.
  - Building: its own block, `role="status"`, "Building your PDF…" with a poll count ("checked 3 times"), Chips and Request disabled. Not a `Skeleton`.
- [ ] Create `ExportSheet.module.css`; move `.sheet`, `.sheet_counts` from `DiaryHome.module.css`; add `.formats`, `.building`, `.summary`.
- [ ] In `DiaryHome.tsx`: delete the stub and its comment, import `ExportSheet`, pass `open={export_open}`. Remove the moved styles from `DiaryHome.module.css`.
- [ ] `cd web && npx tsc -b --noEmit && npm run lint && npx prettier --check .` clean.
- [ ] Look at it: `./run api` + `./run web`, Jane's token, both widths via Playwright. PDF and JSON both download real files.
- [ ] Commit: `feat(web): the export sheet requests, polls and downloads (CAP-18)`.

### Task 3: The check

- [ ] Create `scripts/verify-export-sheet.sh` modelled on `verify-gig-detail.sh`:
  1. `DiaryHome.tsx` imports `ExportSheet` from `./ExportSheet.tsx` and the stub is gone.
  2. No `fetch(`, no `interface .*Response`, all calls via `api.`; `api.blob` is used for the download; `format` is only ever `'json' | 'pdf'`.
  3. Five states present by name: `'idle'`, `'building'`, `'ready'`, `'failed'`, and the empty branch; `Skeleton` is NOT imported (the in-progress state is not a skeleton).
  4. `export-poll.ts` is import-free; compile it standalone and run: delays for attempts 1..6 are `[1000,2000,4000,8000,8000,8000]`; `should_give_up(10)` false, `should_give_up(11)` true; total wall time of the schedule is under 90s; `download_name` yields `reflection-diary-x.pdf`.
  5. Live (skip loudly without server/token): `POST /exports {format: pdf}` → 202 with `id`; `GET /exports/{id}` → 200; download → 200 with `content-type: application/pdf`.
- [ ] `run`: add `verify-export) step ./scripts/verify-export-sheet.sh ;;` with a comment in the house style.
- [ ] `./run verify-export` and `./run verify-diary` both green. Quote the counts.
- [ ] Commit: `test(scripts): verify-export-sheet proves the poll schedule and the download (CAP-18)`.

### Task 4: Docs and finish

- [ ] `docs/Stack-and-Build-Scope.md`: tick the Export sheet line and describe it in one sentence, naming `./run verify-export`.
- [ ] `./run check` (expect only the pre-existing GD errors), `./run verify` 28/28.
- [ ] PR into `dev`, reviewer requested, merge; COA4-76 → Done with criteria checked.

## Self-review

- Coverage: selector + summary (T2), request/poll/download (T2), backoff + give up (T1, proven in T3), five states (T2, asserted in T3). ✓
- Types: `Export` from `paths['/exports']['post']` is the same schema as `GET /exports/{id}` (`#/components/schemas/Export`), so one alias serves both. `format` type is `Export['format']`. ✓
- Not in scope: an export history list, resuming a poll after a reload, a cancel endpoint (none exists).
