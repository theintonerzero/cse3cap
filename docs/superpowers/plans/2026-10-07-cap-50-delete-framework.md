# CAP-50 Delete a framework copy until it is assigned Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A supervisor can delete a framework copy they made, for as long as no gig has it as its rubric.

**Architecture:** `DELETE /api/v1/frameworks/{framework}`. Who may delete is `FrameworkPolicy::delete` (own copy, and a supervisor somewhere, by asking `create`). Whether it may go is `FrameworkEditing::assertDeletable` (no `framework_assignments` row), and `FrameworkEditing::delete` runs the check and the delete in one transaction, turning a 1451 on `fk_fa_fw` into the same 409. Both framework resources gain a derived `assigned`. `EditFramework` offers the delete in a `BottomSheet` confirm to the copy's creator while `assigned` is false.

**Tech Stack:** Laravel 13, PHPUnit feature tests on the per-developer MySQL test database, React 19, Playwright against `web/e2e/fake-api.ts` (ADR #42).

**Spec:** Jira COA4-120 (CAP-50) acceptance criteria. ADR #16, extended by ADR #59 in this change. The acceptance criteria are the brainstorm.

## Global Constraints

- No schema change, no migration, no foreign key change. `fk_fa_fw` and `fk_refl_fw` keep no `ON DELETE` clause.
- Authorisation in `api/app/Policies/` only. The never-assigned rule in `FrameworkEditing` only. No separate reflections check (ADR #35: a reflection takes its framework from the gig's assignment).
- Error code `FRAMEWORK_ASSIGNED`, 409, `details.framework_id`, message: "This framework is assigned to a gig, so it can't be deleted. Frameworks assigned to a gig are kept so every score stays readable."
- Every call through `web/src/api/client.ts`. `web/src/api/schema.ts` is regenerated with `npm run gen:types`, never edited.
- Tokens from `web/src/tokens.css` only. Sentence case. Australian English. No em dashes.
- Seeded rows are never touched. `scripts/smoke.sh` deletes only the copy it made.

## Review Focus

- A copy whose owner is no longer a supervisor anywhere: 403, not a delete. Test: `test_an_owner_who_supervises_nothing_cannot_delete_their_copy`.
- A 1451 from a different foreign key (a reflection pointing at an unassigned framework, which ADR #35 says cannot happen) must not be dressed as `FRAMEWORK_ASSIGNED`. It stays a 500. Covered by matching `fk_fa_fw` in the message, stated in ADR #59.
- Pressing "Keep it" deletes nothing. Test in the browser spec.
- After a refused delete the button goes at once, even if the refresh fails. Test: the 409 spec asserts the button is gone and the message is shown.
- The editor's unsaved edits survive a refused delete: the refresh replaces `base` in place, without going back to skeletons.

---

### Task 1: The policy, the rule and the route, test first

**Files:**
- Create: `api/tests/Feature/FrameworkDeletionTest.php`
- Modify: `api/app/Policies/FrameworkPolicy.php`, `api/app/Services/FrameworkEditing.php`, `api/app/Models/Framework.php`, `api/app/Http/Controllers/Api/V1/FrameworkController.php`, `api/routes/api.php`, `api/app/Http/Resources/FrameworkResource.php`, `api/app/Http/Resources/FrameworkDetailResource.php`

**Interfaces:**
- Produces: `FrameworkPolicy::delete(User, Framework): Response`, `FrameworkEditing::assertDeletable(Framework): void`, `FrameworkEditing::delete(Framework): void`, `Framework::assignments(): HasMany`, response field `assigned: bool` on `Framework` and `FrameworkDetail`.

- [ ] **Step 1: Write the failing tests** in `FrameworkDeletionTest`, built on `DemoSeeder` like `FrameworkMutationTest`:
  - `test_an_owner_deletes_an_unassigned_copy_with_its_competencies_and_levels`: 204, and no `frameworks`, `competencies` or `levels` row left for the copy.
  - `test_an_assigned_copy_cannot_be_deleted`: assign to a fresh gig, then 409 `FRAMEWORK_ASSIGNED`, `details.framework_id`, and every row still there.
  - `test_another_supervisors_copy_cannot_be_deleted`: 403 `ROLE_FORBIDDEN`.
  - `test_a_seeded_base_template_cannot_be_deleted`: 403, as Dr Lee.
  - `test_a_student_cannot_delete_a_framework`: Jane on Dr Lee's copy, 403.
  - `test_an_owner_who_supervises_nothing_cannot_delete_their_copy`: a user with no participation owns a copy made through the service, 403.
  - `test_an_unknown_framework_is_404`: `NOT_FOUND`.
  - `test_an_assignment_that_lands_mid_delete_is_still_a_409`: a `Framework::deleting` listener inserts the assignment after the check and before the `DELETE`; MySQL refuses with 1451 on `fk_fa_fw`; the response is 409 `FRAMEWORK_ASSIGNED` and the copy is still there.
  - `test_the_resources_say_whether_a_framework_is_assigned`: list and detail say `assigned: false`, then `true` after an assignment.
- [ ] **Step 2: Run** `cd api && php artisan test --filter=FrameworkDeletionTest`. Expected: 405 or 404 for the route, and no `assigned` key.
- [ ] **Step 3: Implement**, in this order: `Framework::assignments()`; `FrameworkPolicy::delete`; `FrameworkEditing::assertDeletable` and `delete`; `FrameworkController::destroy` (authorise, `$this->editing->delete($framework)`, `response()->noContent()`); the route and its comment; `withExists`/`loadExists` on `['reflections', 'assignments']` in index, show, store and update; `assigned` after `in_use` in both resources, so `verify-edit-framework.sh`'s field-order grep still finds `"created_by":null`.
- [ ] **Step 4: Run** the filter, then the whole suite. Expected: all green.
- [ ] **Step 5: Commit** `feat(api): a supervisor deletes their own copy until it is assigned (CAP-50)`.

### Task 2: The contract and the rule's other homes

**Files:** `docs/openapi.yaml`, `web/src/api/schema.ts` (generated), `CLAUDE.md`, `.claude/skills/add-endpoint/SKILL.md`, `.claude/skills/add-policy/SKILL.md`, `scripts/check-one-rule.sh`, `docs/API-Specification.md`, `docs/api-reference.html`

- [ ] **Step 1:** `deleteFramework` under `/frameworks/{framework_id}`: 204 `NoContent`, 401, 403 (seeded base, someone else's copy, or not a supervisor), 404, 409 `FrameworkAssigned`. Add `FrameworkAssigned` to `components.responses`, `FRAMEWORK_ASSIGNED` to the error enum, `assigned` (required) to `Framework` and `FrameworkDetail`, and `assigned` to the list example.
- [ ] **Step 2:** `cd web && npm run gen:types`. Then `./run contract-drift`. Expected: pass.
- [ ] **Step 3:** The rule line in CLAUDE.md and in the add-endpoint skill table; the matrix row in `docs/API-Specification.md` §11 and the add-policy skill; a `### DELETE /frameworks/{framework_id}` section and the code in the spec's code list; the endpoint in `docs/api-reference.html`.
- [ ] **Step 4:** `check "a framework is deletable only until assigned" "api/app/Services/FrameworkEditing.php" "'FRAMEWORK_ASSIGNED'"` in `check-one-rule.sh`. Run `./run one-rule`. Expected: pass, nine lines ok.
- [ ] **Step 5: Commit** `docs(api): the contract, the matrix and the rule list carry the delete (CAP-50)`.

### Task 3: The fake and the browser specs, red first

**Files:**
- Create: `web/e2e/edit-framework-delete.spec.ts`
- Modify: `web/e2e/fake-api.ts`, `web/e2e/fixtures.ts`

- [ ] **Step 1:** The fake serves `DELETE /frameworks/:id` as a shape (removes the row, 204), carries `assigned` in `summary()` and on a copy, and gains `assign(framework_id)`, which stages an assignment server-side like `add_reflection`. Fixtures gain `assigned: false` on all three and two copies of Dr Lee's: `MINE` (unassigned) and `MINE_ASSIGNED` (assigned, not in use), as their own constants so no other spec's list changes.
- [ ] **Step 2:** Specs:
  - `an owner deletes an unassigned copy and lands on Frameworks with a confirmation`: the confirm sheet names the framework and says it can't be undone; "Delete framework" sends one `DELETE /frameworks/:id`; the URL is `/frameworks` and "Deleted <name>." is announced.
  - `keeping it deletes nothing`.
  - `no delete for an assigned copy, a seeded base or someone else's copy`.
  - `a refusal shows the server's message and the button goes`: `api.fail('DELETE /frameworks/:id', 409 FRAMEWORK_ASSIGNED)` and `api.assign(MINE)`; the message is shown and the button is gone, and the editor's typed name survives.
  - `any other failure is the screen's error state`: a network fault shows the error notice.
- [ ] **Step 3:** `./run e2e -g "delete"`. Expected: fails, no button.

### Task 4: The screen

**Files:** `web/src/screens/EditFramework.tsx`, `web/src/screens/EditFramework.module.css`, `web/src/screens/SelectFramework.tsx`, `web/src/screens/SelectFramework.module.css`

- [ ] **Step 1:** `EditFramework` passes `refresh_base` (GET the framework, replace `base` in place) and `fail` (to the error state) to `Editor`. `Editor` renders `DeleteFramework` under "Based on" while no copy has been made.
- [ ] **Step 2:** `DeleteFramework` uses `useSession().me`. Owner and `!base.assigned` and not refused: a secondary "Delete framework" button. A `BottomSheet` titled "Delete <name>?", body "This removes <name> and its competencies and descriptors. It can't be undone.", "Delete framework" and "Keep it". 204: `navigate('/frameworks', { replace: true, state: { deleted: name } })`. `FRAMEWORK_ASSIGNED`: close, show `error.message`, hide the button, `refresh_base()`. Anything else: `fail(error)`.
- [ ] **Step 3:** `SelectFramework` reads `location.state.deleted` and shows "Deleted <name>." with `role="status"`.
- [ ] **Step 4:** `./run e2e`. Expected: all green. Then `npm run lint`, `npx prettier --check .`, `scripts/check-tokens.sh`.
- [ ] **Step 5:** Look at it with the playwright plugin at 390 and 1280 wide, against a copy made for the purpose.
- [ ] **Step 6: Commit** `feat(web): delete your own unassigned copy from the editor (CAP-50)`.

### Task 5: Scripts

**Files:** `scripts/smoke.sh`, `scripts/verify-edit-framework.sh`, `run` (comment)

- [ ] **Step 1:** `smoke.sh`, after the one-rubric section: Jane cannot delete the copy (403), nobody deletes a seeded base (403), Dr Lee deletes her copy (204), it is gone (404).
- [ ] **Step 2:** `verify-edit-framework.sh` section 5: the only delete the screen makes is `.delete('/frameworks/{framework_id}'`, never a competency or level; `FRAMEWORK_ASSIGNED` is handled by code. Section 7: a DELETE on a seeded template is refused 403.
- [ ] **Step 3:** Run both against `php artisan serve` with the seeded tokens. Expected: green.
- [ ] **Step 4: Commit** `test(scripts): smoke deletes the copy it made; the editor's one delete (CAP-50)`.

### Task 6: ADR, changelog, counts, inventory

**Files:** `docs/adr/architecture-decision-records.md`, `docs/CHANGELOG.md`, `README.md`, `docs/Design-Inventory.md`

- [ ] **Step 1:** ADR #59, Proposed, `Extends: #16`. ADR #16's Status line and index line say "extended by #59".
- [ ] **Step 2:** Count endpoints with `php artisan route:list --path=api/v1 --json` and rules from CLAUDE.md's list, before and after. Update "What 1.0.0 contains", the README and the spec from those numbers. Drop the smoke-copy known limitation.
- [ ] **Step 3:** CHANGELOG Sprint 5 `### Added` line with the PR number once the PR exists.
- [ ] **Step 4:** Design inventory: the delete and its confirm on the edit framework rows, and in "Built with no frame".
- [ ] **Step 5:** `./run docs`. Expected: pass. Commit `docs: ADR #59, the counts and the inventory (CAP-50)`.

### Task 7: Verify, review, ship

- [ ] `./run test`, `./run e2e`, `./run verify`, `./run contract-drift`, `./run one-rule`, `./run docs`, and `./run check`, outputs quoted.
- [ ] A reviewer agent on the whole branch; take the feedback with superpowers:receiving-code-review.
- [ ] PR into `dev`, Patrick Anley requested, CI green, merge, Jira transitions on evidence only.
