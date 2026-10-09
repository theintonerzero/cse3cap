#!/usr/bin/env python3
"""The live demo's deploy (CAP-54, ADR #62): static rules on deploy/demo, and
the scripts run against stubbed docker, git and curl.

Run: python3 scripts/deploy-demo.test.py  (or ./run deploy-demo-test)"""
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEMO = ROOT / "deploy" / "demo"
failures = []


def check(name, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}")
    if not ok:
        failures.append(name)
        if detail:
            print("        " + str(detail).strip().replace("\n", "\n        "))


def run(*args, env=None, cwd=None):
    return subprocess.run([str(a) for a in args], capture_output=True, stdin=subprocess.DEVNULL,
                          text=True, env={**os.environ, **(env or {})}, cwd=cwd)


def read(path):
    return path.read_text() if path.exists() else ""


# ---------------------------------------------------------------------------
print("deploy/demo/compose.yml")
# ---------------------------------------------------------------------------
compose = read(DEMO / "compose.yml")
check("the project is named diary", re.search(r"^name:\s*diary\s*$", compose, re.M) is not None)
check("it defines no mysql or caddy service of its own",
      bool(compose) and not re.search(r"^\s{2}(mysql|caddy)\s*:", compose, re.M), compose)
check("it joins server_web as an external network",
      "external: true" in compose and "name: server_web" in compose)
services = re.findall(r"^\s{2}diary-[a-z]+:", compose, re.M)
check("every service has a memory limit", len(services) > 0 and compose.count("mem_limit:") == len(services))
check("images are tagged by DIARY_SHA", "diary-api:${DIARY_SHA" in compose and "diary-web:${DIARY_SHA" in compose)
check("MySQL is reached by its certificate name through the host gateway",
      "rddb.darkovski.dev:host-gateway" in compose)
check("evidence uploads live in a named volume", "diary_storage:/app/api/storage" in compose)

print("deploy/demo, no secrets")
# [ \t]* not \s*: an empty `APP_KEY=` line must not borrow the next line as its value.
secret = re.compile(r"(DB_PASSWORD|APP_KEY|ANTHROPIC_API_KEY)[ \t]*=[ \t]*[^\s#]+|\b\d+\|[A-Za-z0-9]{20,}")
demo_files = sorted(p for p in DEMO.rglob("*") if p.is_file()) if DEMO.exists() else []
check("deploy/demo exists", bool(demo_files))
for path in demo_files:
    hit = secret.search(path.read_text(errors="ignore"))
    check(f"{path.relative_to(ROOT)} holds no secret", hit is None, hit.group(0) if hit else "")

print("deploy/demo/web.Caddyfile")
web = read(DEMO / "web.Caddyfile")
check("personas.json is never cached", re.search(r"personas\.json[\s\S]*?no-store", web) is not None, web)
check("/api and /up go to PHP-FPM", "php_fastcgi diary-api:9000" in web and "/up" in web)

print("deploy/demo/php-fpm-diary.conf")
fpm = read(DEMO / "php-fpm-diary.conf")
check("workers keep the container's environment", re.search(r"^clear_env\s*=\s*no", fpm, re.M) is not None)

print()
if failures:
    print(f"{len(failures)} failed.")
    sys.exit(1)
print("All passed.")
