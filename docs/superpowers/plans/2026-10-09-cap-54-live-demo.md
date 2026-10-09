# CAP-54 Live Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A password-gated live demo of the diary at `https://diary.darkovski.dev`, on its own resettable database, that redeploys itself from `dev`.

**Architecture:** Two containers (`diary-api`: Laravel on PHP 8.5-FPM; `diary-web`: Caddy serving the built bundle and fronting PHP-FPM) in their own compose project on `accord`, joined to the existing `server_web` network. The existing `server-caddy-1` gains one imported site block that gates every path behind a cookie issued by `/gate` (basic auth). A systemd timer polls the public repo and runs `scripts/deploy-demo.sh`, which builds, migrates the demo database only, health-checks and rolls back.

**Tech Stack:** Docker Compose, Caddy 2, PHP 8.5-FPM, Node 24 (build only), bash, systemd, Python 3 for the script tests, Playwright for the picker.

**Spec:** `docs/superpowers/specs/2026-10-09-ai-sidecar-and-live-demo-design.md`, section "The live demo". Ticket: COA4-124 (CAP-54).

## Global Constraints

- Branch: `feat/CAP-54-live-demo` off `dev`. One PR into `dev`, reviewer requested.
- **Depends on PR #120 being merged into `dev` first.** Tasks 2 and 3 edit files that only exist after it (`scripts/demo-preflight.php`, `scripts/lib/token-for.php`, `web/src/demo/demoMode.ts`, `web/src/demo/AlumableWelcome.tsx`). Do not start them before.
- Nothing touches the `server` compose project's services, `mysql` or `server-caddy-1` except Task 8's one-time Caddy procedure, done with Jesse.
- Nothing ever migrates or seeds a database whose name does not end in `_demo`. The shared `reflection_diary` is never on any path in this plan.
- No secret in the repository, in `deploy/`, or in the built bundle: `./run bundle-secrets` passes.
- No credential in GitHub. The box only reads the public repo `https://github.com/theintonerzero/cse3cap.git`.
- Box layout, used verbatim by every script: `DIARY_HOME=/home/ubuntu/diary` with `src/` (checkout), `bin/deploy-demo.sh` (the copy the timer runs), `shared/api.env` (0600), `shared/deploy.env` (0600), `shared/demo/personas.json` (0640), `deployed`, `previous`, `freeze`, `deploy.lock`.
- Compose project name `diary`; network `server_web` (external); images `diary-api:<sha>` and `diary-web:<sha>`.
- MySQL is reached as `rddb.darkovski.dev:3306` over TLS with `MYSQL_ATTR_SSL_CA=../db/letsencrypt-roots.pem`, never `127.0.0.1`.
- Gate cookie: `diary_gate=<64 hex chars>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`. **Lax, not the spec's Strict**: Strict drops the cookie on the first click from an email or chat link, which re-prompts for the password every time someone opens a shared link. The API authenticates by bearer token, not by this cookie, so Lax costs no CSRF protection.
- Every document stays in `docs/`; `python3 scripts/check-docs.py` passes.

## Review Focus

0. **`/gate` issuing the cookie without the password.** Found while writing this plan, against a real `caddy:2`: with `basic_auth`, `header` and `redir` written directly inside `handle /gate`, Caddy sorts `header` and `redir` ahead of `basic_auth`, and an unauthenticated request got the cookie. The fix is a `route` around them. Pinned in Task 7's tests ("without the password is a 401 and sets no cookie", "a wrong password sets no cookie"). Any later edit to the gate must keep those passing.
1. **A visitor who opens a shared link in a new browser.** No cookie: page paths redirect to `/gate`, `/api/*` answers 401 in the diary's envelope rather than an HTML redirect an XHR cannot follow. Pinned in Task 7's Caddy test.
2. **The timer fires while a build is still running.** The first ARM build can exceed 5 minutes; a second run must not start a parallel build. Pinned in Task 5 (`flock`).
3. **The first-ever deploy fails its health check.** There is no previous SHA to roll back to; the script must say so, notify, and exit non-zero rather than "roll back" to an empty tag. Pinned in Task 5.
4. **A reset while people are signed in.** Their tokens are revoked; the picker must tell them to reload, and `personas.json` must never be cached, so a reload gets the new tokens. Pinned in Task 3 (message) and Task 4 (`no-store`).
5. **An `api.env` that points at the shared database.** `DB_DATABASE=reflection_diary` must stop the deploy before `migrate` and the reset before `migrate:fresh`. Pinned in Tasks 5 and 6.

---

### Task 1: ADR, partially superseding #45

**Files:**
- Modify: `docs/adr/architecture-decision-records.md` (index line and a new record at the end)

**Interfaces:**
- Produces: the ADR number (call it `#N` below) that Tasks 9's docs cite.

