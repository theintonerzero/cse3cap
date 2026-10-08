# CAP-51 Demo readiness: paste fallback, script truth, rehearsal checklist — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Whoever presents to David Yip can follow `docs/Demo-Script.md` word for word and the app does what it says. The shell's paste fallback finishes its job, and the team has one checklist to rehearse against.

**Architecture:** Two small code fixes in the demo shell. The paste fallback at `/welcome` navigates to My Gigs once a token is in. And the diary's ⋮ menu says **Switch profile** in the shell, so a presenter sees one switch button with one name (Patrick, 8 Oct: "two different login switch buttons is confusing"). The rest is documentation. The script is corrected where the 8 Oct tester pass found it wrong, the dead `./run mock` fallback is replaced by the recorded video, and a rehearsal checklist joins the script.

**Tech Stack:** React 19, Playwright (the `demo-paste` project), Markdown.

**Spec:** The 8 Oct tester pass: findings 3, 4, 5 and 9, and the drafted demo test checklist. Then the team chat of 8 Oct 1:45 pm: Tony timeboxes the shell to today, and if it isn't solid the demo runs with the flag off. Patrick finds the two switch buttons confusing. ADR #60 is the decision this stays inside. Nothing here changes it. Turning the flag off is already how it is used.

## Global Constraints

- On the existing branch `fix/CAP-51-shell-dark-and-radar`, in its worktree, so it lands with PR #118.
- Demo-only code stays behind `demoMode()`. With the flag off, the product is unchanged; the product e2e projects prove it.
- `docs/Demo-Script.md` voice: plain, direct, no em dashes, no semicolons joining clauses (house style for docs).
- `python3 scripts/check-docs.py` stays 251/0 or better, and no new markdown file outside `docs/`.
- Never print a token.
- No attribution lines in commits or the PR.

## Review Focus

