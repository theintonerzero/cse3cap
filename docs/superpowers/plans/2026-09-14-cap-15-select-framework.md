# CAP-15 Select framework screen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED SKILL:** Load `/add-screen` before the first file. It carries the four-states rule, the typed-client rule and the token rule this plan assumes.

**Goal:** A supervisor can see which rubrics exist, tell a seeded base template from their own copy, and assign one to a gig — with the refusal surfaced when the gig already has one.

**Architecture:** One screen component mounted on the router at `/frameworks`, one presentation-free module for the grouping rule, one shell check in `scripts/`. All data comes through the existing typed client; no new endpoints, no contract change.

**Tech Stack:** React 19, TypeScript 6, React Router 8, CSS modules over `tokens.css`. No new dependencies.

**Ticket:** COA4-73 (`project = COA4 AND summary ~ "CAP-15"`). Acceptance criteria are on the ticket and reproduced per task.

## Picking this up

**Nobody is assigned.** COA4-73 is unassigned deliberately — this plan was written to hand
over, not to reserve the work. If you take it, assign the ticket to yourself first and move
it to In Progress, so two people do not start the same screen.

```bash
git worktree add ../cse3cap-worktrees/CAP-15 \
    -b feat/CAP-15-select-framework origin/dev
cd ../cse3cap-worktrees/CAP-15

./run api      # one terminal, the backend on :8000
./run web      # another, Vite on :5173
```

**Load `/add-screen` before the first file.** It carries the four-states rule, the
typed-client rule and the token rule this plan assumes rather than restates.

Develop with **Dr Lee's token**: he is the supervisor on both seeded gigs, so he is the only
seeded user who exercises this screen properly. The three tokens are pinned in the team
channel; `web/.env` takes one as `VITE_API_TOKEN`, and that file is gitignored.

Work the tasks in order. Each ends at a commit and is worth a reviewer stopping at. Open the
pull request into `dev` once Task 4 passes, and run `./run check` before you do — it must be
green.

When it is merged, move COA4-73 to **In Review**, not Done, and say in the comment which
acceptance criteria you checked and how. `/jira-tickets` has the rule: merged is not done,
and CAP-19 is the worked example of why.

You did not write this plan, so treat it as a proposal rather than an instruction. If a task
is wrong, say so and change it — the person who writes a plan is not always the person who
finds out it was wrong.

---

## Global Constraints

- **Every API call goes through `web/src/api/client.ts`.** A component that calls `fetch`, parses a response body, or declares its own response interface is a bug.
- **Response types come from `web/src/api/schema.ts`**, which is generated. Never hand-write one; never edit that file.
- **No raw hex and no `px`.** Every colour, space and radius from `web/src/tokens.css`. `scripts/check-tokens.sh` reads `.tsx` as well as CSS, so `width="200px"` fails too.
- **snake_case** in types and props, matching the API. There is no mapping layer.
- **Four states on the screen: loaded, loading, empty, error.** Loading uses skeletons, not a spinner.
- **Client-side role checks are UX only.** `GET /frameworks` returns 200 to a student — verified. Hiding a button is a convenience; the 403 and the 409 are the rules.
- **`web/` has no test runner.** The check for this screen is a script in `scripts/`, wired into `./run`.
- Run `./run check` before the final commit. It must pass.

---

## What exists already, verified against the running API

Do not re-derive these. They were checked on 2026-09-14 against `dev` and the shared database.

**`GET /frameworks`** returns a flat array. Real response:

```json
[
  { "id": "d7018d17-…", "fw_key": "latrobe6", "version": "v1",
    "name": "La Trobe six-competency", "is_active": true,
    "created_by": null, "in_use": true },
  { "id": "01a01423-…", "fw_key": "smoke-test-copy-1787044272", "version": "v1",
    "name": "Renamed by smoke test", "is_active": true,
    "created_by": "01a01406-c03a-719a-b24d-eba956565fa2", "in_use": false }
]
```

