# Alumable demo shell (CAP-51) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the finished Reflection Diary in a thin, flag-gated Alumable-branded demo harness — a "Sign in with Alumable" welcome and a "My Gigs" home over the diary's real data — so it demos as a feature inside Alumable.

**Architecture:** A `demoMode()` flag (`VITE_DEMO_SHELL=1`) swaps the app's entry: the no-token state renders `AlumableWelcome` instead of `TokenGate`, and a new top-level `/home` route renders `AlumableHome` from `GET /gigs`, each card linking into the existing `gigs/:gig_id` diary flow. The surround carries its own Alumable chrome and brand tokens; once inside a gig the diary keeps its own shell unchanged. No backend, schema, or contract change.

**Tech Stack:** React 19 + TypeScript + Vite, react-router, the generated typed API client (`web/src/api/client.ts`), CSS-variable tokens (`web/src/tokens.css`), Playwright e2e against `web/e2e/fake-api.ts` (ADR #42).

**Spec:** `docs/superpowers/specs/2026-10-07-alumable-demo-shell-design.md`

## Global Constraints

- The product path is untouched: with `VITE_DEMO_SHELL` unset (the default and every production build), the app is exactly today's diary (`TokenGate` entry, no `/home`). Copied verbatim from the spec: "Off (the default, and every production build): the app is exactly today's diary."
- No change to `db/01-schema.sql`, `docs/openapi.yaml`, `web/src/api/schema.ts`, or any `api/` service, policy, request, or existing diary screen behaviour.
- No raw hex or magic pixel value outside `web/src/tokens.css` — `scripts/check-tokens.sh` fails the build otherwise. Alumable brand values go in `tokens.css` under a scoped selector.
- Every screen ships four states: loaded, loading (skeletons, not spinners), empty, error.
- No component calls `fetch`, parses a response body, or declares its own response interface — every call goes through `api.*` in `web/src/api/client.ts`.
- No seeded Sanctum token in committed source or the production bundle. Demo tokens come only from a git-ignored env (`VITE_DEMO_TOKENS`); absent it, the welcome falls back to a skinned paste.
- snake_case in JSON and frontend types; the fields used here are exactly `org_name`, `starts_on`, `ends_on`, `my_role`, `sprints`, `framework`, `reflection_summary` (`{ draft, submitted, assessed }`) from `components['schemas']['Gig']`.

## Review Focus

- **Flag off leaves the product intact.** No `VITE_DEMO_SHELL` → `/` is the diary, `/welcome` and `/home` are `NotFound`, `TokenGate` is the entry. Pinned by the whole existing suite (it runs with the flag off) plus Task 3's explicit `NotFound` assertion.
- **`VITE_DEMO_TOKENS` absent in demo mode.** Welcome must still work — fall back to the skinned paste rather than render dead persona cards. Pinned in Task 1.
- **A persona on no gigs.** `/home` must show the empty state, not a crash or a blank list. Pinned in Task 2.
- **`GET /gigs` slow / failing.** `/home` shows skeletons then an `ErrorNotice` with retry, never a spinner or a silent empty list. Pinned in Task 2.
- **Null gig fields.** `org_name`, `starts_on`, `ends_on` are nullable in the contract; a card with nulls must render (omit the line) rather than print "null". Pinned in Task 2.

---

## File structure

- `web/src/demo/demoMode.ts` — the flag and the persona reader (pure, no React).
- `web/src/demo/assets/` — `alumable-horizontal.png`, `alumable-circle.png`, `alumable-icon.png` (Alumable's logo files, used with the client's permission).
- `web/src/demo/AlumableWelcome.tsx` + `.module.css` — the sign-in.
- `web/src/demo/AlumableHome.tsx` + `.module.css` — My Gigs.
- `web/src/demo/AlumableChrome.tsx` + `.module.css` — header + cosmetic bottom nav wrapping the surround.
- `web/src/tokens.css` — add `[data-brand="alumable"]` block (modify).
- `web/src/app/AppShell.tsx` — no-token branch renders welcome in demo mode (modify, ~line of the `no_token` return).
- `web/src/app/routes.tsx` — register `/home` when `demoMode()`; index redirects to `/home` in demo mode (modify).
- `web/src/app/diary-return.ts` — demo-mode return target is `/home` (modify).
- `web/playwright.config.ts` — second `webServer` on :5176 with the flag on, and a `demo` project; `chromium`/`firefox` projects `testIgnore` `**/demo/**` (modify).
- `web/e2e/demo/*.spec.ts` — the demo specs.
- `web/.env.example` — document `VITE_DEMO_SHELL`, `VITE_DEMO_TOKENS` (create/modify).
- `docs/adr/architecture-decision-records.md` — ADR #60 (modify, via /write-adr).
- `docs/Demo-Script.md`, `README.md`, `web/README.md` — note the shell (modify).

---

### Task 1: Demo flag, brand, assets, and the Alumable welcome (`/welcome`)

Scaffolding (flag module, brand tokens, assets, the second Playwright server) is folded in here because the welcome screen is the first deliverable that needs all of it.

**Files:**
- Create: `web/src/demo/demoMode.ts`, `web/src/demo/AlumableWelcome.tsx`, `web/src/demo/AlumableWelcome.module.css`, `web/src/demo/assets/alumable-horizontal.png` (+ `-circle.png`, `-icon.png`)
- Modify: `web/src/tokens.css`, `web/src/app/AppShell.tsx`, `web/playwright.config.ts`, `web/.env.example`
- Test: `web/e2e/demo/welcome.spec.ts`

**Interfaces:**
- Produces:
  - `demoMode(): boolean` — `import.meta.env.VITE_DEMO_SHELL === '1'`.
  - `type DemoPersona = { id: string; name: string; role_hint: string; slot: SlotId; token: string }` where `SlotId` is imported from `web/src/session/tokens.ts`.
  - `demoPersonas(): DemoPersona[]` — parses `import.meta.env.VITE_DEMO_TOKENS` (JSON array of `{id,name,role_hint,slot,token}`); returns `[]` on absent/invalid, wrapped in try/catch.
- Consumes: `sign_in_with(slot, token)` from `useSession()`; `SlotId` from `session/tokens.ts`.

- [ ] **Step 1: Write the failing test** — `web/e2e/demo/welcome.spec.ts`

```ts
import { test, expect } from '../fixtures.ts';

test('welcome shows Alumable branding and signs a persona in', async ({ page, api }) => {
  await page.goto('/welcome');
  await expect(page.getByRole('img', { name: /alumable/i })).toBeVisible();
  // Persona cards come from VITE_DEMO_TOKENS (set on the demo webServer).
  await page.getByRole('button', { name: /Jane N/ }).click();
  // One-click sign-in lands on the Alumable home.
  await expect(page).toHaveURL(/\/home$/);
  expect(api.calls.some((c) => c.route === 'GET /auth/me')).toBe(true);
});

test('with no demo tokens, welcome falls back to a skinned paste', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __NO_DEMO_TOKENS__?: boolean }).__NO_DEMO_TOKENS__ = true;
  });
  await page.goto('/welcome');
  await expect(page.getByText(/paste/i)).toBeVisible();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx playwright test e2e/demo/welcome.spec.ts --project=demo`
Expected: FAIL — `/welcome` is not routed / `demo` project does not exist yet.

- [ ] **Step 3: Add the flag module** — `web/src/demo/demoMode.ts`

```ts
import type { SlotId } from '../session/tokens.ts';

export function demoMode(): boolean {
  return import.meta.env.VITE_DEMO_SHELL === '1';
}

export interface DemoPersona {
  id: string;
  name: string;
  role_hint: string;
  slot: SlotId;
  token: string;
}

export function demoPersonas(): DemoPersona[] {
  try {
    const raw = import.meta.env.VITE_DEMO_TOKENS;
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DemoPersona[]) : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Add the brand tokens** — in `web/src/tokens.css`, append a scoped block (real sampled values; no hex escapes the file):

```css
/* Alumable demo shell only (CAP-51). Scoped so the diary's own tokens are
 * untouched; the brand orange is the Alumable wordmark, sampled #FFA33C. */
[data-brand='alumable'] {
  --brand-primary: #ffa33c;
  --brand-on-primary: #ffffff;
  --brand-surface: #fff8f0;
  --brand-ink: #2b2233;
}
```

- [ ] **Step 5: Drop in the assets** — copy Alumable's three logo PNGs into `web/src/demo/assets/` as `alumable-horizontal.png`, `alumable-circle.png` and `alumable-icon.png`.

- [ ] **Step 6: Build `AlumableWelcome.tsx`** — logo + one card per `demoPersonas()`; on click `sign_in_with(persona.slot, persona.token)` then `navigate('/home')`. When `demoPersonas()` is empty (or `window.__NO_DEMO_TOKENS__`), render the existing `TokenGate` (`mode="screen"`) dressed with the Alumable header. Wrapper element carries `data-brand="alumable"`. All colour via the brand tokens; no `fetch`, no raw hex.

- [ ] **Step 7: Wire the entry** — in `web/src/app/AppShell.tsx`, the `no_token` branch returns `demoMode() ? <AlumableWelcome /> : <TokenGate mode="screen" />`. Import `AlumableWelcome` and `demoMode`.

- [ ] **Step 8: Add the demo Playwright server + project** — in `web/playwright.config.ts`: a second `webServer` (port 5176, `--strictPort`) with env `{ VITE_API_BASE_URL: <5176 origin>/api/v1, VITE_API_TOKEN: '', VITE_DEMO_SHELL: '1', VITE_DEMO_TOKENS: '<JSON array of four personas with placeholder tokens the fake ignores> }`; a `demo` project with `baseURL` on :5176, `testMatch: ['**/demo/**']`; add `'**/demo/**'` to the `chromium` and `firefox` `testIgnore` lists. Document `VITE_DEMO_SHELL`/`VITE_DEMO_TOKENS` in `web/.env.example`.

- [ ] **Step 9: Run the test and watch it pass**

Run: `cd web && npx playwright test e2e/demo/welcome.spec.ts --project=demo`
Expected: PASS (both cases).

- [ ] **Step 10: Guard the product path** — confirm the existing suite still passes (it runs flag-off): `./run e2e`. Expected: PASS, unchanged.

- [ ] **Step 11: Commit**

```bash
git add web/src/demo web/src/tokens.css web/src/app/AppShell.tsx web/playwright.config.ts web/.env.example web/e2e/demo/welcome.spec.ts
git commit -m "feat(web): Alumable demo welcome behind VITE_DEMO_SHELL (CAP-51)"
```

---

### Task 2: My Gigs home (`/home`)

**Files:**
- Create: `web/src/demo/AlumableHome.tsx`, `web/src/demo/AlumableHome.module.css`
- Modify: `web/src/app/routes.tsx`
- Test: `web/e2e/demo/home.spec.ts`

**Interfaces:**
- Consumes: `api.get('/gigs')` → `components['schemas']['Gig'][]`; `demoMode()`.
- Produces: route `/home` → `<AlumableHome />`, registered only when `demoMode()`; each gig card is a `<Link to={`/gigs/${gig.id}`}>`.

- [ ] **Step 1: Write the failing test** — `web/e2e/demo/home.spec.ts`, four states:

```ts
import { test, expect } from '../fixtures.ts';

test('home lists the gigs as Alumable cards and opens one', async ({ page, api }) => {
  await page.goto('/home');
  const card = page.getByRole('link', { name: /Develop AI use cases/ });
  await expect(card).toBeVisible();
  await expect(page.getByText(/Alumable/)).toBeVisible();          // org_name
  await card.click();
  await expect(page).toHaveURL(/\/gigs\//);                        // into the diary
});

test('home shows the empty state for a persona on no gigs', async ({ page, api }) => {
  api.setGigs([]);                                                 // fixture helper
  await page.goto('/home');
  await expect(page.getByText(/no gigs yet/i)).toBeVisible();
});

test('home skeletons while gigs load, then errors with retry', async ({ page, api }) => {
  api.fail('GET /gigs', { kind: 'status', status: 500, code: 'SERVER_ERROR', message: 'x' });
  await page.goto('/home');
  await expect(page.getByRole('button', { name: /try again/i })).toBeVisible();
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx playwright test e2e/demo/home.spec.ts --project=demo`
Expected: FAIL — `/home` not routed. (If `api.setGigs` is missing, add it to `web/e2e/fake-api.ts` as a one-line setter over the existing `gigs` array; this is test infrastructure, not a backend rule.)

- [ ] **Step 3: Build `AlumableHome.tsx`** — the `Load = loading | error | loaded` union pattern from `DiaryHome.tsx`: `useEffect` with an `AbortController` calling `api.get('/gigs', { signal })`; `loading` → card skeletons (`Skeleton`/`SkeletonGroup`); `error` → `ErrorNotice` with retry (`reload_key` state); `loaded` with `gigs.length === 0` → empty state "No gigs yet"; otherwise one card per gig. Each card: `org_name` (omit line if null), `title`, a dates line from `starts_on`/`ends_on` (omit if null), a `my_role` `Badge`, and a `ProgressBar` from `reflection_summary` (`assessed / (draft+submitted+assessed)`). Card is a `Link` to `/gigs/${gig.id}`. Wrapper carries `data-brand="alumable"`. Colour via brand tokens; no raw hex; no `fetch`.

- [ ] **Step 4: Register the route** — in `web/src/app/routes.tsx`, add, guarded by `demoMode()` (so it is `NotFound` in production), a top-level `/home` route rendering `<AlumableHome />` **outside** the `AppShell` nested route, so the Alumable chrome (Task 3) frames it rather than the diary header.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cd web && npx playwright test e2e/demo/home.spec.ts --project=demo`
Expected: PASS (all three).

- [ ] **Step 6: Commit**

```bash
git add web/src/demo/AlumableHome.tsx web/src/demo/AlumableHome.module.css web/src/app/routes.tsx web/e2e/demo/home.spec.ts web/e2e/fake-api.ts
git commit -m "feat(web): Alumable My Gigs home from GET /gigs (CAP-51)"
```

---

### Task 3: Alumable chrome, index redirect, and return-to-home

**Files:**
- Create: `web/src/demo/AlumableChrome.tsx`, `web/src/demo/AlumableChrome.module.css`
- Modify: `web/src/demo/AlumableWelcome.tsx`, `web/src/demo/AlumableHome.tsx` (wrap in chrome), `web/src/app/routes.tsx` (index redirect), `web/src/app/diary-return.ts` (return target)
- Test: `web/e2e/demo/chrome.spec.ts`

**Interfaces:**
- Produces: `<AlumableChrome>{children}</AlumableChrome>` — header with the horizontal logo + a bottom nav (Gigs active; Chat, Profile present and `disabled`). Wraps `/welcome` and `/home`.
- Consumes: `demoMode()`.

- [ ] **Step 1: Write the failing test** — `web/e2e/demo/chrome.spec.ts`:

```ts
import { test, expect } from '../fixtures.ts';

test('the Alumable chrome frames home and back from a gig returns to it', async ({ page }) => {
  await page.goto('/home');
  await expect(page.getByRole('navigation', { name: /alumable/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /chat/i })).toBeDisabled();
  await page.getByRole('link', { name: /Develop AI use cases/ }).click();
  await expect(page).toHaveURL(/\/gigs\//);
  await page.goBack();
  await expect(page).toHaveURL(/\/home$/);
});

test('in demo mode the index redirects to /home', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/home$/);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd web && npx playwright test e2e/demo/chrome.spec.ts --project=demo`
Expected: FAIL — no chrome nav; `/` does not redirect.

- [ ] **Step 3: Build `AlumableChrome.tsx`** — a `<nav aria-label="Alumable">` header with the logo and a bottom tab bar; Gigs links `/home`, Chat and Profile are `<button disabled>`. Wrap the render of `AlumableWelcome` and `AlumableHome` in `<AlumableChrome>`.

- [ ] **Step 4: Index redirect** — in `routes.tsx`, when `demoMode()`, the index element is `<Navigate to="/home" replace />` instead of `<Home />`. Leave the non-demo `Home()` exactly as is.

- [ ] **Step 5: Return target** — in `web/src/app/diary-return.ts`, when `demoMode()`, the top-level diary "up"/leave destination is `/home` rather than the token screen. Keep the non-demo path unchanged.

- [ ] **Step 6: Run the tests and watch them pass**

Run: `cd web && npx playwright test e2e/demo/chrome.spec.ts --project=demo`
Expected: PASS (both).

- [ ] **Step 7: Guard the product path again** — `./run e2e` (flag off). Expected: PASS, unchanged (index still goes to the diary; `/home` and `/welcome` are `NotFound`).

- [ ] **Step 8: Commit**

```bash
git add web/src/demo/AlumableChrome.tsx web/src/demo/AlumableChrome.module.css web/src/demo/AlumableWelcome.tsx web/src/demo/AlumableHome.tsx web/src/app/routes.tsx web/src/app/diary-return.ts web/e2e/demo/chrome.spec.ts
git commit -m "feat(web): Alumable chrome, index redirect and return-to-home (CAP-51)"
```

---

### Task 4: ADR, docs, and the run-it recipe

**Files:**
- Modify: `docs/adr/architecture-decision-records.md` (ADR #60, via /write-adr), `docs/Demo-Script.md`, `README.md`, `web/README.md`

- [ ] **Step 1: Write ADR #60** — load the `/write-adr` skill and follow its format. Content: "Alumable demo shell is a flag-gated demo harness, not product scope. It adds a branded sign-in and a My Gigs home over the diary's real data; it reconstructs no Alumable feature and changes no schema/contract. Gated by `VITE_DEMO_SHELL`; off in every production build. Alumable brand assets are used under the client's permission for this demo only. This does not reverse ADR #15 (no product login) — the demo sign-in stands in for Alumable's identity exactly as the seeded tokens already do." Add the ToC line and the full entry.

- [ ] **Step 2: Demo-Script note** — in `docs/Demo-Script.md`, add a short "Running it inside the Alumable shell" note: set `VITE_DEMO_SHELL=1` and `VITE_DEMO_TOKENS` in `web/.env.local`, run `./run dev`, open `/`, and the demo starts at the Alumable sign-in; the existing script then proceeds unchanged once a persona is chosen.

- [ ] **Step 3: README** — add the spec and this plan to the docs table if the table lists specs/plans; note the `VITE_DEMO_SHELL` flag in `web/README.md` beside the other env vars. Confirm `web/.gitignore` (or the repo root `.gitignore`) ignores `web/.env.local` so real tokens never commit; add the line if missing.

- [ ] **Step 4: Verify docs** — run the docs/location guard and any link check: `./run verify` (or the docs check it wraps). Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/adr/architecture-decision-records.md docs/Demo-Script.md README.md web/README.md web/.gitignore
git commit -m "docs: ADR #60 and demo-shell run recipe (CAP-51)"
```

---

## Self-review

**Spec coverage:** flag isolation → Task 1 (flag module, AppShell entry) + Task 2/3 (`demoMode()` guards) + Review Focus line 1. Welcome + one-click/paste fallback → Task 1. My Gigs from `GET /gigs` + four states → Task 2. Chrome + return-to-home + index redirect → Task 3. ADR + brand-asset note + run recipe → Task 4. Playwright coverage → Tasks 1–3. No backend/schema/contract change → Global Constraints, enforced by `./run e2e` flag-off checks in Tasks 1 and 3. All spec sections map to a task.

**Placeholder scan:** no TBD/TODO; every code step has real code; the one "follow /write-adr" step is a documented skill handoff, not a placeholder, and names the exact ADR content.

**Type consistency:** `DemoPersona`/`demoPersonas`/`demoMode` defined in Task 1 and consumed by the same names in Tasks 2–3; `SlotId` imported from `session/tokens.ts`; `Gig` fields match `components['schemas']['Gig']` verbatim; `api.get('/gigs')` matches the client surface; `api.fail` / `api.calls` / `api.setGigs` match `web/e2e/fake-api.ts` (the first two exist; `setGigs` is added in Task 2 Step 2).

**Review Focus:** flag-off (line 1) → Tasks 1/3 flag-off runs + Task 2 `demoMode()` NotFound; missing demo tokens (line 2) → Task 1 fallback test; empty gigs (line 3) → Task 2 empty-state test; slow/failing `GET /gigs` (line 4) → Task 2 error test; null gig fields (line 5) → Task 2 Step 3 renders nullable fields by omission (add an assertion there if a card with null `org_name`/dates is in the fixture). All five covered.
