# CAP-16 Edit framework screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED SKILL:** Load `/add-screen` before the first file.

**Goal:** A supervisor picks a rubric to base a copy on, names the copy, renames competencies
and rewords level descriptors, and saves. Saving creates a copy that belongs to them, and the
rubric it was copied from does not change.

**Architecture:** One screen at `/frameworks/:framework_id/edit`, where the route parameter
chooses the base. A presentation-free module holds the draft and works out which PATCHes are
still outstanding. Save is `POST /frameworks` followed by one PATCH per changed field, sent
against the copy. The Select framework screen links every row in, and one script in `scripts/`
checks the lot. No contract change and no backend change.

**Tech Stack:** React 19, TypeScript 6, React Router, CSS modules over `tokens.css`. No new
dependencies.

**Spec:** COA4-74 (`project = COA4 AND summary ~ "CAP-16"`). Its acceptance criteria are the
spec, and ADR #16 is the decision behind them.

## Global Constraints

- Every call goes through `web/src/api/client.ts`. Types come from `web/src/api/schema.ts`. No
  hand-written response types.
- No raw hex and no `px`. Every colour, space and radius comes from `web/src/tokens.css`.
- snake_case throughout. There is no mapping layer.
- Four states: loaded, loading (skeletons), empty and error.
- **Renaming and rewording only (ADR #16).** No creating a framework from scratch, no adding
  or removing competencies, no changing level counts. **No UI for any of them, not even
  disabled.** Stating the restriction in prose is fine. A control for it is not.
- 409 `FRAMEWORK_IN_USE` is surfaced plainly if the guard fires mid-edit.
- `web/` has no test runner, so the check is a script in `scripts/`, wired into `./run`.

---

## What exists, verified on 2026-09-24

- `POST /frameworks {based_on_framework_id, name}` copies **any** framework, not only a
  template (`FrameworkController::store`). It needs a supervisor role on some gig
  (`FrameworkPolicy::create`). It returns `FrameworkDetail` with fresh ids, and codes and
  level values carried over (`FrameworkEditing::copy`). **The name is set by the POST**, so a
  first save needs no PATCH on the framework.
- `PATCH /frameworks/{id} {name}`, `PATCH /competencies/{id} {name, short_label}` and
  `PATCH /levels/{id} {descriptor}` each need the framework to be the caller's own (403
  otherwise) and unused (409 `FRAMEWORK_IN_USE` otherwise).
- `(framework_id, code)` and `(competency_id, level_value)` are both unique keys, so a copy's
  rows match the draft's by code and level value.
- **Both seeded templates are `in_use`**: La Trobe has 8 reflections and SFIA 9 has 2. CAP-15
  hides Edit on an in-use row, so on a freshly seeded database nothing links to this screen.
  **Decided with Jesse on 2026-09-24:** every row gets one "Copy and edit" link instead. The
  editor always copies, so `in_use` has no bearing on reaching it. This changes CAP-15's
  "Edit hidden when in_use", which gets a note on COA4-73.
- `short_label` is the radar's axis label (`db/01-schema.sql:108`). Renaming a competency
  without it leaves the radar showing the old name, so it counts as part of the rename. The
  contract already accepts it.
- `TextArea` autosaves on a debounce. This screen saves explicitly, so it uses plain fields
  styled from tokens.

## File structure

| File | Responsibility |
| --- | --- |
| `web/src/screens/framework-edit.ts` | The draft, which fields are blank, the outstanding PATCHes. No React. |
| `web/src/screens/EditFramework.tsx` | The screen: two fetches, four states, the save sequence. |
| `web/src/screens/EditFramework.module.css` | Its styles, tokens only. |
| `web/src/app/routes.tsx` | Mount it in place of the CAP-16 placeholder. |
| `web/src/screens/SelectFramework.tsx`, `framework-groups.ts` | "Copy and edit" on every row. `is_editable` goes, because nothing uses it any more. |
| `scripts/verify-edit-framework.sh` | The check. |
| `scripts/verify-select-framework.sh` | Its `in_use` assertions follow the entry-point change. |
| `run` | `./run verify-framework-edit`. |

---

### Task 1: The draft and the outstanding edits (check first)

**Files:** Create `scripts/verify-edit-framework.sh` (the executed section) and
`web/src/screens/framework-edit.ts`.

**Interfaces produced:**

```ts
type FrameworkDetail = components['schemas']['FrameworkDetail'];
interface LevelDraft { level_value: number; descriptor: string }
interface CompetencyDraft { code: string; category: string | null; name: string; short_label: string; levels: LevelDraft[] }
interface FrameworkDraft { name: string; competencies: CompetencyDraft[] }
type Edit =
  | { kind: 'framework'; id: string; body: { name: string } }
  | { kind: 'competency'; id: string; body: { name: string; short_label: string | null } }
  | { kind: 'level'; id: string; body: { descriptor: string } };
const NAME_MAX = 191, SHORT_LABEL_MAX = 32;
draft_from(base: FrameworkDetail): FrameworkDraft          // name defaults to "Copy of <base>"
set_competency(d, code, fields: Partial<Pick<CompetencyDraft,'name'|'short_label'>>): FrameworkDraft
set_level(d, code, level_value, descriptor): FrameworkDraft
missing_text(d): string[]                                  // human labels of blank required fields
pending_edits(copy: FrameworkDetail, d): Edit[]            // what still differs, trimmed; '' label -> null
apply_edit(copy: FrameworkDetail, e: Edit): FrameworkDetail
is_dirty(base: FrameworkDetail, d): boolean
```

`pending_edits` diffs the draft against **the copy**, not the base. After each PATCH succeeds
the screen folds it in with `apply_edit`, so a retry after a partial failure sends only what
is left, against the same copy. It throws if the copy is missing a competency or level the
draft has, because silently dropping an edit is worse than failing loudly.

