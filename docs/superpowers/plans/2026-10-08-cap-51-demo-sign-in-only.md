# CAP-51 Demo shell becomes a demo sign-in only — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With `VITE_DEMO_SHELL=1` the only difference from the product is a one-click, named profile picker in place of the token gate, styled like the UI update. My Gigs, the Alumable header and bottom bar, the `/welcome` and `/home` routes and the orange brand palette go. Navigation is the product's own.

**Architecture:** `AppShell` already renders the token gate in place when there is no token, and already sends a newly signed-in different person to `/` (the hand-over in `AppShell.tsx` around line 95). So the picker replaces the gate in place, and does not navigate on its own. `/` routes by role (student → diary home, reviewer → review queue). In the shell, Switch user signs out (`leave()`) so the picker appears in place, because the product's slot sheet can't tell Jane from Noor: they share the Student slot. The picker uses the diary's tokens and the section-tint gradient the diary home uses (`AppShell.module.css:216`).

**Tech Stack:** React 19, TypeScript, CSS modules over `web/src/tokens.css`, Playwright (`demo` and `demo-paste` projects).

**Spec:** Patrick's review of PR #118 (8 Oct, issue comment 6051744745), approved by Tony the same day. Keep the profile picker and its look, with the Alumable logo, but use the muted gradient instead of the orange. Roll the rest back to the diary's own navigation and the approved palette. ADR #60 was never accepted. ADR #61 records the narrower decision.

## Global Constraints
- Branch `fix/CAP-51-demo-sign-in-only` off `dev`. PR #118 is closed in favour of this one.
- No raw hex or `NNpx` outside `web/src/tokens.css`. After this change the picker uses only existing diary tokens, and the `[data-brand='alumable']` block is deleted.
- The product (flag off) is unchanged: the product e2e projects pass as they are.
- Demo-only code stays behind `demoMode()`, which is behind `import.meta.env.DEV` (F15). `check-bundle-secrets.sh` stays green.
- Every behaviour change has a Playwright spec that fails first.
- No attribution lines. Never print a token.

## Review Focus
1. **Switch user in the shell.** After `leave()`, the picker shows in place. Picking a different person lands on `/` (hand-over). Picking the same person keeps the URL.
2. **A reviewer's first sign-in at `/`** lands on the review queue. The queue's top-screen back is the product's "Leave the Reflection Diary" button.
3. **The paste fallback** (no personas) signs in in place, exactly like the product gate.
4. **Dark mode:** the picker follows the theme through diary tokens, with no white flash.
5. **`/home` and `/welcome` in the shell are NotFound** (stale bookmarks from rehearsals).

---

### Task 1: Specs for the sign-in-only shell (RED)
**Files:** rewrite `web/e2e/demo/welcome.spec.ts`, `reviewer.spec.ts`, `switch-profile.spec.ts`, `walk.spec.ts`, `contrast.spec.ts`. Adjust `welcome-paste.spec.ts`. Delete `home.spec.ts` and `chrome.spec.ts`. Create `web/e2e/demo/navigation.spec.ts`.
- welcome: the logo, the heading "Reflection Diary demo", and "not a real Alumable sign-in". One click as Jane lands on the diary home (h1 "Reflection Diary") at `/`. From signed out it stays there.
- reviewer: picking Sam lands on `/review-queue`. Its top-screen back is the button "Leave the Reflection Diary". There is no "Back to My Gigs".
- switch-profile: Jane on `/gigs/:id` → ⋮ → **Switch user** → the picker (with Noor's card) in place → pick Noor → `/` with "Noor A" in the header.
- navigation: `/home` and `/welcome` render NotFound in the shell. A gig's back-arrow is "Back to Reflection Diary" and lands on the diary home.
- contrast: the picker's text meets AA in light and dark. Its background is the section-tint gradient (computed `background-image` contains `linear-gradient`). No `[data-brand]` element exists.
- walk: signed out → picker → Jane → diary home → gig → back → diary home.
- welcome-paste: the fallback paste at `/` signs in in place.
- [ ] Write them. Run `npx playwright test --project=demo --project=demo-paste` and see each new expectation fail on the current shell. Commit `test(e2e): the demo shell is a sign-in only (CAP-51, red)`.

### Task 2: Remove My Gigs, the chrome, the demo routes and the brand palette (GREEN)
**Files:**
- `web/src/app/routes.tsx`: drop the `welcome` and `home` routes and their imports. The index is `<Home />`.
- `web/src/app/AppShell.tsx`: drop the demo back-arrow branch (`/home`). Switch user in the shell is `leave()` only. Update the comments.
- `web/src/demo/AlumableWelcome.tsx`: drop `navigate`, picking only signs in, and drop `data-brand`. Keep the heading and the not-real line.
- `web/src/demo/AlumableWelcome.module.css`: diary tokens. The background is `linear-gradient(to bottom, var(--section-tint-diary) 0, var(--color-bg) 20rem) no-repeat, var(--color-bg)`. Cards use `--color-surface`, `--color-border` and `--shadow-card`. Text uses `--color-text` and `--color-text-muted`. Hover and focus use `--color-primary` and `--color-focus-ring`.
- Delete `AlumableHome.*`, `AlumableChrome.*`, and any logo asset no longer imported.
- `web/src/tokens.css`: delete the `[data-brand='alumable']` block and its comment.
- `web/src/demo/demoMode.ts`: update the comment.
- [ ] Implement. Then run `tsc`, the demo and product e2e projects, `check-tokens`, `check-contrast` and `check-bundle-secrets`. Commit.

### Task 3: The screenshot pipeline ignores the shell
- [ ] `web/playwright.shots.config.ts`: blank `VITE_DEMO_SHELL` and `VITE_DEMO_TOKENS` (carried over from #118's 41fc970; the manifest exclusion is no longer needed because the routes are gone). Prove it with a shots run on a machine with the shell on: the Sign in shot is the product's gate. Commit.

### Task 4: Docs
- [ ] ADR #61, "The demo shell is a sign-in only". It supersedes the scope of #60 (still Proposed): context is Patrick's review, decision as above, honest negatives, and the alternatives "keep My Gigs" and "flag off entirely".
- [ ] `docs/Demo-Script.md`: start from #118's corrected script, which carries the export, History, link, gate and Submit scores corrections, the fallback, the checklist and "Presenting without it". Rewrite the shell section for picker-only: picking a profile opens where the product would, and Switch user (⋮) shows the picker again. Remove every My Gigs, Demo badge and diary-card line from the shell section and the checklist.
- [ ] `check-docs` passes. Commit.

### Task 5: Verify, review, PR
- [ ] Full e2e, guards, a look at the picker at 390 and 1280 in both themes, a fresh reviewer, then a PR with Patrick requested. Close #118 with a pointer.
