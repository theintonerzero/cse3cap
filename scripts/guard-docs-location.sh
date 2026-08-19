#!/usr/bin/env bash
#
# PreToolUse hook. Keeps written documentation inside docs/.
#
# Agents produce prose constantly: a plan, a summary of what they just
# did, a note to their future selves. Left alone it lands wherever the
# agent happened to be, and the repository root fills with files nobody
# asked for and nobody deletes. docs/ is where documentation is looked
# for, indexed in the README table, and reviewed.
#
# Reads the hook payload on stdin and answers on stdout. Refuses to
# create a new documentation file outside the directories that are
# allowed to hold one. Editing a file that already exists is never
# blocked, so README.md, CLAUDE.md and CONTRIBUTING.md stay editable in
# place.
#
# Covers both ways a file gets created: the Write tool, and a shell
# redirection. The second is not an afterthought. An agent working
# through Bash writes every file with `cat > path <<EOF`, which never
# touches the Write tool, so a guard that only matched Write would be
# blind exactly when it is needed most.
#
# Test it with scripts/guard-docs-location.test.py.

exec python3 -c '
import json, os, re, sys

try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)                     # unparseable payload is not our business

tool_input = payload.get("tool_input") or {}

paths = []

# The Write tool names its target outright.
if tool_input.get("file_path"):
    paths.append(tool_input["file_path"])

# A shell command has to be read for it. Heredoc bodies go first: they are
# text, not commands, and this repository writes its documentation and its
# commit messages through them, so a redirection quoted inside one is an
# example rather than an act.
command = tool_input.get("command") or ""
if command:
    command = re.sub(
        r"<<-?\s*[\"\x27]?(\w+)[\"\x27]?\n.*?^\s*\1\s*$",
        " <heredoc> ", command, flags=re.DOTALL | re.MULTILINE)
    paths += re.findall(r">>?\s*([^\s;|&<>]+)", command)
    paths += re.findall(r"\btee\s+(?:-a\s+)?([^\s;|&<>]+)", command)

if not paths:
    sys.exit(0)

project = os.path.abspath(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())


def candidates(path):
    """Where this path could land.

    A relative path in a shell command is relative to a working directory
    the hook cannot see: the command may have cd-ed anywhere first. So try
    the project root as well as the cwd, and let the write through if
    either reading is allowed. Wrong in the permissive direction on
    purpose. A guard that refuses `cat > docs/adr/x.md` because someone
    ran it from api/ gets switched off within the day.
    """
    if os.path.isabs(path):
        return [path]
    return [os.path.join(project, path), os.path.abspath(path)]


def offending(path):
    """The path this refuses to create, or None if it is fine."""

    # Documentation, as opposed to code or data. Anything not on this
    # list belongs to some other guard.
    if not re.search(r"\.(md|markdown|html?|rst|adoc|txt)$", path, re.IGNORECASE):
        return None

    refused = [r for r in (verdict(c) for c in candidates(path)) if r]

    # Allowed under any reading of where it lands is allowed.
    if len(refused) < len(candidates(path)):
        return None

    return refused[0]


def verdict(path):
    """The path this would refuse, or None, for one resolved location."""

    try:
        rel = os.path.relpath(path, project)
    except ValueError:
        return None

    # Outside the repository is scratch space, and scratch space is the
    # right place for a working file. Only what lands in the project is
    # governed.
    if rel.startswith(".."):
        return None

    # Rewriting a file that is already here is not the problem this
    # solves. README.md, CLAUDE.md and CONTRIBUTING.md stay editable.
    if os.path.exists(path):
        return None

    # A README belongs next to the thing it describes. It is also never
    # the name an agent reaches for when dumping a note, so allowing it
    # costs nothing and avoids arguing with a real convention.
    if os.path.basename(rel).lower().startswith("readme."):
        return None

    allowed = (
        "docs/",            # every document this project keeps
        ".claude/",         # agent and skill definitions, which are configuration
        ".github/",         # issue and pull request templates
        ".superpowers/",    # gitignored scratch for plan execution
    )

    if rel.replace(os.sep, "/").startswith(allowed):
        return None

    return rel


rel = next((r for r in (offending(p) for p in paths) if r), None)

if rel is None:
    sys.exit(0)

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            f"Blocked: {rel} is a new document outside docs/. Every document "
            "this project keeps lives in docs/ and is listed in the README "
            "table, so write it there instead. If it is a working note rather "
            "than a document, put it in the scratchpad outside the repository. "
            "Guard: scripts/guard-docs-location.sh"
        ),
    }
}))
'
