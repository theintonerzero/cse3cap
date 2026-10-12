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
print("./assess against stubs")
TOOLS = ("bash", "sed", "grep", "tr", "head", "cat", "mkdir", "chmod", "rm", "mv", "date", "sleep",
         "env", "awk", "base64", "mktemp", "uname", "cut", "wc", "ls", "dirname", "basename", "seq")


def sandbox(docker_script, curl_script="exit 0"):
    """A copy of the driver and the compose file, with stub docker and curl that
    log their arguments, and only the system tools the driver should need."""
    d = pathlib.Path(tempfile.mkdtemp())
    (d / "bin").mkdir()
    (d / "repo" / "deploy" / "assess").mkdir(parents=True)
    (d / "repo" / "db").mkdir()
    (d / "repo" / "db" / "01-schema.sql").write_text("-- stub")
    (d / "repo" / "assess").write_text(read(ROOT / "assess"))
    (d / "repo" / "deploy" / "assess" / "compose.yml").write_text(read(ASSESS_DIR / "compose.yml"))
    for name, body in (("docker", docker_script), ("curl", curl_script)):
        p = d / "bin" / name
        p.write_text(f'#!/bin/bash\necho "$0 $*" >> {d}/calls.log\n{body}\n')
        p.chmod(0o755)
    for tool in TOOLS:
        found = subprocess.run(["bash", "-c", f"command -v {tool}"], capture_output=True, text=True).stdout.strip()
        if found.startswith("/"):
            os.symlink(found, d / "bin" / tool)
    return d


def run_assess(d, *args, stdin=""):
    env = {"PATH": str(d / "bin"), "HOME": str(d), "TERM": "dumb", "ASSESS_NO_TTY": "1"}
    return subprocess.run(["bash", str(d / "repo" / "assess"), *args], cwd=d / "repo", input=stdin,
                          capture_output=True, text=True, env=env, timeout=120)


d = sandbox('if [ "$1" = compose ]; then echo "docker: unknown command: docker compose" >&2; exit 1; fi\nexit 0')
r = run_assess(d, "up")
check("no Compose v2: says so and stops", r.returncode != 0 and "Compose v2" in r.stderr, r.stderr)

d = sandbox('if [ "$1" = buildx ]; then exit 1; fi\nexit 0')
r = run_assess(d, "up")
check("no Buildx: says so and stops", r.returncode != 0 and "Buildx" in r.stderr, r.stderr)

d = sandbox('if [ "$1" = info ]; then exit 1; fi\nexit 0')
r = run_assess(d, "up")
check("Docker not running: says to start it", r.returncode != 0 and "Start Docker" in r.stderr, r.stderr)

d = sandbox("exit 0", "exit 0")
r = run_assess(d, "up")
check(
    "port in use: names ASSESS_PORT and builds nothing",
    r.returncode != 0 and "ASSESS_PORT" in r.stderr
    and re.search(r"compose -f \S+ build\b", read(d / "calls.log")) is None,
    r.stderr,
)

d = sandbox("exit 0", "exit 7")
run_assess(d, "status")
env_file = d / "repo" / ".assess" / "env"
env1 = read(env_file)
mode = stat.S_IMODE(env_file.stat().st_mode) if env1 else 0
pw = re.findall(r"^ASSESS_DB_\w+_PASSWORD=([A-Za-z0-9]+)$", env1, re.M)
check(
    "secrets are generated: four passwords of 32 alphanumerics",
    len(pw) == 4 and all(len(p) == 32 for p in pw),
    env1,
)
check("APP_KEY is base64 of 32 bytes", re.search(r"^ASSESS_APP_KEY=base64:[A-Za-z0-9+/]{43}=$", env1, re.M) is not None, env1)
check(".assess/env is mode 600", mode == 0o600, oct(mode))
run_assess(d, "status")
check("a re-run keeps the same secrets", read(env_file) == env1)
check("no secret reached a command line", not any(p in read(d / "calls.log") for p in pw))

# seeded or not is the database's answer, not a marker file (Review Focus 2)
UP_DOCKER = """
case "$*" in
  *"User::count"*) echo "$USERS" ;;
  *"demo-personas.php"*) echo '[{"token":"a"},{"token":"b"}]' ;;
  *) exit 0 ;;
esac"""
UP_CURL = 'case "$*" in *"/up"*) exit 0 ;; *) exit 7 ;; esac'
for users, should_seed in (("0", True), ("6", False)):
    d = sandbox(UP_DOCKER.replace("$USERS", users), UP_CURL)
    r = run_assess(d, "up", stdin="\n")
    seeded_now = "migrate:fresh" in read(d / "calls.log")
    check(
        f"up with {users} users {'seeds' if should_seed else 'does not reseed'}",
        r.returncode == 0 and seeded_now == should_seed,
        r.stdout[-400:] + r.stderr[-400:],
    )
check("up prints where to open it", "http://localhost:8080" in r.stdout, r.stdout[-300:])