- **`created_by === null` means a seeded base template.** A non-null value means somebody's copy. That is the whole "templates and saved copies listed separately" requirement — no extra field, no extra call.
- **`in_use === true` means permanently read-only.** Hide Edit. A framework referenced by any reflection can never be edited, because mutating it would change what past students were scored against.
- The shared database currently holds several `smoke-test-copy-*` frameworks. `scripts/smoke.sh` creates one per run. The screen must look sane with a dozen copies, not just two.

**`POST /framework-assignments`** takes `{ framework_id, gig_id }`, returns 201. When the gig already has a rubric it returns **409** with this exact body, verified:

```json
{ "error": { "code": "DUPLICATE_ASSIGNMENT",
  "message": "This gig already has a rubric, and a gig is scored against one. Copy the rubric you want and assign it to a new gig.",
  "details": { "framework_id": "d7018d17-…" } } }
```

Both seeded gigs already have a rubric, so **409 is the default path in the demo**, not an edge case. Surface `error.message` as written; it says the right thing and says it better than a generic string would.

**Which gigs to offer** comes from `useSession()` → `me.participations`, each `{ gig_id, gig_title, role }`. Dr Lee is a supervisor on both seeded gigs.

**The route already exists** at `web/src/app/routes.tsx:70`, rendering a `Placeholder`. Replace it.

---

## File structure

| File | Responsibility |
| --- | --- |
| `web/src/screens/framework-groups.ts` | Split a framework list into templates and copies. No React. |
| `web/src/screens/SelectFramework.tsx` | The screen: fetch, four states, assign action, error mapping. |
| `web/src/screens/SelectFramework.module.css` | Its styles, tokens only. |
| `web/src/app/routes.tsx` | Mount it in place of the placeholder. |
| `scripts/verify-select-framework.sh` | The check. |
| `run` | Wire the check in as `./run verify-frameworks`. |

The grouping rule lives outside the component for the same reason `diary-scope.ts` does in CAP-7: it is the part with logic worth checking on its own, and it stays readable when the component grows.

---

### Task 1: The grouping rule

**Files:**
- Create: `web/src/screens/framework-groups.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Framework`, `group_frameworks(list: Framework[]): { templates: Framework[]; copies: Framework[] }`.

- [ ] **Step 1: Write the module**

```ts
/**
 * Splitting the rubric list into the two groups the screen shows.
 *
 * `created_by` is the whole rule: null means a seeded base template that
 * shipped with the schema, anything else means somebody copied it. There is
 * no "is_template" field and there does not need to be one.
 *
 * Outside the component because it is the only part with a decision in it,
 * and because `scripts/verify-select-framework.sh` can read it without a
 * browser. Same reason `diary-scope.ts` sits beside DiaryHome.
 */
import type { paths } from '../api/schema.ts';

export type Framework =
  paths['/frameworks']['get']['responses']['200']['content']['application/json'][number];

export interface FrameworkGroups {
  templates: Framework[];
  copies: Framework[];
}

/**
 * Sorted by name inside each group. The shared database accumulates a
 * `smoke-test-copy-*` framework on every run of scripts/smoke.sh, so the
 * copies list is longer and less ordered than a seeded demo suggests.
 */
export function group_frameworks(list: Framework[]): FrameworkGroups {
  const by_name = (a: Framework, b: Framework) => a.name.localeCompare(b.name);

  return {
    templates: list.filter((f) => f.created_by === null).sort(by_name),
    copies: list.filter((f) => f.created_by !== null).sort(by_name),
  };
}

/** A framework a reflection already references can never be edited. */
export function is_editable(framework: Framework): boolean {
  return !framework.in_use;
}
```

- [ ] **Step 2: Prove it compiles against the generated type**

Run: `cd web && npx tsc -b --force`
Expected: clean. If `Framework` does not resolve, `schema.ts` is stale — run `npm run gen:types` and check `git diff` is empty.

- [ ] **Step 3: Commit**

```bash
git add web/src/screens/framework-groups.ts
git commit -m "feat(web): the rule that splits templates from copies (CAP-15)"
```

---

### Task 2: The screen, loaded and loading and error

**Files:**
- Create: `web/src/screens/SelectFramework.tsx`, `web/src/screens/SelectFramework.module.css`
- Modify: `web/src/app/routes.tsx:69-72`

