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

# ---------------------------------------------------------------------------
print("scripts/deploy-demo.sh")
# ---------------------------------------------------------------------------
SCRIPT = ROOT / "scripts" / "deploy-demo.sh"

STUB_GIT = """#!/bin/sh
echo "git $*" >> "$CALLS"
case "$*" in
  *ls-remote*) printf '%s\\trefs/heads/dev\\n' "$REMOTE_SHA" ;;
  *rev-parse*) echo "$REMOTE_SHA" ;;
esac
exit 0
"""
STUB_DOCKER = """#!/bin/sh
echo "docker $*" >> "$CALLS"
case "$*" in
  *" build"*) [ "${FAIL_BUILD:-}" = 1 ] && exit 1 ;;
  *"artisan migrate"*) [ "${FAIL_MIGRATE:-}" = 1 ] && exit 1 ;;
  *"wget"*|*"/health"*) [ "${FAIL_HEALTH:-}" = 1 ] && exit 1 ;;
  *"demo-personas.php"*) [ "${FAIL_PERSONAS:-}" = 1 ] && exit 1; echo '[{"id":"jane","name":"Jane N","role_hint":"Student","slot":"student","token":"1|x"}]' ;;
esac
exit 0
"""
STUB_CURL = """#!/bin/sh
echo "curl $*" >> "$CALLS"
exit 0
"""
# Called as: flock -n -E 75 LOCKFILE CMD ARGS...
STUB_FLOCK = """#!/bin/sh
[ "${LOCKED:-}" = 1 ] && exit 75
shift 4
exec "$@"
"""


def box(tmp, db="reflection_diary_demo", deployed=None, freeze=False):
    home = pathlib.Path(tmp) / "diary"
    (home / "shared" / "demo").mkdir(parents=True)
    (home / "src" / "deploy" / "demo").mkdir(parents=True)
    (home / "src" / "deploy" / "demo" / "compose.yml").write_text("name: diary\n")
    env = home / "shared" / "api.env"
    env.write_text(f"APP_ENV=production\nDB_DATABASE={db}\n")
    env.chmod(0o600)
    (home / "shared" / "deploy.env").write_text("DIARY_NTFY_URL=https://ntfy.example/diary\n")
    if deployed:
        (home / "deployed").write_text(deployed + "\n")
    if freeze:
        (home / "freeze").write_text("")
    bin_dir = pathlib.Path(tmp) / "bin"
    bin_dir.mkdir()
    for name, body in (("git", STUB_GIT), ("docker", STUB_DOCKER), ("curl", STUB_CURL), ("flock", STUB_FLOCK)):
        (bin_dir / name).write_text(body)
        (bin_dir / name).chmod(0o755)
    calls = pathlib.Path(tmp) / "calls.log"
    return home, {"DIARY_HOME": str(home), "CALLS": str(calls),
                  "DIARY_HEALTH_TRIES": "2", "DIARY_HEALTH_WAIT": "0",
                  "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}, calls


def lines(calls):
    return calls.read_text().splitlines() if calls.exists() else []


OLD, NEW = "a" * 40, "b" * 40

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD, freeze=True)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW})
    check("a freeze file stops a timed deploy before anything runs",
          r.returncode == 0 and not any(l.startswith("docker") for l in lines(calls)), r.stdout + r.stderr)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": OLD})
    check("an unchanged dev does nothing",
          r.returncode == 0 and not any(l.startswith("docker") for l in lines(calls)), r.stdout + r.stderr)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW})
    log = lines(calls)
    order = [next((i for i, l in enumerate(log) if k in l), -1) for k in (" build", "artisan migrate", " up -d")]
    check("a new commit builds, migrates, then starts, in that order",
          r.returncode == 0 and -1 not in order and order == sorted(order), "\n".join(log) + r.stderr)
    check("the deployed and previous SHAs are recorded",
          read(home / "deployed").strip() == NEW and read(home / "previous").strip() == OLD)
    check("ntfy hears that it deployed", any("curl" in l and "deployed" in l for l in log), "\n".join(log))

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, db="reflection_diary", deployed=OLD)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW})
    check("the shared database is refused before any migration",
          r.returncode == 1 and "_demo" in r.stderr
          and not any("artisan migrate" in l or " up -d" in l for l in lines(calls)), r.stdout + r.stderr)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW, "FAIL_BUILD": "1"})
    check("a failed build changes nothing running",
          r.returncode == 1 and not any(" up -d" in l for l in lines(calls))
          and read(home / "deployed").strip() == OLD, r.stdout + r.stderr)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW, "FAIL_MIGRATE": "1"})
    check("a failed migration starts nothing new",
          r.returncode == 1 and not any(" up -d" in l for l in lines(calls)), r.stdout + r.stderr)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW, "FAIL_HEALTH": "1"})
    log = lines(calls)
    ups = [l for l in log if " up -d" in l]
    check("a failed health check rolls back to the previous images",
          r.returncode == 1 and len(ups) == 2 and read(home / "deployed").strip() == OLD,
          "\n".join(log) + r.stderr)
    check("ntfy hears that it rolled back", any("curl" in l and "rolled back" in l for l in log), "\n".join(log))

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=None)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW, "FAIL_HEALTH": "1"})
    log = lines(calls)
    check("a first deploy that fails says there is nothing to roll back to",
          r.returncode == 1 and "nothing to roll back to" in r.stderr
          and len([l for l in log if " up -d" in l]) == 1, "\n".join(log) + r.stderr)

with tempfile.TemporaryDirectory() as tmp:
    home, env, calls = box(tmp, deployed=OLD)
    r = run(SCRIPT, "--if-changed", "dev", env={**env, "REMOTE_SHA": NEW, "LOCKED": "1"})
    check("a run while another holds the lock exits quietly",
          r.returncode == 0 and not any(l.startswith("docker") for l in lines(calls)), r.stdout + r.stderr)

check("the script never touches Caddy or the server project",
      SCRIPT.exists() and not re.search(r"server-caddy|/home/ubuntu/server|caddy reload|-p server", SCRIPT.read_text()))

print()
if failures:
    print(f"{len(failures)} failed.")
    sys.exit(1)
print("All passed.")
