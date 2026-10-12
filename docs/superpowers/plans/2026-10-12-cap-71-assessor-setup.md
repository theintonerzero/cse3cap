# CAP-71: an assessor runs the whole product with one command: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `./assess` (and `.\assess.ps1`) brings the whole product up locally in Docker
with the seeded demo, an optional AI on the assessor's own key, and one command for every
test suite.

**Architecture:** A Compose project, `diary-assess`, in `deploy/assess/`, running a local
`mysql:9.7.2` beside the live demo's own three Dockerfiles. A bash script and a PowerShell
twin drive it, keeping generated secrets in a git-ignored `.assess/`. The API and AI
Dockerfiles gain a `test` stage that is never their default.

**Tech Stack:** Docker Compose v2, bash, PowerShell 7, MySQL 9.7.2, the existing Laravel /
React / FastAPI images, `mcr.microsoft.com/playwright:v1.63.0-noble`, Python 3 for the
repository's own checks.

**Spec:** `docs/superpowers/specs/2026-10-12-cap-71-assessor-setup-design.md`. Ticket CAP-71
(COA4-141). Branch `feat/CAP-71-assess`, rebased on `dev` at `cf34760`.

## Global Constraints

- Docker only on the assessor's machine: Docker Engine or Desktop with Compose v2, git,
  and the shell's own `curl`. No PHP, Composer, Node, Python or MySQL on the host.
