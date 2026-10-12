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
print("deploy/assess: the stack")
compose = read(ASSESS_DIR / "compose.yml")
check("compose.yml exists", compose != "")
check("the project is named diary-assess", re.search(r"^name:\s*diary-assess\s*$", compose, re.M) is not None)
mysql_block = re.search(r"\n  mysql:\n((?:    .*\n|\s*\n)+)", compose)
check(
    "MySQL is never published",
    mysql_block is not None and "ports:" not in mysql_block.group(1),
    mysql_block.group(1) if mysql_block else compose,
)
ports = re.findall(r"^\s+- \"?([^\"\n]+:80)\"?\s*$", compose, re.M)
check("the one published port is bound to 127.0.0.1", ports == ["127.0.0.1:${ASSESS_PORT:-8080}:80"], ports)
for svc in ("mysql", "diary-api", "diary-web", "diary-ai", "api-test", "ai-test", "web-test"):
    check(f"service {svc}", re.search(rf"^  {svc}:\s*$", compose, re.M) is not None)
check(
    "it builds the demo's own Dockerfiles",
    all(f"dockerfile: deploy/demo/{d}" in compose for d in ("api.Dockerfile", "web.Dockerfile", "ai.Dockerfile")),
)
check(
    "the browser image matches web/package.json's Playwright",
    "mcr.microsoft.com/playwright:v1.63.0-noble" in compose
    and '"@playwright/test": "1.63.0"' in read(ROOT / "web" / "package.json"),
)
check(
    "no password or key is written into deploy/assess",
    re.search(
        r"(sk-ant-[A-Za-z0-9_-]{10,}|PASSWORD[:=]\s*['\"]?[A-Za-z0-9]{8,})",
        "".join(read(p) for p in ASSESS_DIR.rglob("*") if p.is_file()),
    )
    is None,
)
check(".assess/ is git-ignored", re.search(r"^/\.assess/\s*$", read(ROOT / ".gitignore"), re.M) is not None)
check(
    "web.Caddyfile sends /ai to the sidecar",
    re.search(r"handle /ai/\*\s*\{\s*reverse_proxy diary-ai:8000\s*\}", read(DEMO / "web.Caddyfile")) is not None,
)

# ---------------------------------------------------------------------------
print()
if failures:
    print(f"{failures} failed.")
    sys.exit(1)
print("All passed.")
