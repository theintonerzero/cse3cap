#!/usr/bin/env python3
"""Cases scripts/deploy.sh and scripts/rollback.sh have to get right.

Run from the repository root:

    python3 scripts/deploy.test.py

No box, no ssh, no database. What a deploy does to a real host is proved on
the first deploy, by the procedure in docs/Deployment.md. What can be proved
here is every decision the scripts make on their own:

- shared/.env is refused unless it is safe to serve the internet with;
- a built frontend carrying a token or one of the box's secrets is refused;
- `current` moves only to a finished release, atomically, and PHP-FPM is
  reloaded every time it does;
- pruning keeps the newest releases and never the one just deployed;
- the laptop half deploys only a tag that is on origin at the same commit.

The refusals matter more than the passes. Each deny case is a way the demo
could leak a credential or serve something nobody reviewed.
"""

import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEPLOY = ROOT / "scripts" / "deploy.sh"
ROLLBACK = ROOT / "scripts" / "rollback.sh"

# The switch to a release is `mv -T` (scripts/rollback.sh), which is GNU
# coreutils: the VPS is Ubuntu and so is CI, so it is right for the box. A
# Mac's BSD mv has no -T, so here every case after the first switch would
# fail for a reason that says nothing about the scripts. Use Homebrew's GNU
# coreutils if it is installed; otherwise say so loudly and leave it to CI,
# which runs this on Linux on every pull request.
GNUBIN = (
    "/opt/homebrew/opt/coreutils/libexec/gnubin",
    "/usr/local/opt/coreutils/libexec/gnubin",
)


def ensure_gnu_mv():
    if subprocess.run(["mv", "--version"], capture_output=True).returncode == 0:
        return
    for gnubin in GNUBIN:
        if (pathlib.Path(gnubin) / "mv").exists():
            os.environ["PATH"] = gnubin + os.pathsep + os.environ["PATH"]
            return
    print("SKIPPED: these cases need GNU mv (-T), as on the VPS and in CI.")
    print("CI runs them on Linux. To run them here: brew install coreutils")
    sys.exit(0)


ensure_gnu_mv()

GOOD_ENV = """\
APP_NAME="Reflection Diary"
APP_ENV=production
APP_DEBUG=false
APP_URL=https://diary.darkovski.dev
APP_KEY=base64:c2VjcmV0LWtleS1mb3ItdGVzdGluZy1vbmx5LTEyMzQ=
DB_PASSWORD=correct-horse-battery
MYSQL_ATTR_SSL_CA=../db/letsencrypt-roots.pem
QUEUE_CONNECTION=sync
CACHE_STORE=file
SESSION_DRIVER=file
"""

failures = []