- [ ] **Step 1: Load `/write-adr` and follow it.** Number: the next free one after the highest in the index (`#61` if PR #120 merged it, so expected `#62`). Status **Proposed**.

- [ ] **Step 2: Write the record with these points, in the skill's voice and format:**
  - Context: CAP-26's design (ADR #45) assumed Caddy at `/etc/caddy`, PHP-FPM, Node and a `diary` user on the host. Read over SSH on 2026-10-09: the box runs Caddy and MySQL 9.7.2 as one compose project in `/home/ubuntu/server`, with no PHP or Node on the host. The procedure was "built, not yet run".
  - Decision: containers in a separate compose project `diary` joined to `server_web`; a cookie gate issued by `/gate`; a separate `reflection_diary_demo` database with its own user; the picker reads personas at runtime from a file behind the gate; the box polls the public repo every 5 minutes and deploys `dev`, with health checks and rollback.
  - What #45 keeps: GitHub holds no credentials; one origin; deploy never edits Caddy; the TLS name rule.
  - What it amends: ADR #60/#61's "dev server only" for the picker. F15 is not reopened: no token is in the bundle.
  - Alternatives: host install as #45 wrote it (rejected: fights the box's existing compose setup); GitHub Actions over SSH (rejected: a key to the database box in GitHub); the shared database (rejected: visitors' submits are irreversible and would change every teammate's fixtures).
  - Consequences: `deploy/caddy`, `deploy/php-fpm`, `scripts/deploy.sh`, `scripts/rollback.sh` describe a layout that is not used; their removal is for CAP-26's owner and the team.

- [ ] **Step 3: Replace `#N`.** Every later task writes `ADR #N` in comments and docs. Once the number is fixed here, use the real number in all of them (`grep -rn 'ADR #N' deploy scripts docs` must be empty before the PR).

- [ ] **Step 4: Check and commit**

Run: `python3 scripts/check-docs.py`
Expected: `... passed, 0 failed`

```bash
git add docs/adr/architecture-decision-records.md
git commit -m "docs(adr): the live demo runs as containers behind a gate, on its own database (CAP-54)"
```

---

### Task 2: Personas from seed output, one table of demo people

**Files:**
- Create: `scripts/lib/demo-people.php`
- Create: `scripts/demo-personas.php`
- Modify: `scripts/demo-preflight.php` (replace its `const PEOPLE = [...]` with the shared table)
- Create: `scripts/demo-personas.test.py`
- Modify: `.github/workflows/ci.yml` (run the new test next to `token-for.test.py`)

**Interfaces:**
- Consumes: `token_for(string $name, ?string $file): string` from `scripts/lib/token-for.php` (PR #120).
- Produces: `DEMO_PEOPLE` constant, list of `[id, name, role_hint, slot]`; CLI `php scripts/demo-personas.php SEED_OUTPUT_FILE` printing a JSON array of `{id, name, role_hint, slot, token}` to stdout, exit 1 with `Error: ...` on stderr when no person has a token.

- [ ] **Step 1: Write the failing test** — `scripts/demo-personas.test.py`

```python
#!/usr/bin/env python3
"""scripts/demo-personas.php builds the live demo's personas.json from the
output of `php artisan db:seed` (CAP-54). Run: python3 scripts/demo-personas.test.py"""
import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "demo-personas.php"
failures = []


def check(name, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}")
    if not ok:
        failures.append(name)
        if detail:
            print("        " + detail.strip().replace("\n", "\n        "))


def run(seed_text):
    with tempfile.TemporaryDirectory() as tmp:
        seed = pathlib.Path(tmp) / "seed.txt"
        seed.write_text(seed_text)
        return subprocess.run(["php", str(SCRIPT), str(seed)], capture_output=True, text=True)


SEED = """\
   INFO  Seeding database.
Jane N   1|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Sam O    2|bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
Dr Lee   3|cccccccccccccccccccccccccccccccccccccccc
Jane N   reflection for Sprint 1, draft
Noor A   4|dddddddddddddddddddddddddddddddddddddddd
"""

print("demo-personas.php")
result = run(SEED)
out = json.loads(result.stdout) if result.returncode == 0 else []
check("exits 0 with tokens present", result.returncode == 0, result.stderr)
check("one persona per person with a token, in the demo's order",
      [p["id"] for p in out] == ["jane", "noor", "sam", "lee"], result.stdout)
check("the token is the last field of the person's token line",
      out and out[0]["token"] == "1|" + "a" * 40, result.stdout)
check("a seeder line without a token is not mistaken for one",
      all("|" in p["token"] for p in out), result.stdout)
check("each persona carries id, name, role_hint, slot and token",
      all(set(p) == {"id", "name", "role_hint", "slot", "token"} for p in out), result.stdout)
check("Sam signs into the assessor slot",
      any(p["id"] == "sam" and p["slot"] == "assessor" for p in out), result.stdout)

result = run("   INFO  Seeding database.\n")
check("no token at all is refused with a reason",
      result.returncode == 1 and "no demo person's token" in result.stderr and result.stdout == "",
      result.stdout + result.stderr)

print()
if failures:
    print(f"{len(failures)} failed.")
    sys.exit(1)
print("All passed.")
```

- [ ] **Step 2: Run it to see it fail**

Run: `python3 scripts/demo-personas.test.py`
Expected: FAIL on "exits 0 with tokens present" (`Could not open input file: scripts/demo-personas.php`).

- [ ] **Step 3: Move the people table into `scripts/lib/demo-people.php`**

```php
<?php
/**
 * Who the demo can sign in as, in the order the demo script meets them
 * (CAP-51, CAP-54). One table for the laptop preflight and for the live demo's
 * personas.json, so the two cannot disagree. Priya R and Tom H are the
 * rehearsal stand-ins for Noor (Demo-Script).
 *
 * Each row: [id, name as the seeder prints it, role hint, token slot].
 */
const DEMO_PEOPLE = [
    ['jane', 'Jane N', 'Student', 'student'],
    ['noor', 'Noor A', 'Student', 'student'],
    ['sam', 'Sam O', 'Assessor', 'assessor'],
    ['lee', 'Dr Lee', 'Supervisor', 'supervisor'],
    ['priya', 'Priya R', 'Student', 'student'],
    ['tom', 'Tom H', 'Student', 'student'],
];
```

In `scripts/demo-preflight.php`: delete the `const PEOPLE = [ ... ];` block and its two comment lines above it, add `require __DIR__ . '/lib/demo-people.php';` under the existing `require __DIR__ . '/lib/token-for.php';`, and change `foreach (PEOPLE as [$id, $name, $role_hint, $slot])` to `foreach (DEMO_PEOPLE as [$id, $name, $role_hint, $slot])`.

- [ ] **Step 4: Write `scripts/demo-personas.php`**

```php
<?php
/**
 * The live demo's personas.json, from `php artisan db:seed` output (CAP-54).
 *
 *   php scripts/demo-personas.php SEED_OUTPUT_FILE > personas.json
 *
 * Runs inside the diary-api container, which is where the seed runs; the box
 * has no PHP. scripts/demo-reset.sh is its only caller. A person with no token
 * line is left out, as the laptop preflight does. None at all is an error, so
 * a reset never publishes an empty picker.
 */
require __DIR__ . '/lib/token-for.php';
require __DIR__ . '/lib/demo-people.php';

$file = $argv[1] ?? '';
$personas = [];
foreach (DEMO_PEOPLE as [$id, $name, $role_hint, $slot]) {
    $token = token_for($name, $file);
    if ($token !== '') {
        $personas[] = ['id' => $id, 'name' => $name, 'role_hint' => $role_hint, 'slot' => $slot, 'token' => $token];
    }
}

if ($personas === []) {
    fwrite(STDERR, "Error: no demo person's token in $file. Was it the output of db:seed on an empty database?\n");
    exit(1);
}

echo json_encode($personas, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES), "\n";
```

- [ ] **Step 5: Run both tests**

Run: `python3 scripts/demo-personas.test.py && python3 scripts/demo-preflight.test.py && python3 scripts/token-for.test.py`
Expected: three `All passed.`

- [ ] **Step 6: Wire into CI.** In `.github/workflows/ci.yml`, directly after the step that runs `python3 scripts/token-for.test.py`, add a step in the same job and the same shape:

```yaml
      - name: Demo personas from seed output
        run: python3 scripts/demo-personas.test.py
```

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/demo-people.php scripts/demo-personas.php scripts/demo-preflight.php scripts/demo-personas.test.py .github/workflows/ci.yml
git commit -m "feat(scripts): the live demo's personas come from seed output, one table of demo people (CAP-54)"
```

---

### Task 3: The picker reads its people at runtime

**Files:**
- Modify: `web/src/demo/demoMode.ts`
- Modify: `web/src/demo/AlumableWelcome.tsx`
- Modify: `web/src/vite-env.d.ts`
- Modify: `web/playwright.config.ts` (a webServer and project for the live picker)
- Create: `web/e2e/demo-live/live-personas.spec.ts`
- Modify: `scripts/check-bundle-secrets.sh` (the canary build also sets the live flag)

**Interfaces:**
- Consumes: `DemoPersona` and `demoPersonas()` from `demoMode.ts` (PR #120); `useSession().sign_in_with(slot, token)` and `last_sign_in_rejected`.
- Produces: `demoMode(): boolean` (true in a build when `VITE_DEMO_PERSONAS_URL` is set); `loadDemoPersonas(): Promise<DemoPersona[]>`; env `VITE_DEMO_PERSONAS_URL` (a path, never a secret).

- [ ] **Step 1: Write the failing spec** — `web/e2e/demo-live/live-personas.spec.ts`

```ts
/**
 * The live demo's picker (CAP-54): people come from /demo/personas.json at
 * runtime, never from the build. Runs under the `demo-live` project, whose
 * server sets VITE_DEMO_PERSONAS_URL and no VITE_DEMO_TOKENS.
 */
import { expect, test } from '@playwright/test';

const PERSONAS = [
  { id: 'jane', name: 'Jane N', role_hint: 'Student', slot: 'student', token: '1|live-jane' },
  { id: 'sam', name: 'Sam O', role_hint: 'Assessor', slot: 'assessor', token: '2|live-sam' },
];

test('shows a card per person from the runtime file', async ({ page }) => {
  await page.route('**/demo/personas.json', (route) => route.fulfill({ json: PERSONAS }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Reflection Diary demo' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Jane N/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sam O/ })).toBeVisible();
});

test('signs in with the token from the file', async ({ page }) => {
  let bearer = '';
  await page.route('**/demo/personas.json', (route) => route.fulfill({ json: PERSONAS }));
  await page.route('**/api/v1/auth/me', (route) => {
    bearer = route.request().headers()['authorization'] ?? '';
    return route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'x', details: {} } } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Jane N/ }).click();
  await expect.poll(() => bearer).toBe('Bearer 1|live-jane');
});

test('a rejected token after a reset says to reload, not to edit an env file', async ({ page }) => {
  await page.route('**/demo/personas.json', (route) => route.fulfill({ json: PERSONAS }));
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'UNAUTHENTICATED', message: 'x', details: {} } } }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: /Jane N/ }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('The demo may have been reset. Reload the page');
  await expect(alert).not.toContainText('.env');
});

test('a missing file falls back to the paste gate', async ({ page }) => {
  await page.route('**/demo/personas.json', (route) => route.fulfill({ status: 404, body: '' }));
  await page.goto('/');
  await expect(page.getByText('Paste a seeded token to continue')).toBeVisible();
});

test('while the file loads, the picker shows skeletons, not the paste gate', async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/demo/personas.json', async (route) => {
    await held;
    await route.fulfill({ json: PERSONAS });
  });
  await page.goto('/');
  await expect(page.getByTestId('personas-loading')).toBeVisible();
  await expect(page.getByText('Paste a seeded token to continue')).toHaveCount(0);
  release();
  await expect(page.getByRole('button', { name: /Jane N/ })).toBeVisible();
});
```

- [ ] **Step 2: Add the `demo-live` server and project** to `web/playwright.config.ts`. Add a constant beside the existing ports, `const LIVE_PORT = PORT + 2;` (if PR #120 already took `PORT + 2`, use the next free offset and say so in the commit), then append to `webServer`:

```ts
    {
      // The live demo's picker (CAP-54): demo mode from the personas URL alone,
      // with no VITE_DEMO_SHELL and no VITE_DEMO_TOKENS, as the deployed build has.
      command: `npx vite --host 127.0.0.1 --port ${LIVE_PORT} --strictPort`,
      url: `http://127.0.0.1:${LIVE_PORT}`,
      reuseExistingServer: false,
      env: {
        VITE_API_BASE_URL: `http://127.0.0.1:${LIVE_PORT}/api/v1`,
        VITE_API_TOKEN: '',
        VITE_DEMO_SHELL: '',
        VITE_DEMO_TOKENS: '',
        VITE_DEMO_PERSONAS_URL: '/demo/personas.json',
      },
    },
