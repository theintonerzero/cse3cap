# CAP-43: Counter-score policy, 404 for classmates and never on your own — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A classmate who tries to counter-score gets 404 rather than 403. Nobody can
counter-score their own reflection, whatever roles they hold. A person holding two roles on one
gig resolves to the same role every time, and the lists agree with the policy.

**Architecture:** `ReflectionPolicy::counterScore` takes the shape `update` already has: 404
unless `view` allows, then a refusal for the owner. `RoleResolver::for` orders a person's roles
on a gig by a fixed precedence with student first, so the least-privileged role wins. The
list scope `Reflection::reviewerExists` stops counting a reviewer row when the same person is
a student on that gig, so the list says what the policy says. ADR #47 records that one role per
person per gig is the model.

**Tech Stack:** Laravel 13 policies, Eloquent, PHPUnit feature tests against your own test
database (`mysql_test`, `DB_TEST_DATABASE`), bash for `scripts/pentest.sh`.

**Spec:** COA4-113 (CAP-43 · Counter-score policy: 404 for classmates, and never on your own
reflection). Acceptance criteria, verbatim:
1. `counterScore` denies as not found unless `view` allows, the same shape as `update`. `ScoringTest` gains a classmate case expecting 404, red before the change.
2. `counterScore` refuses the reflection's owner whatever role they resolve to. A test seeds a user as both student and assessor on one gig and expects their own counter-score refused, red before the change.
3. `RoleResolver::for`'s behaviour with two roles is either made deterministic or written down in `docs/adr/` as a decision. Not left to row order.
4. docs/Security-Review.md marks N1 and N4 fixed, and `scripts/pentest.sh` gains the classmate probe.
5. Authorisation stays in `api/app/Policies/`. Load `/add-policy` first.

**Decision taken with Tony, 2026-10-03:** student wins, plus an ADR. No schema change.

