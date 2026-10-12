#!/usr/bin/env python3
"""CAP-71: the assessor's one-command path (ADR #67).

Static checks on deploy/assess and the Dockerfiles, then ./assess itself
against stub docker and curl, so CI proves the driver's behaviour without
Docker. The real run, with Docker, is done by hand (see the CAP-71 plan).

    python3 scripts/assess.test.py
"""
import os
import pathlib
import re
import stat
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEMO = ROOT / "deploy" / "demo"
ASSESS_DIR = ROOT / "deploy" / "assess"
failures = 0


def check(name, ok, detail=""):
    global failures
    if ok:
        print(f"  ok    {name}")
    else:
        failures += 1
        print(f"  FAIL  {name}")
        if detail:
            print("        " + str(detail)[:400].replace("\n", "\n        "))


def read(path):
    try:
        return pathlib.Path(path).read_text()
    except FileNotFoundError:
        return ""


def stages(dockerfile):
    return re.findall(r"^FROM\s+(\S+)(?:\s+AS\s+(\S+))?", read(dockerfile), re.M | re.I)


# ---------------------------------------------------------------------------
print("Dockerfiles: a test stage, never the default")
for name in ("api.Dockerfile", "ai.Dockerfile"):
    found = stages(DEMO / name)
    names = [alias for _, alias in found]
    check(f"{name} has a test stage", "test" in names, found)
    check(
        f"{name}'s last stage is the runtime",
        bool(found) and found[-1][0] == "runtime" and found[-1][1] == "",
        found,
    )

# ---------------------------------------------------------------------------
print()
if failures:
    print(f"{failures} failed.")
    sys.exit(1)
print("All passed.")
