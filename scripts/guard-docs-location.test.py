#!/usr/bin/env python3
"""Cases scripts/guard-docs-location.sh has to get right.

Run from the repository root:

    python3 scripts/guard-docs-location.test.py

Two payload shapes, because there are two ways to create a file. The Write
tool names its target; a shell command has to be read for it, and an agent
working through Bash writes everything with `cat > path <<EOF`.

The allow cases matter more than the deny ones. A guard that blocks a
legitimate write is worse than no guard, because the next person turns it
off rather than arguing with it.
"""

import json
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
GUARD = pathlib.Path(__file__).with_name("guard-docs-location.sh")

DENY = "deny"
ALLOW = "allow"

CASES = [
    # The thing this exists to stop: prose landing wherever the agent was.
    (DENY, "NOTES.md"),
    (DENY, "SUMMARY.md"),
    (DENY, "api/IMPLEMENTATION-NOTES.md"),
    (DENY, "db/migration-plan.md"),
    (DENY, "scripts/how-this-works.txt"),
    (DENY, "api/app/Services/rules.html"),

    # Where documentation is supposed to go.
    (ALLOW, "docs/api-reference.html"),
    (ALLOW, "docs/adr/0026-something.md"),
    (ALLOW, "docs/superpowers/plans/2026-08-19-frontend.md"),

    # Configuration that happens to be markdown, not documentation.
    (ALLOW, ".claude/agents/new-agent.md"),
    (ALLOW, ".claude/skills/add-thing/SKILL.md"),
    (ALLOW, ".github/PULL_REQUEST_TEMPLATE.md"),
    (ALLOW, ".superpowers/ledger.md"),

    # A README belongs next to the thing it describes, and is never the
    # name an agent reaches for when dumping a note.
    (ALLOW, "web/README.md"),
    (ALLOW, "scripts/bootstrap/README.txt"),

    # Files that already exist are being edited, not created.
    (ALLOW, "README.md"),
    (ALLOW, "CLAUDE.md"),
    (ALLOW, "CONTRIBUTING.md"),

    # Not documentation.
    (ALLOW, "api/app/Services/Scoring.php"),
    (ALLOW, "db/01-schema.sql"),
    (ALLOW, "web/src/tokens.css"),
]


COMMAND_CASES = [
    # The path an agent working through Bash actually takes.
    (DENY, "cat > NOTES.md <<'EOF'\nwhat I just did\nEOF"),
    (DENY, "cat > api/design.md <<'MD'\nnotes\nMD"),
    (DENY, "echo 'a note' >> SUMMARY.txt"),
    (DENY, "printf 'x' | tee HANDOFF.md"),

    # Found by review. A quoted destination came along with its quotes, so
    # the extension test ran against a string ending in a quote rather
    # than in .md, and the write was allowed.
    (DENY, 'cat > "NOTES.md" <<\'EOF\'\nnote\nEOF'),
    (DENY, "cat > 'NOTES.md' <<'EOF'\nnote\nEOF"),
    # Quoting is how a path with a space has to be written, and the bare
    # token stopped at the space.
    (DENY, 'cat > "my working notes.md" <<\'EOF\'\nnote\nEOF'),
    # tee takes flags before its file. Skipping only a literal -a captured
    # the flag as the filename and passed the real target through.
    (DENY, "printf 'x' | tee -i NOTES.md"),
    (DENY, "printf 'x' | tee -ai NOTES.md"),
    (DENY, "printf 'x' | tee --append NOTES.md"),

    # The same act, aimed where documents belong.
    (ALLOW, "cat > docs/adr/0026-thing.md <<'MD'\nrecord\nMD"),
    (ALLOW, "printf 'x' | tee docs/notes.md"),
    (ALLOW, "cat > .claude/agents/new.md <<'MD'\nagent\nMD"),
    # The same forms, aimed where documents belong, must still go through.
    (ALLOW, 'cat > "docs/adr/0033-thing.md" <<\'MD\'\nrecord\nMD'),
    (ALLOW, "cat > 'docs/notes.md' <<'MD'\nnote\nMD"),
    (ALLOW, "printf 'x' | tee -i docs/notes.md"),
    (ALLOW, "printf 'x' | tee --append docs/notes.md"),

    # Text about writing a file, not the writing of one. The shared-database
    # guard blocked the commit that introduced it by missing this.
    (ALLOW, "git commit -F- <<'EOF'\n"
            "chore: refuse a new document written outside docs/\n\n"
            "An agent that writes > NOTES.md at the root is the case.\n"
            "EOF"),

    # Not a document, or not in the repository.
    (ALLOW, "php artisan test > /tmp/results.log"),
    (ALLOW, "git diff > /dev/null"),
    (ALLOW, "cd api && php artisan test 2>&1 | tail -30"),
    (ALLOW, "npx redocly lint docs/openapi.yaml > lint.json"),
    (ALLOW, "cat > /tmp/scratch/working-note.md <<'MD'\nnote\nMD"),
]