- Compose project name `diary-assess`. Service names `mysql`, `diary-api`, `diary-web`,
  `diary-ai` (the demo's names, so `web.Caddyfile` resolves unchanged).
- The only published port is `127.0.0.1:${ASSESS_PORT:-8080}`. MySQL is never published.
- Databases: `reflection_diary_assess` (app), `diary_ai` (sidecar), `reflection_diary_test`,
  `diary_ai_test`. Users `diary_app`, `diary_ai`, `diary_test`. No `REQUIRE SSL` locally.
- `.assess/` at the repository root, git-ignored, every file mode 600: `env`, `api.env`,
  `ai.env`, `personas.json`. No password or key is ever committed or passed on a command
  line.
- AI: `DAILY_CAP_USD=1` by default; model unchanged (`claude-haiku-5-5`); the key is checked
  with `GET https://api.anthropic.com/v1/models` before it is saved.
- The live demo's images build exactly as before: the default (last) stage of
  `api.Dockerfile` and `ai.Dockerfile` is the runtime image.
- `assess` and `assess.ps1` offer the same commands: `up` (default), `ai`, `test`, `reset`,
  `smoke`, `status`, `down`.
- Freeze: the pull request is a draft, a reviewer requested, unmerged until Jesse says.
- Docs only under `docs/` (plus the README). No em dashes or semicolons joining clauses in
  prose (`write-adr` voice).

## Review Focus

1. **`docker compose` missing while `docker` exists** (this Mac today): the script must say
   "Compose v2 is missing: install Docker Desktop, or the docker-compose plugin" and stop,
   not fail on an unknown command. Pinned by a stub test in Task 3.
2. **The database volume deleted while `.assess/` remains** (or the reverse): `up` must
   reseed when the database has no users, not trust a marker file. Pinned in Task 3 by
   deciding "seeded" from a user count.
3. **A key pasted with a trailing newline or spaces, or one Anthropic refuses as not
   workspace-scoped**: whitespace is stripped; a refusal prints Anthropic's own message
   plus the workspace hint, and nothing is saved. Pinned by a stub test in Task 5.
4. **Port 8080 already in use**: `up` stops before building, naming the port and
   `ASSESS_PORT`. Pinned by a stub test in Task 3.
5. **A re-run of `./assess` after everything is up**: no reseed, no second key prompt, the
   same passwords (the MySQL volume was initialised with them). Pinned in Task 3 (secrets
   generated once) and Task 9's full run.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `deploy/assess/compose.yml` | The `diary-assess` project: four services, test services under the `test` profile, volumes. |
| `deploy/assess/mysql-init/01-databases.sh` | First-start SQL: the four databases and three users, from env passwords. |
| `deploy/assess/mysql-init/02-ai-schema.sh` | Loads `ai/db/01-schema.sql` into `diary_ai`. |
| `deploy/demo/web.Caddyfile` | Gains `/ai/*` → `diary-ai:8000`. |
| `deploy/demo/api.Dockerfile`, `deploy/demo/ai.Dockerfile` | Gain a `test` stage; the last stage stays the runtime. |
| `assess` | The bash driver. |
| `assess.ps1` | The PowerShell twin. |
| `scripts/assess.test.py` | Static checks, and the bash driver against stub `docker` and `curl`. |
| `.gitignore` | `.assess/`. |
| `run`, `.github/workflows/ci.yml` | Run `scripts/assess.test.py`. |
| `docs/Assessor-Guide.md`, `README.md`, `docs/adr/architecture-decision-records.md` | The guide, the README block and table row, ADR #67. |

---

### Task 0: Preconditions

**Files:** none.

- [ ] **Step 1:** Ask Jesse before installing anything on his Mac. The full run in Task 9
  needs the Compose v2 plugin (`docker compose` is missing today: `docker: unknown command:
  docker compose`) and PowerShell 7 (`pwsh` is not installed). Proposed:
  `brew install docker-compose powershell`, then add `"cliPluginsExtraDirs":
  ["/opt/homebrew/lib/docker/cli-plugins"]` to `~/.docker/config.json` as brew prints.
- [ ] **Step 2:** Confirm: `docker compose version` prints v2, `pwsh -v` prints 7.x.
- [ ] **Step 3:** Confirm the branch is current: `git log --oneline -1` shows the spec commit
  on top of `cf34760`.

---

### Task 1: The test stages in the API and AI Dockerfiles

**Files:**
- Modify: `deploy/demo/api.Dockerfile`, `deploy/demo/ai.Dockerfile`
- Create: `scripts/assess.test.py` (first checks)

**Interfaces:**
- Produces: build targets `test` in both Dockerfiles. `api` test image runs
  `php artisan test` from `/app/api` with dev dependencies; `ai` test image runs `pytest -q`
  from `/app/ai` with `tests/` and `db/` present. The default target of both is `runtime`.

- [ ] **Step 1: Write the failing checks.** `scripts/assess.test.py`, in the shape of
  `scripts/deploy-demo.test.py` (a `check(name, ok, detail)` that prints `ok`/`FAIL` and a
  final count; exit 1 on any failure):

```python
#!/usr/bin/env python3
"""CAP-71: the assessor's one-command path. Static checks, then the bash driver
against stub docker and curl. Run: python3 scripts/assess.test.py"""
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


print("Dockerfiles: a test stage, never the default")
for name in ("api.Dockerfile", "ai.Dockerfile"):
    found = stages(DEMO / name)
    names = [alias for _, alias in found]
    check(f"{name} has a test stage", "test" in names, found)
    check(f"{name}'s last stage is the runtime", bool(found) and found[-1][0] == "runtime"
          and found[-1][1] == "", found)
```

- [ ] **Step 2: Run it and see both files fail.** `python3 scripts/assess.test.py` → four
  `FAIL` lines ("has a test stage", "last stage is the runtime").

- [ ] **Step 3: Restructure `api.Dockerfile`.** Name the existing stage `runtime`, add the
  test stage and an empty final `FROM runtime`, so the default target is byte-for-byte the
  runtime image. Change the first line and append at the end:

```dockerfile
FROM php:8.5-fpm AS runtime
```

```dockerfile
# The assessor's backend suite (CAP-71, ./assess test api). The runtime above with
# Composer's dev dependencies; never the default target, so the live demo builds
# exactly what it built before.
FROM runtime AS test
RUN composer install --no-interaction --no-progress --prefer-dist \
 && rm -f .env
ENTRYPOINT []
CMD ["php", "artisan", "test"]

# The default target: the runtime image, unchanged.
FROM runtime
```

- [ ] **Step 4: Restructure `ai.Dockerfile`** the same way. First line
  `FROM python:3.12-slim AS runtime`, then append:

```dockerfile
# The assessor's sidecar suite (CAP-71, ./assess test ai), with the database tests
# that need AI_TEST_DATABASE_URL. Root, because the venv was made as root.
FROM runtime AS test
USER root
RUN uv sync --frozen --no-install-project --group dev
COPY ai/tests ./tests
COPY ai/db ./db
CMD ["pytest", "-q"]

# The default target: the runtime image, unchanged.
FROM runtime
```

- [ ] **Step 5: Run the checks and the demo's own.** `python3 scripts/assess.test.py` → the
  four lines `ok`. `python3 scripts/deploy-demo.test.py` → `All passed.` (it checks the
  sidecar's non-root `USER` and the model layer order; both still hold in `runtime`).

- [ ] **Step 6: Prove the default image is unchanged.** With Docker:
  `docker build -q -f deploy/demo/ai.Dockerfile --target runtime -t chk:runtime .` and
  `docker build -q -f deploy/demo/ai.Dockerfile -t chk:default .` print the same image ID.
  Same for `api.Dockerfile`. Then `docker rmi chk:runtime chk:default`.

- [ ] **Step 7: Commit.**

```bash
git add deploy/demo/api.Dockerfile deploy/demo/ai.Dockerfile scripts/assess.test.py
git commit -m "build: a test stage in the API and AI images, never their default (CAP-71)"
```

---

### Task 2: The Compose project, the MySQL init, and the `/ai` route

**Files:**
- Create: `deploy/assess/compose.yml`, `deploy/assess/mysql-init/01-databases.sh`,
  `deploy/assess/mysql-init/02-ai-schema.sh`
- Modify: `deploy/demo/web.Caddyfile`, `.gitignore`, `scripts/assess.test.py`

**Interfaces:**
- Consumes: Task 1's `test` targets.
- Produces: compose services `mysql`, `diary-api`, `diary-web`, `diary-ai`, and under the
  `test` profile `api-test`, `ai-test`, `web-test`. Environment the driver must export from
  `.assess/env` before any `docker compose` call: `ASSESS_DB_ROOT_PASSWORD`,
  `ASSESS_DB_APP_PASSWORD`, `ASSESS_DB_AI_PASSWORD`, `ASSESS_DB_TEST_PASSWORD`,
  `ASSESS_APP_KEY`, and optionally `ASSESS_PORT`. Files the driver must create before
  `up`: `.assess/api.env`, `.assess/ai.env`, `.assess/personas.json`.

- [ ] **Step 1: Write the failing checks.** Append to `scripts/assess.test.py`:

```python
print("deploy/assess: the stack")
compose = read(ASSESS_DIR / "compose.yml")
check("compose.yml exists", compose != "")
check("the project is named diary-assess", re.search(r"^name:\s*diary-assess\s*$", compose, re.M) is not None)
mysql_block = re.search(r"\n  mysql:\n((?:    .*\n|\s*\n)+)", compose)
check("MySQL is never published", mysql_block is not None and "ports:" not in mysql_block.group(1),
      mysql_block.group(1) if mysql_block else compose)
ports = re.findall(r"^\s+- \"?([^\"\n]+:80)\"?\s*$", compose, re.M)
check("the one published port is bound to 127.0.0.1", ports == ["127.0.0.1:${ASSESS_PORT:-8080}:80"], ports)
for svc in ("mysql", "diary-api", "diary-web", "diary-ai", "api-test", "ai-test", "web-test"):
    check(f"service {svc}", re.search(rf"^  {svc}:\s*$", compose, re.M) is not None)
check("it builds the demo's own Dockerfiles",
      all(f"dockerfile: deploy/demo/{d}" in compose for d in ("api.Dockerfile", "web.Dockerfile", "ai.Dockerfile")))
check("the browser image matches web/package.json's Playwright",
      "mcr.microsoft.com/playwright:v1.63.0-noble" in compose
      and '"@playwright/test": "1.63.0"' in read(ROOT / "web" / "package.json"))
check("no password or key is written into deploy/assess",
      re.search(r"(sk-ant-[A-Za-z0-9_-]{10,}|PASSWORD[:=]\s*['\"]?[A-Za-z0-9]{8,})",
                "".join(read(p) for p in ASSESS_DIR.rglob("*") if p.is_file())) is None)
check(".assess/ is git-ignored", re.search(r"^/\.assess/\s*$", read(ROOT / ".gitignore"), re.M) is not None)
check("web.Caddyfile sends /ai to the sidecar",
      re.search(r"handle /ai/\*\s*\{\s*reverse_proxy diary-ai:8000\s*\}", read(DEMO / "web.Caddyfile")) is not None)
```

- [ ] **Step 2: Run them and see them fail.** `python3 scripts/assess.test.py` → the new
  lines `FAIL`.

- [ ] **Step 3: Add the `/ai` route to `deploy/demo/web.Caddyfile`**, after the `@laravel`
  handle:

```caddyfile
	# The AI sidecar (ADR #64). On the live demo the VPS's Caddy sends /ai to the
	# sidecar before a request reaches this container, so this never fires there.
	# On an assessor's machine (CAP-71) it is the only way in.
	handle /ai/* {
		reverse_proxy diary-ai:8000
	}
```

- [ ] **Step 4: Write `deploy/assess/compose.yml`.**

```yaml
# An assessor's machine (CAP-71, ADR #67): the whole product with its own MySQL,
# built from the live demo's own Dockerfiles. Driven by ./assess, which exports
# the ASSESS_* variables from .assess/env; nothing secret is written here.
name: diary-assess

services:
  mysql:
    image: mysql:9.7.2
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${ASSESS_DB_ROOT_PASSWORD:?run ./assess}
      ASSESS_DB_APP_PASSWORD: ${ASSESS_DB_APP_PASSWORD:?run ./assess}
      ASSESS_DB_AI_PASSWORD: ${ASSESS_DB_AI_PASSWORD:?run ./assess}
      ASSESS_DB_TEST_PASSWORD: ${ASSESS_DB_TEST_PASSWORD:?run ./assess}
    volumes:
      - mysql:/var/lib/mysql
      - ./mysql-init:/docker-entrypoint-initdb.d:ro
      - ../../ai/db/01-schema.sql:/ai-schema.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "MYSQL_PWD=\"$$MYSQL_ROOT_PASSWORD\" mysqladmin ping -h 127.0.0.1 -u root --silent"]
      interval: 3s
      timeout: 5s
      retries: 60

  diary-api:
    build:
      context: ../..
      dockerfile: deploy/demo/api.Dockerfile
    image: diary-assess-api:local
    restart: unless-stopped
    env_file: ../../.assess/api.env
    volumes:
      - storage:/app/api/storage
    depends_on:
      mysql:
        condition: service_healthy

  diary-web:
    build:
      context: ../..
      dockerfile: deploy/demo/web.Dockerfile
    image: diary-assess-web:local
    restart: unless-stopped
    ports:
      - "127.0.0.1:${ASSESS_PORT:-8080}:80"
    volumes:
      - ../../.assess/personas.json:/srv/demo/personas.json:ro
    depends_on:
      - diary-api

  diary-ai:
    build:
      context: ../..
      dockerfile: deploy/demo/ai.Dockerfile
    image: diary-assess-ai:local
    restart: unless-stopped
    env_file: ../../.assess/ai.env
    mem_limit: 2g
    depends_on:
      mysql:
        condition: service_healthy

  api-test:
    profiles: [test]
    build:
      context: ../..
      dockerfile: deploy/demo/api.Dockerfile
      target: test
    image: diary-assess-api-test:local
    environment:
      APP_KEY: ${ASSESS_APP_KEY:?run ./assess}
      DB_HOST: mysql
      DB_PORT: "3306"
      DB_USERNAME: diary_test
      DB_PASSWORD: ${ASSESS_DB_TEST_PASSWORD:?run ./assess}
      DB_TEST_DATABASE: reflection_diary_test
      DB_COLLATION: utf8mb4_0900_ai_ci
      MYSQL_ATTR_SSL_CA: ""
    depends_on:
      mysql:
        condition: service_healthy

  ai-test:
    profiles: [test]
    build:
      context: ../..
      dockerfile: deploy/demo/ai.Dockerfile
      target: test
    image: diary-assess-ai-test:local
    environment:
      AI_TEST_DATABASE_URL: mysql://diary_test:${ASSESS_DB_TEST_PASSWORD:?run ./assess}@mysql:3306/diary_ai_test
    depends_on:
      mysql:
        condition: service_healthy

  web-test:
    profiles: [test]
    image: mcr.microsoft.com/playwright:v1.63.0-noble
    working_dir: /repo/web
    environment:
      CI: "1"
    volumes:
      - ../..:/repo
      - web_modules:/repo/web/node_modules
    command: ["sh", "-c", "npm ci --no-audit --no-fund && npx playwright test"]

volumes:
  mysql:
  storage:
  web_modules:
```

- [ ] **Step 5: Write `deploy/assess/mysql-init/01-databases.sh`** (runs once, on an
  empty volume, as the image's init):

```bash
#!/bin/bash
# First start only (CAP-71): the assessor's four databases and three users. The
# passwords arrive from ./assess through compose's environment; none is written here.
set -euo pipefail
mysql -u root -p"$MYSQL_ROOT_PASSWORD" <<SQL
CREATE DATABASE reflection_diary_assess CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE diary_ai CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE reflection_diary_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE diary_ai_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'diary_app'@'%' IDENTIFIED BY '${ASSESS_DB_APP_PASSWORD}';
GRANT ALL ON reflection_diary_assess.* TO 'diary_app'@'%';
CREATE USER 'diary_ai'@'%' IDENTIFIED BY '${ASSESS_DB_AI_PASSWORD}';
GRANT SELECT, INSERT, UPDATE, DELETE, DROP ON diary_ai.* TO 'diary_ai'@'%';
CREATE USER 'diary_test'@'%' IDENTIFIED BY '${ASSESS_DB_TEST_PASSWORD}';
GRANT ALL ON reflection_diary_test.* TO 'diary_test'@'%';
GRANT ALL ON diary_ai_test.* TO 'diary_test'@'%';
SQL
```

  (Passwords are 32 alphanumerics from the driver, so they need no SQL escaping. Task 3's
  generator guarantees that.)

- [ ] **Step 6: Write `deploy/assess/mysql-init/02-ai-schema.sh`:**

```bash
#!/bin/bash
# First start only (CAP-71): the sidecar's tables, from the file the live demo uses.
set -euo pipefail
mysql -u root -p"$MYSQL_ROOT_PASSWORD" diary_ai < /ai-schema.sql
```

  `chmod 755` both scripts.

- [ ] **Step 7: Ignore `.assess/`.** Append to `.gitignore`:

```gitignore
# The assessor's generated passwords, key and personas (CAP-71). Never committed.
/.assess/
```

- [ ] **Step 8: Run the checks.** `python3 scripts/assess.test.py` → all `ok`.
  `python3 scripts/deploy-demo.test.py` → `All passed.`

- [ ] **Step 9: Commit.**

```bash
git add deploy/assess deploy/demo/web.Caddyfile .gitignore scripts/assess.test.py
git commit -m "feat(deploy): the diary-assess Compose project and its own MySQL (CAP-71)"
```

---

### Task 3: `./assess up`, `status` and `down`

**Files:**
- Create: `assess`
- Modify: `scripts/assess.test.py`

**Interfaces:**
- Consumes: Task 2's compose file and the `ASSESS_*` variables.
- Produces, as bash functions inside `assess` (Tasks 4–6 add commands that call them):
  `say`, `ok`, `warn`, `die`; `compose ARGS...` (exports `.assess/env`, runs
  `docker compose -f deploy/assess/compose.yml ARGS`); `ensure_secrets`;
  `write_api_env`; `ensure_ai_env`; `seeded` (exit 0 when the app database has users);
  `seed`; `wait_for_web`; `port` (prints `${ASSESS_PORT:-8080}`); `ai_on` (exit 0 when
  `.assess/ai.env` has `AI_ENABLED=true`).

- [ ] **Step 1: Write the failing stub tests.** Append to `scripts/assess.test.py`. The
  driver runs with a `PATH` whose `docker` and `curl` are stubs that log their arguments,
  in a copy of the repository's `assess` and `deploy/assess` under a temp dir:

```python
print("./assess against stubs")


def sandbox(docker_script, curl_script="exit 0"):
    d = pathlib.Path(tempfile.mkdtemp())
    (d / "bin").mkdir()
    (d / "repo" / "deploy" / "assess").mkdir(parents=True)
    (d / "repo" / "db").mkdir()
    (d / "repo" / "db" / "01-schema.sql").write_text("-- stub")
    (d / "repo" / "assess").write_text(read(ROOT / "assess"))
    (d / "repo" / "deploy" / "assess" / "compose.yml").write_text(read(ASSESS_DIR / "compose.yml"))
    for name, body in (("docker", docker_script), ("curl", curl_script)):
        p = d / "bin" / name
        p.write_text(f"#!/bin/bash\necho \"$0 $*\" >> {d}/calls.log\n{body}\n")
        p.chmod(0o755)
    for tool in ("bash", "sed", "grep", "tr", "head", "cat", "mkdir", "chmod", "rm", "mv",
                 "printf", "date", "sleep", "env", "awk", "od", "base64", "mktemp", "uname",
                 "cut", "wc", "ls", "dirname", "basename", "seq"):
        found = subprocess.run(["bash", "-c", f"command -v {tool}"], capture_output=True, text=True).stdout.strip()
        if found and found.startswith("/"):
            os.symlink(found, d / "bin" / tool)
    return d


def run_assess(d, *args, stdin=""):
    env = {"PATH": str(d / "bin"), "HOME": str(d), "TERM": "dumb", "ASSESS_NO_TTY": "1"}
    return subprocess.run(["bash", str(d / "repo" / "assess"), *args], cwd=d / "repo",
                          input=stdin, capture_output=True, text=True, env=env, timeout=60)


# docker present, compose missing (this Mac before Task 0)
d = sandbox('if [ "$1" = compose ]; then echo "docker: unknown command: docker compose" >&2; exit 1; fi\n'
            'if [ "$1" = info ]; then exit 0; fi')
r = run_assess(d, "up")
check("no Compose v2: says so and stops", r.returncode != 0 and "Compose v2" in r.stderr, r.stderr)

# Docker installed but not running
d = sandbox('if [ "$1" = info ]; then exit 1; fi\nexit 0')
r = run_assess(d, "up")
check("Docker not running: says to start it", r.returncode != 0 and "start Docker" in r.stderr, r.stderr)

# port in use: the stub curl answers on it
d = sandbox('exit 0', 'exit 0')
r = run_assess(d, "up")
check("port in use: names ASSESS_PORT and builds nothing", r.returncode != 0 and "ASSESS_PORT" in r.stderr
      and "build" not in read(d / "calls.log"), r.stderr)

# secrets: generated once, mode 600, alphanumeric, kept on a re-run
d = sandbox('exit 0', 'exit 7')
run_assess(d, "status")
env1 = read(d / "repo" / ".assess" / "env")
mode = stat.S_IMODE((d / "repo" / ".assess" / "env").stat().st_mode) if env1 else 0
pw = re.findall(r"^ASSESS_DB_\w+_PASSWORD=([A-Za-z0-9]+)$", env1, re.M)
check("secrets are generated: four passwords of 32 alphanumerics", len(pw) == 4 and all(len(p) == 32 for p in pw), env1)
check("APP_KEY is base64 of 32 bytes", re.search(r"^ASSESS_APP_KEY=base64:[A-Za-z0-9+/]{43}=$", env1, re.M) is not None, env1)
check(".assess/env is mode 600", mode == 0o600, oct(mode))
run_assess(d, "status")
check("a re-run keeps the same secrets", read(d / "repo" / ".assess" / "env") == env1)
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
    check(f"up with {users} users {'seeds' if should_seed else 'does not reseed'}",
          r.returncode == 0 and seeded_now == should_seed, r.stdout[-400:] + r.stderr[-400:])
```

- [ ] **Step 2: Run them and see them fail** (`assess` does not exist yet).

- [ ] **Step 3: Write `assess`.** Executable (`chmod 755`), at the repository root:

```bash
#!/usr/bin/env bash
#
# The Reflection Diary on an assessor's machine (CAP-71, ADR #67): the whole
# product in Docker with its own MySQL, the seeded demo, an optional AI on your
# own Anthropic key, and every test suite. docs/Assessor-Guide.md explains it.
#
#   ./assess            build, start and seed, then print the address
#   ./assess ai         add, replace or remove your Anthropic key, or change the cap
#   ./assess test       the backend, AI and browser suites (or: test api|ai|web)
#   ./assess reset      reseed the demo and empty the AI's tables
#   ./assess smoke      check the running stack from outside
#   ./assess status     what is running
#   ./assess down       stop it (down --wipe also deletes its data and images)
#
# Generated passwords, Laravel's key and your Anthropic key live in .assess/,
# which git ignores. None is ever put on a command line.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
STATE="$ROOT/.assess"
COMPOSE_FILE="$ROOT/deploy/assess/compose.yml"
[ -f db/01-schema.sql ] && [ -f "$COMPOSE_FILE" ] || { echo "Run this from the cse3cap repository." >&2; exit 1; }

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
ok()   { printf '    \033[32mok\033[0m    %s\n' "$*"; }
warn() { printf '    \033[33m!!\033[0m    %s\n' "$*" >&2; }
die()  { printf '\n\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

port() { printf '%s' "${ASSESS_PORT:-8080}"; }
url()  { printf 'http://localhost:%s' "$(port)"; }

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
need_docker() {
    command -v docker >/dev/null 2>&1 \
        || die "Docker is not installed. Install Docker Desktop (https://docs.docker.com/get-docker/), start it, and run ./assess again."
    docker info >/dev/null 2>&1 \
        || die "Docker is installed but not running. Start Docker Desktop (or the docker service), then run ./assess again."
    docker compose version >/dev/null 2>&1 \
        || die "Docker Compose v2 is missing ('docker compose' is not a command here). Install Docker Desktop, or the docker-compose plugin, then run ./assess again."
}

port_free() {
    # Something already answering on the port means ours would fail to bind.
    if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$(port)/" 2>/dev/null; then
        return 1
    fi
    return 0
}

# ---------------------------------------------------------------------------
# State: .assess/
# ---------------------------------------------------------------------------
secret() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32; }

write_private() { # write_private FILE: stdin to FILE, mode 600 from the start
    local tmp
    umask 077
    tmp="$(mktemp "$1.XXXXXX")"
    cat >"$tmp"
    chmod 600 "$tmp"
    mv "$tmp" "$1"
}

ensure_secrets() {
    mkdir -p "$STATE"
    chmod 700 "$STATE"
    [ -f "$STATE/env" ] && return 0
    {
        printf 'ASSESS_DB_ROOT_PASSWORD=%s\n' "$(secret)"
        printf 'ASSESS_DB_APP_PASSWORD=%s\n' "$(secret)"
        printf 'ASSESS_DB_AI_PASSWORD=%s\n' "$(secret)"
        printf 'ASSESS_DB_TEST_PASSWORD=%s\n' "$(secret)"
        printf 'ASSESS_APP_KEY=base64:%s\n' "$(head -c 32 /dev/urandom | base64 | tr -d '\n')"
    } | write_private "$STATE/env"
}

load_secrets() { set -a; . "$STATE/env"; set +a; }

write_api_env() {
    load_secrets
    write_private "$STATE/api.env" <<EOF
APP_NAME="Reflection Diary"
APP_ENV=production
APP_DEBUG=false
APP_URL=$(url)
FRONTEND_URL=$(url)
APP_KEY=$ASSESS_APP_KEY
LOG_CHANNEL=stderr
LOG_LEVEL=warning
DB_CONNECTION=mysql
DB_HOST=mysql
DB_PORT=3306
DB_DATABASE=reflection_diary_assess
DB_USERNAME=diary_app
DB_PASSWORD=$ASSESS_DB_APP_PASSWORD
DB_COLLATION=utf8mb4_0900_ai_ci
MYSQL_ATTR_SSL_CA=
CACHE_STORE=file
SESSION_DRIVER=file
QUEUE_CONNECTION=sync
EOF
}

ensure_ai_env() { # AI off until a key is given; the database URL is always there
    load_secrets
    [ -f "$STATE/ai.env" ] && return 0
    write_private "$STATE/ai.env" <<EOF
AI_ENABLED=false
DIARY_API_BASE=http://diary-web/api/v1
DATABASE_URL=mysql://diary_ai:$ASSESS_DB_AI_PASSWORD@mysql:3306/diary_ai
DAILY_CAP_USD=1
ANTHROPIC_API_KEY=
EOF
}

ensure_personas() { [ -f "$STATE/personas.json" ] || printf '[]\n' | write_private "$STATE/personas.json"; }

ai_on() { grep -qx 'AI_ENABLED=true' "$STATE/ai.env" 2>/dev/null; }

compose() { load_secrets; docker compose -f "$COMPOSE_FILE" "$@"; }

# ---------------------------------------------------------------------------
# Seeding: scripts/demo-reset.sh's steps, against this project only
# ---------------------------------------------------------------------------
seeded() {
    local n
    n="$(compose run --rm -T diary-api php artisan tinker --execute 'echo App\Models\User::count();' 2>/dev/null | tr -dc '0-9')"
    [ -n "$n" ] && [ "$n" -gt 0 ]
}

seed() {
    local work
    work="$(mktemp -d)"
    chmod 700 "$work"
    trap 'rm -rf "$work"' RETURN
    say "Seeding the demo"
    compose run --rm -T diary-api php artisan migrate:fresh --drop-views --seed --force --no-interaction --no-ansi \
        >"$work/seed.txt" || die "Seeding failed. Run ./assess reset to try again, or ./assess down --wipe for a clean start."
    compose run --rm -T diary-api php artisan tinker --execute '
        require "/app/scripts/lib/demo-people.php";
        foreach (DEMO_PEOPLE as [$id, $name]) {
            $user = App\Models\User::where("display_name", $name)->first();
            if ($user === null || $user->tokens()->exists()) { continue; }
            $token = $user->createToken("demo", ["*"], now()->addDays(Database\Seeders\DemoSeeder::TOKEN_LIFETIME_DAYS));
            echo $name, " ", $token->plainTextToken, PHP_EOL;
        }' >>"$work/seed.txt"
    compose run --rm -T -v "$work:/seed:ro" diary-api php /app/scripts/demo-personas.php /seed/seed.txt \
        | write_private "$STATE/personas.json"
    compose run --rm -T diary-ai python -m sidecar.reset >/dev/null 2>&1 \
        || warn "The AI's tables were not emptied; they fill again as the AI is used."
    ok "seeded: $(grep -c '"token"' "$STATE/personas.json") people to sign in as"
}

wait_for_web() {
    for _ in $(seq 1 60); do
        curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$(port)/up" && return 0
        sleep 2
    done
    die "The app did not answer on $(url). See the logs: docker compose -f deploy/assess/compose.yml logs"
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
cmd_up() {
    need_docker
    ensure_secrets
    write_api_env
    ensure_ai_env
    ensure_personas
    if [ -z "$(compose ps -q diary-web 2>/dev/null)" ] && ! port_free; then
        die "Port $(port) is in use. Free it, or choose another: ASSESS_PORT=8090 ./assess"
    fi
    say "Building and starting (the first run takes 5-10 minutes)"
    compose build || die "A build failed (above). Check Docker has 4 GB of memory and a network, then run ./assess again."
    compose up -d mysql || die "MySQL did not start (above)."
    seeded || seed
    compose up -d || die "The stack did not start (above)."
    wait_for_web
    ai_offer
    print_ready
}

print_ready() {
    say "Ready"
    printf '    Open %s and pick a person to sign in as.\n' "$(url)"
    printf '    Jane N is a student on both gigs; Sam O assesses; Dr Lee supervises.\n'
    if ai_on; then printf '    AI: on, your key, capped at US$%s a day.\n' "$(sed -n 's/^DAILY_CAP_USD=//p' "$STATE/ai.env")"
    else printf '    AI: off. ./assess ai turns it on with your own Anthropic key.\n'; fi
    printf '    Tests: ./assess test    Stop: ./assess down\n'
}

cmd_status() {
    ensure_secrets; ensure_ai_env; ensure_personas
    say "Status"
    if [ -n "$(compose ps -q diary-web 2>/dev/null)" ]; then ok "running at $(url)"; else warn "not running: ./assess"; fi
    if ai_on; then ok "AI on"; else ok "AI off"; fi
}

cmd_down() {
    need_docker
    ensure_secrets; ensure_ai_env; ensure_personas
    if [ "${1:-}" = "--wipe" ]; then
        compose --profile test down --volumes --rmi local
        rm -rf "$STATE"
        ok "stopped, and its database, images and .assess/ deleted"
    else
        compose --profile test down
        ok "stopped. ./assess starts it again with the same data"
    fi
}

ai_offer() { :; }   # Task 5 replaces this with the key prompt

case "${1:-up}" in
    up)     cmd_up ;;
    status) cmd_status ;;
    down)   shift; cmd_down "${1:-}" ;;
    -h|--help|help) sed -n '3,16p' "$0" | sed 's/^# \{0,1\}//' ;;
    *) die "Unknown command '$1'. ./assess help lists them." ;;
esac
```

- [ ] **Step 4: Run the stub tests.** `python3 scripts/assess.test.py` → all `ok`. If a stub
  test fails because a tool is missing from the sandbox, add it to the `sandbox()` list, not
  to the driver.

- [ ] **Step 5: Commit.**

```bash
git add assess scripts/assess.test.py
git commit -m "feat: ./assess brings the product up with its own MySQL and the seeded demo (CAP-71)"
```

---

### Task 4: `./assess smoke`

**Files:** Modify `assess`, `scripts/assess.test.py`.

**Interfaces:**
- Consumes: `port`, `ai_on`, `ensure_*` from Task 3.
- Produces: `cmd_smoke` (exit 0 when every check passes, prints one line per check).

- [ ] **Step 1: Write the failing stub test.** Append:

```python
d = sandbox('exit 0', '''
case "$*" in
  *"/demo/personas.json"*) echo '[{"name":"Jane N","token":"t1"},{"token":"t2"},{"token":"t3"},{"token":"t4"},{"token":"t5"},{"token":"t6"}]' ;;
  *"/ai/v1/status"*) echo '404' ;;
  *) echo 200 ;;
esac''')
r = run_assess(d, "smoke")
check("smoke: passes when the stack answers as expected", r.returncode == 0 and "6 people" in r.stdout, r.stdout + r.stderr)
check("smoke: a persona token never reaches a command line", "t1" not in read(d / "calls.log").replace("personas", ""))
```

- [ ] **Step 2: Run it and see it fail** (`Unknown command 'smoke'`).

- [ ] **Step 3: Implement.** Add before the `case`:

```bash
http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$@"; }

cmd_smoke() {
    ensure_secrets; ensure_ai_env; ensure_personas
    local base="http://127.0.0.1:$(port)" fails=0 people token hdr code
    say "Smoke"
    [ "$(http_code "$base/")" = 200 ] && ok "the page loads" || { warn "the page does not load"; fails=1; }
    [ "$(http_code "$base/up")" = 200 ] && ok "/up answers" || { warn "/up does not answer"; fails=1; }
    people="$(curl -s --max-time 5 "$base/demo/personas.json" | grep -o '"token"' | wc -l | tr -d ' ')"
    [ "$people" = 6 ] && ok "personas.json lists $people people" || { warn "personas.json lists ${people:-0} people, not 6"; fails=1; }
    token="$(sed -n 's/.*"token": *"\([^"]*\)".*/\1/p' "$STATE/personas.json" | head -n 1)"
    hdr="$(mktemp)"; chmod 600 "$hdr"
    printf 'Authorization: Bearer %s\n' "$token" >"$hdr"
    code="$(http_code -H @"$hdr" "$base/api/v1/auth/me")"; rm -f "$hdr"
    [ "$code" = 200 ] && ok "a persona's token reads /api/v1/auth/me" || { warn "/api/v1/auth/me answered $code to a persona"; fails=1; }
    code="$(http_code "$base/ai/v1/status")"
    if ai_on; then want=401; else want=404; fi
    [ "$code" = "$want" ] && ok "/ai/v1/status answers $code (AI $(ai_on && echo on || echo off))" \
        || { warn "/ai/v1/status answered $code, wanted $want"; fails=1; }
    [ "$fails" = 0 ] || die "Smoke failed (above)."
}
```

  and `smoke)  cmd_smoke ;;` in the `case`. The stub prints the status code that
  `http_code`'s `-w '%{http_code}'` would, so `/`, `/up` and `/auth/me` read 200 and
  `/ai/v1/status` reads 404 (AI off in a fresh sandbox).

- [ ] **Step 4: Run the tests.** All `ok`.

- [ ] **Step 5: Commit.** `git commit -am "feat: ./assess smoke checks the running stack from outside (CAP-71)"`

---

### Task 5: The AI key

**Files:** Modify `assess`, `scripts/assess.test.py`.

**Interfaces:**
- Consumes: `ensure_ai_env`, `write_private`, `compose`, `port`, `ai_on`.
- Produces: `ai_offer` (the first-run prompt), `cmd_ai [--cap N | --off]`,
  `set_ai_var NAME VALUE`, `check_key KEY` (exit 0 when Anthropic accepts it; prints
  Anthropic's message on refusal), `restart_ai` (recreates `diary-ai` and confirms its
  status: 401 on, 404 off).

- [ ] **Step 1: Write the failing stub tests.** Append:

```python
REFUSED = '{"type":"error","error":{"type":"invalid_request_error","message":"This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header"}}'
d = sandbox('exit 0', f'''
case "$*" in
  *api.anthropic.com*) printf '%s' '{REFUSED}' > "$(echo "$*" | sed -n 's/.*-o \\([^ ]*\\).*/\\1/p')"; echo 400 ;;
  *) echo 401 ;;
esac''')
r = run_assess(d, "ai", stdin="1\n  sk-ant-api03-REFUSEDKEY0000000000  \n")
ai_env = read(d / "repo" / ".assess" / "ai.env")
check("a refused key: Anthropic's message is shown", "not scoped to a workspace" in r.stderr, r.stderr)
check("a refused key: the workspace hint is shown", "inside a workspace" in r.stderr, r.stderr)
check("a refused key is not saved", "REFUSEDKEY" not in ai_env and "AI_ENABLED=false" in ai_env, ai_env)
check("the key never reaches a command line", "REFUSEDKEY" not in read(d / "calls.log"))

d = sandbox('exit 0', '''
case "$*" in
  *api.anthropic.com*) echo 200 ;;
  *) echo 401 ;;
esac''')
r = run_assess(d, "ai", stdin="1\nsk-ant-api03-GOODKEY00000000000000\n")
ai_env = read(d / "repo" / ".assess" / "ai.env")
check("an accepted key turns the AI on, whitespace stripped",
      "ANTHROPIC_API_KEY=sk-ant-api03-GOODKEY00000000000000\n" in ai_env and "AI_ENABLED=true" in ai_env, ai_env)
check("the cap defaults to US$1", "DAILY_CAP_USD=1\n" in ai_env, ai_env)
run_assess(d, "ai", "--cap", "5")
check("--cap sets the cap", "DAILY_CAP_USD=5\n" in read(d / "repo" / ".assess" / "ai.env"))
run_assess(d, "ai", "--off")
ai_env = read(d / "repo" / ".assess" / "ai.env")
check("--off removes the key and turns the AI off", "GOODKEY" not in ai_env and "AI_ENABLED=false" in ai_env, ai_env)
r = run_assess(d, "ai", "--cap", "lots")
check("--cap refuses a non-number", r.returncode != 0 and "a number" in r.stderr, r.stderr)
```

- [ ] **Step 2: Run them and see them fail.**

- [ ] **Step 3: Implement.** Replace the `ai_offer` stub and add, before the `case`:

```bash
set_ai_var() { # set_ai_var NAME VALUE: the value travels in the environment, never argv
    local tmp
    tmp="$(mktemp "$STATE/ai.env.XXXXXX")"
    NAME="$1" VALUE="$2" awk 'BEGIN { n = ENVIRON["NAME"]; v = ENVIRON["VALUE"] }
        index($0, n "=") == 1 { print n "=" v; done = 1; next } { print }
        END { if (!done) print n "=" v }' "$STATE/ai.env" >"$tmp"
    chmod 600 "$tmp"
    mv "$tmp" "$STATE/ai.env"
}

check_key() { # check_key KEY: asks Anthropic, never puts the key on a command line
    local hdr body code
    hdr="$(mktemp)"; body="$(mktemp)"; chmod 600 "$hdr" "$body"
    printf 'x-api-key: %s\nanthropic-version: 2023-06-01\n' "$1" >"$hdr"
    code="$(curl -s -o "$body" -w '%{http_code}' --max-time 20 -H @"$hdr" https://api.anthropic.com/v1/models || true)"
    rm -f "$hdr"
    if [ "$code" = 200 ]; then rm -f "$body"; return 0; fi
    warn "Anthropic answered $code: $(sed -n 's/.*"message": *"\([^"]*\)".*/\1/p' "$body" | head -n 1)"
    grep -q 'workspace' "$body" && warn "Make the key inside a workspace: Anthropic Console > Settings > Workspaces > API keys."
    rm -f "$body"
    return 1
}

restart_ai() {
    # Stopped: the new settings apply when ./assess next starts it.
    [ -n "$(compose ps -q diary-ai 2>/dev/null)" ] || { ok "saved; it applies when the stack next starts (./assess)"; return 0; }
    compose up -d --no-deps --force-recreate diary-ai >/dev/null
    local want code
    if ai_on; then want=401; else want=404; fi
    for _ in $(seq 1 60); do
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$(port)/ai/v1/status" || true)"
        [ "$code" = "$want" ] && { ok "the AI answers $code ($(ai_on && echo on || echo off))"; return 0; }
        sleep 3
    done
    warn "The AI did not answer $want yet (it loads a model on first start). ./assess smoke checks again."
}

read_key() { # prints the pasted key, whitespace stripped; nothing when skipped
    local key=""
    if [ -n "${ANTHROPIC_API_KEY:-}" ] && [ -z "${ASSESS_NO_TTY:-}" ]; then
        read -r -p "    Use the key in ANTHROPIC_API_KEY? [Y/n] " use </dev/tty
        [[ "$use" != [nN]* ]] && { printf '%s' "$ANTHROPIC_API_KEY" | tr -d '[:space:]'; return; }
    fi
    if [ -n "${ASSESS_NO_TTY:-}" ]; then read -r key; else read -rs -p "    Paste an Anthropic API key, or press Enter to skip: " key </dev/tty; echo >&2; fi
    printf '%s' "$key" | tr -d '[:space:]'
}

take_key() { # asks, checks and saves; returns 1 if skipped or refused
    local key
    key="$(read_key)"
    [ -n "$key" ] || { ok "skipped: the AI stays off"; return 1; }
    check_key "$key" || { warn "nothing saved"; return 1; }
    set_ai_var ANTHROPIC_API_KEY "$key"
    set_ai_var AI_ENABLED true
    ok "key accepted and saved to .assess/ai.env"
    printf '    Try it: Jane on a draft (Ask me questions), Tom on an assessed reflection with a gap,\n'
    printf '    Sam in the review queue (search by meaning, recurring themes).\n'
}

ai_offer() { # first run only: once the key file has been written, never ask again
    [ -f "$STATE/ai-offered" ] && return 0
    : | write_private "$STATE/ai-offered"
    say "AI features (optional)"
    printf '    The coach, calibration questions, similar reflections, search and themes.\n'
    printf '    They use your own Anthropic key, capped at US$1 a day.\n'
    take_key && restart_ai || true
}

cmd_ai() {
    ensure_secrets; ensure_ai_env; ensure_personas
    case "${1:-}" in
        --cap)
            [[ "${2:-}" =~ ^[0-9]+([.][0-9]+)?$ ]] || die "--cap takes a number of US dollars a day, e.g. ./assess ai --cap 5"
            set_ai_var DAILY_CAP_USD "$2"; ok "cap: US\$$2 a day"; restart_ai; return ;;
        --off)
            set_ai_var ANTHROPIC_API_KEY ""; set_ai_var AI_ENABLED false; ok "key removed, AI off"; restart_ai; return ;;
        "") ;;
        *) die "./assess ai takes --cap N or --off, or nothing to choose." ;;
    esac
    say "AI"
    if ai_on; then
        printf '    on · key …%s · cap US$%s a day\n' "$(sed -n 's/^ANTHROPIC_API_KEY=.*\(....\)$/\1/p' "$STATE/ai.env")" \
            "$(sed -n 's/^DAILY_CAP_USD=//p' "$STATE/ai.env")"
    else printf '    off\n'; fi
    printf '    1) add or replace the key   2) change the cap   3) turn the AI off   Enter) leave it\n'
    local choice
    if [ -n "${ASSESS_NO_TTY:-}" ]; then read -r choice; else read -r -p "    > " choice </dev/tty; fi
    case "$choice" in
        1) take_key && restart_ai || true ;;
        2) local cap; if [ -n "${ASSESS_NO_TTY:-}" ]; then read -r cap; else read -r -p "    US\$ a day: " cap </dev/tty; fi
           cmd_ai --cap "$cap" ;;
        3) cmd_ai --off ;;
        *) ok "unchanged" ;;
    esac
}
```

  and `ai)     shift; cmd_ai "$@" ;;` in the `case`.

- [ ] **Step 4: Run the tests.** All `ok`.

- [ ] **Step 5: Commit.** `git commit -am "feat: ./assess ai, the assessor's own key checked, capped and never on a command line (CAP-71)"`

---

### Task 6: `./assess test` and `./assess reset`

**Files:** Modify `assess`, `scripts/assess.test.py`.

**Interfaces:**
- Consumes: `compose`, `seed`, `restart_ai`, `need_docker`.
- Produces: `cmd_test [api|ai|web]` (runs `compose --profile test run --rm --build SERVICE`
  per suite, collects pass/fail, prints `api passed · ai passed · web FAILED`, exits
  non-zero on any failure), `cmd_reset`.

- [ ] **Step 1: Write the failing stub tests.** Append:

```python
d = sandbox('case "$*" in *"run --rm --build ai-test"*) exit 1 ;; *) exit 0 ;; esac', 'exit 7')
r = run_assess(d, "test")
calls = read(d / "calls.log")
check("test runs all three suites", all(f"run --rm --build {s}-test" in calls for s in ("api", "ai", "web")), calls)
check("test reports each suite and exits non-zero on a failure",
      r.returncode != 0 and "ai FAILED" in r.stdout and "api passed" in r.stdout and "web passed" in r.stdout,
      r.stdout + r.stderr)
d = sandbox('exit 0', 'exit 7')
run_assess(d, "test", "web")
calls = read(d / "calls.log")
check("test web runs only the browser suite", "web-test" in calls and "api-test" not in calls and "ai-test" not in calls, calls)
r = run_assess(d, "test", "everything")
check("test refuses an unknown suite", r.returncode != 0 and "api, ai or web" in r.stderr, r.stderr)
```

- [ ] **Step 2: Run them and see them fail.**

- [ ] **Step 3: Implement.** Before the `case`:

```bash
cmd_test() {
    need_docker
    ensure_secrets; write_api_env; ensure_ai_env; ensure_personas
    local suites=(api ai web) results=() failed=0 s
    if [ -n "${1:-}" ]; then
        case "$1" in api|ai|web) suites=("$1") ;; *) die "./assess test takes api, ai or web, or nothing for all three." ;; esac
    fi
    compose up -d mysql >/dev/null || die "MySQL did not start (above)."
    for s in "${suites[@]}"; do
        say "Tests: $s"
        if compose --profile test run --rm --build "$s-test"; then results+=("$s passed")
        else results+=("$s FAILED"); failed=1; fi
    done
    say "Summary"
    local line="" r
    for r in "${results[@]}"; do line="${line:+$line · }$r"; done
    printf '    %s\n' "$line"
    [ "$failed" = 0 ] || exit 1
}

cmd_reset() {
    need_docker
    ensure_secrets; write_api_env; ensure_ai_env; ensure_personas
    compose up -d mysql >/dev/null || die "MySQL did not start (above)."
    seed
    compose up -d >/dev/null
    ok "reset: everyone signed in must reload the page"
}
```

  and `test)   shift; cmd_test "${1:-}" ;;` and `reset)  cmd_reset ;;` in the `case`.

- [ ] **Step 4: Run the tests.** All `ok`.

- [ ] **Step 5: Commit.** `git commit -am "feat: ./assess test runs every suite in containers, ./assess reset reseeds (CAP-71)"`

---

### Task 7: `assess.ps1`, the PowerShell twin

**Files:**
- Create: `assess.ps1`
- Modify: `scripts/assess.test.py`

**Interfaces:**
- Produces: the same commands and output as `assess`, using `Invoke-WebRequest` for HTTP,
  `[Security.Cryptography.RandomNumberGenerator]` for secrets, and the same `.assess/`
  files, so either driver can pick up where the other left off.

- [ ] **Step 1: Write the failing parity check.** Append:

```python
print("assess.ps1: the same commands")
bash_cmds = set(re.findall(r"^\s+(up|ai|test|reset|smoke|status|down)\)", read(ROOT / "assess"), re.M))
ps_cmds = set(re.findall(r"^\s+'(up|ai|test|reset|smoke|status|down)'\s*\{", read(ROOT / "assess.ps1"), re.M))
check("assess and assess.ps1 offer the same commands", bash_cmds == ps_cmds and len(bash_cmds) == 7,
      f"bash {sorted(bash_cmds)} ps1 {sorted(ps_cmds)}")
```

- [ ] **Step 2: Run it and see it fail.**

- [ ] **Step 3: Write `assess.ps1`.** Same structure and messages as `assess`:

```powershell
<#
The Reflection Diary on an assessor's machine (CAP-71, ADR #67), for Windows.
The same commands as ./assess; docs/Assessor-Guide.md explains them.

  .\assess.ps1            build, start and seed, then print the address
  .\assess.ps1 ai         add, replace or remove your Anthropic key, or change the cap
  .\assess.ps1 test       the backend, AI and browser suites (or: test api|ai|web)
  .\assess.ps1 reset      reseed the demo and empty the AI's tables
  .\assess.ps1 smoke      check the running stack from outside
  .\assess.ps1 status     what is running
  .\assess.ps1 down       stop it (down --wipe also deletes its data and images)
#>
param([Parameter(Position = 0)][string]$Command = 'up', [Parameter(ValueFromRemainingArguments)][string[]]$Rest = @())
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$State = Join-Path $PSScriptRoot '.assess'
$ComposeFile = Join-Path $PSScriptRoot 'deploy/assess/compose.yml'
if (-not (Test-Path 'db/01-schema.sql') -or -not (Test-Path $ComposeFile)) { Write-Error 'Run this from the cse3cap repository.'; exit 1 }

function Say($m)  { Write-Host "`n==> $m" -ForegroundColor White }
function Ok($m)   { Write-Host "    ok    $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    !!    $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "`nError: $m" -ForegroundColor Red; exit 1 }
function Port     { if ($env:ASSESS_PORT) { $env:ASSESS_PORT } else { '8080' } }
function Url      { "http://localhost:$(Port)" }

function Need-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Die 'Docker is not installed. Install Docker Desktop (https://docs.docker.com/get-docker/), start it, and run .\assess.ps1 again.' }
    docker info *> $null; if ($LASTEXITCODE -ne 0) { Die 'Docker is installed but not running. Start Docker Desktop, then run .\assess.ps1 again.' }
    docker compose version *> $null; if ($LASTEXITCODE -ne 0) { Die "Docker Compose v2 is missing ('docker compose' is not a command here). Install Docker Desktop, then run .\assess.ps1 again." }
}

function Secret {
    $chars = [char[]]'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    $bytes = [byte[]]::new(32); [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

function Write-Private($Path, [string]$Text) {
    New-Item -ItemType Directory -Force -Path $State | Out-Null
    [IO.File]::WriteAllText($Path, $Text.Replace("`r`n", "`n"))
    if (-not $IsWindows) { chmod 600 $Path }
}

function Ensure-Secrets {
    if (Test-Path "$State/env") { return }
    $key = [byte[]]::new(32); [Security.Cryptography.RandomNumberGenerator]::Fill($key)
    Write-Private "$State/env" (@(
        "ASSESS_DB_ROOT_PASSWORD=$(Secret)", "ASSESS_DB_APP_PASSWORD=$(Secret)",
        "ASSESS_DB_AI_PASSWORD=$(Secret)", "ASSESS_DB_TEST_PASSWORD=$(Secret)",
        "ASSESS_APP_KEY=base64:$([Convert]::ToBase64String($key))") -join "`n") + "`n")
}

function Load-Secrets { Get-Content "$State/env" | ForEach-Object { $n, $v = $_ -split '=', 2; Set-Item "env:$n" $v } }
function Ai-Var($Name) { (Get-Content "$State/ai.env" | Where-Object { $_ -like "$Name=*" } | Select-Object -First 1) -replace "^$Name=", '' }
function Ai-On { (Ai-Var 'AI_ENABLED') -eq 'true' }
function Set-AiVar($Name, $Value) {
    $lines = @(Get-Content "$State/ai.env" | Where-Object { $_ -notlike "$Name=*" }) + "$Name=$Value"
    Write-Private "$State/ai.env" (($lines -join "`n") + "`n")
}

function Write-ApiEnv {
    Load-Secrets
    Write-Private "$State/api.env" (@(
        'APP_NAME="Reflection Diary"', 'APP_ENV=production', 'APP_DEBUG=false',
        "APP_URL=$(Url)", "FRONTEND_URL=$(Url)", "APP_KEY=$env:ASSESS_APP_KEY",
        'LOG_CHANNEL=stderr', 'LOG_LEVEL=warning', 'DB_CONNECTION=mysql', 'DB_HOST=mysql', 'DB_PORT=3306',
        'DB_DATABASE=reflection_diary_assess', 'DB_USERNAME=diary_app', "DB_PASSWORD=$env:ASSESS_DB_APP_PASSWORD",
        'DB_COLLATION=utf8mb4_0900_ai_ci', 'MYSQL_ATTR_SSL_CA=', 'CACHE_STORE=file', 'SESSION_DRIVER=file',
        'QUEUE_CONNECTION=sync') -join "`n") + "`n")
}

function Ensure-AiEnv {
    Load-Secrets
    if (Test-Path "$State/ai.env") { return }
    Write-Private "$State/ai.env" (@('AI_ENABLED=false', 'DIARY_API_BASE=http://diary-web/api/v1',
        "DATABASE_URL=mysql://diary_ai:$($env:ASSESS_DB_AI_PASSWORD)@mysql:3306/diary_ai",
        'DAILY_CAP_USD=1', 'ANTHROPIC_API_KEY=') -join "`n") + "`n")
}

