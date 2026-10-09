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
# The box's INPUT chain rejects server_web -> host:3306 (only 22, 80, 443 are
# open), so the host gateway is "No route to host". The mysql container is on
# server_web itself; a link alias gives it the certificate's name in diary-api.
check("MySQL is reached by its certificate name, as the mysql container on server_web",
      "mysql:rddb.darkovski.dev" in compose and "external_links" in compose)
check("not through the host gateway, which the box's firewall rejects", "host-gateway" not in compose)
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
# migrate:fresh prints what DemoSeeder prints (three tokens, no Noor); tinker
# prints the extra people's tokens; demo-personas.php is the REAL script, run on
# the seed file the reset actually wrote, found through the -v mount.
STUB_DOCKER = """#!/bin/sh
echo "docker $*" >> "$CALLS"
case "$*" in
  *" build"*) [ "${FAIL_BUILD:-}" = 1 ] && exit 1 ;;
  *"migrate:fresh"*)
    echo "Jane N   1|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    echo "Sam O    2|bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    echo "Dr Lee   3|cccccccccccccccccccccccccccccccccccccccc" ;;
  *"tinker"*) echo "Noor A 4|dddddddddddddddddddddddddddddddddddddddd" ;;
  *"artisan migrate"*) [ "${FAIL_MIGRATE:-}" = 1 ] && exit 1 ;;
  *"wget"*|*"/health"*) [ "${FAIL_HEALTH:-}" = 1 ] && exit 1 ;;
  *"demo-personas.php"*)
    [ "${FAIL_PERSONAS:-}" = 1 ] && exit 1
    dir="$(printf '%s\\n' "$*" | sed -n 's/.*-v \\([^:]*\\):\\/seed.*/\\1/p')"
    exec php "$REPO/scripts/demo-personas.php" "$dir/seed.txt" ;;
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
    return home, {"DIARY_HOME": str(home), "CALLS": str(calls), "REPO": str(ROOT),
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

# ---------------------------------------------------------------------------
print("scripts/demo-reset.sh")
# ---------------------------------------------------------------------------
RESET = ROOT / "scripts" / "demo-reset.sh"

if not RESET.exists():
    check("scripts/demo-reset.sh exists", False)
else:
    with tempfile.TemporaryDirectory() as tmp:
        home, env, calls = box(tmp, deployed=OLD)
        r = run(RESET, env=env)
        log = lines(calls)
        personas = home / "shared" / "demo" / "personas.json"
        check("a reset reseeds the demo database from scratch",
              r.returncode == 0 and any("migrate:fresh" in l and "--seed" in l and "--drop-views" in l for l in log),
              "\n".join(log) + r.stderr)
        check("it writes personas.json from the seed output",
              personas.exists() and '"jane"' in personas.read_text(), r.stderr)
        # Demo-Script's main student. DemoSeeder issues no token for her.
        check("Noor, who the seeder gives no token, is in the picker too",
              personas.exists() and '"noor"' in personas.read_text(),
              (personas.read_text() if personas.exists() else "") + r.stderr)
        # The tinker code spans lines, so read the whole call, not one log line.
        whole = read(calls)
        tinker = whole[whole.find("tinker"):] if "tinker" in whole else ""
        check("the extra tokens expire with the seeded ones",
              "createToken" in tinker and "TOKEN_LIFETIME_DAYS" in tinker and "tokens()->exists()" in tinker,
              tinker)
        check("personas.json is not world-readable",
              personas.exists() and (personas.stat().st_mode & 0o777) == 0o640)

    with tempfile.TemporaryDirectory() as tmp:
        home, env, calls = box(tmp, db="reflection_diary", deployed=OLD)
        r = run(RESET, env=env)
        check("the shared database is refused before migrate:fresh",
              r.returncode == 1 and "_demo" in r.stderr and not any("migrate" in l for l in lines(calls)),
              r.stdout + r.stderr)

    with tempfile.TemporaryDirectory() as tmp:
        home, env, calls = box(tmp, deployed=OLD)
        personas = home / "shared" / "demo" / "personas.json"
        personas.write_text('[{"id":"old"}]')
        r = run(RESET, env={**env, "FAIL_PERSONAS": "1"})
        check("a failed personas build keeps the old file rather than an empty one",
              r.returncode == 1 and personas.read_text() == '[{"id":"old"}]', r.stdout + r.stderr)

    with tempfile.TemporaryDirectory() as tmp:
        home, env, calls = box(tmp, deployed=None)
        r = run(RESET, env=env)
        check("a reset before any deploy is refused with a reason",
              r.returncode == 1 and "deploy first" in r.stderr, r.stdout + r.stderr)

# ---------------------------------------------------------------------------
print("deploy/demo/site.caddy with a generated gate")
# ---------------------------------------------------------------------------
GATE_SCRIPT = ROOT / "scripts" / "demo-gate.sh"
docker_ok = shutil.which("docker") is not None and run("docker", "info").returncode == 0
if not GATE_SCRIPT.exists() or not (DEMO / "site.caddy").exists():
    check("scripts/demo-gate.sh and deploy/demo/site.caddy exist", False)
elif not docker_ok:
    print("  skip  docker is not available here; CI runs these")
else:
    import base64
    import time
    import urllib.error
    import urllib.request

    with tempfile.TemporaryDirectory() as tmp:
        srv = pathlib.Path(tmp)
        bcrypt = run("docker", "run", "--rm", "caddy:2", "caddy", "hash-password",
                     "--plaintext", "test-password-123").stdout.strip()
        r = run(GATE_SCRIPT, "--out", srv / "diary-gate.caddy", "--hash", bcrypt, "--secret", "f" * 64)
        check("demo-gate.sh writes the gate file", r.returncode == 0 and (srv / "diary-gate.caddy").exists(),
              r.stdout + r.stderr)
        check("the gate file is not world-readable",
              (srv / "diary-gate.caddy").exists() and ((srv / "diary-gate.caddy").stat().st_mode & 0o777) == 0o640)
        (srv / "Caddyfile").write_text(
            "{\n\tadmin off\n\tauto_https off\n}\n(baseline) {\n}\n(accesslog) {\n}\n"
            "import /srv/server/diary-site.caddy\n")
        # The site block names diary.darkovski.dev; for a local run serve it on :8080 instead.
        site = (DEMO / "site.caddy").read_text().replace("diary.darkovski.dev {", "http://:8080 {", 1)
        site = site.replace("reverse_proxy diary-web:80", 'respond "app" 200')
        (srv / "diary-site.caddy").write_text(site)

        # docker cp rather than a bind mount: Docker Desktop and colima do not
        # share temporary directories with their VM, so a mount arrives empty.
        name = "diary-gate-test"
        run("docker", "rm", "-f", name)
        run("docker", "create", "--name", name, "-p", "18080:8080", "caddy:2",
            "caddy", "run", "--config", "/srv/server/Caddyfile", "--adapter", "caddyfile")
        run("docker", "cp", f"{srv}/.", f"{name}:/srv/server")
        run("docker", "start", name)
        time.sleep(2)
        r = run("docker", "exec", name, "caddy", "validate", "--config", "/srv/server/Caddyfile",
                "--adapter", "caddyfile")
        check("caddy validates the site with its gate", r.returncode == 0, r.stdout + r.stderr)

        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None

        def get(path, cookie=None, password=None):
            req = urllib.request.Request(f"http://127.0.0.1:18080{path}")
            if cookie:
                req.add_header("Cookie", cookie)
            if password:
                req.add_header("Authorization", "Basic " + base64.b64encode(f"demo:{password}".encode()).decode())
            try:
                resp = urllib.request.build_opener(NoRedirect).open(req, timeout=5)
                return resp.status, dict(resp.headers), resp.read().decode()
            except urllib.error.HTTPError as e:
                return e.code, dict(e.headers), e.read().decode()

        try:
            status, headers, _ = get("/")
            check("a page without the cookie redirects to /gate",
                  status == 303 and headers.get("Location") == "/gate", (status, headers))
            status, headers, body = get("/api/v1/auth/me")
            check("the API without the cookie is a 401 in the diary's envelope",
                  status == 401 and '"UNAUTHENTICATED"' in body and "json" in headers.get("Content-Type", ""),
                  (status, body))
            status, _, body = get("/", cookie="diary_gate=" + "f" * 64)
            check("with the cookie, the app is served", status == 200 and body == "app", (status, body))
            status, _, _ = get("/", cookie="diary_gate=" + "0" * 64)
            check("a wrong cookie is still sent to /gate", status == 303)
            status, headers, _ = get("/gate")
            check("/gate without the password is a 401 and sets no cookie",
                  status == 401 and "Set-Cookie" not in headers, (status, headers))
            status, headers, _ = get("/gate", password="wrong")
            check("a wrong password sets no cookie", status == 401 and "Set-Cookie" not in headers, (status, headers))
            status, headers, _ = get("/gate", password="test-password-123")
            check("the right password sets the cookie and goes home",
                  status == 303 and headers.get("Location") == "/"
                  and headers.get("Set-Cookie", "").startswith("diary_gate=" + "f" * 64), (status, headers))
        finally:
            run("docker", "rm", "-f", name)

print("deploy/demo timer")
timer = read(DEMO / "diary-deploy.timer")
service = read(DEMO / "diary-deploy.service")
check("the timer fires every 5 minutes", "OnUnitActiveSec=5min" in timer)
check("the service runs the installed copy, not the checkout it rewrites",
      "/home/ubuntu/diary/bin/deploy-demo.sh --if-changed dev" in service and "/src/" not in service)

print()
if failures:
    print(f"{len(failures)} failed.")
    sys.exit(1)
print("All passed.")