# The same commands, run from a subdirectory. The verdict must not change
# just because the shell was somewhere else.
SUBDIRECTORY_CASES = [
    (ALLOW, "cat > docs/adr/0027-thing.md <<'MD'\nrecord\nMD"),
    (ALLOW, "printf 'x' > docs/notes.md"),
    (DENY, "cat > NOTES.md <<'EOF'\nnote\nEOF"),
    (DENY, "printf 'x' > HANDOFF.md"),
]


def decision(relative_path: str) -> str:
    env = dict(os.environ, CLAUDE_PROJECT_DIR=str(ROOT))
    result = subprocess.run(
        [str(GUARD)],
        input=json.dumps({"tool_input": {"file_path": str(ROOT / relative_path)}}),
        capture_output=True,
        text=True,
        env=env,
    )
    out = result.stdout.strip()
    if not out:
        return ALLOW
    return json.loads(out)["hookSpecificOutput"]["permissionDecision"]


def command_decision(command: str) -> str:
    env = dict(os.environ, CLAUDE_PROJECT_DIR=str(ROOT))
    result = subprocess.run(
        [str(GUARD)],
        input=json.dumps({"tool_input": {"command": command}}),
        capture_output=True,
        text=True,
        env=env,
    )
    out = result.stdout.strip()
    if not out:
        return ALLOW
    return json.loads(out)["hookSpecificOutput"]["permissionDecision"]


def from_a_subdirectory(command: str) -> str:
    """Run the guard as if the shell had cd-ed into api/ first.

    A relative path in a command is relative to a working directory the
    hook cannot see. Resolving it against the cwd alone refused
    `cat > docs/adr/x.md` whenever it was run from anywhere but the root.
    """
    env = dict(os.environ, CLAUDE_PROJECT_DIR=str(ROOT))
    result = subprocess.run(
        [str(GUARD)],
        input=json.dumps({"tool_input": {"command": command}}),
        capture_output=True,
        text=True,
        env=env,
        cwd=str(ROOT / "api"),
    )
    out = result.stdout.strip()
    if not out:
        return ALLOW
    return json.loads(out)["hookSpecificOutput"]["permissionDecision"]


def outside_the_repository() -> str:
    """Scratch space is the right place for a working file."""
    env = dict(os.environ, CLAUDE_PROJECT_DIR=str(ROOT))
    with tempfile.TemporaryDirectory() as scratch:
        result = subprocess.run(
            [str(GUARD)],
            input=json.dumps(
                {"tool_input": {"file_path": os.path.join(scratch, "working-note.md")}}),
            capture_output=True,
            text=True,
            env=env,
        )
    out = result.stdout.strip()
    return ALLOW if not out else json.loads(out)["hookSpecificOutput"]["permissionDecision"]


def main() -> int:
    failures = 0

    for expected, path in CASES:
        actual = decision(path)
        ok = actual == expected
        failures += not ok
        print("%s  want=%-5s got=%-5s  %s"
              % ("  ok" if ok else "FAIL", expected, actual, path))

    for expected, command in COMMAND_CASES:
        actual = command_decision(command)
        ok = actual == expected
        failures += not ok
        print("%s  want=%-5s got=%-5s  %s"
              % ("  ok" if ok else "FAIL", expected, actual,
                 command.split("\n")[0][:64]))

    for expected, command in SUBDIRECTORY_CASES:
        actual = from_a_subdirectory(command)
        ok = actual == expected
        failures += not ok
        print("%s  want=%-5s got=%-5s  [from api/] %s"
              % ("  ok" if ok else "FAIL", expected, actual,
                 command.split("\n")[0][:52]))

    actual = outside_the_repository()
    ok = actual == ALLOW
    failures += not ok
    print("%s  want=%-5s got=%-5s  <scratchpad>/working-note.md"
          % ("  ok" if ok else "FAIL", ALLOW, actual))

    print()
    if failures:
        print("%d case(s) wrong" % failures)
        return 1

    print("all %d cases correct"
          % (len(CASES) + len(COMMAND_CASES) + len(SUBDIRECTORY_CASES) + 1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