- [ ] Step 1: write the executed section of the check. Compile the module standalone with
  `tsc` and assert the cases listed under Task 4. Run it: **FAIL**, the module does not exist.
- [ ] Step 2: write `framework-edit.ts`.
- [ ] Step 3: run the check: **PASS**. Then `npx tsc -b --force` in `web/`.
- [ ] Step 4: commit `feat(web): the draft and the edits a save still owes (CAP-16)`.

### Task 2: The screen

**Files:** Create `EditFramework.tsx` and `EditFramework.module.css`. Modify `routes.tsx`.

- `EditFramework` reads `framework_id`, then fetches `GET /frameworks` (for the selector) and
  `GET /frameworks/{framework_id}` together. Its states are `loading` (skeletons shaped like
  the form), `error` (`ErrorNotice` plus a link back to Frameworks), and `loaded`, which
  renders `<Editor key={base.id} …>`. The key means choosing another base starts a new
  draft.
- **Empty** means the base has no competencies. It says there is nothing to rename and leaves
  the base selector on screen, so the reader has a way out.
- **Based on** is a `<select>` grouped Templates / Saved copies by `group_frameworks`.
  Changing it navigates to that framework's edit route with `replace`. When the draft is
  dirty, a line warns that switching discards the edits. Once a copy exists the selector is
  disabled, since the copy already belongs to the old base.
- The page states the fixed shape once, in prose: scored `min`–`max`, competencies and levels
  fixed. There are no controls for shape.
- Each competency is a `Card` holding a fieldset. Its legend shows code and category. It has
  inputs for name (`maxLength` 191) and radar label (`maxLength` 32), and a textarea per level.
- **Save** is labelled "Save as a new copy", or "Save changes to your copy" once one exists.
  It runs `POST` if there is no copy yet, then each `pending_edits` item in order, folding
  each one into the copy.
  - A failure with **no copy yet** shows "Nothing was saved" and `ErrorNotice`.
  - A failure **after the copy exists** says the copy exists and how many edits are still
    outstanding. Saving again finishes those on the same copy.
  - **`FRAMEWORK_IN_USE`** says plainly that the copy was used to score a reflection before
    the edits reached it and can no longer change. It shows `error.message` as sent, and
    offers "Save to a fresh copy", which clears the copy but keeps the typing.
- Save is disabled while saving, while any required field is blank (named in the message), and
  when a copy exists with nothing outstanding.
- Mount it: `<Route path="frameworks/:framework_id/edit" element={<EditFramework />} />`.
- Lint, prettier, build, `check-tokens`. Commit `feat(web): the edit framework screen,
  copy then edit (CAP-16)`.

### Task 3: The way in

- `SelectFramework.tsx`: every row gets a "Copy and edit" link to `/frameworks/:id/edit`, not
  gated on `in_use`. Its import of `is_editable` is removed, and so is the function in
  `framework-groups.ts`.
- `verify-select-framework.sh`: the "Edit is gated on in_use" assertion becomes "Copy and
  edit on every row". The four `is_editable` executions go, and the assertion count follows.
- Commit `feat(web): every rubric can be copied and edited, in use or not (CAP-16)`.

### Task 4: The check, whole

`scripts/verify-edit-framework.sh`, wired in as `./run verify-framework-edit` with a help line.
It checks:

1. **Mounted.** `routes.tsx` renders `EditFramework` and the CAP-16 placeholder is gone.
2. **Reachable.** Select framework links "Copy and edit" to the route, not gated by `in_use`.
3. **Typed client.** No `fetch`. The screen calls `.post('/frameworks'`,
   `.patch('/frameworks/{framework_id}'`, `.patch('/competencies/{competency_id}'` and
   `.patch('/levels/{level_id}'`. Types come from `schema.ts`.
4. **Four states,** with skeletons and `ErrorNotice`.
5. **Scope (ADR #16).** No POST or DELETE on competencies or levels, no framework creation
   other than the copy, and no add/remove controls. The screen switches on
   `'FRAMEWORK_IN_USE'` by code.
6. **Executed.**
   - `draft_from` orders competencies by position and levels by value, and turns a null
     label into `''`.
   - An untouched draft produces only the name edit, and none once the copy has that name.
   - Renaming produces one competency edit. A blank label goes out as null.
   - Rewording produces one level edit, matched by value.
   - Whitespace only produces no edit.
   - Matching is by code, not by array order.
   - `apply_edit` clears each edit.
   - A copy missing a competency throws.
   - `missing_text` names blank fields and ignores a blank label.
   - `is_dirty` is false for a fresh draft and true after a change.
7. **Live, read-only,** with Dr Lee's token.
   - `GET /frameworks/{id}` carries `competencies`, `levels`, `descriptor`, `short_label`,
     `code` and `level_value`.
   - A PATCH on a seeded template is refused with 403, which proves the screen cannot write to
     a template.
   - It skips loudly when there is no server.

Prove it can fail by pointing the route back at the placeholder and seeing a FAIL. Then
`./run check`. Commit `test(web): verify the edit framework screen (CAP-16)`.

### Task 5: Look at it, then finish

- Run `./run api` and `./run web` with Dr Lee's token. Copy La Trobe and SFIA 9. Rename one
  competency and its label, reword one descriptor, and save. Read the copy back with
  `GET /frameworks/{id}` and check the base is unchanged. Check a phone width and a desktop
  width.
- Request review. Open a PR into `dev`, with a reviewer requested.
- **Jira:** COA4-74 stays In Progress until the PR is open and green, then moves to In Review.
  It moves to Done only after merge, with each criterion checked. COA4-73 gets a comment on
  the entry-point change.