1. **The paste fallback at `/`** (AppShell renders the welcome in place when there's no token), not only at `/welcome`. After a paste there, landing on My Gigs is right too.
2. **A rejected token.** `on_done` fires on paste, before `/auth/me` answers. My Gigs must then fall back to `/welcome` (its `no_token` redirect) rather than show an error that strands the presenter.
3. **The script's step numbers.** Moving History into §1 must not break the "steps 1 to 4" references elsewhere in the script.
4. **The CAP-52 note in §2.** It's conditional, so it has to say exactly when it stops applying.

---

### Task 1: The paste fallback lands on My Gigs (RED, then GREEN)

**Files:**
- Modify: `web/e2e/demo/welcome-paste.spec.ts` (append)
- Modify: `web/src/demo/AlumableWelcome.tsx` (the `TokenGate` fallback)

**Interfaces:**
- Consumes: `TokenGate`'s existing `on_done?: () => void`, which is called after `sign_in_with` and after `switch_to`.

- [ ] **Step 1: Write the failing test**

```ts
test('a pasted token at /welcome goes on to My Gigs', async ({ page }) => {
  // After Switch profile on a machine with no personas set up, the paste used
  // to sign in and then sit on /welcome with nothing to say it had worked.
  await page.goto('/welcome');
  await page.getByRole('button', { name: /Student/ }).click();
  await page.getByRole('textbox', { name: 'Paste the student token' }).fill('1|demo-paste');
  await page.getByRole('button', { name: 'Use this token' }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole('heading', { level: 1, name: 'My gigs' })).toBeVisible();
});
```

And a guard for Review Focus 2. It passes before and after, and stays because the fix adds a
navigation that a rejected token must survive:

```ts
test('a rejected pasted token comes back to the picker, saying so', async ({ page, api }) => {
  api.fail('GET /auth/me', { kind: 'error', status: 401, code: 'UNAUTHENTICATED', message: 'Bad token.' });
  await page.goto('/welcome');
  await page.getByRole('button', { name: /Student/ }).click();
  await page.getByRole('textbox', { name: 'Paste the student token' }).fill('1|wrong');
  await page.getByRole('button', { name: 'Use this token' }).click();

  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('alert')).toContainText('That token was rejected');
});
```



- [ ] **Step 2: Watch it fail**

Run: `cd web && npx playwright test --project=demo-paste e2e/demo/welcome-paste.spec.ts`
Expected: the new navigation test FAILS on `toHaveURL`, which is still `/welcome`. The rejected-token guard passes.

- [ ] **Step 3: Navigate on done**

```tsx
        <TokenGate
          mode="screen"
          heading="Reflection Diary demo"
          intro="No profiles are set up on this computer. Paste a seeded token to continue."
          on_done={() => navigate('/home')}
        />
```

- [ ] **Step 4: Watch it pass, with the rest of the demo specs**

Run: `cd web && npx playwright test --project=demo --project=demo-paste`
Expected: all pass, the new one included.

- [ ] **Step 5: Commit**

```bash
git add web/e2e/demo/welcome-paste.spec.ts web/src/demo/AlumableWelcome.tsx
git commit -m "fix(web): the demo's token paste goes on to My Gigs once it signs in (CAP-51)"
```

### Task 2: One switch button, one name (RED, then GREEN)

**Files:**
- Modify: `web/e2e/demo/switch-profile.spec.ts`: the test "inside the diary, the menu's Switch user goes to the profile picker"
- Modify: `web/src/app/AppShell.tsx`: the ⋮ menu's first item, around line 209

**Interfaces:**
- Consumes: `demoMode()`. With the flag off, the product's label stays **Switch user**, and `e2e/switch-user.spec.ts` (product) pins that.

- [ ] **Step 1: The spec expects one name.** Rename the test to `"inside the diary, the menu's Switch profile goes to the profile picker"`, and change its menuitem lookup to `page.getByRole('menuitem', { name: 'Switch profile' })`. Add a test under it, so the old name can't come back beside the new one:

```ts
test('the diary menu has no second "Switch user" in the demo shell', async ({ page }) => {
  await sign_in(page);
  await page.goto(`/gigs/${GIG}`);
  await page.getByRole('button', { name: 'More options' }).click();
  await expect(page.getByRole('menuitem', { name: 'Switch user' })).toHaveCount(0);
});
```

- [ ] **Step 2: Watch it fail.** Run `cd web && npx playwright test --project=demo e2e/demo/switch-profile.spec.ts`. Expected: both FAIL. The first finds no menuitem named "Switch profile", and the second finds one "Switch user".

- [ ] **Step 3: The label follows the shell**

```tsx
                  // CAP-51: in the demo shell the header says "Switch profile",
                  // so the menu says it too: one button, one name (Patrick,
                  // 8 Oct). It goes to the profile picker, whose cards name
                  // each person. The slot sheet cannot: Jane and Noor share
                  // the student slot.
                  label: demoMode() ? 'Switch profile' : 'Switch user',
```

- [ ] **Step 4: Watch it pass, product untouched.** Run `cd web && npx playwright test --project=demo e2e/demo/ && npx playwright test --project=chromium e2e/switch-user.spec.ts e2e/shell.spec.ts`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/e2e/demo/switch-profile.spec.ts web/src/app/AppShell.tsx
git commit -m "fix(web): one switch button, one name: the diary's menu says Switch profile in the demo shell (CAP-51)"
```

### Task 3: The script says what the app does

**Files:**
- Modify: `docs/Demo-Script.md`

Each step below is a replacement. Find the old wording (line wraps may differ), replace it, then reflow the paragraph to about 92 columns like the rest of the file.

- [ ] **Step 1: Pre-flight, the fallback.** Replace the checklist item that begins "A fallback if the network refuses port 3306: the same build against `./run mock`" with:

```markdown
- [ ] A fallback if the network refuses port 3306. First a phone hotspot: check
      `nc -z rddb.darkovski.dev 3306` on it beforehand. Then the recorded walk-through
      video, on the laptop and playable offline. Not `./run mock`: its data is
      generated from the contract, so titles read "string", every profile signs in as
      the same person, and sections 3 and 4 cannot run.
```

- [ ] **Step 2: §1 step 4, Export.** Replace "The whole record downloads as JSON." with:

```markdown
Pick **PDF** or **JSON**, press **Request a PDF export** (or JSON), then **Download** when it
is ready: the whole record, every gig and every sprint, in one file.
```

- [ ] **Step 3: §1 gains History.** After §1 step 4, add:

```markdown
5. **Gig details ›**, then **History**: every submission and assessment on that gig, dated.
   Show it here on Jane: Noor's reflections are still drafts, and a draft has no history yet.
```

- [ ] **Step 4: §2 step 1.** Replace "**History** shows every submission and assessment, dated." with:

```markdown
(Her **History** is empty, because drafts are not events. Section 1 showed it on Jane.)
```

- [ ] **Step 5: §2 step 3, the link.** Replace "add evidence with **Add a link** (any `https://` address)" with:

```markdown
add evidence with **Add a link**: give it a label and any `https://` address, then **Add link**
```

- [ ] **Step 6: §2 step 4, saving.** Replace "4. Do the same for the rest. Saving happens as you go." with:

```markdown
4. Do the same for the rest. Saving happens as you go. Until CAP-52 is merged, let each
   narrative show **Saved** before pressing **Next** or **Submit**, and don't type while a
   score is saving. Both can lose words in the current build. Delete this sentence once
   CAP-52 is on `dev`.
```

- [ ] **Step 7: §2 step 5, the gate.** Replace "the screen says what, jumps to the first competency at fault and highlights every one, instead of failing generically" with:

```markdown
the screen says what and jumps to the first competency at fault, instead of failing
generically. It reports one kind of gap at a time: writing first, then self-scores, then
evidence
```

- [ ] **Step 8: §3 steps 3 and 4.** Replace both steps with:

```markdown
3. Score every competency, one of them below Noor's self-score, and leave that one's comment
   empty. Press **Submit scores**. Nothing is sent: a pop-up names the competency that
   "needs a comment to go with its score", because a lower counter-score has to be
   explained. **Okay** takes you to it. Add the comment.
4. Press **Submit scores** again. With every entry counter-scored, the reflection becomes
   assessed by itself.
```

- [ ] **Step 9: §4, cleaning up.** After step 3 ("Edit a copy"), add:

```markdown
   After a rehearsal, open that copy and press **Delete framework**, so the shared database
   doesn't collect a "La Trobe (n)" for every run. A copy can be deleted until it is assigned.
```

- [ ] **Step 10: The shell's switching paragraph.** Replace "or **Switch user** in the diary's ⋮ menu" with "or **Switch profile** in the diary's ⋮ menu (the same button, by the same name)".

- [ ] **Step 11: Presenting without the shell.** At the end of the "Running it inside the Alumable shell" section, after the paragraph that begins "The wrapper is demo-only and flag-gated", add:

```markdown
### Presenting without it

The shell is a wrapper, not the product, and the demo does not depend on it. If it is not
solid on the day (the team's call, 8 Oct: decide by the end of the rehearsal), turn it off.
Delete the `VITE_DEMO_SHELL=1` line from `web/.env.development.local` and restart
`./run dev`. Nothing else changes: no revert, no rebuild of anything else, and a production
build never had it. The script above then runs exactly as written, from the token prompt,
with Noor in a second tab because she and Jane share the Student slot. To show where the
diary lives inside Alumable, put the Figma frames in the slides before the live demo: the
Home feed's Reflection Diary card, the My gigs sheet, the Learn tab and the Profile's Record
tab (`docs/Design-Inventory.md`, the `host app` rows).
```

- [ ] **Step 12: Check**

Run: `python3 scripts/check-docs.py && grep -n "Save all scores\|downloads\s*as JSON\|run mock\` shows" docs/Demo-Script.md`
Expected: check-docs passes, and the grep prints nothing.

- [ ] **Step 13: Commit**

```bash
git add docs/Demo-Script.md
git commit -m "docs(demo-script): say what the app does: export, history, links, the gate, Submit scores, the fallback (CAP-51)"
```

### Task 4: A rehearsal checklist beside the script

**Files:**
- Modify: `docs/Demo-Script.md` (a new section before "Questions to expect")

- [ ] **Step 1: Add the section**

```markdown
## Rehearsal checklist

Run this end to end at least once before the demo, as Priya R or Tom H for section 2 so
Noor's last empty sprint is kept. Tick it again an hour before.

**Pre-flight**
- [ ] Shell on or off decided (see "Presenting without it"), and everyone presenting knows
      which
- [ ] `dev` pulled, `npm ci` in `web/` and `composer install` in `api/`
- [ ] Port 3306 reachable on the venue network or the hotspot
- [ ] `./run api` and `./run dev` running, and the shell's four personas in
      `web/.env.development.local`
- [ ] Noor (or Priya or Tom) has an empty sprint, using the query above
- [ ] The team has agreed no reseed, no migration and no token revoke on demo day
- [ ] Video on the laptop, browser at 100 % zoom, window at least 1280 wide, theme chosen

**The shell**
- [ ] The picker reads "Reflection Diary demo", with four named cards and the Demo badge
- [ ] Jane's My Gigs: the Reflection Diary card first, then her gigs. Sam's and Dr Lee's:
      shortcuts, and no diary card
- [ ] **Switch profile**, in the header or the diary's ⋮ menu, returns to the picker
- [ ] Dark, from the system or from the diary's menu: no white flash between screens

**Each section**
- [ ] §1: two polygons on the radar, a sprint chip redraws it, SFIA shows seven levels,
      export downloads, History lists events, the back-arrows go gig → diary → My Gigs
- [ ] §2: Start reflection, narrative saved, link added, self-score picked, the gate refuses
      a blank, then Submit names the assessor
- [ ] §3: the reflection is in Sam's queue, the comment rule refuses, Submit scores marks it
      assessed, and Noor's radar then includes it
- [ ] §4: both rubrics read-only, a copy edited and then deleted, Assign shows each gig's rubric

**Failure drills**
- [ ] Network off mid-screen: an error with Retry, and Retry recovers
- [ ] Refresh mid-stepper: the draft is still there
- [ ] Port 3306 refused: the hotspot, then the video
```

- [ ] **Step 2: Check, commit, push**

Run: `python3 scripts/check-docs.py`
Expected: passes.

```bash
git add docs/Demo-Script.md
git commit -m "docs(demo-script): a rehearsal checklist for the client demo (CAP-51)"
git push
```

### Task 5: Verify the branch, update the PR, tell the board

- [ ] **Step 1:** Run `./run lint`, `cd web && npx playwright test` (full suite), `bash scripts/check-tokens.sh`, `node scripts/check-contrast.mjs`, `python3 scripts/check-docs.py` and `bash scripts/check-bundle-secrets.sh`. Expected: all green.
- [ ] **Step 2:** Edit PR #118's body to add: the paste-fallback fix and the one-name switch, each with its RED reason; the script corrections, as a short list; the flag-off section; and the checklist. Re-request Patrick.
- [ ] **Step 3:** CAP-51 (COA4-121) is already Done in Jira. Don't move it. Once #118 merges, add one comment listing what the follow-up changed (Patrick's three points, the two shots-pipeline fixes, this plan's items), with the PR link. Whether follow-ups get their own ticket is Tony's call.

## Not in this plan
- CAP-52, the editor bugs: its own plan, `2026-10-08-cap-52-editor-keeps-every-edit.md`.
- The faded self-score in the assessor view, and "has been notified" (COA4-70's wording). Both wait on Tony.
- An ADR #60 note about the new heading. It goes in the accept-ADRs PR.
