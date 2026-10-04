#!/usr/bin/env python3
"""Cases scripts/contract-routes.py has to get right.

Run from the repository root:

    python3 scripts/contract-routes.test.py

Each case writes a route list (the shape of `php artisan route:list --json`)
and a contract (docs/openapi.yaml bundled to JSON) to a temp directory and
runs the script on them, so neither the real routes nor the real contract
is read.
"""

import json
import pathlib
import subprocess
import sys
import tempfile

SCRIPT = pathlib.Path(__file__).resolve().with_name("contract-routes.py")

SERVER = {"servers": [{"url": "http://localhost:8000/api/v1"}]}


def contract(paths):
    return {**SERVER, "paths": paths}


def route(method, uri):
    return {"method": method, "uri": uri}


OP = {"responses": {"200": {"description": "ok"}}}

# (label, routes, contract, expect_pass, text the output must contain)
CASES = [
    (
        "agreeing sets pass",
        [route("GET|HEAD", "api/v1/gigs"), route("POST", "api/v1/reflections")],
        contract({"/gigs": {"get": OP}, "/reflections": {"post": OP}}),
        True,
        "",
    ),
    (
        "path parameter names may differ",
        [route("GET|HEAD", "api/v1/reflections/{reflection}")],
        contract({"/reflections/{reflection_id}": {"get": OP, "parameters": []}}),
        True,
        "",
    ),
    (
        "HEAD is ignored, GET is kept",
        [route("GET|HEAD", "api/v1/auth/me")],
        contract({"/auth/me": {"get": OP}}),
        True,
        "",
    ),
    (
        "routes outside the server's base path are ignored",
        [route("GET|HEAD", "api/v1/gigs"), route("GET|HEAD", "up"), route("GET|HEAD", "/")],
        contract({"/gigs": {"get": OP}}),
        True,
        "",
    ),
    (
        "an operation nothing routes fails, and is named",
        [route("GET|HEAD", "api/v1/reflections")],
        contract({"/reflections": {"get": OP, "post": OP}}),
        False,
        "POST /reflections",
    ),
    (
        "a route the contract does not declare fails, and is named",
        [route("GET|HEAD", "api/v1/gigs"), route("DELETE", "api/v1/gigs/{gig}")],
        contract({"/gigs": {"get": OP}}),
        False,
        "DELETE /gigs/{}",
    ),
    (
        "an api route outside the base path fails, and is named",
        [route("GET|HEAD", "api/v1/gigs"), route("GET|HEAD", "api/health")],
        contract({"/gigs": {"get": OP}}),
        False,
        "GET /api/health",
    ),
    (
        "an undeclared route at the base path itself fails",
        [route("GET|HEAD", "api/v1/gigs"), route("GET|HEAD", "api/v1")],
        contract({"/gigs": {"get": OP}}),
        False,
        "GET /",
    ),
    (
        "a HEAD-only route is an operation of its own",
        [route("GET|HEAD", "api/v1/gigs"), route("HEAD", "api/v1/ping")],
        contract({"/gigs": {"get": OP}}),
        False,
        "HEAD /ping",
    ),
    (
        "a contract with no operations is refused, not matched",
        [],
        contract({}),
        False,
        "no operations",
    ),
    (
        "an empty route list against a real contract fails",
        [],
        contract({"/gigs": {"get": OP}}),
        False,
        "GET /gigs",
    ),
]


def run_case(label, routes, spec, expect_pass, must_contain):
    with tempfile.TemporaryDirectory() as tmp:
        routes_file = pathlib.Path(tmp, "routes.json")
        contract_file = pathlib.Path(tmp, "contract.json")
        routes_file.write_text(json.dumps(routes))
        contract_file.write_text(json.dumps(spec))
        result = subprocess.run(
            [sys.executable, str(SCRIPT), str(routes_file), str(contract_file)],
            capture_output=True,
            text=True,
        )
    output = result.stdout + result.stderr
    passed = result.returncode == 0
    if passed != expect_pass:
        return f"{label}: expected {'pass' if expect_pass else 'fail'}, got exit {result.returncode}\n{output}"
    if must_contain and must_contain not in output:
        return f"{label}: output does not name {must_contain!r}\n{output}"
    return None


def main():
    failures = [f for f in (run_case(*case) for case in CASES) if f]
    for failure in failures:
        print(f"FAIL {failure}")
    if failures:
        print(f"{len(failures)} of {len(CASES)} cases wrong")
        return 1
    print(f"all {len(CASES)} cases correct")
    return 0


if __name__ == "__main__":
    sys.exit(main())
