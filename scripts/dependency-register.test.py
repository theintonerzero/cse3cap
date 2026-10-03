#!/usr/bin/env python3
"""Cases scripts/dependency-register.py has to get right without the network.

    python3 scripts/dependency-register.test.py

The audits themselves are Composer's and npm's. What is ours is reading a
licence expression and writing a table cell, and both have already been
wrong once: a dual licence was flagged though the user may pick the permissive
side, and Laravel's affected range `<13.30.0|<12.69.0` split its table row.
"""

import importlib.util
import pathlib
import sys

spec = importlib.util.spec_from_file_location(
    "register", pathlib.Path(__file__).resolve().with_name("dependency-register.py"))
register = importlib.util.module_from_spec(spec)
spec.loader.exec_module(register)

CASES = [
    ("plain permissive", register.is_permissive("MIT"), True),
    ("plain copyleft", register.is_permissive("LGPL-2.1"), False),
    ("OR: a permissive option is enough", register.is_permissive("BSD-3-Clause OR GPL-2.0-only OR GPL-3.0-only"), True),
    ("OR: no permissive option", register.is_permissive("GPL-2.0-only OR GPL-3.0-only"), False),
    ("AND: every part must be permissive", register.is_permissive("MIT AND LGPL-3.0-or-later"), False),
    ("AND: all permissive", register.is_permissive("(MIT AND Apache-2.0)"), True),
    ("no licence recorded", register.is_permissive("none"), False),
    ("a pipe is escaped for a table cell", register.cell(">=13.0.0,<13.30.0|<12.69.0"), ">=13.0.0,<13.30.0\\|<12.69.0"),
    ("text without a pipe is untouched", register.cell("Laravel: XSS"), "Laravel: XSS"),
]


def main():
    wrong = [(label, got, want) for label, got, want in CASES if got != want]
    for label, got, want in wrong:
        print(f"FAIL {label}: got {got!r}, want {want!r}")
    if wrong:
        print(f"{len(wrong)} of {len(CASES)} cases wrong")
        return 1
    print(f"all {len(CASES)} cases correct")
    return 0


if __name__ == "__main__":
    sys.exit(main())
