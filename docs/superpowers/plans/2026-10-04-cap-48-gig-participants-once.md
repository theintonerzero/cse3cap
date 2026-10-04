# CAP-48 Gig participants once Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /gigs/{id}` lists each participant once, with the role `RoleResolver::for` resolves (ADR #47).

**Architecture:** `GigResource` stops mapping raw `gig_participants` rows. It takes one row per `user_id` and asks `RoleResolver` for that person's role on the gig, the same way `MeResource` does since CAP-43. The precedence rule stays in `RoleResolver` alone.

**Tech Stack:** Laravel 13, PHPUnit feature tests, MySQL test DB (shared per developer).

**Spec:** Jira COA4-118 (CAP-48) acceptance criteria; ADR #47.

## Global Constraints

- Roles resolve server-side in `api/app/Services/RoleResolver.php` and nowhere else. The precedence order is not reimplemented.
- Response shape unchanged: `participants[]` of `{id, display_name, role}` (`docs/openapi.yaml`, `GigDetail`).
- The test DB is shared per developer. Check that no peer session is using it before a run.

## Review Focus

- A gig with ordinary single-role participants still lists every one of them, with the role they hold.
- The order of participants stays stable (first row per user, in the order loaded).
- One small memoised query per participant is acceptable at about five per gig. Nothing else adds queries.

---

### Task 1: One row per participant

**Files:**
- Modify: `api/app/Http/Resources/GigResource.php` (participants block)
- Test: `api/tests/Feature/DualRoleTest.php`

- [ ] **Step 1: Write the failing test**

```php
public function test_the_gig_page_lists_a_dual_role_participant_once_as_student(): void
{
    Sanctum::actingAs($this->dual);

    $rows = collect($this->getJson("/api/v1/gigs/{$this->gig->id}")->assertOk()->json('participants'))
        ->where('id', $this->dual->id)->values();

    $this->assertCount(1, $rows);
    $this->assertSame('student', $rows[0]['role']);
}
```

- [ ] **Step 2: Run it, expect FAIL** (2 rows, not 1)

Run: `./run test --filter test_the_gig_page_lists_a_dual_role_participant_once_as_student`

- [ ] **Step 3: Implement**

```php
$roles = app(RoleResolver::class);
$data['participants'] = $this->participants->unique('user_id')->map(fn ($p) => [
    'id' => $p->user_id,
    'display_name' => $p->user->display_name,
    'role' => $roles->for($p->user, $this->resource),
])->values();
```

- [ ] **Step 4: Run it, expect PASS.** Then run the full suite, `./run one-rule` and pint.

- [ ] **Step 5: Commit**
