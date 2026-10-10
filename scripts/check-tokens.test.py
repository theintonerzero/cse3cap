#!/usr/bin/env python3
"""Cases scripts/check-tokens.sh has to get right.

Run from the repository root:

    python3 scripts/check-tokens.test.py

Each case is a fixture web/src/ built under a temp directory, passed to
the script as its source-dir argument, so the real tree is never read
or written.
"""

import pathlib
import subprocess
import sys
import tempfile

SCRIPT = pathlib.Path(__file__).resolve().with_name("check-tokens.sh")

CASES = [
    ("token usage passes", "Button.css",
     ".button { background: var(--color-primary); padding: var(--space-16); }\n", True),
    ("zero px passes", "Reset.css", ".x { margin: 0px; }\n", True),
    ("raw hex fails", "Bad.css", ".x { color: #ff0000; }\n", False),
    ("magic pixel fails", "Bad.tsx", "const style = { padding: '12px' };\n", False),
]


def run_case(label, filename, content, expect_pass):
    with tempfile.TemporaryDirectory() as tmp:
        src = pathlib.Path(tmp) / "src"
        src.mkdir()
        (src / "tokens.css").write_text(
            "/* not scanned; may contain hex and px freely */\n", encoding="utf-8"
        )
        (src / filename).write_text(content, encoding="utf-8")

        result = subprocess.run(
            ["bash", str(SCRIPT), str(src)],
            capture_output=True,
            text=True,
        )
        passed = result.returncode == 0
        ok = passed == expect_pass
        print(f"[{'ok' if ok else 'FAIL'}] {label}")
        if not ok:
            print(f"  expected {'pass' if expect_pass else 'fail'}, got {'pass' if passed else 'fail'}")
            print(f"  stdout:\n{result.stdout}")
        return ok


def main():
    results = [run_case(*case) for case in CASES]
    if not all(results):
        sys.exit(1)
    print(f"\n{len(results)} cases passed.")


if __name__ == "__main__":
    main()