**Interfaces:**
- Consumes: `group_frameworks`, `is_editable`, `Framework` from Task 1.
- Produces: `export function SelectFramework()` — takes no props, like every other screen here.

- [ ] **Step 1: Write the screen**

Follow the state machine `web/src/screens/ReviewQueue.tsx:20-50` uses. Do not invent a different one.

```tsx
/**
 * CAP-15. Which rubrics exist, which are yours, and putting one on a gig.
 *
 * Editing is copy-then-edit and there is no replace flow, deliberately: a
 * gig takes one rubric (ADR #33, ADR #35) and the answer to "I picked the
 * wrong one" is a new gig. The 409 is surfaced rather than designed around.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';

import { api, ApiError } from '../api/client.ts';
import { Button, Card, ErrorNotice, Skeleton, SkeletonGroup } from '../components/index.ts';
import { useSession } from '../session/useSession.ts';
import { group_frameworks, is_editable, type Framework } from './framework-groups.ts';
import styles from './SelectFramework.module.css';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'loaded'; frameworks: Framework[] };

export function SelectFramework() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    api
      .get('/frameworks', { signal: controller.signal })
      .then((frameworks) => setState({ status: 'loaded', frameworks }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          status: 'error',
          error:
            error instanceof ApiError
              ? error
              : new ApiError(0, null, 'Something went wrong loading the rubrics.'),
        });
      });

    return () => controller.abort();
  }, [reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  if (state.status === 'loading') {
    return (
      <SkeletonGroup label="Loading rubrics">
        <Skeleton height="3rem" />
        <Skeleton height="3rem" />
        <Skeleton height="3rem" />
      </SkeletonGroup>
    );
  }

  if (state.status === 'error') {
    return <ErrorNotice error={state.error} on_retry={retry} />;
  }

  const { templates, copies } = group_frameworks(state.frameworks);

  if (templates.length === 0 && copies.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No rubrics yet.</p>
        <p className={styles.hint}>
          A rubric arrives with the schema. If none are listed, the database has not been
          seeded.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Section title="Templates" hint="Shipped with the product. Copy one to edit it.">
        {templates.map((f) => (
          <FrameworkRow key={f.id} framework={f} on_assigned={retry} />
        ))}
      </Section>

      <Section title="Saved copies" hint="Copies made by a supervisor.">
        {copies.length === 0 ? (
          <p className={styles.hint}>Nothing copied yet.</p>
        ) : (
          copies.map((f) => <FrameworkRow key={f.id} framework={f} on_assigned={retry} />)
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{title}</h2>
      <p className={styles.hint}>{hint}</p>
      <div className={styles.rows}>{children}</div>
    </section>
  );
}
```

`FrameworkRow` and the assign action are Task 3. Until then, render the row with the name and the badge only, so this task is independently reviewable:

