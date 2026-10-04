#!/usr/bin/env python3
"""Cases scripts/check-docs.py has to get right.

Run from the repository root:

    python3 scripts/check-docs.test.py

Each case builds a small fixture repository in a temp directory, changes one
thing, and runs the script against it, so the real tree is never read. The
base fixture passes every check; a case that expects a failure breaks exactly
one of them and names what the output must contain.
"""

import hashlib
import pathlib
import subprocess
import sys
import tempfile

SCRIPT = pathlib.Path(__file__).resolve().with_name("check-docs.py")

COMPOSER_LOCK = '{"packages": []}\n'
NPM_LOCK = '{"lockfileVersion": 3}\n'


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


ADR_PATH = "docs/adr/architecture-decision-records.md"

ADR_LOG = """# Architecture decision records

Index

#1  First decision ................ Superseded by #2
#2  Second decision ............... Accepted
#3  Third decision ................ Proposed

===============================================================

ADR #1: First decision
Status: Superseded by #2
Date: 2026-08-01

===============================================================

ADR #2: Second decision
Status: Accepted, extended later
Date: 2026-08-02

===============================================================

ADR #3: Third decision
Status: Proposed
Date: 2026-08-03
"""


def base():
    """A fixture repository that passes every check."""
    return {
        "run": 'case "$1" in\n    test)  echo ;;\n    deps) echo ;;\n    fmt|format) echo ;;\nesac\n',
        "README.md": (
            "# Project\n\nRun `./run test`. Windows: `./run.ps1 check`.\n\n"
            "| Document | What |\n| --- | --- |\n"
            "| [`docs/Guide.md`](docs/Guide.md) | A guide |\n"
            "| [`docs/adr/`](docs/adr/) | Decisions |\n"
            "| [`docs/Dependency-Register.md`](docs/Dependency-Register.md) | Register |\n"
            "| [site](https://example.org) | External |\n"
        ),
        "docs/Guide.md": (
            "# Guide\n\nSee [the decisions](adr/architecture-decision-records.md#index)"
            " and [the top](#guide). ![chart](chart.png)\n"
        ),
        "docs/chart.png": "",
        ADR_PATH: ADR_LOG,
        "api/composer.lock": COMPOSER_LOCK,
        "web/package-lock.json": NPM_LOCK,
        "docs/Dependency-Register.md": (
            "# Register\n\n"
            f"| Lockfiles | `api/composer.lock` sha256 `{sha(COMPOSER_LOCK)}`, "
            f"`web/package-lock.json` sha256 `{sha(NPM_LOCK)}` |\n"
        ),
    }


def with_changes(changes):
    """The base fixture with some files replaced, added, or removed (None)."""
    files = base()
    for path, content in changes.items():
        if content is None:
            files.pop(path, None)
        else:
            files[path] = content
    return files


CASES = [
    ("the base fixture passes", base(), True, ""),
    (
        "a relative link to a missing file fails, and is named",
        with_changes({"docs/Guide.md": "See [gone](Missing.md).\n"}),
        False,
        "docs/Guide.md: link to Missing.md",
    ),
    (
        "an external link, an anchor and a link with an anchor are not checked as files",
        with_changes({"docs/Guide.md": "[a](https://x.org) [b](#top) "
                      "[c](adr/architecture-decision-records.md#x) ![chart](chart.png)\n"}),
        True,
        "",
    ),
    (
        "a ./run command that run does not declare fails, and is named",
        with_changes({"CONTRIBUTING.md": "Then `./run deploy` it.\n"}),
        False,
        "./run deploy",
    ),
    (
        "an alias in run counts as declared",
        with_changes({"CONTRIBUTING.md": "Tidy with `./run format`.\n"}),
        True,
        "",
    ),
    (
        "a document in docs/ missing from the README table fails",
        with_changes({"docs/Orphan.md": "# Orphan\n"}),
        False,
        "docs/Orphan.md is not listed",
    ),
    (
        "an image nothing references fails",
        with_changes({"docs/unused.png": ""}),
        False,
        "docs/unused.png",
    ),
    (
        "an ADR heading with no index line fails",
        with_changes({ADR_PATH: ADR_LOG + "\nADR #4: Fourth\nStatus: Proposed\n"}),
        False,
        "#4",
    ),
    (
        "two ADRs with the same number fail",
        with_changes({ADR_PATH: ADR_LOG + "\nADR #3: Another third\nStatus: Proposed\n"}),
        False,
        "#3 is used by more than one",
    ),
    (
        "an index status that disagrees with the record fails",
        with_changes({ADR_PATH: ADR_LOG.replace(
            "#3  Third decision ................ Proposed",
            "#3  Third decision ................ Accepted")}),
        False,
        "#3",
    ),
    (
        "a gap in the numbering is allowed",
        with_changes({ADR_PATH: ADR_LOG.replace("#3  Third", "#5  Third").replace("ADR #3:", "ADR #5:")}),
        True,
        "",
    ),
    (
        "an index line with a two-dot leader is still read",
        with_changes({ADR_PATH: ADR_LOG.replace(
            "#3  Third decision ................ Proposed",
            "#3  Third decision .. Proposed")}),
        True,
        "",
    ),
    (
        "a folder in docs/ counts as listed when the README lists a folder inside it",
        with_changes({
            "docs/history/plans/one.md": "# One\n",
            "README.md": base()["README.md"] + "| [`docs/history/plans/`](docs/history/plans/) | Plans |\n",
        }),
        True,
        "",
    ),
    (
        "a dependency register older than the lockfile fails",
        with_changes({"web/package-lock.json": '{"lockfileVersion": 3, "changed": true}\n'}),
        False,
        "./run deps",
    ),
    (
        "a register with no lockfile hashes fails",
        with_changes({"docs/Dependency-Register.md": "# Register\n"}),
        False,
        "./run deps",
    ),
]


def run_case(label, files, expect_pass, must_contain):
    with tempfile.TemporaryDirectory() as tmp:
        for rel, content in files.items():
            path = pathlib.Path(tmp, rel)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
        result = subprocess.run(
            [sys.executable, str(SCRIPT), tmp], capture_output=True, text=True
        )
    output = result.stdout + result.stderr
    if (result.returncode == 0) != expect_pass:
        return f"{label}: expected {'pass' if expect_pass else 'fail'}, got exit {result.returncode}\n{output}"
    if must_contain and must_contain not in output:
        return f"{label}: output does not mention {must_contain!r}\n{output}"
    return None


def main():
    failures = [f for f in (run_case(*case) for case in CASES) if f]
    for failure in failures:
        print(f"FAIL {failure.splitlines()[0]}")
    if failures:
        print(f"{len(failures)} of {len(CASES)} cases wrong")
        return 1
    print(f"all {len(CASES)} cases correct")
    return 0


if __name__ == "__main__":
    sys.exit(main())
