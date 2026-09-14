# Sequencing plan: Tony's remaining tickets

**Date:** 2026-09-08
**Owner:** Tony To
**Status:** Live. Phases 0 to 3 are actionable now; phase 4 is gated on other people.

Not an implementation plan for one ticket, which is what
`docs/superpowers/plans/` otherwise holds. This is a sequencing plan across a board, written
because four of seven remaining items are unblocked and three are waiting on other people,
and the order those are tackled in decides whether the waiting costs anything.

## Where the board stands

Merged to `dev` as of `2407e94`: CAP-4, CAP-10 (#19), CAP-19 (#17), CAP-24's token half
(#24), CAP-26's design (#23), and the review-policy correction (#25).

| Item | Blocked by | Whose |
| --- | --- | --- |
| F1 token-leak fix | — | Tony |
| Documentation drift | — | Tony |
| CAP-19 acceptance audit | — | Tony |
| CAP-20 finish | Jane's token | Tony |
| CAP-10 follow-up | CAP-5 (done) | Patrick |
| CAP-26 build | SSH and DNS | Jesse |
| CAP-24 injection half | CAP-13, CAP-16 | Patrick, unassigned |

## The ordering principle

Anything with a human on the other end goes first, because its latency cannot be
compressed. Local work fills the wait. Nothing gets started that cannot be finished.

---

## Phase 0 · Fire the asks. Before any code

**0.1 Jesse: SSH and DNS.** CAP-26 §9.1 and §9.4. An SSH user on the VPS carrying
`id_ed25519.pub` — read-only is enough to close §9.3, sudo later for the Caddy site block
and the php-fpm pool — and an A record for `diary.darkovski.dev`. Mention that ADR #21
records the Caddy on that box issuing the certificate MySQL serves, so the change wants his
eyes.

**0.2 Standup: who owns the framework screens.** CAP-5 is done — Patrick built it after it
was reassigned from Andrew, who does not write code. The same correction left **CAP-15 and
CAP-16 unassigned**, and they gate CAP-24. The question for standup is who picks them up,
not why they are late.

**0.3 Jira.** CAP-4 done. CAP-10 and CAP-19 done with their follow-ups raised separately.
CAP-20, CAP-24 and CAP-26 stay open with blockers named. **CAP-24 must not be closed**: its
injection half is genuinely undone and `docs/Security-Review.md` says so.

## Phase 1 · F1 — **done, PR #28**

Sequenced ahead of CAP-20 on the reasoning that its deadline belonged to someone else. That
reasoning held, and the deadline turned out to have already passed.

The prediction was that F1 goes live when CAP-5 lands. Wrong ticket: **CAP-10 did it**, when
#19 merged earlier the same day. `web/src/screens/ReviewQueue.tsx:14` imports `api` rather
than only `ApiError`, which pulls the whole request path, and CAP-10 gave it a
`review-queue.html` build entry, so it ships. A production build from `dev` at `a0a6c79` put
a bearer token in `assets/components-*.js`.

The lesson is worth more than the fix: a finding whose severity depends on somebody else's
merge should be fixed when it is found, not scheduled against a date you do not control.

Fixed by gating the seed behind `import.meta.env.DEV`, which is statically `false` in a
production build, and held there by `scripts/check-bundle-secrets.sh` — confirmed to fail
against the vulnerable client and pass against the fixed one, and wired into `./run check`.

In `web/src/api/client.ts`:

```ts
let authToken: string | null = import.meta.env.DEV
  ? (import.meta.env.VITE_API_TOKEN ?? null)
  : null;
```

`import.meta.env.DEV` is `false` in any production build, so the branch and the value are
eliminated before the bundle is written. Add a check in `scripts/` that greps a production
build for a bearer-token shape and wire it into `./run`, so it is a check the team has
rather than a rule someone remembers. Full finding in `docs/Security-Review.md`.

## Phase 2 · Close CAP-20

The only ticket that can move to done without another person. Jane's token into
`~/reflection-diary-tokens.txt`, then `./run swap`, then read the output rather than assume
it, then the verification note carrying the five findings already recorded in `d0a22c0`'s
message, then a PR.

The note has to say plainly what was not proven. The ticket's premise does not hold, and a
verification that quietly claims more than it tested is worse than none.

## Phase 3 · Correctness debt, while waiting

**3.1 Documentation drift.** `README.md`'s status table still says the frontend is "scaffold
only, renders the word `test`, no screens built", which is false: ten components, a gallery
and a merged review queue. In `docs/Stack-and-Build-Scope.md`, `tokens.css` (143), core
components (145) and the review queue (169) are still unticked, and §4.4's policies row is
still `[~]` after CAP-19 landed.

**3.2 CAP-19 acceptance audit.** The criterion is "every row of the permission matrix has a
policy method behind it" with "a feature test per row, including the negative case". Twelve
policy methods exist across four policies and the API reference carries a per-endpoint role
table, but nobody has walked one against the other — that was the review #17 merged without.

## Phase 4 · Gated. Prepare, do not start

**CAP-26.** When Jesse answers: `./run check-host <target>`, close §9, and only then write
the implementation plan. The spec is explicit that it is not plan-ready until §9 closes.

**CAP-10 follow-up.** About an hour on the day CAP-5 lands. Scope is deleting
`web/review-queue.html` and `web/src/review-queue-dev.tsx`, reverting the multi-entry
`vite.config.ts`, and mounting `ReviewQueue` on the router.

**CAP-24 injection half.** Nothing to do until CAP-13 and CAP-16 exist. Reviewing an empty
frontend produces a clean result that means nothing.

---

## The dependency chain

Taken from the `Depends on` lines in `docs/jira/`, not from memory. Everything Tony still
owns is either free of dependencies or sits behind CAP-5.

```
DONE  CAP-2 typed client ─┐
DONE  CAP-3 components ───┤
DONE  CAP-4 components ───┼─→ CAP-5  app shell        DONE (Patrick, #30)
DONE  CAP-6 RadarPanel ───┘        │
DONE  CAP-10 review queue ──┐      │
                            │      ├─→ CAP-11 stepper      Amenah  ─┐
                            └──────┼──────────────────────→ CAP-13  Patrick ─┐
                                   │                                          ├─→ CAP-24
                                   └─→ CAP-15 select fw  UNASSIGNED           │   injection
                                            │                                 │   half
                                            └─→ CAP-16 edit fw  UNASSIGNED ───┘

Jesse: SSH + DNS ─→ CAP-26 build                     (independent of everything above)
```

### What has to happen before each of Tony's remaining items

| Item | Needs first | Owner | Depth |
| --- | --- | --- | --- |
| CAP-20 screenshot | nothing | Tony | 0 |
| CAP-19 acceptance audit | nothing | Tony | 0 |
| Documentation drift | nothing | Tony | 0 |
| CAP-10 follow-up | CAP-5 (done, Patrick) | — | 0 |
| CAP-26 build | SSH + DNS, then §9.2 | Jesse, then team | 1 |
| **CAP-24 injection half** | **CAP-11 → CAP-13** *and* **CAP-15 → CAP-16** | Amenah, Patrick, **and whoever takes 15/16** | **2, twice** |

### The two things this makes obvious

**CAP-24 is the last thing Tony can finish, and it needs two chains to complete, not one.**
It requires CAP-13 *and* CAP-16, which sit at the end of separate chains. CAP-5 rooted both
and is now done, so the depth is two rather than three — but CAP-16's chain starts at an
unassigned ticket, which is not obviously better than a blocked one. Nothing Tony does
shortens either.

**Four screen tickets were assigned to somebody who does not write code.** CAP-5, CAP-8,
CAP-15 and CAP-16 went to Andrew, who is the team's cybersecurity member rather than a
developer. That is a planning error made when the board was filled, not a person
underdelivering, and it is why CAP-5 sat unstarted long enough to gate everything behind it.

The board has already corrected most of it, which the repository's csv files do not show:
live Jira has CAP-5 and CAP-8 reassigned to Patrick, and **CAP-15 and CAP-16 unassigned**.
Andrew's four live issues are all non-development work — personas, a usability walkthrough,
a trade-show deck — which is the right shape for him.

So the thing that most determines whether the remaining board lands is not a person. It is
that **CAP-15 and CAP-16, thirteen points of framework screens, are owned by nobody**, and
unowned work does not get done by waiting for it. Chasing an assignee who was never the
right assignee wastes the chase.

### What this changes about the order

Nothing in phases 0 to 3, which are all zero-depth. It changes what to do when they run out:
**do not wait on CAP-24.** Take CAP-5 if it is still unstarted, because it is the one piece
of work that shortens every remaining chain at once, including the two that end at Tony's
last ticket.

CAP-26 is the exception and the opportunity: it depends on nobody in the screen chain. If
Jesse answers, it can be finished while the frontend is still blocked.

## Escalation triggers

Decided now, so they are not decided under pressure.

**An unowned ticket stays unowned for three days** — it stops being a gap on the board and
becomes somebody's job, probably whoever noticed. CAP-15 and CAP-16 are there now. The
lesson from CAP-5 is that a ticket with the wrong owner behaves exactly like a ticket with
no owner, and neither announces itself: both simply fail to start.

**Match the ticket to the person before the sprint, not after.** Four screen tickets went to
the team's cybersecurity member. The board corrected two of them by reassignment and two by
unassignment, weeks later, after CAP-5 had already delayed everything behind it.

**Jesse silent on access for two days** — CAP-26 changes shape rather than stalling, to
"write it, whoever holds the box runs it". That fallback is already in §9.4 and the
config-in-the-repo design was chosen partly to support it, so nothing is wasted.

## The risk worth seeing early

If every phase above lands, Tony finishes his own board and becomes wholly blocked, with
three items that cannot start. That is why 0.2 matters more than any of his own tickets.