```

and to `projects`:

```ts
    {
      name: 'demo-live',
      testMatch: /e2e\/demo-live\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${LIVE_PORT}` },
    },
```

Make sure the existing projects' `testMatch`/`testIgnore` do not also pick up `e2e/demo-live/` (add it to their `testIgnore` the way PR #120 excludes `e2e/demo/`).

- [ ] **Step 3: Run it to see it fail**

Run: `cd web && npx playwright test --project=demo-live`
Expected: FAIL — the first test finds no "Reflection Diary demo" heading (demo mode is off without `VITE_DEMO_SHELL`).

- [ ] **Step 4: Implement in `web/src/demo/demoMode.ts`.** Replace `demoMode()` and add `loadDemoPersonas()` and a shared parser; keep `demoPersonas()` for the dev path:

```ts
/**
 * The live demo's personas file (CAP-54), a path such as /demo/personas.json.
 * A path, never a secret: the file sits behind the site's password gate and
 * is written on the box by scripts/demo-reset.sh. Setting it turns the
 * picker on in a build; no token is compiled in (F15 stays closed, and
 * scripts/check-bundle-secrets.sh builds with it set to prove that).
 */
const PERSONAS_URL = import.meta.env.VITE_DEMO_PERSONAS_URL;

/**
 * True with a personas URL (the live demo, any build), or on the development
 * server with VITE_DEMO_SHELL=1. Otherwise false, in every production build.
 */
export function demoMode(): boolean {
  if (PERSONAS_URL) return true;
  return import.meta.env.DEV ? import.meta.env.VITE_DEMO_SHELL === '1' : false;
}

/** True when the people come from the box rather than the laptop's env. */
export function demoLive(): boolean {
  return Boolean(PERSONAS_URL);
}

function parsePersonas(parsed: unknown): DemoPersona[] {
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (entry): entry is DemoPersona =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as DemoPersona).id === 'string' &&
      typeof (entry as DemoPersona).name === 'string' &&
      typeof (entry as DemoPersona).slot === 'string' &&
      typeof (entry as DemoPersona).token === 'string',
  );
}

/**
 * The people, from the live file when there is one, else from the dev env.
 * Any failure is an empty list: the welcome falls back to the paste gate.
 * Not through api/client.ts on purpose: this is a static file beside the app,
 * not the API, and it carries no bearer token.
 */
export async function loadDemoPersonas(): Promise<DemoPersona[]> {
  if (!PERSONAS_URL) return demoPersonas();
  try {
    const response = await fetch(PERSONAS_URL, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) return [];
    return parsePersonas(await response.json());
  } catch {
    return [];
  }
}
```

and change the body of the existing `demoPersonas()` to use the parser:

```ts
export function demoPersonas(): DemoPersona[] {
  try {
    const raw = import.meta.env.DEV ? import.meta.env.VITE_DEMO_TOKENS : undefined;
    if (!raw) return [];
    return parsePersonas(JSON.parse(raw));
  } catch {
    return [];
  }
}
```

- [ ] **Step 5: Implement in `web/src/demo/AlumableWelcome.tsx`.** Load once on mount; three states (loading skeleton, personas, fallback). Replace `const personas = demoPersonas();` and the import:

```tsx
import { useEffect, useState } from 'react';

import { Skeleton } from '../components/Skeleton/Skeleton.tsx';
import { TokenGate } from '../session/TokenGate.tsx';
import { useSession } from '../session/useSession.ts';
import { type DemoPersona, demoLive, loadDemoPersonas } from './demoMode.ts';
```

```tsx
  const [personas, setPersonas] = useState<DemoPersona[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadDemoPersonas().then((loaded) => {
      if (live) setPersonas(loaded);
    });
    return () => {
      live = false;
    };
  }, []);

  if (personas === null) {
    return (
      <div className={styles.screen}>
        <header className={styles.header}>
          <img src={logo} alt="Alumable logo" className={styles.logo} />
        </header>
        <main className={styles.panel} data-testid="personas-loading" aria-busy="true">
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </main>
      </div>
    );
  }
```

Check `web/src/components/Skeleton/Skeleton.tsx` for its real export name and props and use those; do not add a new skeleton. Then change the rejected message to depend on where the people came from:

```tsx
          {last_sign_in_rejected && (
            <p className={styles.rejected} role="alert">
              {demoLive()
                ? 'That profile could not sign in: the demo may have been reset. Reload the page to get fresh profiles.'
                : 'That profile could not sign in: its token was rejected. Check the tokens in web/.env.development.local.'}
            </p>
          )}
```

Add to `web/src/vite-env.d.ts`, beside `VITE_DEMO_TOKENS`:

```ts
  /**
   * The live demo's personas file, e.g. /demo/personas.json (CAP-54). A path,
   * not a secret. Set only by deploy/demo/web.Dockerfile.
   */
  readonly VITE_DEMO_PERSONAS_URL?: string;
```

- [ ] **Step 6: Run the new spec and the whole suite**

Run: `cd web && npx playwright test --project=demo-live && npx playwright test`
Expected: the five new tests pass; every existing spec passes unmodified.

- [ ] **Step 7: Prove the live build carries no token.** In `scripts/check-bundle-secrets.sh`, find the `printf 'VITE_DEMO_SHELL=1\nVITE_DEMO_TOKENS=...` line that writes the canary into `$LOCAL_ENV`, and add `VITE_DEMO_PERSONAS_URL=/demo/personas.json\n` to the same `printf` so the canary build is the live build. Then:

Run: `./run bundle-secrets`
Expected: `ok     no demo persona token in the production bundle` and `Passed.`

- [ ] **Step 8: Typecheck, lint, commit**

Run: `cd web && npx tsc -b && npx oxlint && npx prettier --check src e2e`
Expected: no errors.

```bash
git add web/src/demo/demoMode.ts web/src/demo/AlumableWelcome.tsx web/src/vite-env.d.ts web/playwright.config.ts web/e2e/demo-live/live-personas.spec.ts scripts/check-bundle-secrets.sh
git commit -m "feat(web): the live demo's picker reads its people at runtime, no token in the build (CAP-54)"
```

---

### Task 4: The two images and the compose project

**Files:**
- Create: `deploy/demo/api.Dockerfile`
- Create: `deploy/demo/api-entrypoint.sh`
- Create: `deploy/demo/php-fpm-diary.conf`
- Create: `deploy/demo/web.Dockerfile`
- Create: `deploy/demo/web.Caddyfile`
- Create: `deploy/demo/compose.yml`
- Create: `deploy/demo/api.env.example`
- Create: `.dockerignore`
- Create: `scripts/deploy-demo.test.py` (first section; Tasks 5–7 add sections)

**Interfaces:**
- Produces: services `diary-api` (FPM on 9000) and `diary-web` (HTTP on 80, `/up` health); env `DIARY_SHA`, `DIARY_HOME` read by `compose.yml`; `/app/scripts/demo-personas.php` inside `diary-api`.

- [ ] **Step 1: Write the failing static checks** — `scripts/deploy-demo.test.py`

```python
#!/usr/bin/env python3
"""The live demo's deploy (CAP-54): static rules on deploy/demo, and the
scripts run against stubbed docker, git and curl. Run: python3 scripts/deploy-demo.test.py"""
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEMO = ROOT / "deploy" / "demo"
failures = []


def check(name, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}")
    if not ok:
        failures.append(name)
        if detail:
            print("        " + str(detail).strip().replace("\n", "\n        "))


def run(*args, env=None, cwd=None):
    return subprocess.run([str(a) for a in args], capture_output=True, stdin=subprocess.DEVNULL,
                          text=True, env={**os.environ, **(env or {})}, cwd=cwd)


# ---------------------------------------------------------------------------
print("deploy/demo/compose.yml")
# ---------------------------------------------------------------------------
compose = (DEMO / "compose.yml").read_text() if (DEMO / "compose.yml").exists() else ""
check("the project is named diary", re.search(r"^name:\s*diary\s*$", compose, re.M) is not None)
check("it defines no mysql or caddy service of its own",
      not re.search(r"^\s{2}(mysql|caddy)\s*:", compose, re.M), compose)
check("it joins server_web as an external network",
      "external: true" in compose and "name: server_web" in compose)
check("every service has a memory limit",
      compose.count("mem_limit:") == len(re.findall(r"^\s{2}diary-[a-z]+:", compose, re.M)) > 0)
check("images are tagged by DIARY_SHA", "diary-api:${DIARY_SHA" in compose and "diary-web:${DIARY_SHA" in compose)
check("MySQL is reached by its certificate name through the host gateway",
      "rddb.darkovski.dev:host-gateway" in compose)
check("evidence uploads live in a named volume", "diary_storage:/app/api/storage" in compose)

print("deploy/demo, no secrets")
# [ \t]* not \s*: an empty `APP_KEY=` line must not borrow the next line as its value.
secret = re.compile(r"(DB_PASSWORD|APP_KEY|ANTHROPIC_API_KEY)[ \t]*=[ \t]*[^\s#]+|\b\d+\|[A-Za-z0-9]{20,}")
for path in sorted(DEMO.rglob("*")):
    if path.is_file():
        hit = secret.search(path.read_text(errors="ignore"))
        check(f"{path.relative_to(ROOT)} holds no secret", hit is None, hit.group(0) if hit else "")

print("deploy/demo/web.Caddyfile")
web = (DEMO / "web.Caddyfile").read_text() if (DEMO / "web.Caddyfile").exists() else ""
check("personas.json is never cached", re.search(r"personas\.json[\s\S]*?no-store", web) is not None, web)
check("/api and /up go to PHP-FPM", "php_fastcgi diary-api:9000" in web and "/up" in web)

print("deploy/demo/php-fpm-diary.conf")
fpm = (DEMO / "php-fpm-diary.conf").read_text() if (DEMO / "php-fpm-diary.conf").exists() else ""
check("workers keep the container's environment", re.search(r"^clear_env\s*=\s*no", fpm, re.M) is not None)

print()
if failures:
    print(f"{len(failures)} failed.")
    sys.exit(1)
print("All passed.")
```

- [ ] **Step 2: Run it to see it fail**

Run: `python3 scripts/deploy-demo.test.py`
Expected: FAIL on "the project is named diary" and the others.

- [ ] **Step 3: Write `deploy/demo/compose.yml`**

```yaml
# The live demo (CAP-54, ADR #N). Its own compose project, so bringing the
# diary up or down never touches MySQL or Caddy in /home/ubuntu/server.
# scripts/deploy-demo.sh sets DIARY_SHA and DIARY_HOME; nothing here is secret.
name: diary

services:
  diary-api:
    image: diary-api:${DIARY_SHA:?set by scripts/deploy-demo.sh}
    build:
      context: ../..
      dockerfile: deploy/demo/api.Dockerfile
    restart: unless-stopped
    env_file: ${DIARY_HOME:-/home/ubuntu/diary}/shared/api.env
    volumes:
      - diary_storage:/app/api/storage
    # The certificate is issued for rddb.darkovski.dev, so the name must stay;
    # the host gateway reaches MySQL's published 3306 without leaving the box.
    extra_hosts:
      - "rddb.darkovski.dev:host-gateway"
    mem_limit: 512m
    networks: [web]

  diary-web:
    image: diary-web:${DIARY_SHA:?set by scripts/deploy-demo.sh}
    build:
      context: ../..
      dockerfile: deploy/demo/web.Dockerfile
    restart: unless-stopped
    depends_on: [diary-api]
    volumes:
      - ${DIARY_HOME:-/home/ubuntu/diary}/shared/demo:/srv/demo:ro
    mem_limit: 128m
    networks: [web]

networks:
  web:
    external: true
    name: server_web

volumes:
  diary_storage:
```

- [ ] **Step 4: Write `deploy/demo/php-fpm-diary.conf`, `deploy/demo/api-entrypoint.sh`, `deploy/demo/api.Dockerfile`**

`deploy/demo/php-fpm-diary.conf`:

```ini
; The live demo (CAP-54). Laravel reads its settings from the container's
; environment (compose env_file), and FPM clears it for workers by default.
[www]
clear_env = no
```

`deploy/demo/api-entrypoint.sh`:

```bash
#!/bin/sh
# Starts the demo API (CAP-54). Storage is a named volume, so its tree is made
# here on every start, then the config is cached from this container's env.
set -eu
cd /app/api
for dir in storage/app/private storage/framework/cache storage/framework/sessions \
           storage/framework/views storage/logs bootstrap/cache; do
    mkdir -p "$dir"
done
chown -R www-data:www-data storage bootstrap/cache
php artisan config:cache --no-ansi >/dev/null
php artisan route:cache --no-ansi >/dev/null
exec "$@"
```

`deploy/demo/api.Dockerfile`:

```dockerfile
# The demo API (CAP-54): Laravel on PHP 8.5-FPM. Built on the box from the
# repository at one commit; nothing secret is copied in.
FROM php:8.5-fpm

COPY --from=mlocati/php-extension-installer /usr/bin/install-php-extensions /usr/local/bin/
RUN install-php-extensions pdo_mysql intl zip opcache
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app/api
COPY api/composer.json api/composer.lock ./
RUN composer install --no-dev --no-interaction --no-progress --prefer-dist --no-scripts --no-autoloader
COPY api/ ./
RUN composer dump-autoload --no-dev --optimize --classmap-authoritative \
 && rm -f .env

# The CA bundle MYSQL_ATTR_SSL_CA names, relative to api/.
COPY db/letsencrypt-roots.pem /app/db/letsencrypt-roots.pem
# The reset builds personas.json here; the box has no PHP.
COPY scripts/demo-personas.php /app/scripts/demo-personas.php
COPY scripts/lib/token-for.php scripts/lib/demo-people.php /app/scripts/lib/

COPY deploy/demo/php-fpm-diary.conf /usr/local/etc/php-fpm.d/zz-diary.conf
COPY deploy/demo/api-entrypoint.sh /usr/local/bin/diary-api-entrypoint
RUN chmod 755 /usr/local/bin/diary-api-entrypoint

ENTRYPOINT ["diary-api-entrypoint"]
CMD ["php-fpm"]
```

- [ ] **Step 5: Write `deploy/demo/web.Caddyfile` and `deploy/demo/web.Dockerfile`**

`deploy/demo/web.Caddyfile`:

```caddyfile
# Inside the diary-web container (CAP-54). Plain HTTP on the server_web
# network only: TLS, the gate and the public headers are server-caddy-1's.
{
	admin off
	auto_https off
}

:80 {
	encode zstd gzip

	request_body /api/* {
		max_size 101MiB
	}

	@laravel path /api/* /up
	handle @laravel {
		root * /app/api/public
		php_fastcgi diary-api:9000
	}

	# Written by scripts/demo-reset.sh on every reset. A cached copy would
	# hand out tokens the reset just revoked.
	handle /demo/personas.json {
		root * /srv
		header Cache-Control "no-store"
		file_server
	}

	handle {
		root * /srv/web
		@assets path /assets/*
		header @assets Cache-Control "public, max-age=31536000, immutable"
		@not_assets not path /assets/*
		header @not_assets Cache-Control "no-cache"
		try_files {path} /index.html
		file_server
	}
}
```

`deploy/demo/web.Dockerfile`:

```dockerfile
# The demo bundle and its internal web server (CAP-54). The bundle is built
# with a personas URL and no tokens; ./run bundle-secrets proves that shape.
FROM node:24-bookworm-slim AS build
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
ENV VITE_API_BASE_URL=/api/v1 \
    VITE_DEMO_PERSONAS_URL=/demo/personas.json \
    VITE_API_TOKEN= \
    VITE_DEMO_SHELL= \
    VITE_DEMO_TOKENS=
RUN rm -f .env .env.local .env.development.local .env.production.local && npm run build

FROM caddy:2
COPY deploy/demo/web.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/web/dist /srv/web
# php_fastcgi checks the front controller exists on this side before passing on.
COPY api/public /app/api/public
```

`.dockerignore` at the repository root:

```
.git
**/node_modules
**/.env
**/.env.*
!**/.env.example
api/vendor
api/storage
web/dist
web/test-results
docs
```

`web/e2e` stays in the context on purpose: `npm run build` is `tsc -b && vite build`, and `tsc -b` type-checks the `tsconfig.e2e.json` project too, which fails with no inputs.

`deploy/demo/api.env.example` (the template for `shared/api.env` on the box; values left empty on purpose):

```
APP_NAME="Reflection Diary"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://diary.darkovski.dev
APP_KEY=
FRONTEND_URL=https://diary.darkovski.dev
LOG_CHANNEL=stderr
LOG_LEVEL=warning
DB_CONNECTION=mysql
DB_HOST=rddb.darkovski.dev
DB_PORT=3306
DB_DATABASE=reflection_diary_demo
DB_USERNAME=diary_demo_app
DB_PASSWORD=
DB_COLLATION=utf8mb4_0900_ai_ci
MYSQL_ATTR_SSL_CA=../db/letsencrypt-roots.pem
CACHE_STORE=file
SESSION_DRIVER=file
QUEUE_CONNECTION=sync
```

- [ ] **Step 6: Run the static checks, then build both images locally** (the box is arm64, and so is this Mac)

Run: `python3 scripts/deploy-demo.test.py`
Expected: `All passed.`

Run: `mkdir -p /tmp/diary-local/shared/demo && touch /tmp/diary-local/shared/api.env && DIARY_SHA=local DIARY_HOME=/tmp/diary-local docker compose -f deploy/demo/compose.yml build` (compose checks that `env_file` exists even for a build)
Expected: both images build. Then: `docker run --rm --entrypoint php diary-api:local -m | grep -E 'pdo_mysql|intl|zip'` prints the three; `docker run --rm diary-web:local ls /srv/web/index.html /app/api/public/index.php` lists both; `docker run --rm diary-web:local sh -c 'grep -rl "1|" /srv/web/assets || echo clean'` prints `clean`.

- [ ] **Step 7: Commit**

```bash
git add deploy/demo .dockerignore scripts/deploy-demo.test.py
git commit -m "feat(deploy): the demo as two containers in their own compose project (CAP-54)"
```

---

### Task 5: `scripts/deploy-demo.sh`

**Files:**
- Create: `scripts/deploy-demo.sh`
- Modify: `scripts/deploy-demo.test.py` (add the "deploy-demo.sh" section before the summary)

**Interfaces:**
- Consumes: `deploy/demo/compose.yml` (`DIARY_SHA`, `DIARY_HOME`).
- Produces: CLI `deploy-demo.sh --if-changed <branch>` and `deploy-demo.sh <sha|tag>`; files `$DIARY_HOME/deployed`, `$DIARY_HOME/previous`; env read from `$DIARY_HOME/shared/deploy.env`: `DIARY_REPO`, `DIARY_NTFY_URL`, `DIARY_NTFY_TOKEN` (all optional). Exit 0 on deployed or nothing to do, 1 on refused/failed/rolled back.

- [ ] **Step 1: Write the failing tests.** Add before the final summary in `scripts/deploy-demo.test.py`:

```python
# ---------------------------------------------------------------------------
print("scripts/deploy-demo.sh")
# ---------------------------------------------------------------------------
SCRIPT = ROOT / "scripts" / "deploy-demo.sh"

STUB_GIT = """#!/bin/sh
echo "git $*" >> "$CALLS"
case "$*" in
  *ls-remote*) printf '%s\\trefs/heads/dev\\n' "$REMOTE_SHA" ;;
  *rev-parse*) echo "$REMOTE_SHA" ;;
esac
exit 0
"""
STUB_DOCKER = """#!/bin/sh
echo "docker $*" >> "$CALLS"
case "$*" in
  *" build"*) [ "${FAIL_BUILD:-}" = 1 ] && exit 1 ;;
  *"artisan migrate"*) [ "${FAIL_MIGRATE:-}" = 1 ] && exit 1 ;;
  *"wget"*|*"/health"*) [ "${FAIL_HEALTH:-}" = 1 ] && exit 1 ;;
esac
exit 0
"""
STUB_CURL = """#!/bin/sh
echo "curl $*" >> "$CALLS"
exit 0
"""
# Called as: flock -n -E 75 LOCKFILE CMD ARGS...
STUB_FLOCK = """#!/bin/sh
[ "${LOCKED:-}" = 1 ] && exit 75
shift 4
exec "$@"
"""


def box(tmp, db="reflection_diary_demo", deployed=None, freeze=False):
    home = pathlib.Path(tmp) / "diary"
    (home / "shared" / "demo").mkdir(parents=True)
    (home / "src" / "deploy" / "demo").mkdir(parents=True)
    (home / "src" / "deploy" / "demo" / "compose.yml").write_text("name: diary\n")
    env = home / "shared" / "api.env"
    env.write_text(f"APP_ENV=production\nDB_DATABASE={db}\n")
    env.chmod(0o600)
    (home / "shared" / "deploy.env").write_text("DIARY_NTFY_URL=https://ntfy.example/diary\n")
    if deployed:
        (home / "deployed").write_text(deployed + "\n")
    if freeze:
        (home / "freeze").write_text("")
    bin_dir = pathlib.Path(tmp) / "bin"
    bin_dir.mkdir()
    for name, body in (("git", STUB_GIT), ("docker", STUB_DOCKER), ("curl", STUB_CURL), ("flock", STUB_FLOCK)):
        (bin_dir / name).write_text(body)
        (bin_dir / name).chmod(0o755)
    calls = pathlib.Path(tmp) / "calls.log"
    return home, {"DIARY_HOME": str(home), "CALLS": str(calls),
                  "DIARY_HEALTH_TRIES": "2", "DIARY_HEALTH_WAIT": "0",
                  "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}, calls


def lines(calls):
    return calls.read_text().splitlines() if calls.exists() else []


OLD, NEW = "a" * 40, "b" * 40

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD, freeze=True)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW})
    check("a freeze file stops a timed deploy before anything runs",
          r.returncode == 0 and not any(l.startswith("docker") for l in lines(calls)), r.stdout + r.stderr)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": OLD})
    check("an unchanged dev does nothing",
          r.returncode == 0 and not any(l.startswith("docker") for l in lines(calls)), r.stdout + r.stderr)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW})
    log = lines(calls)
    order = [next((i for i, l in enumerate(log) if k in l), -1) for k in (" build", "artisan migrate", " up -d")]
    check("a new commit builds, migrates, then starts, in that order",
          r.returncode == 0 and -1 not in order and order == sorted(order), "\n".join(log) + r.stderr)
    check("the deployed and previous SHAs are recorded",
          (home / "deployed").read_text().strip() == NEW and (home / "previous").read_text().strip() == OLD)
    check("ntfy hears that it deployed", any("curl" in l and "deployed" in l for l in log), "\n".join(log))

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, db="reflection_diary", deployed=OLD)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW})
    check("the shared database is refused before any migration",
          r.returncode == 1 and "_demo" in r.stderr
          and not any("artisan migrate" in l or " up -d" in l for l in lines(calls)), r.stdout + r.stderr)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW, "FAIL_BUILD": "1"})
    check("a failed build changes nothing running",
          r.returncode == 1 and not any(" up -d" in l for l in lines(calls))
          and (home / "deployed").read_text().strip() == OLD, r.stdout + r.stderr)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW, "FAIL_MIGRATE": "1"})
    check("a failed migration starts nothing new",
          r.returncode == 1 and not any(" up -d" in l for l in lines(calls)), r.stdout + r.stderr)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW, "FAIL_HEALTH": "1"})
    log = lines(calls)
    ups = [l for l in log if " up -d" in l]
    check("a failed health check rolls back to the previous images",
          r.returncode == 1 and len(ups) == 2 and (home / "deployed").read_text().strip() == OLD,
          "\n".join(log) + r.stderr)
    check("ntfy hears that it rolled back", any("curl" in l and "rolled back" in l for l in log), "\n".join(log))

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=None)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW, "FAIL_HEALTH": "1"})
    log = lines(calls)
    check("a first deploy that fails says there is nothing to roll back to",
          r.returncode == 1 and "nothing to roll back to" in r.stderr
          and len([l for l in log if " up -d" in l]) == 1, "\n".join(log) + r.stderr)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW, "LOCKED": "1"})
    check("a run while another holds the lock exits quietly",
          r.returncode == 0 and not any(l.startswith("docker") for l in lines(calls)), r.stdout + r.stderr)

check("the script never touches Caddy or the server project",
      not re.search(r"server-caddy|/home/ubuntu/server|caddy reload|-p server", SCRIPT.read_text()))
```

- [ ] **Step 2: Run to see it fail**

Run: `python3 scripts/deploy-demo.test.py`
Expected: FAIL on every `deploy-demo.sh` check (`No such file or directory`).

- [ ] **Step 3: Write `scripts/deploy-demo.sh`**

```bash
#!/usr/bin/env bash
# Deploys the live demo on accord (CAP-54, ADR #N). Runs ON the box.
#
#   deploy-demo.sh --if-changed dev   what the timer runs every 5 minutes
#   deploy-demo.sh <sha|tag>          by hand, e.g. to pin a version with freeze
#
# Builds the commit's images, migrates the demo database (and only a database
# whose name ends in _demo), starts them, health-checks, and on failure puts
# the previous images back. Never touches Caddy or the server compose project.
set -euo pipefail

DIARY_HOME="${DIARY_HOME:-/home/ubuntu/diary}"
SRC="$DIARY_HOME/src"
COMPOSE="$SRC/deploy/demo/compose.yml"
# shellcheck disable=SC1091
[ -f "$DIARY_HOME/shared/deploy.env" ] && . "$DIARY_HOME/shared/deploy.env"
DIARY_REPO="${DIARY_REPO:-https://github.com/theintonerzero/cse3cap.git}"

fail() { printf 'Error: %s\n' "$*" >&2; notify "failed: $*"; exit 1; }
say() { printf '==> %s\n' "$*"; }
notify() {
    [ -n "${DIARY_NTFY_URL:-}" ] || return 0
    curl -fsS -m 10 ${DIARY_NTFY_TOKEN:+-H "Authorization: Bearer $DIARY_NTFY_TOKEN"} \
        -H "Title: diary demo" -d "$*" "$DIARY_NTFY_URL" >/dev/null || true
}
compose() { DIARY_SHA="$1" DIARY_HOME="$DIARY_HOME" docker compose -f "$COMPOSE" "${@:2}"; }

# One run at a time: a first build on this box can outlast the timer. flock
# exits 75 when another run holds the lock; that is not a failure.
if [ "${DIARY_LOCKED:-}" != 1 ]; then
    rc=0
    DIARY_LOCKED=1 flock -n -E 75 "$DIARY_HOME/deploy.lock" "$0" "$@" || rc=$?
    [ "$rc" -eq 75 ] && exit 0
    exit "$rc"
fi

# The one rule that protects the team: only a *_demo database is migrated.
db="$(sed -n 's/^DB_DATABASE=["'\'']\{0,1\}\([^"'\'']*\).*/\1/p' "$DIARY_HOME/shared/api.env" | tail -n 1)"
case "$db" in
    *_demo) ;;
    *) fail "shared/api.env names DB_DATABASE='$db'. The demo only ever migrates a database ending in _demo." ;;
esac

deployed="$(cat "$DIARY_HOME/deployed" 2>/dev/null || true)"

if [ "${1:-}" = "--if-changed" ]; then
    branch="${2:?--if-changed needs a branch}"
    if [ -e "$DIARY_HOME/freeze" ]; then say "frozen, not deploying"; exit 0; fi
    want="$(git ls-remote "$DIARY_REPO" "refs/heads/$branch" | cut -f1)"
    [ -n "$want" ] || fail "could not read $branch from $DIARY_REPO"
    [ "$want" = "$deployed" ] && exit 0
    ref="$want"
else
    ref="${1:?usage: deploy-demo.sh --if-changed <branch> | deploy-demo.sh <sha|tag>}"
fi

say "fetching $ref"
[ -d "$SRC/.git" ] || git clone --quiet --no-checkout "$DIARY_REPO" "$SRC"
git -C "$SRC" fetch --quiet --depth 1 origin "$ref"
git -C "$SRC" checkout --quiet --force FETCH_HEAD
sha="$(git -C "$SRC" rev-parse HEAD)"
short="${sha:0:7}"

say "building $short"
compose "$sha" build || fail "build of $short failed; nothing running was changed"

say "migrating $db"
compose "$sha" run --rm diary-api php artisan migrate --force --no-interaction \
    || fail "migration at $short failed; the running demo was left as it was"

say "starting $short"
compose "$sha" up -d --remove-orphans

# About a minute by default; the tests set both to keep a failed check fast.
healthy() {
    local i=0
    while [ "$i" -lt "${DIARY_HEALTH_TRIES:-12}" ]; do
        compose "$1" exec -T diary-web wget -q -O /dev/null http://127.0.0.1/up && return 0
        i=$((i + 1))
        sleep "${DIARY_HEALTH_WAIT:-5}"
    done
    return 1
}

if healthy "$sha"; then
    [ -n "$deployed" ] && [ "$deployed" != "$sha" ] && printf '%s\n' "$deployed" > "$DIARY_HOME/previous"
    printf '%s\n' "$sha" > "$DIARY_HOME/deployed"
    install -m 755 "$SRC/scripts/deploy-demo.sh" "$DIARY_HOME/bin/deploy-demo.sh.new" 2>/dev/null \
        && mv -f "$DIARY_HOME/bin/deploy-demo.sh.new" "$DIARY_HOME/bin/deploy-demo.sh" || true
    docker image ls --format '{{.Repository}}:{{.Tag}}' 'diary-*' \
        | grep -v -e ":$sha$" -e ":${deployed:-none}$" | xargs -r docker image rm >/dev/null 2>&1 || true
    say "deployed $short"
    notify "deployed $short"
    exit 0
fi

if [ -z "$deployed" ]; then
    printf 'Error: %s failed its health check and there is nothing to roll back to.\n' "$short" >&2
    notify "first deploy $short failed its health check; nothing to roll back to"
    exit 1
fi
say "health check failed, rolling back to ${deployed:0:7}"
compose "$deployed" up -d --remove-orphans
notify "rolled back: $short failed /up, back on ${deployed:0:7}. If $short migrated, run demo-reset.sh."
exit 1
```

`chmod 755 scripts/deploy-demo.sh`.

The health check uses `wget` inside `diary-web` (the Caddy image is Alpine, which has it). The stubbed `docker` in the test matches `wget` in its arguments.

- [ ] **Step 4: Run the tests**

Run: `python3 scripts/deploy-demo.test.py`
Expected: `All passed.` The box's `flock` is util-linux, which has `-E`; macOS has no `flock`, which is why the test always stubs it.

- [ ] **Step 5: Commit**

```bash
git add scripts/deploy-demo.sh scripts/deploy-demo.test.py
git commit -m "feat(scripts): deploy-demo.sh builds, migrates the demo db only, health-checks, rolls back (CAP-54)"
```

---

### Task 6: `scripts/demo-reset.sh`

**Files:**
- Create: `scripts/demo-reset.sh`
- Modify: `scripts/deploy-demo.test.py` (add the "demo-reset.sh" section)

**Interfaces:**
- Consumes: `diary-api` image with `/app/scripts/demo-personas.php`; `$DIARY_HOME/deployed`.
- Produces: `$DIARY_HOME/shared/demo/personas.json` (0640). Plan 2 extends this script to empty `diary_ai`.

- [ ] **Step 1: Write the failing tests.** Add to `scripts/deploy-demo.test.py` before the summary (reuses `box`, `lines` and the stubs from Task 5; extend `STUB_DOCKER` so that a call containing `demo-personas.php` prints a JSON array):

In `STUB_DOCKER`, add a case before `esac`:

```
  *"demo-personas.php"*) [ "${FAIL_PERSONAS:-}" = 1 ] && exit 1; echo '[{"id":"jane","name":"Jane N","role_hint":"Student","slot":"student","token":"1|x"}]' ;;
```

Then:

```python
# ---------------------------------------------------------------------------
print("scripts/demo-reset.sh")
# ---------------------------------------------------------------------------
RESET = ROOT / "scripts" / "demo-reset.sh"

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD)
    r = run(RESET, env=env)
    log = lines(calls)
    personas = home / "shared" / "demo" / "personas.json"
    check("a reset reseeds the demo database from scratch",
          r.returncode == 0 and any("migrate:fresh" in l and "--seed" in l and "--drop-views" in l for l in log),
          "\n".join(log) + r.stderr)
    check("it writes personas.json from the seed output",
          personas.exists() and '"jane"' in personas.read_text(), r.stderr)
    check("personas.json is not world-readable", personas.exists() and (personas.stat().st_mode & 0o777) == 0o640)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, db="reflection_diary", deployed=OLD)
    r = run(RESET, env=env)
    check("the shared database is refused before migrate:fresh",
          r.returncode == 1 and "_demo" in r.stderr and not any("migrate" in l for l in lines(calls)),
          r.stdout + r.stderr)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD)
    personas = home / "shared" / "demo" / "personas.json"
    personas.write_text('[{"id":"old"}]')
    r = run(RESET, env={**env, "FAIL_PERSONAS": "1"})
    check("a failed personas build keeps the old file rather than an empty one",
          r.returncode == 1 and personas.read_text() == '[{"id":"old"}]', r.stdout + r.stderr)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=None)
    r = run(RESET, env=env)
    check("a reset before any deploy is refused with a reason",
          r.returncode == 1 and "deploy first" in r.stderr, r.stdout + r.stderr)
```

- [ ] **Step 2: Run to see it fail**

Run: `python3 scripts/deploy-demo.test.py`
Expected: FAIL on the four `demo-reset.sh` checks.

- [ ] **Step 3: Write `scripts/demo-reset.sh`**

```bash
#!/usr/bin/env bash
# Resets the live demo to freshly seeded data (CAP-54, ADR #N). Runs ON the box.
# Every visitor is signed out: their tokens go with the old rows, and the
# picker's personas.json is rewritten with the new ones.
set -euo pipefail

DIARY_HOME="${DIARY_HOME:-/home/ubuntu/diary}"
COMPOSE="$DIARY_HOME/src/deploy/demo/compose.yml"
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

db="$(sed -n 's/^DB_DATABASE=["'\'']\{0,1\}\([^"'\'']*\).*/\1/p' "$DIARY_HOME/shared/api.env" | tail -n 1)"
case "$db" in
    *_demo) ;;
    *) fail "shared/api.env names DB_DATABASE='$db'. A reset only ever runs on a database ending in _demo." ;;
esac

sha="$(cat "$DIARY_HOME/deployed" 2>/dev/null || true)"
[ -n "$sha" ] || fail "nothing is deployed yet; deploy first, then reset"
compose() { DIARY_SHA="$sha" DIARY_HOME="$DIARY_HOME" docker compose -f "$COMPOSE" "$@"; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

printf '==> reseeding %s\n' "$db"
compose run --rm diary-api php artisan migrate:fresh --drop-views --seed --force --no-interaction --no-ansi \
    > "$work/seed.txt"

printf '==> writing personas.json\n'
compose run --rm -T -v "$work:/seed:ro" diary-api php /app/scripts/demo-personas.php /seed/seed.txt \
    > "$work/personas.json" || fail "could not build personas.json; the previous file was kept"
install -m 0640 "$work/personas.json" "$DIARY_HOME/shared/demo/personas.json"
printf '==> done. Everyone signed in before the reset must reload the page.\n'
```

`chmod 755 scripts/demo-reset.sh`.

- [ ] **Step 4: Run the tests**

Run: `python3 scripts/deploy-demo.test.py`
Expected: `All passed.`

- [ ] **Step 5: Commit**

```bash
git add scripts/demo-reset.sh scripts/deploy-demo.test.py
git commit -m "feat(scripts): demo-reset.sh reseeds the demo db only and rewrites the picker's people (CAP-54)"
```

---

### Task 7: The gate, the timer units, the smoke check

**Files:**
- Create: `deploy/demo/site.caddy`
- Create: `scripts/demo-gate.sh`
- Create: `deploy/demo/diary-deploy.service`
- Create: `deploy/demo/diary-deploy.timer`
- Create: `scripts/smoke-demo.sh`
- Modify: `scripts/deploy-demo.test.py` (Caddy validation and gate behaviour)
- Modify: `.github/workflows/ci.yml` (run `deploy-demo.test.py` beside `deploy.test.py`)
- Modify: `run` (`./run deploy-demo-test`)

**Interfaces:**
- Produces: `/home/ubuntu/server/diary-site.caddy` (copied from `deploy/demo/site.caddy`) importing `/srv/server/diary-gate.caddy`, which `scripts/demo-gate.sh` writes with matchers `@diary_nogate`, `@diary_nogate_api` and the `/gate` handler. Plan 2 adds one `reverse_proxy /ai/*` line to `site.caddy`.

- [ ] **Step 1: Write the failing tests.** Add to `scripts/deploy-demo.test.py` before the summary:

```python
# ---------------------------------------------------------------------------
print("deploy/demo/site.caddy with a generated gate")
# ---------------------------------------------------------------------------
GATE_SCRIPT = ROOT / "scripts" / "demo-gate.sh"
docker_ok = shutil.which("docker") and run("docker", "info").returncode == 0
if not docker_ok:
    print("  skip  docker is not available here; CI runs these")
else:
    with tempfile.TemporaryDirectory() as tmp:
        srv = pathlib.Path(tmp)
        bcrypt = run("docker", "run", "--rm", "caddy:2", "caddy", "hash-password",
                     "--plaintext", "test-password-123").stdout.strip()
        r = run(GATE_SCRIPT, "--out", srv / "diary-gate.caddy", "--hash", bcrypt, "--secret", "f" * 64)
        check("demo-gate.sh writes the gate file", r.returncode == 0 and (srv / "diary-gate.caddy").exists(),
              r.stdout + r.stderr)
        check("the gate file is not world-readable",
              ((srv / "diary-gate.caddy").stat().st_mode & 0o777) == 0o640)
        shutil.copy(DEMO / "site.caddy", srv / "diary-site.caddy")
        (srv / "Caddyfile").write_text(
            "{\n\tadmin off\n\tauto_https off\n}\n(baseline) {\n}\n(accesslog) {\n}\n"
            "import /srv/server/diary-site.caddy\n")
        # The site block names diary.darkovski.dev; for a local run serve it on :8080 instead.
        site = (srv / "diary-site.caddy").read_text().replace("diary.darkovski.dev {", "http://:8080 {", 1)
        site = site.replace("reverse_proxy diary-web:80", 'respond "app" 200')
        (srv / "diary-site.caddy").write_text(site)
        # docker cp rather than a bind mount: Docker Desktop does not share
        # temporary directories with its VM, so a mount arrives empty there.
        name = "diary-gate-test"
        run("docker", "rm", "-f", name)
        run("docker", "create", "--name", name, "-p", "18080:8080", "caddy:2",
            "caddy", "run", "--config", "/srv/server/Caddyfile", "--adapter", "caddyfile")
        run("docker", "cp", f"{srv}/.", f"{name}:/srv/server")
        run("docker", "start", name)
        import base64, time, urllib.request, urllib.error
        time.sleep(2)
        r = run("docker", "exec", name, "caddy", "validate", "--config", "/srv/server/Caddyfile",
                "--adapter", "caddyfile")
        check("caddy validates the site with its gate", r.returncode == 0, r.stdout + r.stderr)

        def get(path, cookie=None, password=None):
            req = urllib.request.Request(f"http://127.0.0.1:18080{path}")
            if cookie:
                req.add_header("Cookie", cookie)
            if password:
                req.add_header("Authorization", "Basic " + base64.b64encode(f"demo:{password}".encode()).decode())
            opener = urllib.request.build_opener(type("NoRedirect", (urllib.request.HTTPRedirectHandler,),
                                                      {"redirect_request": lambda *a, **k: None}))
            try:
                resp = opener.open(req, timeout=5)
                return resp.status, dict(resp.headers), resp.read().decode()
            except urllib.error.HTTPError as e:
                return e.code, dict(e.headers), e.read().decode()

        try:
            status, headers, _ = get("/")
            check("a page without the cookie redirects to /gate",
                  status == 303 and headers.get("Location") == "/gate", (status, headers))
            status, headers, body = get("/api/v1/auth/me")
            check("the API without the cookie is a 401 in the diary's envelope",
                  status == 401 and '"UNAUTHENTICATED"' in body and "json" in headers.get("Content-Type", ""),
                  (status, body))
            status, _, body = get("/", cookie="diary_gate=" + "f" * 64)
            check("with the cookie, the app is served", status == 200 and body == "app", (status, body))
            status, _, _ = get("/", cookie="diary_gate=" + "0" * 64)
            check("a wrong cookie is still sent to /gate", status == 303)
            status, headers, _ = get("/gate")
            check("/gate without the password is a 401 and sets no cookie",
                  status == 401 and "Set-Cookie" not in headers, (status, headers))
            status, headers, _ = get("/gate", password="wrong")
            check("a wrong password sets no cookie", status == 401 and "Set-Cookie" not in headers, (status, headers))
            status, headers, _ = get("/gate", password="test-password-123")
            check("the right password sets the cookie and goes home",
                  status == 303 and headers.get("Location") == "/"
                  and headers.get("Set-Cookie", "").startswith("diary_gate=" + "f" * 64), (status, headers))
        finally:
            run("docker", "rm", "-f", name)

print("deploy/demo timer")
timer = (DEMO / "diary-deploy.timer").read_text() if (DEMO / "diary-deploy.timer").exists() else ""
service = (DEMO / "diary-deploy.service").read_text() if (DEMO / "diary-deploy.service").exists() else ""
check("the timer fires every 5 minutes", "OnUnitActiveSec=5min" in timer)
check("the service runs the installed copy, not the checkout it rewrites",
      "/home/ubuntu/diary/bin/deploy-demo.sh --if-changed dev" in service and "/src/" not in service)
```

- [ ] **Step 2: Run to see it fail**

Run: `python3 scripts/deploy-demo.test.py`
Expected: FAIL on "demo-gate.sh writes the gate file" and the timer checks.

- [ ] **Step 3: Write `scripts/demo-gate.sh`**

```bash
#!/usr/bin/env bash
# Writes the live demo's gate (CAP-54): /home/ubuntu/server/diary-gate.caddy,
# imported by diary-site.caddy. Never committed: it holds the password hash
# and the cookie secret. Run ON the box, then validate and reload Caddy by the
# procedure in docs/Deployment.md.
#
#   demo-gate.sh                  asks for the password, makes a new secret
#   demo-gate.sh --out F --hash H --secret S   (tests)
set -euo pipefail

out=/home/ubuntu/server/diary-gate.caddy
hash=""
secret=""
while [ $# -gt 0 ]; do
    case "$1" in
        --out) out="$2"; shift 2 ;;
        --hash) hash="$2"; shift 2 ;;
        --secret) secret="$2"; shift 2 ;;
        *) printf 'Error: unknown option %s\n' "$1" >&2; exit 1 ;;
    esac
done

if [ -z "$hash" ]; then
    read -r -s -p "Demo password: " pw; printf '\n'
    [ ${#pw} -ge 12 ] || { printf 'Error: use at least 12 characters\n' >&2; exit 1; }
    hash="$(docker exec -i server-caddy-1 caddy hash-password --plaintext "$pw")"
fi
[ -n "$secret" ] || secret="$(openssl rand -hex 32)"

umask 027
cat > "$out" <<EOF
# Generated by scripts/demo-gate.sh. Not in git. Changing the secret signs
# everyone out; changing the hash changes the password.
@diary_nogate_api {
	not header Cookie *diary_gate=$secret*
	path /api/* /ai/*
}
@diary_nogate not header Cookie *diary_gate=$secret*
# route, not bare directives: inside handle, Caddy sorts header and redir
# ahead of basic_auth, which hands out the cookie without the password.
handle /gate {
	route {
		basic_auth {
			demo $hash
		}
		header Set-Cookie "diary_gate=$secret; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800"
		redir * / 303
	}
}
EOF
chmod 0640 "$out"
printf '==> wrote %s. The username is "demo".\n' "$out"
```

`chmod 755 scripts/demo-gate.sh`.

- [ ] **Step 4: Write `deploy/demo/site.caddy`**

```caddyfile
# The live demo's public site (CAP-54, ADR #N). Copied on the box to
# /home/ubuntu/server/diary-site.caddy and imported by the server Caddyfile.
# The gate's secret and password hash are in diary-gate.caddy, written by
# scripts/demo-gate.sh and never committed.
diary.darkovski.dev {
	import baseline
	import accesslog
	header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"

	request_body /api/* {
		max_size 101MiB
	}

	# route keeps these in the order written: the gate first, then the refusals,
	# then the app. Nothing reaches diary-web without the cookie.
	route {
		import /srv/server/diary-gate.caddy

		header @diary_nogate_api Content-Type "application/json"
		respond @diary_nogate_api `{"error":{"code":"UNAUTHENTICATED","message":"The demo password is required.","details":{}}}` 401
		redir @diary_nogate /gate 303

		reverse_proxy diary-web:80
	}
}
```

- [ ] **Step 5: Write the timer units and the smoke check**

`deploy/demo/diary-deploy.service`:

```ini
# The live demo's auto-deploy (CAP-54). Installed to /etc/systemd/system.
[Unit]
Description=Deploy the Reflection Diary demo if dev has moved
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=ubuntu
Group=docker
ExecStart=/home/ubuntu/diary/bin/deploy-demo.sh --if-changed dev
```

`deploy/demo/diary-deploy.timer`:

```ini
[Unit]
Description=Check dev for a new demo build every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

`scripts/smoke-demo.sh`:

```bash
#!/usr/bin/env bash
# Checks the live demo from outside (CAP-54). Read-only: it never signs in.
#   scripts/smoke-demo.sh [https://diary.darkovski.dev]
set -euo pipefail
url="${1:-https://diary.darkovski.dev}"
fails=0
expect() {
    local name="$1" want="$2" got="$3"
    if [ "$got" = "$want" ]; then printf '  ok    %s\n' "$name"; else printf '  FAIL  %s (got %s, want %s)\n' "$name" "$got" "$want"; fails=$((fails + 1)); fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

expect "a page without the cookie redirects" 303 "$(code "$url/")"
expect "it redirects to /gate" "$url/gate" "$(curl -s -o /dev/null -w '%{redirect_url}' "$url/")"
expect "the API without the cookie is 401" 401 "$(code "$url/api/v1/auth/me")"
expect "the persona file without the cookie is not served" 303 "$(code "$url/demo/personas.json")"
expect "/gate asks for the password" 401 "$(code "$url/gate")"
expect "HTTPS is enforced" "max-age=31536000; includeSubDomains" \
    "$(curl -sI "$url/gate" | tr -d '\r' | sed -n 's/^[Ss]trict-[Tt]ransport-[Ss]ecurity: //p')"

[ "$fails" -eq 0 ] && printf '\nPassed.\n' || { printf '\n%d failed.\n' "$fails"; exit 1; }
```

`chmod 755 scripts/smoke-demo.sh`.

- [ ] **Step 6: Run the tests**

Run: `python3 scripts/deploy-demo.test.py`
Expected: `All passed.` (with Docker running locally the Caddy section runs; without it, it prints `skip`).

- [ ] **Step 7: Wire it in.** In `.github/workflows/ci.yml`, after the step running `python3 scripts/deploy.test.py`, add:

```yaml
      - name: Live demo deploy (CAP-54)
        run: python3 scripts/deploy-demo.test.py
```

In `run`, beside the `check-host)` case, add:

```bash
    # The live demo's scripts and deploy/demo, against stubs and a local Caddy (CAP-54).
    deploy-demo-test) step python3 scripts/deploy-demo.test.py ;;