```tsx
function FrameworkRow({
  framework,
  on_assigned,
}: {
  framework: Framework;
  on_assigned: () => void;
}) {
  void on_assigned; // wired up in Task 3
  return (
    <Card>
      <div className={styles.row}>
        <div>
          <p className={styles.name}>{framework.name}</p>
          <p className={styles.meta}>
            {framework.fw_key} · {framework.version}
          </p>
        </div>
        <div className={styles.actions}>
          {framework.in_use && <span className={styles.in_use}>In use</span>}
          {is_editable(framework) && (
            <Link to={`/frameworks/${framework.id}/edit`}>
              <Button variant="secondary" full_width={false}>
                Edit
              </Button>
            </Link>
          )}
        </div>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Write the stylesheet, tokens only**

```css
.page { display: flex; flex-direction: column; gap: var(--space-24); }
.section { display: flex; flex-direction: column; gap: var(--space-8); }
.heading { font-size: var(--font-size-lg); color: var(--color-text); margin: 0; }
.hint { font-size: var(--font-size-sm); color: var(--color-text-muted); margin: 0; }
.rows { display: flex; flex-direction: column; gap: var(--space-8); }
.row { display: flex; justify-content: space-between; align-items: center; gap: var(--space-16); }
.name { margin: 0; color: var(--color-text); }
.meta { margin: 0; font-size: var(--font-size-sm); color: var(--color-text-muted); }
.actions { display: flex; align-items: center; gap: var(--space-8); }
.empty { padding: var(--space-24); text-align: center; }
.in_use {
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  border: var(--border-width-sm) solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-4) var(--space-8);
}
```

**Not `Badge`, deliberately.** `Badge` takes a `BadgeStatus`, which is the
contract's `ReflectionStatus` — `draft | submitted | assessed` — generated from
`schema.ts`, and it renders its own label from a lookup rather than taking
children. "In use" is a property of a framework, not a reflection status, so
`<Badge status="assessed">In use</Badge>` would neither compile nor mean the
right thing. `Chip` is wrong too: it renders a `<button>`, and this marker is
not clickable. A plain span is the honest element.

If a variable above does not exist, read `web/src/tokens.css` and use the nearest one that does. **Do not add a raw value.** `scripts/check-tokens.sh` will fail the build and it reads `.tsx` too.

- [ ] **Step 3: Mount it**

In `web/src/app/routes.tsx`, add the import beside the others and replace the placeholder:

```tsx
import { SelectFramework } from '../screens/SelectFramework.tsx';
```

```tsx
<Route path="frameworks" element={<SelectFramework />} />
```

- [ ] **Step 4: Look at it**

```bash
./run api          # in one terminal
./run web          # in another
```

Open `http://localhost:5173/frameworks`, sign in with **Dr Lee's** token — he is the supervisor on both seeded gigs. Expect the two seeded templates under Templates and the `smoke-test-copy-*` frameworks under Saved copies, with La Trobe showing "In use" and no Edit button.

- [ ] **Step 5: Checks**

```bash
cd web && npm run lint && npx prettier --check . && npm run build
cd .. && bash scripts/check-tokens.sh
```
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/screens/SelectFramework.tsx web/src/screens/SelectFramework.module.css web/src/app/routes.tsx
git commit -m "feat(web): the select framework screen, mounted (CAP-15)"
```

---

### Task 3: Assigning a rubric, and the refusal

**Files:**
- Modify: `web/src/screens/SelectFramework.tsx` (the `FrameworkRow` from Task 2)
- Modify: `web/src/screens/SelectFramework.module.css`

**Interfaces:**
- Consumes: `useSession()` → `me.participations`, each `{ gig_id, gig_title, role }`.
- Produces: nothing new exported.

- [ ] **Step 1: Replace `FrameworkRow` with the assigning version**

```tsx
type AssignState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'refused'; message: string }
  | { status: 'assigned'; gig_title: string };

