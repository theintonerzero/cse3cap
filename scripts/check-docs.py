#!/usr/bin/env python3
"""Fails when the documentation stops describing the repository.

    ./run docs                          from the repository root
    python3 scripts/check-docs.py       the same thing
    python3 scripts/check-docs.py DIR   against another tree (the case test does this)

The handover audit of 2026-10-03 found that most of what was wrong in the docs
was a claim nothing checked: a link to a moved file, a ./run command that no
longer existed, an ADR index line that was never added, two records sharing a
number, a dependency register older than the lockfiles. Each of these is
mechanical, so each is checked here, and CI runs it on every pull request.

What it checks:

1. Relative links in the living docs resolve. External links and anchors are
   not checked, and fenced code is skipped.
2. Every `./run <command>` the living docs mention is a command `run` declares.
3. Every document in docs/ is listed in the README's documentation table, and
   every image in docs/ is referenced from somewhere.
4. The ADR index and the records agree: every record has an index line and
   the reverse, no number is used twice, and the index's status (accepted,
   proposed or superseded) matches the record's. Gaps in numbering are allowed.
5. docs/Dependency-Register.md was generated from the lockfiles as they are
   now. It records each lockfile's sha256; `./run deps` regenerates it.

"Living docs" are the ones a reader acts on today. docs/adr/ and
docs/superpowers/ are history and may mention things that have since changed;
docs/jira/ holds imports. Those are left alone.

Stdlib only.
"""

import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else pathlib.Path(__file__).resolve().parent.parent

HISTORY = ("docs/adr/", "docs/superpowers/", "docs/jira/")
IMAGE = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"}
LOCKFILES = ("api/composer.lock", "web/package-lock.json")
REGISTER = "docs/Dependency-Register.md"
ADR_LOG = "docs/adr/architecture-decision-records.md"

LINK = re.compile(r"\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
FENCE = re.compile(r"^(```|~~~).*?^\1", re.M | re.S)
RUN_MENTION = re.compile(r"(?<![\w./])\./run[ \t]+([^\s`'\")\],;]+)")
RUN_LABEL = re.compile(r"^\s*([a-z][a-z0-9|-]*)\)", re.M)
# The dot leader between title and status is as short as two dots on some lines.
INDEX_LINE = re.compile(r"^#(\d+)\s+.*?\s\.{2,}\s*(\S.*)$")
RECORD = re.compile(r"^ADR #(\d+):", re.M)

problems = []
passed = 0


def ok():
    global passed
    passed += 1


def bad(message):
    problems.append(message)


def rel(path):
    return path.relative_to(ROOT).as_posix()


def living_docs():
    candidates = [ROOT / "README.md", ROOT / "CONTRIBUTING.md", ROOT / "CLAUDE.md", ROOT / "web" / "README.md"]
    candidates += sorted((ROOT / "docs").glob("*.md"))
    candidates += sorted((ROOT / ".claude" / "skills").glob("*/SKILL.md"))
    candidates += sorted((ROOT / ".claude" / "agents").glob("*.md"))
    return [p for p in candidates if p.is_file() and not rel(p).startswith(HISTORY)]


def check_links(docs):
    for doc in docs:
        text = FENCE.sub("", doc.read_text(encoding="utf-8"))
        text = re.sub(r"`[^`\n]*`", "", text)  # inline code shows paths, it does not link them
        for target in LINK.findall(text):
            if "://" in target or target.startswith(("#", "mailto:")):
                continue
            path = target.split("#", 1)[0].split("?", 1)[0]
            if not path:
                continue
            if (doc.parent / path).exists():
                ok()
            else:
                bad(f"{rel(doc)}: link to {target} points at nothing")


def declared_commands():
    run = ROOT / "run"
    if not run.is_file():
        return set()
    labels = set()
    for group in RUN_LABEL.findall(run.read_text(encoding="utf-8")):
        labels.update(group.split("|"))
    return labels


def check_run_mentions(docs):
    declared = declared_commands()
    for doc in docs:
        for command in RUN_MENTION.findall(doc.read_text(encoding="utf-8")):
            if not re.fullmatch(r"[a-z][a-z0-9-]*", command):
                continue  # a placeholder, a flag or a comment, not a command name
            if command in declared:
                ok()
            else:
                bad(f"{rel(doc)}: mentions ./run {command}, which run does not declare")


def check_docs_listed(docs):
    readme = ROOT / "README.md"
    readme_text = readme.read_text(encoding="utf-8") if readme.is_file() else ""
    every_text = "\n".join(d.read_text(encoding="utf-8") for d in docs)
    for entry in sorted((ROOT / "docs").iterdir()):
        if entry.name.startswith("."):
            continue
        name = rel(entry)
        if entry.suffix.lower() in IMAGE:
            if entry.name in every_text:
                ok()
            else:
                bad(f"{name} is an image that no document references")
        elif entry.is_dir():
            # Listed itself, or through a folder inside it (docs/superpowers/ is
            # listed as its specs/ and plans/).
            if f"]({name}/" in readme_text or f"]({name})" in readme_text:
                ok()
            else:
                bad(f"{name}/ is not listed in the README's documentation table")
        elif f"]({name})" in readme_text:
            ok()
        else:
            bad(f"{name} is not listed in the README's documentation table")


def category(status):
    status = status.strip().lower()
    if "superseded" in status:
        return "superseded"
    if status.startswith("proposed"):
        return "proposed"
    return "accepted"


def check_adrs():
    log = ROOT / ADR_LOG
    if not log.is_file():
        return
    lines = log.read_text(encoding="utf-8").splitlines()

    index = {}
    in_index = False
    for line in lines:
        if line.strip() == "Index":
            in_index = True
            continue
        if in_index and line.startswith("====="):
            break
        match = INDEX_LINE.match(line) if in_index else None
        if match:
            index[int(match.group(1))] = match.group(2)

    records = {}
    current = None
    for line in lines:
        heading = RECORD.match(line)
        if heading:
            number = int(heading.group(1))
            if number in records:
                bad(f"ADR #{number} is used by more than one record")
            records.setdefault(number, None)
            current = number
            continue
        if current is not None and line.startswith("Status:") and records[current] is None:
            records[current] = line.split(":", 1)[1]

    for number in sorted(set(records) | set(index)):
        if number not in index:
            bad(f"ADR #{number} has a record but no line in the index")
        elif number not in records:
            bad(f"the ADR index lists #{number}, but there is no record for it")
        elif records[number] is None:
            bad(f"ADR #{number} has no Status line")
        elif category(index[number]) != category(records[number]):
            bad(f"ADR #{number}: the index says {category(index[number])}, "
                f"the record says {category(records[number])}")
        else:
            ok()


def check_register():
    register = ROOT / REGISTER
    if not register.is_file():
        return
    text = register.read_text(encoding="utf-8")
    for lockfile in LOCKFILES:
        path = ROOT / lockfile
        if not path.is_file():
            continue
        match = re.search(rf"`{re.escape(lockfile)}` sha256 `([0-9a-f]{{64}})`", text)
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if match and match.group(1) == actual:
            ok()
        else:
            bad(f"{REGISTER} was not generated from the current {lockfile}: "
                f"run ./run deps and commit the result")


def main():
    docs = living_docs()
    check_links(docs)
    check_run_mentions(docs)
    check_docs_listed(docs)
    check_adrs()
    check_register()
    for problem in problems:
        print(f"  FAIL {problem}")
    print(f"\n{passed} passed, {len(problems)} failed")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