```

and one line in the help text next to `check-host`: `${GREEN}./run deploy-demo-test${RESET}            the live demo's deploy rules`.

- [ ] **Step 8: Commit**

```bash
git add deploy/demo scripts/demo-gate.sh scripts/smoke-demo.sh scripts/deploy-demo.test.py .github/workflows/ci.yml run
git commit -m "feat(deploy): the password gate, the 5-minute timer and an outside smoke check (CAP-54)"
```

---

### Task 8: Bring it up on accord, with Jesse

Operational. Every step that writes on the box is said in chat before it runs, and the Caddy steps are done with Jesse watching. Nothing here touches `reflection_diary`.

**Files:** none in the repository. Results are quoted into the PR description.

- [ ] **Step 1: Push the branch so the box can fetch it.** `git push -u origin feat/CAP-54-live-demo`. Move CAP-54 (COA4-124) to In Progress (branch with commits) and say so.

- [ ] **Step 2: Databases and users (Jesse runs, or approves it being run).** On the box, with the root password from where Jesse keeps it:

```bash
ssh accord
docker exec -it mysql mysql -uroot -p
```

```sql
CREATE DATABASE reflection_diary_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE diary_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'diary_demo_app'@'%' IDENTIFIED BY '<generated, 32+ chars>' REQUIRE SSL;
GRANT ALL PRIVILEGES ON reflection_diary_demo.* TO 'diary_demo_app'@'%';
CREATE USER 'diary_ai'@'%' IDENTIFIED BY '<generated, 32+ chars>' REQUIRE SSL;
GRANT ALL PRIVILEGES ON diary_ai.* TO 'diary_ai'@'%';
SHOW GRANTS FOR 'diary_demo_app'@'%';
```