Background: docs/Security-Review.md, 2026-10-03 re-verification entry (PR #95), where these
are F12 (N1) and F13 (N4).

## Global Constraints

- Authorisation lives in `api/app/Policies/`. `RoleResolver` decides a role and
  `Reflection`'s scopes filter lists (ADR #40). Nothing new in a controller or a FormRequest.
- 404 when the caller must not learn the reflection exists, 403 when they can see it but may
  not do this (`/add-policy`).
- No schema change and no migration. `gig_participants` keeps `UNIQUE (gig_id, user_id, role)`.
- Never seed a reflection from `DemoSeeder` (CLAUDE.md). Tests build what they assert on.
- **The test database is per developer, not per session.** cse3cap-7a runs on this machine
  with the same `api/.env`. Before running the suite, check with `ListAgents` that it is not
  running tests, and never run two suites at once.
- ADR voice: no em dashes, no semicolons joining clauses, honest negatives (`/write-adr`).

## Review Focus

1. **A dual-role user and the lists.** If the scope still counts a reviewer row, `GET
   /reflections` lists classmates' work the policy then 404s. Expect the list and the policy to
   agree. Pinned in Task 2.
2. **A dual-role user starting their own reflection.** `GigPolicy::createReflection` needs
   `student`. With alphabetical index order, `for()` returns `assessor` today and the student
   cannot start one. Expect 201. Pinned in Task 2.
3. **The owner on their own reflection, single role.** Jane counter-scoring her own entry must
   stay 403 `ROLE_FORBIDDEN`, because she can see it. The existing
   `test_a_student_cannot_counter_score_even_their_own` pins it, and Task 1 must not turn it
   into 404.
4. **A reviewer's ordinary counter-score.** Sam and Dr Lee must still get 201. The existing
   ScoringTest cases pin it, and every task runs the whole class.
5. **`my_role` for a dual-role user** in `GET /gigs/{id}` and `/auth/me` participations, which
   drive the nav. Expect `student`, matching the policy. Pinned in Task 2.

---

## Task 0: Workspace

- [ ] **Step 1:** In this worktree, copy `api/.env` from the main checkout (gitignored, never
  committed) and run `cd api && composer install -q`. Confirm `DB_TEST_DATABASE` is set without
  printing its value: `grep -c '^DB_TEST_DATABASE=.\+' api/.env` → `1`.
- [ ] **Step 2:** Baseline: `cd api && php artisan test --filter ScoringTest` → all pass. Record
  the count in the ledger.

## Task 1: counterScore is 404 unless view allows, and never the owner

**Files:**
- Modify: `api/app/Policies/ReflectionPolicy.php` (`counterScore`)
- Test: `api/tests/Feature/ScoringTest.php`

**Interfaces:**
- Consumes: `ReflectionPolicy::view(User, Reflection): Response`, unchanged.
- Produces: `counterScore` returning `denyAsNotFound()` when `view` is not allowed, `deny()`
  (403) for the owner, `allow()` otherwise.

- [ ] **Step 1: Write the failing tests.** In `ScoringTest`, after
  `test_a_stranger_gets_404_rather_than_403`, add `use App\Models\GigParticipant;` if missing
  (it is already imported) and:

```php
    public function test_a_classmate_gets_404_rather_than_403(): void
    {
        $entry = $this->entries()->first();
        $classmate = User::create(['display_name' => 'Classmate']);
        GigParticipant::create([
            'gig_id' => $this->reflection->gig_id, 'user_id' => $classmate->id, 'role' => 'student',
        ]);
        Sanctum::actingAs($classmate);

        $this->postJson("/api/v1/entries/{$entry->id}/scores", ['level_id' => $this->levelOf($entry, 4), 'comment' => 'x'])
            ->assertStatus(404)->assertJsonPath('error.code', 'NOT_FOUND');
    }

    public function test_nobody_counter_scores_their_own_reflection_whatever_their_roles(): void
    {
        $jane = $this->user('Jane N');
        GigParticipant::create([
            'gig_id' => $this->reflection->gig_id, 'user_id' => $jane->id, 'role' => 'assessor',
        ]);
        $entry = $this->entries()->first();
        Sanctum::actingAs($jane);

        $this->postJson("/api/v1/entries/{$entry->id}/scores", ['level_id' => $this->levelOf($entry, 4), 'comment' => 'x'])
            ->assertStatus(403)->assertJsonPath('error.code', 'ROLE_FORBIDDEN');

        $this->assertSame(0, $entry->scores()->where('score_type', 'counter')->count());
    }

    public function test_an_assessor_row_on_your_own_gig_still_cannot_score_your_own_work(): void
    {
        $jane = $this->user('Jane N');
        GigParticipant::where('gig_id', $this->reflection->gig_id)->where('user_id', $jane->id)
            ->update(['role' => 'assessor']);
        $entry = $this->entries()->first();
        Sanctum::actingAs($jane);

        $this->postJson("/api/v1/entries/{$entry->id}/scores", ['level_id' => $this->levelOf($entry, 4), 'comment' => 'x'])
            ->assertStatus(403)->assertJsonPath('error.code', 'ROLE_FORBIDDEN');
    }
```

  The third test is the one that proves the owner check on its own. After Task 2 the dual-role
  test is also held by the precedence, so it could pass with the owner check removed. With
  only an assessor row, nothing but the owner check refuses her. (Suggested by session
  cse3cap-e8.)

  Before writing the second test, read `ReflectionEntry` for the scores relation's real name and
  the counter-score discriminator column (check `db/01-schema.sql`, `scores`). Use what is
  there; do not invent a column.

- [ ] **Step 2: Watch them fail.**
  Run: `cd api && php artisan test --filter 'test_a_classmate_gets_404_rather_than_403|test_nobody_counter_scores_their_own'`
  Run the same filter with `|test_an_assessor_row_on_your_own_gig` added.
  Expected: the classmate test FAILS with 403 where 404 was expected. The own-reflection test
  FAILS with 201, because `for()` returns `assessor` (index order puts it before `student`).
  The assessor-row test FAILS with 201.
  If the second one passes instead, the row order differs from what the plan assumed: ledger
  it, and the test still pins the behaviour after the fix.

- [ ] **Step 3: Make counterScore take update's shape.** Replace the body of `counterScore` and
  its docblock's first sentence:

```php
    /**
     * Counter-scoring: an assessor, supervisor or employer on the gig,
     * never the reflection's owner, whatever other role they hold there.
     * Whether the reflection is in the right state to actually accept a
     * score is Scoring::counterScore's job (NOT_SUBMITTED, 409), not this
     * policy's -- a 403 here would say "you may never do this" when the
     * truth is "not yet."
     *
     * Not-found unless the caller may view it, the same shape as update:
     * a classmate must get the answer a made-up id gets. Everyone else who
     * may view a reflection that is not theirs is a reviewer, which is
     * why view and counter-scoring share RoleResolver::REVIEWER_ROLES.
     */
    public function counterScore(User $user, Reflection $reflection): Response
    {
        if (! $this->view($user, $reflection)->allowed()) {
            return Response::denyAsNotFound();
        }

        if ($reflection->user_id === $user->id) {
            return Response::deny('Nobody can counter-score their own reflection.');
        }

        // Implied by view today, kept so a later change to view cannot
        // quietly widen who scores.
        return in_array($this->roles->for($user, $reflection->gig), RoleResolver::REVIEWER_ROLES, true)
            ? Response::allow()
            : Response::deny('Only an assessor, supervisor or employer can counter-score this reflection.');
    }
```

  Grep `api/` and `web/` for anything asserting on the counter-score refusal message, and
  update it if the owner's now reads differently.

- [ ] **Step 4: Watch them pass, and the class stay green.**
  Run: `cd api && php artisan test --filter ScoringTest`
  Expected: all pass, the baseline count plus two. Then `cd api && php artisan test --filter
  'ReflectionWritePathTest|ReflectionVisibilityTest|PermissionMatrix'` (whichever of those exist,
  `ls tests/Feature`) → all pass.

- [ ] **Step 5: Commit.**
  `git add api/app/Policies/ReflectionPolicy.php api/tests/Feature/ScoringTest.php`
  `git commit -m "fix(policy): counter-score is 404 for a classmate and never the owner's (CAP-43)"`

## Task 2: One role per person per gig, student first, and the lists agree

**Files:**
- Modify: `api/app/Services/RoleResolver.php` (`for`, a new `PRECEDENCE` constant)
- Modify: `api/app/Models/Reflection.php` (`reviewerExists`)
- Test: create `api/tests/Feature/DualRoleTest.php`

**Interfaces:**
- Produces: `RoleResolver::PRECEDENCE = ['student', 'assessor', 'employer', 'supervisor']`,
  least privilege first. `for()` returns the first of the person's roles in that order.
- Produces: `reviewerExists` matches only when the person holds a reviewer role **and** no
  student role on that gig.

- [ ] **Step 1: Write the failing tests.** `DualRoleTest` seeds `DemoSeeder`, makes a
  classmate's submitted reflection on "Develop AI use cases" the way `ScoringTest::
  submittedReflection` does (copy that helper, acting as a new student `Classmate` added to the
  gig), then gives a new user `Dual` both a `student` and an `assessor` row on the same gig.
  Insert the two rows in each order across two tests, so the result cannot be row order.

```php
    public function test_a_dual_role_user_resolves_to_student_whichever_row_came_first(): void
    {
        foreach ([['assessor', 'student'], ['student', 'assessor']] as $i => $order) {
            $user = User::create(['display_name' => "Dual {$i}"]);
            foreach ($order as $role) {
                GigParticipant::create(['gig_id' => $this->gig->id, 'user_id' => $user->id, 'role' => $role]);
            }
            $this->assertSame('student', (new RoleResolver)->for($user, $this->gig), implode(' then ', $order));
        }
    }

    public function test_a_dual_role_user_cannot_see_a_classmates_reflection(): void
    {
        Sanctum::actingAs($this->dual);
        $this->getJson("/api/v1/reflections/{$this->classmates->id}")->assertStatus(404);
        $ids = collect($this->getJson('/api/v1/reflections')->assertOk()->json('data') ?? $this->getJson('/api/v1/reflections')->json())->pluck('id');
        $this->assertNotContains($this->classmates->id, $ids);
    }

    public function test_a_dual_role_user_has_nothing_to_review_on_that_gig(): void
    {
        Sanctum::actingAs($this->dual);
        $this->getJson('/api/v1/review-queue')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_a_dual_role_user_can_start_their_own_reflection(): void
    {
        Sanctum::actingAs($this->dual);
        $this->postJson('/api/v1/reflections', [
            'sprint_id' => $this->gig->sprints()->orderBy('ordinal')->firstOrFail()->id,
        ])->assertStatus(201);
    }

    public function test_my_role_is_student_for_a_dual_role_user(): void
    {
        Sanctum::actingAs($this->dual);
        $this->getJson("/api/v1/gigs/{$this->gig->id}")->assertOk()->assertJsonPath('my_role', 'student');
    }
```

  Read `docs/openapi.yaml` for the real response shapes of `GET /reflections` and `GET
  /review-queue` (a bare array or under `data`) and assert on that exact shape. Replace the
  defensive `?? ...` above with the one the contract says. `/review-queue` may need a gig
  filter; check the contract.

- [ ] **Step 2: Watch them fail.**
  Run: `cd api && php artisan test --filter DualRoleTest`
  Expected: resolution FAILS on the `student then assessor` order or both (got `assessor`).
  The list test FAILS (the classmate's id is listed). The queue test FAILS (one item). Start
  FAILS with 403. `my_role` FAILS (`assessor`). The `GET /reflections/{id}` half of the list
  test may already pass or fail depending on order; either is fine as long as the list half
  fails.

- [ ] **Step 3: Precedence in RoleResolver.**

```php
    /**
     * When one person holds several roles on a gig, the least-privileged
     * wins (ADR #47). One role per person per gig is the model, and the
     * schema allows more only because Alumable supplies participants. The
     * order makes the answer the same every time instead of whichever row
     * the index returns first.
     *
     * @var list<string>
     */
    public const PRECEDENCE = ['student', 'assessor', 'employer', 'supervisor'];

    public function for(User $user, Gig $gig): ?string
    {
        $key = $user->id.':'.$gig->id;

        return $this->memo[$key] ??= $gig->participants()
            ->where('user_id', $user->id)
            ->orderByRaw(
                'CASE role '.implode(' ', array_map(
                    fn (int $rank) => "WHEN ? THEN {$rank}",
                    array_keys(self::PRECEDENCE),
                )).' END',
                self::PRECEDENCE,
            )
            ->value('role');
    }
```

  A portable `CASE` rather than MySQL's `FIELD()`, so nothing here ties the resolver to one
  engine. The order among the reviewer roles is least privilege: an assessor scores, an
  employer also assigns rubrics, and a supervisor also builds them.

- [ ] **Step 4: The list scope agrees.** In `Reflection::reviewerExists`, after the `whereIn`:

```php
            // A student on the gig is a student there, whatever else they
            // hold (ADR #47). Without this a dual-role user would list
            // classmates' reflections the policy then answers 404 for.
            ->whereNotExists(fn (QueryBuilder $student) => $student
                ->selectRaw('1')
                ->from('gig_participants as as_student')
                ->whereColumn('as_student.gig_id', 'gig_participants.gig_id')
                ->whereColumn('as_student.user_id', 'gig_participants.user_id')
                ->where('as_student.role', 'student'));
```

  Read `scopeReviewableBy` (the review queue's scope) and confirm it goes through
  `reviewerExists`. If it builds its own join, apply the same condition there, not a copy of
  the whole rule: extract it if needed so it lives once.

- [ ] **Step 5: Watch them pass, and everything else.**
  Run: `cd api && php artisan test --filter DualRoleTest` → 5 pass.
  Then the whole suite, after the `ListAgents` check: `./run test` → all pass.
  Then `./run one-rule` → passes (no rule implemented twice).

- [ ] **Step 6: Commit.**
  `git add api/app/Services/RoleResolver.php api/app/Models/Reflection.php api/tests/Feature/DualRoleTest.php`
  `git commit -m "fix(roles): one role per person per gig, student first, and the lists agree (CAP-43)"`

## Task 3: ADR #47

**Files:** Modify `docs/adr/architecture-decision-records.md` (index line, and the record at
the end after a `===` separator line, matching #46).

- [ ] **Step 1:** Index line after #46: `#47 One role per person per gig, student first .. Proposed`
  (dot leaders to the same width as its neighbours).
- [ ] **Step 2:** The record. Title `ADR #47: One role per person per gig, and the student role
  wins`. Status Proposed, Date 2026-10-03. Context: the schema's `UNIQUE (gig_id, user_id,
  role)` allows two roles; `for()` returned whichever the index gave (alphabetical, so
  `assessor` over `student`); five callers depend on the single answer; F13 in
  docs/Security-Review.md; no such row on the shared db on 2026-10-03; participants come from
  Alumable. Decision: precedence student, assessor, employer, supervisor; the list scope
  matches; counterScore refuses the owner regardless. Negatives, honestly: a dual-role person
  loses their reviewer powers on that gig entirely, silently, with no error saying why; the
  precedence among reviewer roles is a judgement nobody asked the client about; it treats a
  data shape as supported that the product never designed for.
  Alternatives, fairly: reviewer wins (keeps the reviewer's work, loses the student's own
  reflection on that gig); a schema unique on `(gig_id, user_id)` (strongest, but a migration on
  the shared db and a constraint Alumable's data may not meet); `for()` returning every role
  (the honest model, but every caller changes and the matrix has no rows for combinations).
- [ ] **Step 3:** `./run docs` → passes (it checks the ADR index).
- [ ] **Step 4: Commit.** `git commit -m "docs(adr): #47, one role per person per gig, student first (CAP-43)"`

## Task 4: The classmate probe, and the review entry

**Files:** Modify `scripts/pentest.sh`. Modify `docs/Security-Review.md` only if PR #95 has
merged, otherwise on #95's branch (see Step 3).

- [ ] **Step 1:** After the line `expect "Jane counter-scores her own entry" …`, add:

```bash
expect "Jane counter-scores a classmate's entry"         "$JANE" POST "/entries/$NOT_JANES_ENTRY/scores" 404 NOT_FOUND "{\"level_id\":\"$JANE_LEVEL\",\"comment\":\"pentest\"}"
```

  `NOT_JANES_ENTRY` is already an entry on Sam's gig that is not Jane's, and Jane is a student
  there, so she is the classmate. Refusal only: if it ever answers 201 it has written a counter
  score into the shared db, so read the `judge` block and confirm a hole is reported loudly.
- [ ] **Step 2:** `bash -n scripts/pentest.sh`. Then, after the `ListAgents` check and with a
  server running from this branch (`php artisan serve` from this worktree's `api/`), `./run
  pentest` → 37 probes, 37 hold. If no server can run from this branch, say so in the PR and
  do not claim the probe passed.
- [ ] **Step 3:** In `docs/Security-Review.md`'s 2026-10-03 re-verification entry, add under F12
  and F13 a `> **Fixed in CAP-43 (#<PR>).**` line each, naming the test that holds it. If #95 has
  not merged when this PR opens, put the two lines on #95's branch and say so in both PRs, as
  CAP-44 did.
- [ ] **Step 4: Commit** `scripts/pentest.sh` (and the review note if it is on this branch):
  `git commit -m "test(security): pentest probes a classmate's counter-score (CAP-43)"`

## Task 5: Hand over

- [ ] Final whole-branch review by a fresh reviewer (executing-plans).
- [ ] PR into `dev`, reviewers RickLTCS and theintonerzero, the body quoting each red and green
  run and naming which criterion each proves. It says ADR #47 is Proposed and needs the team.
- [ ] Jira COA4-113: assign Tony, To Do → In Progress once the branch has a commit, In Review
  once CI is green. Transition with no comment, then `jira_add_comment`, then re-read. Plain
  text, and every identifier with an underscore in backticks. CAP-31 (COA4-89) can then be
  re-checked for Done: its criterion 2 is what this fixes.