def check(name, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'}  {name}")
    if not ok:
        failures.append(name)
        if detail:
            print("        " + detail.strip().replace("\n", "\n        "))


def run(*args, env=None, cwd=None):
    return subprocess.run(
        [str(a) for a in args],
        capture_output=True,
        stdin=subprocess.DEVNULL,
        text=True,
        env={**os.environ, **(env or {})},
        cwd=cwd,
    )


def env_file(tmp, text, mode=0o600):
    path = pathlib.Path(tmp) / "shared.env"
    path.write_text(text)
    path.chmod(mode)
    return path


# ---------------------------------------------------------------------------
print("shared/.env")
# ---------------------------------------------------------------------------

ENV_CASES = [
    ("a production-safe file passes", GOOD_ENV, 0o600, True, ""),
    ("quoted values are read without their quotes",
     GOOD_ENV.replace("APP_DEBUG=false", 'APP_DEBUG="false"'), 0o600, True, ""),
    ("APP_DEBUG=true is refused",
     GOOD_ENV.replace("APP_DEBUG=false", "APP_DEBUG=true"), 0o600, False, "APP_DEBUG"),
    ("the last assignment wins, as it does for Laravel",
     GOOD_ENV + "APP_DEBUG=true\n", 0o600, False, "APP_DEBUG"),
    ("APP_ENV=local is refused",
     GOOD_ENV.replace("APP_ENV=production", "APP_ENV=local"), 0o600, False, "APP_ENV"),
    ("an empty APP_KEY is refused",
     GOOD_ENV.replace("APP_KEY=base64:c2VjcmV0LWtleS1mb3ItdGVzdGluZy1vbmx5LTEyMzQ=", "APP_KEY="),
     0o600, False, "APP_KEY"),
    ("a missing CA file setting is refused",
     GOOD_ENV.replace("MYSQL_ATTR_SSL_CA=../db/letsencrypt-roots.pem\n", ""),
     0o600, False, "MYSQL_ATTR_SSL_CA"),
    ("an http:// APP_URL is refused",
     GOOD_ENV.replace("https://", "http://"), 0o600, False, "APP_URL"),
    ("the database queue driver is refused",
     GOOD_ENV.replace("QUEUE_CONNECTION=sync", "QUEUE_CONNECTION=database"),
     0o600, False, "QUEUE_CONNECTION"),
    ("VITE_API_TOKEN anywhere in the file is refused",
     GOOD_ENV + "VITE_API_TOKEN=1|abc\n", 0o600, False, "VITE_API_TOKEN"),
    ("a file others can read is refused", GOOD_ENV, 0o644, False, "chmod 600"),
]

for name, text, mode, should_pass, needle in ENV_CASES:
    with tempfile.TemporaryDirectory() as tmp:
        result = run(DEPLOY, "--check-env", env_file(tmp, text, mode))
        passed = result.returncode == 0
        ok = passed == should_pass and needle in result.stderr
        check(name, ok, result.stdout + result.stderr)

with tempfile.TemporaryDirectory() as tmp:
    result = run(DEPLOY, "--check-env", pathlib.Path(tmp) / "absent.env")
    check("a missing file is refused", result.returncode != 0, result.stderr)


# ---------------------------------------------------------------------------
print("\nThe built frontend")
# ---------------------------------------------------------------------------

CLEAN_JS = 'const b="/api/v1";fetch(b+"/auth/me",{headers:{Authorization:"Bearer "+t}});'
TOKEN = "7|" + "a1B2c3D4e5" * 4

BUNDLE_CASES = [
    ("a clean bundle passes", CLEAN_JS, True),
    ("a Sanctum token is refused", CLEAN_JS + f'const t="{TOKEN}";', False),
    ("a prefixed Sanctum token is refused",
     CLEAN_JS + f'const t="7|rdiary_{"a1B2c3D4e5" * 4}";', False),
    ("the box's database password is refused",
     CLEAN_JS + 'const p="correct-horse-battery";', False),
    ("the box's APP_KEY is refused",
     CLEAN_JS + 'const k="base64:c2VjcmV0LWtleS1mb3ItdGVzdGluZy1vbmx5LTEyMzQ=";', False),
]

for name, js, should_pass in BUNDLE_CASES:
    with tempfile.TemporaryDirectory() as tmp:
        dist = pathlib.Path(tmp) / "dist" / "assets"
        dist.mkdir(parents=True)
        (dist / "index-abc123.js").write_text(js)
        (dist.parent / "index.html").write_text("<div id=root></div>")
        result = run(DEPLOY, "--check-bundle", dist.parent, env_file(tmp, GOOD_ENV))
        check(name, (result.returncode == 0) == should_pass, result.stdout + result.stderr)

with tempfile.TemporaryDirectory() as tmp:
    dist = pathlib.Path(tmp) / "dist"
    dist.mkdir()
    result = run(DEPLOY, "--check-bundle", dist, env_file(tmp, GOOD_ENV))
    check("an empty build is refused, not waved through", result.returncode != 0, result.stderr)


# ---------------------------------------------------------------------------
print("\nSwitching releases")
# ---------------------------------------------------------------------------


def box(tmp, names, finished=True):
    """A /var/www/diary with the given releases, and a reload that is logged."""
    root = pathlib.Path(tmp) / "diary"
    for n in names:
        rel = root / "releases" / n
        if finished:
            (rel / "web" / "dist").mkdir(parents=True)
            (rel / "web" / "dist" / "index.html").write_text(n)
            (rel / "api" / "vendor").mkdir(parents=True)
            (rel / "api" / "vendor" / "autoload.php").write_text("<?php")
        else:
            rel.mkdir(parents=True)
        (rel / "RELEASE").write_text(f"v-{n} 0000000\n")
    (root / "shared").mkdir(parents=True)
    log = root / "reloads"
    (root / "shared" / "deploy.conf").write_text(f'PHP_FPM_RELOAD="echo reload >> {log}"\n')
    return root, log


def current(root):
    link = root / "current"
    return os.readlink(link) if link.is_symlink() else None


def reloads(log):
    return log.read_text().count("reload") if log.exists() else 0


A, B, C = "2026-10-01-000000-aaaaaaa", "2026-10-02-000000-bbbbbbb", "2026-10-03-000000-ccccccc"

with tempfile.TemporaryDirectory() as tmp:
    root, log = box(tmp, [A, B, C])
    env = {"DIARY_ROOT": str(root)}

    result = run(ROLLBACK, "--to", C, env=env)
    check("--to points current at the release, relatively",
          result.returncode == 0 and current(root) == f"releases/{C}",
          result.stdout + result.stderr)
    check("and reloads PHP-FPM", reloads(log) == 1, log.read_text() if log.exists() else "")
    check("and leaves no current.next behind", not (root / "current.next").exists())

    result = run(ROLLBACK, env=env)
    check("with no argument it goes to the release before current",
          result.returncode == 0 and current(root) == f"releases/{B}",
          result.stdout + result.stderr)

    run(ROLLBACK, env=env)
    result = run(ROLLBACK, env=env)
    check("from the oldest release it refuses rather than guessing",
          result.returncode != 0 and current(root) == f"releases/{A}",
          result.stdout + result.stderr)

    result = run(ROLLBACK, "--to", "../../etc", env=env)
    check("a path is refused as a release name", result.returncode != 0, result.stderr)

    result = run(ROLLBACK, "--to", "2099-01-01-000000-nothere", env=env)
    check("a release that does not exist is refused",
          result.returncode != 0 and current(root) == f"releases/{A}", result.stderr)

    result = run(ROLLBACK, "--list", env=env)
    check("--list marks the current release",
          result.returncode == 0 and f"* {A}" in result.stdout and B in result.stdout,
          result.stdout + result.stderr)

with tempfile.TemporaryDirectory() as tmp:
    root, log = box(tmp, [A])
    half = root / "releases" / B
    half.mkdir()
    (half / "RELEASE").write_text("v-half 0000000\n")
    env = {"DIARY_ROOT": str(root)}
    run(ROLLBACK, "--to", A, env=env)
    result = run(ROLLBACK, "--to", B, env=env)
    check("a release with no build is refused, and current does not move",
          result.returncode != 0 and current(root) == f"releases/{A}",
          result.stdout + result.stderr)

with tempfile.TemporaryDirectory() as tmp:
    root, log = box(tmp, [A])
    (root / "shared" / "deploy.conf").write_text('PHP_FPM_RELOAD="false"\n')
    result = run(ROLLBACK, "--to", A, env={"DIARY_ROOT": str(root)})
    check("a failed reload is a failure, not a warning", result.returncode != 0, result.stderr)

with tempfile.TemporaryDirectory() as tmp:
    import fcntl

    root, log = box(tmp, [A, B])
    env = {"DIARY_ROOT": str(root)}
    run(ROLLBACK, "--to", A, env=env)
    with open(root / ".deploy.lock", "w") as held:
        fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
        result = run(ROLLBACK, "--to", B, env=env)
    check("while a deploy holds the lock, a rollback refuses and current does not move",
          result.returncode != 0 and current(root) == f"releases/{A}"
          and "running" in result.stderr,
          result.stdout + result.stderr)


# ---------------------------------------------------------------------------
print("\nGoing live: switch, check, and back out")
# ---------------------------------------------------------------------------


def live_box(tmp, reload="true"):
    """A box where A is live and B is built and waiting; each has the real rollback.sh."""
    root, log = box(tmp, [A, B])
    for n in (A, B):
        (root / "releases" / n / "scripts").mkdir()
        shutil.copy(ROLLBACK, root / "releases" / n / "scripts" / "rollback.sh")
    (root / "shared" / "deploy.conf").write_text(f'PHP_FPM_RELOAD="{reload}"\n')
    run(ROLLBACK, "--to", A, env={"DIARY_ROOT": str(root)})
    return root


with tempfile.TemporaryDirectory() as tmp:
    root = live_box(tmp)
    result = run(DEPLOY, "--go-live", root / "releases" / B, A, env={"DIARY_LIVE_CHECK": "true"})
    check("a release that answers stays live",
          result.returncode == 0 and current(root) == f"releases/{B}",
          result.stdout + result.stderr)

with tempfile.TemporaryDirectory() as tmp:
    root = live_box(tmp)
    result = run(DEPLOY, "--go-live", root / "releases" / B, A, env={"DIARY_LIVE_CHECK": "false"})
    check("a release that fails its live check: current goes back to the previous one",
          result.returncode != 0 and current(root) == f"releases/{A}",
          result.stdout + result.stderr)
    check("and the failed release is removed, so a rollback can never pick it",
          not (root / "releases" / B).exists(), str(sorted(p.name for p in (root / "releases").iterdir())))

with tempfile.TemporaryDirectory() as tmp:
    root = live_box(tmp, reload="false")
    result = run(DEPLOY, "--go-live", root / "releases" / B, A, env={"DIARY_LIVE_CHECK": "true"})
    check("a PHP-FPM reload that fails on the switch: current goes back to the previous one",
          result.returncode != 0 and current(root) == f"releases/{A}",
          result.stdout + result.stderr)

with tempfile.TemporaryDirectory() as tmp:
    root = live_box(tmp)
    result = run(DEPLOY, "--go-live", root / "releases" / B, "", env={"DIARY_LIVE_CHECK": "false"})
    check("with no previous release it says so and fails, rather than pretending",
          result.returncode != 0 and "no previous release" in result.stderr,
          result.stdout + result.stderr)


# ---------------------------------------------------------------------------
print("\nThe config cache")
# ---------------------------------------------------------------------------

with tempfile.TemporaryDirectory() as tmp:
    api = pathlib.Path(tmp) / "api"
    (api / "bootstrap" / "cache").mkdir(parents=True)
    cached = api / "bootstrap" / "cache" / "config.php"
    cached.write_text("<?php return ['database' => 'password-in-plaintext'];")
    cached.chmod(0o644)
    result = run(DEPLOY, "--lock-config", api)
    check("config.php (which holds DB_PASSWORD and APP_KEY) is made readable by its owner only",
          result.returncode == 0 and stat.S_IMODE(cached.stat().st_mode) == 0o600,
          oct(stat.S_IMODE(cached.stat().st_mode)) + "\n" + result.stderr)

with tempfile.TemporaryDirectory() as tmp:
    result = run(DEPLOY, "--lock-config", pathlib.Path(tmp) / "api")
    check("a missing config cache is refused, not skipped", result.returncode != 0, result.stderr)


# ---------------------------------------------------------------------------
print("\nPruning")
# ---------------------------------------------------------------------------

with tempfile.TemporaryDirectory() as tmp:
    releases = pathlib.Path(tmp) / "releases"
    names = [f"2026-10-{d:02d}-000000-{d:07d}" for d in range(1, 9)]
    for n in names:
        (releases / n).mkdir(parents=True)
    result = run(DEPLOY, "--prune", releases, names[-1])
    left = sorted(p.name for p in releases.iterdir())
    check("keeps the newest five", left == names[-5:], f"{left}\n{result.stderr}")

with tempfile.TemporaryDirectory() as tmp:
    releases = pathlib.Path(tmp) / "releases"
    names = [f"2026-10-{d:02d}-000000-{d:07d}" for d in range(1, 9)]
    for n in names:
        (releases / n).mkdir(parents=True)
    # A clock set wrong on the box can make the new release sort oldest.
    result = run(DEPLOY, "--prune", releases, names[0])
    left = sorted(p.name for p in releases.iterdir())
    check("never removes the release it was told to keep", names[0] in left, f"{left}")

with tempfile.TemporaryDirectory() as tmp:
    releases = pathlib.Path(tmp) / "releases"
    names = [f"2026-10-{d:02d}-000000-{d:07d}" for d in range(1, 9)]
    for n in names:
        (releases / n).mkdir(parents=True)
    # After a rollback to an old release, that release is what a failed next
    # deploy goes back to. Pruning it would leave nothing known good.
    result = run(DEPLOY, "--prune", releases, names[-1], names[1])
    left = sorted(p.name for p in releases.iterdir())
    check("keeps the previous live release too, however old",
          names[1] in left and names[-1] in left, f"{left}\n{result.stderr}")


# ---------------------------------------------------------------------------
print("\nFrom the laptop")
# ---------------------------------------------------------------------------


def git(cwd, *args):
    return run("git", *args, cwd=cwd, env={
        "GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
        "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com",
        "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_CONFIG_SYSTEM": "/dev/null",
    })


with tempfile.TemporaryDirectory() as tmp:
    tmp = pathlib.Path(tmp)
    work, origin, bin_dir = tmp / "work", tmp / "origin.git", tmp / "bin"
    (work / "scripts").mkdir(parents=True)
    shutil.copy(DEPLOY, work / "scripts" / "deploy.sh")
    git(tmp, "init", "-q", "-b", "main", str(work))
    git(work, "add", ".")
    git(work, "commit", "-q", "-m", "one")
    git(tmp, "clone", "-q", "--bare", str(work), str(origin))
    git(work, "remote", "add", "origin", str(origin))

    # ssh is replaced by a stub that records what would have run remotely.
    bin_dir.mkdir()
    calls = tmp / "ssh-calls"
    stub = bin_dir / "ssh"
    stub.write_text(f'#!/bin/sh\necho "$@" >> {calls}\ncat > /dev/null\n')
    stub.chmod(stub.stat().st_mode | stat.S_IEXEC)
    env = {"PATH": f"{bin_dir}:{os.environ['PATH']}"}
    script = work / "scripts" / "deploy.sh"

    result = run(script, "diary@box", "v1", env=env, cwd=work)
    check("an unknown tag is refused", result.returncode != 0 and not calls.exists(),
          result.stdout + result.stderr)

    git(work, "tag", "-a", "v1", "-m", "v1")
    result = run(script, "diary@box", "v1", env=env, cwd=work)
    check("a tag that is not on origin is refused",
          result.returncode != 0 and not calls.exists() and "not on origin" in result.stderr,
          result.stdout + result.stderr)

    git(work, "push", "-q", "origin", "v1")
    git(work, "commit", "-q", "--allow-empty", "-m", "two")
    git(work, "tag", "-f", "-a", "v1", "-m", "moved")
    result = run(script, "diary@box", "v1", env=env, cwd=work)
    check("a tag that differs from origin's is refused",
          result.returncode != 0 and not calls.exists() and "on origin" in result.stderr,
          result.stdout + result.stderr)

    git(work, "fetch", "-q", "-f", "origin", "refs/tags/v1:refs/tags/v1")
    check("(setup) the local tag is origin's again",
          git(work, "rev-parse", "v1^{commit}").stdout == git(origin, "rev-parse", "v1^{commit}").stdout)
    result = run(script, "diary@box", "v1", env=env, cwd=work)
    lines = calls.read_text().splitlines() if calls.exists() else []
    check("a tag on origin is sent, then deployed from inside the release",
          result.returncode == 0 and len(lines) == 2
          and "tar -x -C /var/www/diary/releases/" in lines[0]
          and "scripts/deploy.sh --on-box /var/www/diary/releases/" in lines[1]
          and " v1 " in lines[1],
          "\n".join(lines) + "\n" + result.stdout + result.stderr)

    git(work, "tag", "lw")
    git(work, "push", "-q", "origin", "lw")
    calls.unlink(missing_ok=True)
    result = run(script, "diary@box", "lw", env=env, cwd=work)
    check("a lightweight tag works too", result.returncode == 0, result.stdout + result.stderr)

    git(work, "remote", "set-url", "origin", str(tmp / "nowhere.git"))
    calls.unlink(missing_ok=True)
    result = run(script, "diary@box", "v1", env=env, cwd=work)
    check("an unreachable origin is refused with a reason, not silently",
          result.returncode != 0 and "could not read origin" in result.stderr and not calls.exists(),
          result.stdout + result.stderr)


print()
if failures:
    print(f"{len(failures)} failed.")
    sys.exit(1)
print("All passed.")