Expected: the grants list only `reflection_diary_demo.*`. Passwords are generated with `openssl rand -base64 33` on the box and go straight into the env files in Step 3, never into chat or git.

- [ ] **Step 3: The box layout and env files**

```bash
mkdir -p /home/ubuntu/diary/{bin,shared/demo}
git clone --quiet https://github.com/theintonerzero/cse3cap.git /home/ubuntu/diary/src
git -C /home/ubuntu/diary/src checkout --quiet feat/CAP-54-live-demo
install -m 755 /home/ubuntu/diary/src/scripts/deploy-demo.sh /home/ubuntu/diary/bin/deploy-demo.sh
install -m 600 /home/ubuntu/diary/src/deploy/demo/api.env.example /home/ubuntu/diary/shared/api.env
```

Fill `APP_KEY` (`openssl rand -base64 32`, prefixed `base64:`) and `DB_PASSWORD` in `shared/api.env` with an editor on the box. Write `shared/deploy.env` (mode 600) with `DIARY_NTFY_URL=https://ntfy.darkovski.dev/<topic Jesse names>` and, if that topic needs it, `DIARY_NTFY_TOKEN`.

- [ ] **Step 4: First deploy, by hand, from the branch**

Run: `/home/ubuntu/diary/bin/deploy-demo.sh feat/CAP-54-live-demo`
Expected: `==> deployed <short>`.

