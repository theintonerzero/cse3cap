#!/usr/bin/env python3
"""Cases scripts/lib/token-for.sh has to get right, and the scripts that use it.

Run from the repository root:

    python3 scripts/token-for.test.py

The seeder prints one line per person, name then token (DemoSeeder.php).
A tokens file a reissue was appended to holds two lines for the same
person, and a file saved on Windows ends each line in \\r. Every script
that reads a token by name goes through token_for, so both cases are
handled once, here (CAP-45).

Each helper case writes a fixture tokens file under a temp directory and
sources the helper under `set -euo pipefail`, the strictest setting a
caller could have, so a helper that aborts its caller fails here.
"""

import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
HELPER = ROOT / "scripts" / "lib" / "token-for.sh"
# The same rule in PHP, for `./run demo` and `.\\run.ps1 demo` (CAP-51): run.ps1
# has no bash, and every laptop that runs the API has PHP. Both readers run the
# same CASES below, so the rule is written twice but pinned once.
PHP_HELPER = ROOT / "scripts" / "lib" / "token-for.php"

FAKE = "a" * 40

# (label, fixture or None for no file, name, expected token)
CASES = [
    ("prefixed", f"Jane N   7|rdiary_{FAKE}\n", "Jane N", f"7|rdiary_{FAKE}"),
    ("unprefixed", f"Jane N   7|{FAKE}\n", "Jane N", f"7|{FAKE}"),
    ("CRLF line endings", f"Jane N   7|rdiary_{FAKE}\r\n", "Jane N", f"7|rdiary_{FAKE}"),
    ("newest of two",
     f"Jane N   7|old{FAKE}\nSam O    8|rdiary_{FAKE}\nJane N   9|rdiary_{FAKE}\n",
     "Jane N", f"9|rdiary_{FAKE}"),
    ("newest of two, CRLF",
     f"Dr Lee   7|old{FAKE}\r\nDr Lee   9|rdiary_{FAKE}\r\n",
     "Dr Lee", f"9|rdiary_{FAKE}"),
    # What `php artisan db:seed` prints: DemoSeeder's token lines, then a
    # ReflectionSeeder line per reflection that also starts with the name.
    # The CI smoke run reads exactly this file.
    ("seed output, reflection lines after the token",
     f"Jane N   7|rdiary_{FAKE}\nSam O    8|rdiary_{FAKE}\nDr Lee   9|rdiary_{FAKE}\n"
     "Jane N   Develop AI use cases   sprint 1  assessed\n"
     "Jane N   Data migration audit   sprint 2  submitted\n",
     "Jane N", f"7|rdiary_{FAKE}"),
    ("seed output appended twice, newest token wins",
     f"Jane N   7|old{FAKE}\nJane N   Develop AI use cases   sprint 1  assessed\n"
     f"Jane N   12|rdiary_{FAKE}\nJane N   Develop AI use cases   sprint 1  assessed\n",
     "Jane N", f"12|rdiary_{FAKE}"),
    ("no line for the name", f"Sam O    8|rdiary_{FAKE}\n", "Jane N", ""),
    ("no tokens file", None, "Jane N", ""),
]

# A by-name read that takes every matching line: grep ... | awk '{print $NF}'
# with nothing keeping only the last line.
OLD_READ = re.compile(r"grep[^\n|]*\|\s*awk '\{print \$NF\}'")
DEFINES_TOKEN_FOR = re.compile(r"^\s*(function\s+)?token_for\s*\(\)", re.M)

failures = 0


def report(ok, label, detail=""):
    global failures
    print(f"[{'ok' if ok else 'FAIL'}] {label}" + (f": {detail}" if detail and not ok else ""))
    if not ok:
        failures += 1


def run_case(label, fixture, name, expected):
    with tempfile.TemporaryDirectory() as tmp:
        tokens = pathlib.Path(tmp) / "tokens.txt"
        if fixture is not None:
            tokens.write_bytes(fixture.encode("utf-8"))
        result = subprocess.run(
            ["bash", "-c",
             'set -euo pipefail; . "$1"; got="$(token_for "$2" "$3")"; '
             'printf "%s" "$got"; echo; echo "survived"',
             "_", str(HELPER), name, str(tokens)],
            capture_output=True,
        )
        # Bytes, not text mode: text mode turns \r\n into \n and would hide a
        # token that kept its \r.
        lines = result.stdout.decode("utf-8").split("\n")
        got = lines[0] if lines else ""
        survived = "survived" in lines
        report(survived and got == expected, label,
               f"got {got!r}, wanted {expected!r}"
               + ("" if survived else f", caller aborted (exit {result.returncode}) {result.stderr.decode().strip()}"))


def readers():
    files = sorted((ROOT / "scripts").glob("*.sh"))
    files += [ROOT / "run", ROOT / "run.ps1"]
    return [f for f in files if f.exists()]


def check_readers():
    for path in readers():
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(ROOT)
        hits = [n for n, line in enumerate(text.splitlines(), 1) if OLD_READ.search(line)]
        report(not hits, f"{rel}: no by-name read takes every matching line",
               "line " + ", ".join(map(str, hits)))
        report(not DEFINES_TOKEN_FOR.search(text), f"{rel}: no second copy of token_for",
               "defines its own token_for; source scripts/lib/token-for.sh instead")


def run_php_case(label, fixture, name, expected):
    with tempfile.TemporaryDirectory() as tmp:
        tokens = pathlib.Path(tmp) / "tokens.txt"
        if fixture is not None:
            tokens.write_bytes(fixture.encode("utf-8"))
        result = subprocess.run(
            ["php", str(PHP_HELPER), name, str(tokens)], capture_output=True)
        got = result.stdout.decode("utf-8").rstrip("\n")
        report(result.returncode == 0 and got == expected, f"php: {label}",
               f"got {got!r}, wanted {expected!r} (exit {result.returncode}) "
               f"{result.stderr.decode().strip()}")


def main():
    if not HELPER.exists():
        report(False, "scripts/lib/token-for.sh exists", "missing")
    else:
        for case in CASES:
            run_case(*case)
    if not PHP_HELPER.exists():
        report(False, "scripts/lib/token-for.php exists", "missing")
    else:
        for case in CASES:
            run_php_case(*case)
    check_readers()
    print(f"\n{'FAIL' if failures else 'ok'}: {failures} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