function Ensure-Personas { if (-not (Test-Path "$State/personas.json")) { Write-Private "$State/personas.json" "[]`n" } }
function Ensure-State { Ensure-Secrets; Write-ApiEnv; Ensure-AiEnv; Ensure-Personas }
function Compose { Load-Secrets; docker compose -f $ComposeFile @args }
function Code($Uri, $Headers = @{}) {
    try { (Invoke-WebRequest -Uri $Uri -Headers $Headers -TimeoutSec 5 -SkipHttpErrorCheck -UseBasicParsing).StatusCode } catch { 0 }
}

function Seeded {
    $n = (Compose run --rm -T diary-api php artisan tinker --execute 'echo App\Models\User::count();' 2>$null) -replace '\D', ''
    $n -and [int]$n -gt 0
}

function Seed {
    Say 'Seeding the demo'
    $work = Join-Path ([IO.Path]::GetTempPath()) ("assess-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $work | Out-Null
    try {
        Compose run --rm -T diary-api php artisan migrate:fresh --drop-views --seed --force --no-interaction --no-ansi | Set-Content "$work/seed.txt"
        if ($LASTEXITCODE -ne 0) { Die 'Seeding failed. Run .\assess.ps1 reset to try again, or .\assess.ps1 down --wipe for a clean start.' }
        $php = 'require "/app/scripts/lib/demo-people.php"; foreach (DEMO_PEOPLE as [$id, $name]) { $user = App\Models\User::where("display_name", $name)->first(); if ($user === null || $user->tokens()->exists()) { continue; } $token = $user->createToken("demo", ["*"], now()->addDays(Database\Seeders\DemoSeeder::TOKEN_LIFETIME_DAYS)); echo $name, " ", $token->plainTextToken, PHP_EOL; }'
        Compose run --rm -T diary-api php artisan tinker --execute $php | Add-Content "$work/seed.txt"
        $json = Compose run --rm -T -v "${work}:/seed:ro" diary-api php /app/scripts/demo-personas.php /seed/seed.txt
        Write-Private "$State/personas.json" (($json -join "`n") + "`n")
        Compose run --rm -T diary-ai python -m sidecar.reset *> $null
        if ($LASTEXITCODE -ne 0) { Warn "The AI's tables were not emptied; they fill again as the AI is used." }
        Ok "seeded: $(([regex]::Matches((Get-Content "$State/personas.json" -Raw), '"token"')).Count) people to sign in as"
    } finally { Remove-Item -Recurse -Force $work }
}

function Wait-Web {
    for ($i = 0; $i -lt 60; $i++) { if ((Code "http://127.0.0.1:$(Port)/up") -eq 200) { return }; Start-Sleep 2 }
    Die "The app did not answer on $(Url). See the logs: docker compose -f deploy/assess/compose.yml logs"
}

function Check-Key($Key) {
    try {
        Invoke-WebRequest -Uri 'https://api.anthropic.com/v1/models' -Headers @{ 'x-api-key' = $Key; 'anthropic-version' = '2023-06-01' } -TimeoutSec 20 -UseBasicParsing | Out-Null
        return $true
    } catch {
        $body = $_.ErrorDetails.Message
        $message = try { ($body | ConvertFrom-Json).error.message } catch { $body }
        Warn "Anthropic refused the key: $message"
        if ($body -match 'workspace') { Warn 'Make the key inside a workspace: Anthropic Console > Settings > Workspaces > API keys.' }
        return $false
    }
}

function Restart-Ai {
    Compose up -d --no-deps --force-recreate diary-ai | Out-Null
    $want = if (Ai-On) { 401 } else { 404 }
    for ($i = 0; $i -lt 60; $i++) {
        if ((Code "http://127.0.0.1:$(Port)/ai/v1/status") -eq $want) { Ok "the AI answers $want"; return }
        Start-Sleep 3
    }
    Warn "The AI did not answer $want yet (it loads a model on first start). .\assess.ps1 smoke checks again."
}

function Take-Key {
    $key = ''
    if ($env:ANTHROPIC_API_KEY -and (Read-Host '    Use the key in ANTHROPIC_API_KEY? [Y/n]') -notmatch '^[nN]') { $key = $env:ANTHROPIC_API_KEY }
    else { $key = [Net.NetworkCredential]::new('', (Read-Host '    Paste an Anthropic API key, or press Enter to skip' -AsSecureString)).Password }
    $key = $key -replace '\s', ''
    if (-not $key) { Ok 'skipped: the AI stays off'; return $false }
    if (-not (Check-Key $key)) { Warn 'nothing saved'; return $false }
    Set-AiVar 'ANTHROPIC_API_KEY' $key; Set-AiVar 'AI_ENABLED' 'true'
    Ok 'key accepted and saved to .assess/ai.env'
    Write-Host '    Try it: Jane on a draft (Ask me questions), Tom on an assessed reflection with a gap,'
    Write-Host '    Sam in the review queue (search by meaning, recurring themes).'
    return $true
}

function Ai-Offer {
    if (Test-Path "$State/ai-offered") { return }
    Write-Private "$State/ai-offered" ''
    Say 'AI features (optional)'
    Write-Host '    The coach, calibration questions, similar reflections, search and themes.'
    Write-Host '    They use your own Anthropic key, capped at US$1 a day.'
    if (Take-Key) { Restart-Ai }
}

function Print-Ready {
    Say 'Ready'
    Write-Host "    Open $(Url) and pick a person to sign in as."
    Write-Host '    Jane N is a student on both gigs; Sam O assesses; Dr Lee supervises.'
    if (Ai-On) { Write-Host "    AI: on, your key, capped at US`$$(Ai-Var 'DAILY_CAP_USD') a day." }
    else { Write-Host '    AI: off. .\assess.ps1 ai turns it on with your own Anthropic key.' }
    Write-Host '    Tests: .\assess.ps1 test    Stop: .\assess.ps1 down'
}

switch ($Command) {
    'up' {
        Need-Docker; Ensure-State
        if (-not (Compose ps -q diary-web 2>$null) -and (Code "http://127.0.0.1:$(Port)/") -ne 0) { Die "Port $(Port) is in use. Free it, or choose another: `$env:ASSESS_PORT=8090; .\assess.ps1" }
        Say 'Building and starting (the first run takes 5-10 minutes)'
        Compose build; if ($LASTEXITCODE -ne 0) { Die 'A build failed (above). Check Docker has 4 GB of memory and a network, then run .\assess.ps1 again.' }
        Compose up -d mysql; if ($LASTEXITCODE -ne 0) { Die 'MySQL did not start (above).' }
        if (-not (Seeded)) { Seed }
        Compose up -d; if ($LASTEXITCODE -ne 0) { Die 'The stack did not start (above).' }
        Wait-Web; Ai-Offer; Print-Ready
    }
    'ai' {
        Ensure-State
        switch ($Rest[0]) {
            '--cap' { if ($Rest[1] -notmatch '^\d+(\.\d+)?$') { Die '--cap takes a number of US dollars a day, e.g. .\assess.ps1 ai --cap 5' }; Set-AiVar 'DAILY_CAP_USD' $Rest[1]; Ok "cap: US`$$($Rest[1]) a day"; Restart-Ai }
            '--off' { Set-AiVar 'ANTHROPIC_API_KEY' ''; Set-AiVar 'AI_ENABLED' 'false'; Ok 'key removed, AI off'; Restart-Ai }
            $null {
                Say 'AI'
                if (Ai-On) { $k = Ai-Var 'ANTHROPIC_API_KEY'; Write-Host "    on · key …$($k.Substring($k.Length - 4)) · cap US`$$(Ai-Var 'DAILY_CAP_USD') a day" } else { Write-Host '    off' }
                Write-Host '    1) add or replace the key   2) change the cap   3) turn the AI off   Enter) leave it'
                switch (Read-Host '    >') {
                    '1' { if (Take-Key) { Restart-Ai } }
                    '2' { & $PSCommandPath ai --cap (Read-Host '    US$ a day') }
                    '3' { & $PSCommandPath ai --off }
                    default { Ok 'unchanged' }
                }
            }
            default { Die '.\assess.ps1 ai takes --cap N or --off, or nothing to choose.' }
        }
    }
    'test' {
        Need-Docker; Ensure-State
        $suites = if ($Rest[0]) { if ($Rest[0] -notin 'api', 'ai', 'web') { Die '.\assess.ps1 test takes api, ai or web, or nothing for all three.' }; @($Rest[0]) } else { @('api', 'ai', 'web') }
        Compose up -d mysql | Out-Null
        $results = @(); $failed = $false
        foreach ($s in $suites) {
            Say "Tests: $s"
            Compose --profile test run --rm --build "$s-test"
            if ($LASTEXITCODE -eq 0) { $results += "$s passed" } else { $results += "$s FAILED"; $failed = $true }
        }
        Say 'Summary'; Write-Host "    $($results -join ' · ')"
        if ($failed) { exit 1 }
    }
    'reset' { Need-Docker; Ensure-State; Compose up -d mysql | Out-Null; Seed; Compose up -d | Out-Null; Ok 'reset: everyone signed in must reload the page' }
    'smoke' {
        Ensure-State; $base = "http://127.0.0.1:$(Port)"; $fails = 0
        Say 'Smoke'
        if ((Code "$base/") -eq 200) { Ok 'the page loads' } else { Warn 'the page does not load'; $fails++ }
        if ((Code "$base/up") -eq 200) { Ok '/up answers' } else { Warn '/up does not answer'; $fails++ }
        $people = try { @((Invoke-RestMethod "$base/demo/personas.json" -TimeoutSec 5)).Count } catch { 0 }
        if ($people -eq 6) { Ok "personas.json lists $people people" } else { Warn "personas.json lists $people people, not 6"; $fails++ }
        $token = (Get-Content "$State/personas.json" -Raw | ConvertFrom-Json)[0].token
        $code = Code "$base/api/v1/auth/me" @{ Authorization = "Bearer $token" }
        if ($code -eq 200) { Ok "a persona's token reads /api/v1/auth/me" } else { Warn "/api/v1/auth/me answered $code to a persona"; $fails++ }
        $want = if (Ai-On) { 401 } else { 404 }; $code = Code "$base/ai/v1/status"
        if ($code -eq $want) { Ok "/ai/v1/status answers $code" } else { Warn "/ai/v1/status answered $code, wanted $want"; $fails++ }
        if ($fails) { Die 'Smoke failed (above).' }
    }
    'status' {
        Ensure-State; Say 'Status'
        if (Compose ps -q diary-web 2>$null) { Ok "running at $(Url)" } else { Warn 'not running: .\assess.ps1' }
        if (Ai-On) { Ok 'AI on' } else { Ok 'AI off' }
    }
    'down' {
        Need-Docker; Ensure-State
        if ($Rest[0] -eq '--wipe') { Compose --profile test down --volumes --rmi local; Remove-Item -Recurse -Force $State; Ok "stopped, and its database, images and .assess/ deleted" }
        else { Compose --profile test down; Ok 'stopped. .\assess.ps1 starts it again with the same data' }
    }
    default { Die "Unknown command '$Command'. Get-Help .\assess.ps1 lists them." }
}
```

- [ ] **Step 4: Run the parity check.** `python3 scripts/assess.test.py` → all `ok`.
  `pwsh -NoProfile -Command "& { $null = [System.Management.Automation.Language.Parser]::ParseFile('assess.ps1', [ref]$null, [ref]$errs); $errs }"`
  prints nothing (no parse errors).

- [ ] **Step 5: Commit.** `git add assess.ps1 scripts/assess.test.py && git commit -m "feat: assess.ps1, the same commands on Windows (CAP-71)"`

---

### Task 8: Wiring, the guide, the README and ADR #67

**Files:**
- Modify: `run` (the `check` target and a target of its own), `.github/workflows/ci.yml`,
  `README.md`, `docs/adr/architecture-decision-records.md`
- Create: `docs/Assessor-Guide.md`

- [ ] **Step 1: Run the static check from `./run check` and CI.** In `run`, after
  `step python3 scripts/deploy-demo.test.py` in `check)`, add
  `step python3 scripts/assess.test.py`, and a target
  `assess-test) step python3 scripts/assess.test.py ;;` beside `deploy-demo-test)`, listed in
  the help text beside it. In `.github/workflows/ci.yml`, after the "Check the live demo's
  deploy and gate" step:

```yaml
      # The assessor's one-command path (CAP-71): the stack's shape, and ./assess
      # against stub docker and curl. The real run needs Docker and is done by hand.
      - name: Check the assessor's setup
        run: python3 scripts/assess.test.py