If the migration fails, separate reachability from TLS before changing anything:

```bash
docker run --rm --add-host rddb.darkovski.dev:host-gateway --network server_web busybox nc -zv -w 5 rddb.darkovski.dev 3306
```

- `open` but the migration says "Access denied": TLS or the password, in that order (Runbook: almost never the password). Check `MYSQL_ATTR_SSL_CA=../db/letsencrypt-roots.pem` is in `shared/api.env` exactly, and `docker compose -p diary run --rm diary-api ls -l /app/db/letsencrypt-roots.pem` shows the file.
- `timed out`: the host gateway cannot reach the published 3306 (a firewall rule between the Docker bridge and the host). Stop and ask Jesse whether to give the `mysql` service a network alias `rddb.darkovski.dev` on the `web` network instead. That is his call: it means adding the alias to the server compose file, and applying it needs `docker network disconnect server_web mysql` then `docker network connect --alias rddb.darkovski.dev server_web mysql`, which drops every open database connection for a moment, so the team is told first.

- [ ] **Step 5: First reset, to seed and write the picker's people**

Run: `/home/ubuntu/diary/src/scripts/demo-reset.sh`
Expected: `==> done.`, and `jq length /home/ubuntu/diary/shared/demo/personas.json` prints 4 or more.

- [ ] **Step 6: The gate and the Caddy change (with Jesse; say it in the team channel first)**

