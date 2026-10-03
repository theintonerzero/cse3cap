# CAP-44: verify-app-shell.sh reads an rdiary_ token — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `./run verify-shell`'s live check keeps working when the three seeded tokens are
reissued with ADR #46's `rdiary_` prefix, and a check that runs in CI says so.

**Architecture:** Line 98 of `scripts/verify-app-shell.sh` is the only place in the repository
that pulls a token out of `~/reflection-diary-tokens.txt` by its shape. Every sibling script
pulls it by the person's name and takes the last field. This plan makes the shell check do the
same, through one small function, and adds an offline assertion on that function that runs in
CI, where the live half is skipped.

**Tech Stack:** bash, `grep`, `awk`, `tr`. No new tooling.

**Spec:** COA4-114 (CAP-44 · verify-app-shell.sh cannot read an rdiary_ token: fix before the
reissue). Acceptance criteria, verbatim:
1. The extraction accepts a prefixed token, and still accepts an unprefixed one until the reissue.
2. A grep across `scripts/`, `web/` and `run` for any other token-shape pattern finds none that excludes `_`.
3. Merged before the three tokens are reissued.

Raised by the 2026-10-03 re-verification entry in `docs/Security-Review.md` (PR #95).

**Whose work this is.** The line was written by Patrick for CAP-5 (`24c3e41`, 2026-09-13), when
tokens had no prefix, and it was correct then. What breaks it is CAP-32's ADR #46 (#93, Tony),
so this is that change's follow-up and Tony's to make. No open pull request or branch touches
the file (checked 2026-10-03). Patrick is requested as a reviewer because it is his script.

**What the seeder writes.** `DemoSeeder` prints `sprintf('%-8s %s', $display_name, $token)`, so
each line of the tokens file is a display name, padding and the token, for example
`Jane N   7|rdiary_…`. A token never contains a space. The siblings read it with
`grep 'Jane N' "$TOKENS" | awk '{print $NF}'` (`smoke.sh:116`, `pentest.sh:105`,
`verify-diary-home.sh:123` and others).

## Global Constraints

- Nothing touches the shared database. Do not reissue tokens, run a seeder or mint a token to
  test this. The prefixed case is proved with a fixture line, never a real token.
- No real token is written into the repository, a fixture or a commit. Fixture tokens are
  visibly fake: `7|rdiary_` followed by forty `a` characters.
- The check lives in `scripts/verify-app-shell.sh` itself, where CI already runs its offline
  half (`.github/workflows/ci.yml:296-306` skips only the live half). No check in a scratchpad.
- Behaviour when the file is missing or holds no token for Jane stays a loud skip (`meh`),
  never a failure. The existing message wording stays.

## Review Focus

1. **A tokens file saved with Windows line endings.** `awk '{print $NF}'` keeps the trailing
   `\r`, and the header becomes `Bearer 7|rdiary_…\r`, which answers 401. Expect the `\r` to be
   stripped. Pinned in Task 1.
2. **The file holds both the old and the new token after a reissue**, because the new lines
   were pasted under the old ones. Two matches would put a newline inside the header. Expect
   exactly one token, the last one in the file (the newest). Pinned in Task 1.
3. **No line for Jane at all**, for example a file holding only Sam's token. Expect an empty
   result and the existing skip, not a failure. Pinned in Task 1.
4. **An unprefixed token**, which every developer holds until the reissue. Expect it to be read
   as before. Pinned in Task 1.
5. **Which user the live check signs in as.** The old line took the first token in the file,
   which is Jane's because the seeder prints her first. The fix names Jane explicitly, so the
   check no longer depends on the order. `/auth/me` for Jane carries participations, which the
   check asserts on.

---

## Task 1: Read the token by name, and prove it offline

**Files:**
- Modify: `scripts/verify-app-shell.sh:94-99` (section 3, the token read)
- Test: the same file, a new offline assertion block at the top of section 3

**Interfaces:**
- Produces: `token_for NAME FILE`, a bash function that prints the last token on the lines of
  FILE containing NAME, with any `\r` removed. It prints nothing if FILE is missing or has no
  such line. It is used only inside this script.

- [ ] **Step 1: Write the failing assertion**

At the start of section 3, just after
`say "3. GET /auth/me returns what the nav is built from"`, define the function with the
**current** extraction, so the assertions that follow run against today's behaviour:

```bash
# The token on the last line naming NAME. A token never holds a space, so
# it is the last field. Same read as smoke.sh and pentest.sh, by name and
# not by shape, because ADR #46's rdiary_ prefix changed the shape once.
token_for() {
    [ -f "$2" ] || return 0
    grep -oE '[0-9]+\|[A-Za-z0-9]+' "$2" | head -1
}

fake="$(printf 'a%.0s' $(seq 40))"
fixture="$(mktemp)"
trap 'rm -f "$fixture"' EXIT

expect_token() {
    if [ "$2" = "$3" ]; then ok "token read: $1"; else bad "token read: $1" "got '$2'"; fi
}

printf 'Jane N   7|rdiary_%s\n' "$fake" > "$fixture"
expect_token "prefixed"            "$(token_for 'Jane N' "$fixture")" "7|rdiary_$fake"

printf 'Jane N   7|%s\n' "$fake" > "$fixture"
expect_token "unprefixed"          "$(token_for 'Jane N' "$fixture")" "7|$fake"

printf 'Jane N   7|rdiary_%s\r\n' "$fake" > "$fixture"
expect_token "CRLF line endings"   "$(token_for 'Jane N' "$fixture")" "7|rdiary_$fake"

printf 'Jane N   7|old%s\nSam O    8|rdiary_%s\nJane N   9|rdiary_%s\n' "$fake" "$fake" "$fake" > "$fixture"
expect_token "newest of two"       "$(token_for 'Jane N' "$fixture")" "9|rdiary_$fake"

printf 'Sam O    8|rdiary_%s\n' "$fake" > "$fixture"
expect_token "no line for Jane"    "$(token_for 'Jane N' "$fixture")" ""
```

- [ ] **Step 2: Run it and watch it fail**

Run: `TOKENS=/nonexistent ./run verify-shell`

(`/nonexistent` keeps the live half skipped, so only the offline checks decide the result.)

Expected: FAIL on `prefixed` (got `7|rdiary`), `CRLF line endings` (got `7|rdiary`),
`newest of two` (got `7|old…`) and `no line for Jane` (got `8|rdiary`). `unprefixed` passes.
Quote the output in the PR. This is the red state the ticket describes.

- [ ] **Step 3: Make the function read by name**

Replace the body of `token_for`:

```bash
token_for() {
    [ -f "$2" ] || return 0
    grep -F "$1" "$2" | tr -d '\r' | awk '{print $NF}' | tail -n 1
}
```

And replace the old read, the four lines after `token=''`:

```bash
token=''
if [ -f "$TOKENS" ]; then
    token="$(grep -oE '[0-9]+\|[A-Za-z0-9]+' "$TOKENS" | head -1)"
fi
```

with:

```bash
token="$(token_for 'Jane N' "$TOKENS")"
```

- [ ] **Step 4: Run it and watch it pass**

Run: `TOKENS=/nonexistent ./run verify-shell`
Expected: all five `token read:` lines `ok`, the live check a `skip` reading
`no token in /nonexistent`, and 0 failed.

- [ ] **Step 5: Prove the live half still works with today's unprefixed token**

With the API running from this worktree (`./run api`, reading the shared database, no writes):

Run: `./run verify-shell`
Expected: the `/auth/me carries …` and `a participation carries …` lines all `ok`. This is
criterion 1's "still accepts an unprefixed one", against the real server.

If no server can be started, say so in the PR rather than claim it.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-app-shell.sh
git commit -m "fix(scripts): verify-shell reads the token by name, not by shape (CAP-44)"
```

## Task 2: Prove no other token-shape pattern excludes the underscore

**Files:** none changed, unless the grep finds something.

- [ ] **Step 1: Sweep**

Run:

```bash
git grep -nE '\[0-9\]\+\\?\||\\d\+\\\||\[A-Za-z0-9\]\+' -- scripts web/src web/e2e run run.ps1 api/tests
```

Expected: `scripts/deploy.sh:146` alone, whose class `[A-Za-z0-9_]*` already admits the prefix.
`verify-app-shell.sh` no longer appears. Quote the output in the PR as criterion 2's evidence.

If anything else appears that cannot match `7|rdiary_…`, fix it in this task the same way, by
name and last field, and add it to the commit.

- [ ] **Step 2: Run what CI runs**

Run: `./run lint` and `./run docs`
Expected: both clean. The plan file itself is under `docs/superpowers/plans/`, so `./run docs`
checks it as well.

## Task 3: Hand over

- [ ] **Step 1: Pull request into `dev`**, titled
  `fix(scripts): verify-shell reads an rdiary_ token (CAP-44)`. The body quotes the red output
  from Task 1 Step 2, the green one from Step 4, the live result from Step 5 and the sweep from
  Task 2, says which criterion each proves, and says in bold that it must merge before the
  tokens are reissued. Request Patrick (his script) and one other reviewer.
- [ ] **Step 2: Jira.** Move COA4-114 To Do → In Progress when the branch has its commit, and
  In Progress → In Review once the PR's CI is green, assigning it to Tony as the person doing
  the work. Done only after the merge and after criteria 1 and 2 are each checked against `dev`.
  Criterion 3 is the order of two events: the comment on Done says the tokens had not yet been
  reissued when this merged, or the ticket waits.
- [ ] **Step 3:** In `docs/Security-Review.md`, the CAP-32 entry's sign-off is where the reissue
  is described. Leave a one-line note under the 2026-10-03 re-verification entry's "Two claims
  were wrong" saying CAP-44 fixed the first, in the same PR, so the correction travels with the
  fix. If PR #95 has not merged yet, add the line to that branch instead and say so in both PRs.
