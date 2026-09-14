---
name: jira-tickets
description: Use when you need a ticket's real state, assignee or sprint, when reporting what is done or outstanding, or when work finishes and a ticket should move. Covers reading COA4 from Jira and transitioning tickets.
---

# Jira tickets

The board is the truth about tickets. The repository is the truth about code. They disagree
regularly and neither is automatically right.

Project **COA4** on `latrobecomsci.atlassian.net`, board 2395, maintained each sprint.
Reached through the `atlassian` MCP server in `.mcp.json`, which authenticates as **you**.

## Never read docs/jira/*.csv for status

Those are the import files the tickets were created from. They have no status column and no
issue key — `Issue Type, Summary, Description, Epic Link, Parent, Assignee, Priority, Story
Points, Sprint, Due Date, Labels`. They record what the board looked like the day it was
filled and nothing since. Assignees in them are stale: CAP-5 is Andrew's there and Patrick
built it.

They stay in the repository as the record of what was imported. Reading them to answer
"what is done" produces a confident wrong answer, which is worse than no answer.

## Resolving CAP-n to a Jira key

The repository says `CAP-20`. Jira says `COA4-nn`. **There is no arithmetic between them** —
CAP-1 is COA4-59 and CAP-6 is COA4-65, so the offset is not constant, and no mapping file
exists.

What makes it work is that the CAP key is inside the summary: `CAP-11 · Entry stepper,
student mode`. So search the summary:

```
project = COA4 AND summary ~ "CAP-20"
```

Always confirm the summary you get back really is that ticket before acting on it. `~` is a
text match: searching `CAP-2` can return CAP-20 through CAP-29 as well.

## Before trusting any answer

If the MCP server is not connected or the credentials are missing, **say so and stop**. Do
not fall back to the CSVs and do not infer status from git history — both produce answers
that look authoritative and are not.

`./run jira` checks the credentials independently of the MCP server, over plain HTTP. When
Jira behaves oddly, run it: it separates "my token is wrong" from "the MCP server is
broken", which otherwise look identical.

## Jira and git disagree. Report it, do not resolve it

A ticket says Done and its pull request is unmerged. A ticket is assigned to one person and
another person's name is on every commit. A ticket is still To Do and the work shipped a
week ago.

All three happen here. When they do, **say both things**:

> CAP-5 is Done in Jira, assigned to Andrew. The commits are Patrick's and it merged as #30.

Not "CAP-5 is done", and not "Jira is wrong". The disagreement is usually the most useful
thing you have found, and quietly picking a side destroys it.

Read Jira for **intent**: what was asked for, who owns it, which sprint, what the acceptance
criteria say. Read git for **reality**: what exists, what merged, what passes.

## Transitioning tickets

Agents may move tickets. That is a real write, performed as the developer whose token is in
the environment, and it is visible to four other people.

**Move a ticket only when the work is actually observable.** Not when a plan says it will be
done, not when a branch exists, not when you are about to start.

| Transition | Only when |
| --- | --- |
| To Do → In Progress | A branch exists and has a commit on it |
| In Progress → Done | The pull request is **merged into `dev`**, verified against git, not assumed |
| anything → anything else | The person asked for it |

**Never:**

- Move a ticket that is not the one you are working on, unless asked by name.
- Move someone else's ticket. You are acting as one developer; moving another's work
  misrepresents who did what, on a board that is assessed.
- Move a ticket to Done because its acceptance criteria "look met". Criteria are met by
  merged code, and several tickets here have merged with a criterion unverified — CAP-19's
  row-by-row audit among them.
- Batch-transition. One ticket, one deliberate decision.

**Say what you moved and why**, in the same message as the work. A transition nobody was
told about is how a board stops being trusted.

## Partial tickets

Some tickets are genuinely half-done and the board has no state for it. CAP-24's token half
merged while its injection half waits on other screens; CAP-26's design merged while the
deploy waits on host access.

**Do not move a half-finished ticket to Done.** Leave it In Progress and put the split in a
comment, or say plainly that the ticket needs splitting. Marking it Done because the part
you did is finished loses the part nobody did.

## What to do with what you read

When reporting status, ground every claim in one of the two sources and name which:

> Merged: CAP-1, CAP-2, CAP-3, CAP-4, CAP-5, CAP-6, CAP-7, CAP-9, CAP-10, CAP-19, CAP-20
> (git). Jira additionally shows CAP-8 In Progress, which has no branch yet.

Story points, sprint membership and assignees come from Jira and nowhere else. The CSVs'
copies of all three are a year-zero snapshot.

## Common mistakes

| Mistake | What happens |
| --- | --- |
| Reading the CSVs for status | A confident, wrong completion figure |
| Computing COA4 from CAP-n | Wrong ticket, possibly transitioned |
| `summary ~ "CAP-2"` without checking | Matches CAP-20 to CAP-29 too |
| Moving a ticket to Done on a green PR | It is Done when merged, not when green |
| Resolving a Jira/git disagreement silently | Destroys the finding that mattered |
| Falling back to git when Jira is unreachable | Looks authoritative, misses reassignments |