```

- [ ] **Step 2: Write `docs/Assessor-Guide.md`.** Sections, in this order, each written out
  in full (the spec's sections are the source):
  1. *What you need*: Docker Desktop (or Engine with Compose v2), git, about 6 GB of disk
     and 4 GB of memory for Docker. Windows: PowerShell 7 or Windows PowerShell 5.1.
  2. *Start it*: `git clone https://github.com/theintonerzero/cse3cap.git`, `cd cse3cap`,
     `./assess` (Windows `.\assess.ps1`). First run 5–10 minutes. Open
     `http://localhost:8080`.
  3. *Who to sign in as*: a table of the six people and what each shows, from the README's
     demo-data section (Jane both gigs and both rubrics; Noor a draft part-way; Tom a large
     calibration gap; Priya almost none; Sam the review queue, one gig; Dr Lee supervises
     and edits frameworks).
  4. *The AI, with your own key*: what it does and never does (ADR #64: asks, never writes),
     the key prompt, `./assess ai`, the US$1 cap and what happens at it, the workspace-key
     note, where to try each feature.
  5. *Run the tests*: `./assess test`, the three suites and what each covers, the first-run
     download, the summary.
  6. *Commands*: the table from the spec.
  7. *When something goes wrong*: Docker not running, Compose missing, port in use
     (`ASSESS_PORT`), a build failing (memory), the AI answering "not available" (the cap,
     or the key), starting clean (`./assess down --wipe`).
  8. *What runs where*: the four containers, the local database, that nothing reaches the
     team's VPS, and that `.assess/` holds the generated secrets and your key.

  Add a row to the README's documents table:
  `| [`docs/Assessor-Guide.md`](docs/Assessor-Guide.md) | Run the whole product, the AI and the tests with one command |`

- [ ] **Step 3: The README block.** Directly under the "Where this is up to" section:

```markdown
## For assessors

Docker and git are all you need. Everything runs in containers with its own database and the
seeded demo; nothing touches the team's servers.

```bash
git clone https://github.com/theintonerzero/cse3cap.git && cd cse3cap
./assess            # Windows: .\assess.ps1
```

Then open http://localhost:8080 and pick a person to sign in as. `./assess ai` turns the AI
on with your own Anthropic key, and `./assess test` runs every test suite. The whole guide
is [`docs/Assessor-Guide.md`](docs/Assessor-Guide.md).
```

- [ ] **Step 4: ADR #67.** Append to `docs/adr/architecture-decision-records.md`, with the
  index line `#67 An assessor's stack with its own database .. Proposed`, using the
  `write-adr` format and voice. Context: assessors have no VPS access, setup expects the
  shared database and team passwords, the AI needs the team's key. Decision: the
  `diary-assess` Compose project, its own MySQL, the demo's Dockerfiles, `./assess` and
  `assess.ps1`, `.assess/` for generated secrets, the assessor's own key capped at US$1.
  Consequences, positive: clone to signed-in in minutes; the same images as the live demo;
  every suite runnable, the sidecar's database tests included. Negative: a second way to run
  the product to keep working; the first run downloads several GB; `web.Caddyfile` gains a
  route the live demo never uses; real Windows is unproven until someone runs it; the
  shared-database rule (CLAUDE.md) does not apply to this database, which a reader must not
  generalise. Alternatives: an all-in-one image (one `docker run`, but a second way of
  running nothing else uses, that drifts and hides failures); the demo's compose file with
  an override (least new YAML, but written for the VPS's network and paths, so fragile);
  publishing images to a registry (no build on the assessor's machine, but a registry to
  run and images to keep in step with every commit).

- [ ] **Step 5: Check the docs.** `python3 scripts/check-docs.py` → `0 failed`.
  `./run check` → passes (it runs `assess.test.py` now).

- [ ] **Step 6: Commit.**

```bash
git add run .github/workflows/ci.yml README.md docs/Assessor-Guide.md docs/adr/architecture-decision-records.md
git commit -m "docs: the assessor's guide, the README block and ADR #67 (CAP-71)"
```

---

### Task 9: The full run, and the pull request

**Files:** none new; fixes go to the files they belong in.

- [ ] **Step 1: A clean `up` without a key.** `./assess down --wipe 2>/dev/null; ./assess`,
  pressing Enter at the key prompt. Expect: images build, `seeded: 6 people`, `Ready`,
  `AI: off`. `./assess smoke` → five `ok`. Open `http://localhost:8080` with Playwright at
  390 and 1280: the persona picker lists six people; sign in as Jane; the diary and the
  learning record load with her seeded scores; no AI controls.
- [ ] **Step 2: A re-run.** `./assess` again: no reseed (the user count is non-zero), no key
  prompt (`.assess/ai-offered`), the same `.assess/env`. Smoke passes.
- [ ] **Step 3: The AI on.** `./assess ai`, choose 1, paste a workspace-scoped key Jesse
  provides for this run only. Expect `key accepted`, `the AI answers 401 (on)`. As Jane on a
  draft, "Ask me questions" returns questions (the first end-to-end proof of the coach).
  `./assess ai --cap 2` then `./assess ai --off` → `the AI answers 404 (off)`. The key is
  then removed from `.assess/ai.env`.
- [ ] **Step 4: Reset.** `./assess reset` → reseeded; smoke passes.
- [ ] **Step 5: Tests.** `./assess test` → a summary with all three passed, and the counts
  read off each suite's own output. Record them for the PR.
- [ ] **Step 6: PowerShell.** Under `pwsh` on macOS: `./assess.ps1 status`, `./assess.ps1
  smoke`, `./assess.ps1 ai --off`, `./assess.ps1 test api`. Expect the same output as bash.
- [ ] **Step 7: Clean up.** `./assess down --wipe`. Confirm `docker volume ls`,
  `docker images 'diary-assess-*'` and `.assess/` are gone.
- [ ] **Step 8: Every repository check.** `./run check` (or, without the shared database,
  every static step of it), `python3 scripts/assess.test.py`,
  `python3 scripts/deploy-demo.test.py`, `python3 scripts/check-docs.py`.
- [ ] **Step 9: The pull request.** Push, open a **draft** PR into `dev` titled
  "feat: an assessor runs the whole product, AI and tests with one command (CAP-71)", the
  body opening with the freeze hold, listing what was run and its output (Steps 1–7), and
  saying plainly that real Windows has not been run. Request RickLTCS. Move COA4-141 to In
  Progress (branch with commits), then In Review once CI is green, each with a comment.