SMOKE_CURL = """
case "$*" in
  *"/demo/personas.json"*) echo '[{"token":"t1"},{"token":"t2"},{"token":"t3"},{"token":"t4"},{"token":"t5"},{"token":"t6"}]' ;;
  *"/ai/v1/status"*) echo 404 ;;
  *) echo 200 ;;
esac"""
d = sandbox("exit 0", SMOKE_CURL)
(d / "repo" / ".assess").mkdir()
(d / "repo" / ".assess" / "personas.json").write_text('[\n    {\n        "name": "Jane N",\n        "token": "1|smokeTOKENsecret"\n    }\n]\n')
r = run_assess(d, "smoke")
check("smoke: passes when the stack answers as expected", r.returncode == 0 and "6 people" in r.stdout, r.stdout + r.stderr)
check("smoke: a persona's token never reaches a command line", "smokeTOKENsecret" not in read(d / "calls.log"))
d = sandbox("exit 0", SMOKE_CURL.replace("echo 404", "echo 502"))
r = run_assess(d, "smoke")
check("smoke: fails, naming the check, when the AI answers wrongly", r.returncode != 0 and "wanted 404" in r.stderr, r.stderr)

REFUSED = ('{"type":"error","error":{"type":"invalid_request_error","message":"This API key is not scoped '
           'to a workspace, so this request must include the anthropic-workspace-id header"}}')
d = sandbox("exit 0", f"""
case "$*" in
  *api.anthropic.com*) printf '%s' '{REFUSED}' > "$(echo "$*" | sed -n 's/.*-o \\([^ ]*\\).*/\\1/p')"; echo 400 ;;
  *) echo 401 ;;
esac""")
r = run_assess(d, "ai", stdin="1\n  sk-ant-api03-REFUSEDKEY0000000000  \n")
ai_env = read(d / "repo" / ".assess" / "ai.env")
check("a refused key: Anthropic's message is shown", "not scoped to a workspace" in r.stderr, r.stderr)
check("a refused key: the workspace hint is shown", "inside a workspace" in r.stderr, r.stderr)
check("a refused key is not saved", "REFUSEDKEY" not in ai_env and "AI_ENABLED=false" in ai_env, ai_env)
check("the key never reaches a command line", "REFUSEDKEY" not in read(d / "calls.log"))

d = sandbox("exit 0", """
case "$*" in
  *api.anthropic.com*) echo 200 ;;
  *) echo 401 ;;
esac""")
r = run_assess(d, "ai", stdin="1\nsk-ant-api03-GOODKEY00000000000000\n")
ai_env = read(d / "repo" / ".assess" / "ai.env")
check(
    "an accepted key turns the AI on, whitespace stripped",
    "ANTHROPIC_API_KEY=sk-ant-api03-GOODKEY00000000000000\n" in ai_env and "AI_ENABLED=true" in ai_env,
    ai_env + r.stderr,
)
check("the cap defaults to US$1", "DAILY_CAP_USD=1\n" in ai_env, ai_env)
check("ai.env stays mode 600", stat.S_IMODE((d / "repo" / ".assess" / "ai.env").stat().st_mode) == 0o600)
check("with the stack stopped, the change waits for the next start", "next starts" in r.stdout, r.stdout)
run_assess(d, "ai", "--cap", "5")
check("--cap sets the cap", "DAILY_CAP_USD=5\n" in read(d / "repo" / ".assess" / "ai.env"))
run_assess(d, "ai", "--off")
ai_env = read(d / "repo" / ".assess" / "ai.env")
check("--off removes the key and turns the AI off", "GOODKEY" not in ai_env and "AI_ENABLED=false" in ai_env, ai_env)
r = run_assess(d, "ai", "--cap", "lots")
check("--cap refuses a non-number", r.returncode != 0 and "a number" in r.stderr, r.stderr)
r = run_assess(d, "ai", stdin="1\n\n")
check("an empty paste skips, and saves nothing", "skipped" in r.stdout and "AI_ENABLED=false" in read(d / "repo" / ".assess" / "ai.env"), r.stdout)

d = sandbox('case "$*" in *"run --rm --build ai-test"*) exit 1 ;; *) exit 0 ;; esac', "exit 7")
r = run_assess(d, "test")
calls = read(d / "calls.log")
check("test runs all three suites", all(f"run --rm --build {s}-test" in calls for s in ("api", "ai", "web")), calls)
check(
    "test reports each suite and exits non-zero on a failure",
    r.returncode != 0 and "api passed · ai FAILED · web passed" in r.stdout,
    r.stdout + r.stderr,
)
d = sandbox("exit 0", "exit 7")
r = run_assess(d, "test", "web")
calls = read(d / "calls.log")
check(
    "test web runs only the browser suite",
    r.returncode == 0 and "web-test" in calls and "api-test" not in calls and "ai-test" not in calls,
    calls,
)
r = run_assess(d, "test", "everything")
check("test refuses an unknown suite", r.returncode != 0 and "api, ai or web" in r.stderr, r.stderr)
d = sandbox(UP_DOCKER.replace("$USERS", "6"), UP_CURL)
r = run_assess(d, "reset")
check("reset reseeds even when the demo is already seeded", r.returncode == 0 and "migrate:fresh" in read(d / "calls.log"), r.stdout + r.stderr)

# ---------------------------------------------------------------------------
print()
if failures:
    print(f"{failures} failed.")
    sys.exit(1)
print("All passed.")
