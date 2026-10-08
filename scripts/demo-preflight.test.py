#!/usr/bin/env python3
"""Cases scripts/demo-preflight.php has to get right (CAP-51).

Run from the repository root:

    python3 scripts/demo-preflight.test.py

`./run demo` and `.\\run.ps1 demo` run the preflight before starting both
servers. It refuses to start when the shared database is unreachable (saying
to use a hotspot), and writes the demo sign-in's people into
web/.env.development.local from the team's tokens file, keeping every other
line there. It never prints a token.

Each case builds a throwaway api/.env, tokens file and web env under a temp
directory and points the preflight at them, so nothing here reads or writes
a real file or reaches the real database. "Reachable" is a socket this test
listens on; "unreachable" is a port nothing listens on.
"""

import json
import os
import pathlib
import socket
import stat
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "scripts" / "demo-preflight.php"

FAKE = "b" * 40
TOKENS = (
    f"Jane N   7|rdiary_old{FAKE}\r\n"
    f"Sam O    8|rdiary_{FAKE}\r\n"
    f"Dr Lee   9|rdiary_{FAKE}\r\n"
    "Jane N   Develop AI use cases   sprint 1  assessed\r\n"
    f"Noor A   10|rdiary_{FAKE}\r\n"
    f"Jane N   11|rdiary_{FAKE}\r\n"
)

failures = 0


def report(ok, label, detail=""):
    global failures
    print(f"[{'ok' if ok else 'FAIL'}] {label}" + (f": {detail}" if detail and not ok else ""))
    if not ok:
        failures += 1


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def run(tmp, port, tokens=TOKENS, web_env=None):
    tmp = pathlib.Path(tmp)
    api_env = tmp / "api.env"
    api_env.write_text(f"APP_NAME=x\nDB_HOST=127.0.0.1\nDB_PORT={port}\nDB_PASSWORD=secret\n")
    tokens_file = tmp / "tokens.txt"
    if tokens is not None:
        tokens_file.write_bytes(tokens.encode("utf-8"))
    web = tmp / "web.env.development.local"
    if web_env is not None:
        web.write_text(web_env)
    result = subprocess.run(
        ["php", str(SCRIPT), "--api-env", str(api_env), "--tokens", str(tokens_file),
         "--web-env", str(web)],
        capture_output=True, text=True, timeout=30,
    )
    return result, web


def personas(web):
    for line in web.read_text().splitlines():
        if line.startswith("VITE_DEMO_TOKENS="):
            return json.loads(line.split("=", 1)[1])
    return None


def main():
    if not SCRIPT.exists():
        report(False, "scripts/demo-preflight.php exists", "missing")
        print(f"\nFAIL: {failures} failed")
        return 1

    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen()
        up = listener.getsockname()[1]

        with tempfile.TemporaryDirectory() as tmp:
            result, web = run(tmp, up, web_env="VITE_SOMETHING_ELSE=keep\nVITE_DEMO_TOKENS=[]\n")
            out = result.stdout + result.stderr
            report(result.returncode == 0, "reachable database and a tokens file: ok",
                   f"exit {result.returncode}: {out.strip()}")
            people = personas(web) or []
            names = [p["name"] for p in people]
            report(names == ["Jane N", "Noor A", "Sam O", "Dr Lee"],
                   "the people are written in the script's order", f"got {names}")
            by_name = {p["name"]: p for p in people}
            report(by_name.get("Jane N", {}).get("token") == f"11|rdiary_{FAKE}",
                   "the newest line for a person wins, CR stripped")
            report([by_name.get(n, {}).get("slot") for n in ["Jane N", "Noor A", "Sam O", "Dr Lee"]]
                   == ["student", "student", "assessor", "supervisor"],
                   "each person signs into the right slot")
            text = web.read_text()
            report("VITE_SOMETHING_ELSE=keep" in text, "other lines in the web env are kept")
            report("VITE_DEMO_SHELL=1" in text, "the demo sign-in is switched on")
            report(text.count("VITE_DEMO_TOKENS=") == 1, "one VITE_DEMO_TOKENS line, replaced")
            report(FAKE not in out and "secret" not in out, "no token or password is printed")
            report(all(n in out for n in ["Jane N", "Noor A", "Sam O", "Dr Lee"]),
                   "it names who it found", out.strip())
            if os.name == "posix":
                mode = stat.S_IMODE(web.stat().st_mode)
                report(mode == 0o600, "the web env is readable by its owner only", oct(mode))

        with tempfile.TemporaryDirectory() as tmp:
            existing = 'VITE_DEMO_SHELL=1\nVITE_DEMO_TOKENS=[{"id":"jane","name":"Jane N","role_hint":"Student","slot":"student","token":"x|y"}]\n'
            result, web = run(tmp, up, tokens=None, web_env=existing)
            report(result.returncode == 0 and web.read_text() == existing,
                   "no tokens file: an existing web env is left as it is",
                   f"exit {result.returncode}")
            report("Jane N" in result.stdout, "and it names who is already set up")

        with tempfile.TemporaryDirectory() as tmp:
            result, web = run(tmp, up, tokens=None, web_env=None)
            text = web.read_text() if web.exists() else ""
            report(result.returncode == 0 and "VITE_DEMO_SHELL=1" in text
                   and "VITE_DEMO_TOKENS" not in text,
                   "no tokens anywhere: the sign-in is on and will ask to paste",
                   f"exit {result.returncode}, env {text!r}")
            report("reflection-diary-tokens" in (result.stdout + result.stderr) or "tokens file" in (result.stdout + result.stderr),
                   "and it says where the tokens file goes")

    with tempfile.TemporaryDirectory() as tmp:
        result, web = run(tmp, free_port())
        out = result.stdout + result.stderr
        report(result.returncode != 0, "unreachable database: it refuses to start",
               f"exit {result.returncode}")
        report("hotspot" in out.lower(), "and says to try a hotspot", out.strip())
        report(not web.exists(), "and writes nothing")

    print(f"\n{'FAIL' if failures else 'ok'}: {failures} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