```bash
cd /home/ubuntu/server
cp -a Caddyfile "Caddyfile.bak.$(date -u +%Y%m%d-%H%M%S)"
/home/ubuntu/diary/src/scripts/demo-gate.sh
install -m 644 /home/ubuntu/diary/src/deploy/demo/site.caddy diary-site.caddy
printf '\nimport /srv/server/diary-site.caddy\n' >> Caddyfile
docker exec server-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Expected: `Valid configuration`. Only then: `docker exec server-caddy-1 caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`. Then immediately confirm the database certificate is untouched: `openssl s_client -connect rddb.darkovski.dev:3306 -starttls mysql </dev/null 2>/dev/null | openssl x509 -noout -subject -enddate` prints `CN=rddb.darkovski.dev` and a future date. If validate fails: restore the backup, do not reload.

- [ ] **Step 7: The timer**

```bash
sudo install -m 644 /home/ubuntu/diary/src/deploy/demo/diary-deploy.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now diary-deploy.timer
systemctl list-timers diary-deploy.timer
```

Expected: the timer listed with a next run within 5 minutes.

- [ ] **Step 8: Verify from outside, then by eye**

Run (from the laptop): `scripts/smoke-demo.sh`
Expected: `Passed.`

Then open `https://diary.darkovski.dev` with the Playwright browser at 360 px and 1440 px: `/gate` prompts, the password lets you in, the picker shows the seeded people, Jane signs in to her diary home, and the console has no CSP errors. Quote the smoke output and describe the screenshots in the PR.

