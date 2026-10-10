#!/usr/bin/env python3
"""scripts/demo-personas.php builds the live demo's personas.json from the
output of `php artisan db:seed` (CAP-54). Run: python3 scripts/demo-personas.test.py"""
import json
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "demo-personas.php"
failures = []


def check(name, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}")
    if not ok:
        failures.append(name)
        if detail:
            print("        " + detail.strip().replace("\n", "\n        "))


def run(seed_text):
    with tempfile.TemporaryDirectory() as tmp:
        seed = pathlib.Path(tmp) / "seed.txt"
        seed.write_text(seed_text)
        return subprocess.run(["php", str(SCRIPT), str(seed)], capture_output=True, text=True)


SEED = """\
   INFO  Seeding database.
Jane N   1|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
Sam O    2|bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
Dr Lee   3|cccccccccccccccccccccccccccccccccccccccc
Jane N   reflection for Sprint 1, draft
Noor A   4|dddddddddddddddddddddddddddddddddddddddd
"""

print("demo-personas.php")
result = run(SEED)
out = json.loads(result.stdout) if result.returncode == 0 else []
check("exits 0 with tokens present", result.returncode == 0, result.stderr)
check("one persona per person with a token, in the demo's order",
      [p["id"] for p in out] == ["jane", "noor", "sam", "lee"], result.stdout)
check("the token is the last field of the person's token line",
      bool(out) and out[0]["token"] == "1|" + "a" * 40, result.stdout)
check("a seeder line without a token is not mistaken for one",
      all("|" in p["token"] for p in out), result.stdout)
check("each persona carries id, name, role_hint, slot and token",
      all(set(p) == {"id", "name", "role_hint", "slot", "token"} for p in out), result.stdout)
check("Sam signs into the assessor slot",
      any(p["id"] == "sam" and p["slot"] == "assessor" for p in out), result.stdout)

result = run("   INFO  Seeding database.\n")
check("no token at all is refused with a reason",
      result.returncode == 1 and "no demo person's token" in result.stderr and result.stdout == "",
      result.stdout + result.stderr)

print()
if failures:
    print(f"{len(failures)} failed.")
    sys.exit(1)
print("All passed.")