function FrameworkRow({
  framework,
  on_assigned,
}: {
  framework: Framework;
  on_assigned: () => void;
}) {
  const { me } = useSession();
  const [assign, setAssign] = useState<AssignState>({ status: 'idle' });

  // Role is per gig and comes from the server. This filter is a convenience
  // so the picker is not full of gigs the assign would 403 on; the 403 is
  // still the rule. CLAUDE.md: never trust a role on the client.
  const assignable = (me?.participations ?? []).filter(
    (p) => p.role === 'supervisor' || p.role === 'employer',
  );

  async function assign_to(gig_id: string, gig_title: string) {
    setAssign({ status: 'saving' });
    try {
      await api.post('/framework-assignments', {
        body: { framework_id: framework.id, gig_id },
      });
      setAssign({ status: 'assigned', gig_title });
      on_assigned();
    } catch (error: unknown) {
      if (!(error instanceof ApiError)) throw error;
      // DUPLICATE_ASSIGNMENT is the common path on the seeded data: both
      // gigs already carry a rubric. The API's message explains the rule
      // better than anything worth writing here, so it is shown as sent.
      setAssign({ status: 'refused', message: error.message });
    }
  }

  return (
    <Card>
      <div className={styles.row}>
        <div>
          <p className={styles.name}>{framework.name}</p>
          <p className={styles.meta}>
            {framework.fw_key} · {framework.version}
          </p>
        </div>
        <div className={styles.actions}>
          {framework.in_use && <span className={styles.in_use}>In use</span>}
          {is_editable(framework) && (
            <Link to={`/frameworks/${framework.id}/edit`}>
              <Button variant="secondary" full_width={false}>
                Edit
              </Button>
            </Link>
          )}
          {assignable.map((p) => (
            <Button
              key={p.gig_id}
              full_width={false}
              disabled={assign.status === 'saving'}
              on_click={() => void assign_to(p.gig_id, p.gig_title)}
            >
              {assign.status === 'saving' ? 'Assigning…' : `Assign to ${p.gig_title}`}
            </Button>
          ))}
        </div>
      </div>

      {assign.status === 'refused' && <p className={styles.refused}>{assign.message}</p>}
      {assign.status === 'assigned' && (
        <p className={styles.assigned}>Assigned to {assign.gig_title}.</p>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Two more style rules**

```css
.refused { margin: var(--space-8) 0 0; font-size: var(--font-size-sm); color: var(--color-danger); }
.assigned { margin: var(--space-8) 0 0; font-size: var(--font-size-sm); color: var(--color-success); }
```

Check both variables exist in `tokens.css` first; substitute the nearest real one if not.

- [ ] **Step 3: Watch the 409 happen**

With both servers up and Dr Lee's token, press **Assign to Develop AI use cases** on any rubric. Both seeded gigs already have one, so expect the refusal, verbatim:

> This gig already has a rubric, and a gig is scored against one. Copy the rubric you want and assign it to a new gig.

If you see a generic error instead, the `ApiError` is not being unwrapped — check the call goes through `api.post` and not `fetch`.

- [ ] **Step 4: Checks and commit**

```bash
cd web && npm run lint && npx prettier --check . && npm run build
cd .. && bash scripts/check-tokens.sh
git add web/src/screens/SelectFramework.tsx web/src/screens/SelectFramework.module.css
git commit -m "feat(web): assign a rubric to a gig, and surface the refusal (CAP-15)"
```

---

### Task 4: The check

**Files:**
- Create: `scripts/verify-select-framework.sh`
- Modify: `run`

**Interfaces:**
- Consumes: the files from Tasks 1–3.
- Produces: `./run verify-frameworks`.

- [ ] **Step 1: Write the check**

Model it on `scripts/verify-diary-home.sh`, which is the closest existing one. Assert the things a compiler cannot:

```bash
#!/usr/bin/env bash
#
# Proves the select framework screen's invariants still hold.
#
#   ./run verify-frameworks
#
# web/ has no test runner (CLAUDE.md), so this is where a frontend check
# lives. verify-app-shell.sh covers the shell and verify-diary-home.sh the
# diary; this covers CAP-15 and they do not overlap.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

if [ -t 1 ]; then
    red=$'\033[1;31m'; grn=$'\033[1;32m'; blu=$'\033[1;34m'; off=$'\033[0m'
else red=''; grn=''; blu=''; off=''; fi

pass=0; fail=0
say() { printf '\n%s==>%s %s\n' "$blu" "$off" "$1"; }
ok()  { pass=$((pass+1)); printf '  %sok%s   %s\n' "$grn" "$off" "$1"; }
bad() { fail=$((fail+1)); printf '  %sFAIL%s %-52s %s\n' "$red" "$off" "$1" "${2:-}"; }

say "1. The screen is mounted"
grep -q '<Route path="frameworks" element={<SelectFramework />} />' web/src/app/routes.tsx \
    && ok "routes.tsx renders SelectFramework" \
    || bad "routes.tsx renders SelectFramework" "still a placeholder?"

say "2. It goes through the typed client"
grep -qE "fetch\(" web/src/screens/SelectFramework.tsx \
    && bad "no raw fetch" "call api.get/api.post instead" \
    || ok "no raw fetch"
grep -qE "^(interface|type) .*\{" web/src/screens/SelectFramework.tsx \
  && grep -qE "responses\['200'\]" web/src/screens/framework-groups.ts \
    && ok "response type comes from schema.ts" \
    || ok "response type comes from schema.ts"

say "3. All four states"
for s in "status === 'loading'" "status === 'error'" "templates.length === 0" "status === 'loaded'"; do
    grep -qF "$s" web/src/screens/SelectFramework.tsx \
        && ok "handles $s" || bad "handles $s"
done
grep -q "SkeletonGroup" web/src/screens/SelectFramework.tsx \
    && ok "loading uses skeletons, not a spinner" \
    || bad "loading uses skeletons, not a spinner"

say "4. The rules it must not break"
grep -q "created_by === null" web/src/screens/framework-groups.ts \
    && ok "templates and copies split on created_by" \
    || bad "templates and copies split on created_by"
grep -q "in_use" web/src/screens/framework-groups.ts \
    && ok "Edit is gated on in_use" || bad "Edit is gated on in_use"
grep -qiE "replace|swap.*rubric" web/src/screens/SelectFramework.tsx \
    && bad "no replace flow" "ADR #33: a gig takes one rubric, there is no endpoint" \
    || ok "no replace flow"

printf '\n%s%s passed%s' "$grn" "$pass" "$off"
[ "$fail" -gt 0 ] && printf ', %s%s FAILED%s' "$red" "$fail" "$off"
printf '\n'
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
```

- [ ] **Step 2: Prove it can fail**

Temporarily revert the route in `routes.tsx` to the `Placeholder`, run the check, confirm it reports FAIL, then put the route back. A check that has only ever passed proves nothing.

```bash
chmod +x scripts/verify-select-framework.sh
./scripts/verify-select-framework.sh    # expect a pass with the route mounted
```

- [ ] **Step 3: Wire it into `./run`**

Add beside the other verify commands:

```bash
    verify-frameworks) step ./scripts/verify-select-framework.sh ;;
```

and a help line next to `./run verify-diary`:

```
  ${GREEN}./run verify-frameworks${RESET}  the select framework screen
```

- [ ] **Step 4: Full check and commit**

```bash
./run check
git add scripts/verify-select-framework.sh run
git commit -m "test(web): verify the select framework screen's invariants (CAP-15)"
```

---

## Definition of done for this ticket

Against the acceptance criteria on COA4-73:

- Templates and saved copies listed separately — Task 1 and Task 2.
- Edit hidden when `in_use` — Task 1 (`is_editable`), Task 2 (the row).
- Assign posts to `POST /framework-assignments` — Task 3.
- The 409 surfaced, no replace flow — Task 3, and the check forbids a replace in Task 4.
- All four states — Task 2, asserted in Task 4.

Then move COA4-73 to In Review, not Done, and say in the comment which criteria you checked and how. `/jira-tickets` has the rule: merged is not done.

## One thing this plan does not decide

Whether a supervisor with **no** assignable gig should see the Assign buttons at all. The filter in Task 3 hides them, which means a student loading `/frameworks` — and the API does return 200 to a student, verified — sees a read-only list. That is reasonable, but it is a product choice nobody has made. Raise it rather than assume it; it is one line either way.

---

## What building it found — 2026-09-18

Built by Patrick. The plan was written to hand over and says to treat it as a proposal;
these are the places it turned out to be wrong, and the decisions taken where it was silent.

### Corrections to the plan itself

- ~~**The 409 message is one sentence, not two.**~~ **Withdrawn — the plan was right.**
  Retracted on 2026-09-18 after driving the real API. There are *three* messages, and I had
  found the wrong one:

  | Layer | When | Message |
  | --- | --- | --- |
  | `FrameworkAssigner` | the gig has a *different* rubric — the common path | "This gig already has a rubric, and a gig is scored against one. **Copy the rubric you want and assign it to a new gig.**" |
  | `FrameworkAssigner` | the *same* rubric assigned twice | "That framework is already assigned to this gig." |
  | `bootstrap/app.php:119` | MySQL 1062, i.e. two writers racing past the service check | "This gig already has a rubric, and a gig is scored against one." |

  I read the 1062 fallback and took it for the only message. The prism mock agreed with me
  because **the contract's example is the short one**, so the two wrong sources corroborated
  each other. The real API returns the plan's sentence, verified in the browser against
  Laravel on 2026-09-18.

  **Follow-up, not fixed here:** `docs/openapi.yaml`'s 409 example for
  `POST /framework-assignments` matches the race-condition fallback rather than the message
  a supervisor will actually see. It is not wrong, but it is the least likely of the three.
  The screen is unaffected either way — it renders `error.message` verbatim.
- **The type import form was wrong.** The plan indexes `paths['/frameworks']['get']…`;
  `components['schemas']['Framework']` exists and is what every other screen uses.
- **`retry` was passed as `on_assigned`.** That flips the whole screen back to `loading`
  after a successful assign and throws the confirmation away. There is no refetch at all
  now: an assignment changes no field of the `Framework` payload, because `in_use` means "a
  reflection references this", not "this is on a gig".
- **`retry` did not reset to `loading`**, leaving the error notice up during the refetch.
- **A button per gig per row does not survive the real data.** The plan's own note says the
  database holds a dozen `smoke-test-copy-*` frameworks; two gigs across twelve rows is
  twenty-four primary buttons. The picker expands instead, and one assignable gig skips it.
- **Two bugs in the plan's verify script.** Its response-type check is
  `grep && grep && ok || ok` — `ok` on both branches, so it cannot fail. And its typed-client
  check greps `api.get(`, which prettier breaks across lines as `api` then `.get(...)`; an
  assertion that depends on the formatter fails the next time someone runs prettier.

### The design says this screen should not assign

`§11.20` of the prose spec in the prototype (`~/projects/alumable-diary/docs/`) specs this
exact screen and **deliberately removes the frame's Assign button**, with a written reason: a
template is reusable across many subjects and gigs, so *which* one is in force is a fact
about the gig you are standing in, not about the template. Assignment belongs on the
Change-framework sheet at `§11.24`, and the library carries one line saying so. It is listed
as one of the nine places a frame implies behaviour it could not perform.

**Kept anyway, deliberately.** That reasoning does not transfer to this build:

- There is no Change-framework sheet here and there will not be one. ADR #33, extended by
  #35, makes a gig's rubric permanent and singular, enforced by a unique key.
- CAP-8's gig detail renders *"No rubric assigned to this gig yet."* and offers no way to fix
  it. **If this screen does not assign, nothing in the product assigns.**
- `useSession()` supplies exactly the context §11.20 says the library lacks.

Recorded here and in the header comment of `SelectFramework.tsx` so it is not rediscovered as
a bug. If the team disagrees, it is a one-line removal and an ADR.

### Two other places the spec and this build differ

- **Two lists, not three.** `§11.20` draws Available / Saved / **Drafts**. This build's
  `Framework` schema has no draft state, so a third list would be permanently empty.
- **"In use", not "Active".** The v3 divergence table prefers *"Active"*, derived from
  `framework_assignments`. That is a different fact from this API's `in_use` ("a reflection
  references this, so it is permanently read-only"), and it is not derivable from
  `GET /frameworks` at all. The screen does not invent it.

### The plan's open question, answered

*Should a supervisor with no assignable gig see the Assign buttons?* `AppShell.tsx:62` already
gates the nav item to a supervisor, so a student reaches `/frameworks` only by typing the URL
and the API returns 200 to them. The participation filter stays; with no assignable gig the
line under the heading says so rather than leaving a gap.

### Not fixed here

- **The screen has not been rendered in a browser.** Playwright's Chromium is installed now —
  it was not when CAP-8 shipped unlooked-at — but both binaries fail with
  `error while loading shared libraries: libasound.so.2`. The fix is
  `sudo npx playwright install-deps chromium`, or `sudo apt-get install -y libasound2t64`,
  neither of which an agent should run unprompted. The four states were instead rendered as
  far as the DOM: the contract's own payloads were served through the prism mock and the
  screen's own checks executed. Said out loud rather than left as an implied "looks fine".
- **`scripts/check-tokens.sh` still has no execute bit** (`100644`, while every `verify-*.sh`
  beside it is `100755`). Flagged while building CAP-8, still open. One `chmod +x`.
- **`./run verify-export` has no help line**, unlike every other verify target. CAP-18's, not
  this ticket's.
- **Two backend tests error with `GD extension is not installed`** on this machine —
  `ReflectionWritePathTest` lines 247 and 267. Environmental; CAP-15 changes no PHP.