---

### Task 9: Documents

**Files:**
- Modify: `docs/Deployment.md`
- Modify: `docs/Runbook.md`
- Modify: `docs/Security-Review.md`
- Modify: `README.md` (docs table, only if a new document was added; none is)

- [ ] **Step 1: `docs/Deployment.md`.** Put a new top section, "The live demo (CAP-54, ADR #N)", above the existing content: what is on the box (the layout from Global Constraints), the compose project, the gate, the timer, `freeze`, `deploy-demo.sh <sha>` by hand, `demo-reset.sh`, the Caddy procedure from Task 8 Step 6, and rollback (automatic on a failed health check; by hand `deploy-demo.sh $(cat /home/ubuntu/diary/previous)`, then `demo-reset.sh` if the bad commit migrated). Retitle the existing content "Superseded: the host layout (CAP-26, ADR #45)" with one line saying ADR #N replaced it because the box does not have that layout, and that its files are kept until CAP-26's owner decides.

- [ ] **Step 2: `docs/Runbook.md`.** Add rows: the demo is down (check `systemctl status diary-deploy`, `journalctl -u diary-deploy -n 50`, `docker compose -p diary ps`); freeze for a presentation (`touch /home/ubuntu/diary/freeze`, remove after); reset (`demo-reset.sh`, everyone reloads); change the password or sign everyone out (`demo-gate.sh`, then the validate-and-reload procedure).

- [ ] **Step 3: `docs/Security-Review.md`.** A new dated entry for CAP-54: the gate (cookie secret and bcrypt hash on the box only; `/api` refuses without it); the persona file (seeded tokens reachable only through the gate, `no-store`, rewritten on reset; F15 not reopened because no token is in the bundle, proven by `./run bundle-secrets` with the live flag); the demo database user's grants; what is still exposed (anyone with the password can sign in as any persona and write to the demo database, which a reset undoes).

- [ ] **Step 4: Check and commit**

Run: `python3 scripts/check-docs.py`
Expected: `... passed, 0 failed`

```bash
git add docs/Deployment.md docs/Runbook.md docs/Security-Review.md
git commit -m "docs: the live demo's deploy, runbook and security entry (CAP-54)"
```

---

### Task 10: Verify and hand over

- [ ] **Step 1: The whole floor.** Run: `./run check && ./run e2e && ./run bundle-secrets && python3 scripts/deploy-demo.test.py`. Expected: all pass. Quote the summary lines.
- [ ] **Step 2: Watch one automatic deploy.** Push a trivial docs commit to the branch is not enough (the timer follows `dev`). Instead, after the PR merges, confirm within 10 minutes that `/home/ubuntu/diary/deployed` equals `dev`'s SHA and that ntfy received "deployed". Quote both.
- [ ] **Step 3: Check every CAP-54 acceptance criterion against what exists**, one by one, per `/jira-tickets`, and say how each was checked. Move COA4-124 to In Review when the PR is open with CI green, to Done only after merge and that check.
- [ ] **Step 4: `superpowers:requesting-code-review`, then open the PR into `dev`** with a reviewer requested, the smoke output, and the note that Tony (CAP-26) and the team should read the ADR.
