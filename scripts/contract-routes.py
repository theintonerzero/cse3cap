#!/usr/bin/env python3
"""Compares the routes Laravel serves with the operations the contract declares.

    python3 scripts/contract-routes.py ROUTES_JSON CONTRACT_JSON

ROUTES_JSON is `php artisan route:list --json`. CONTRACT_JSON is
docs/openapi.yaml bundled to JSON (redocly), so this needs no YAML parser and
runs on any python3. scripts/check-contract-drift.sh produces both.

Each side becomes a set of "METHOD /path". Paths are relative to the
contract's first server url, so `api/v1/gigs` and `/gigs` are the same
thing. Routes outside the API altogether (Laravel's own `up`, say) are not
the contract's business, but one under `api/` that missed the `v1` group is,
and is reported by its full path. Path parameters are compared by position,
not by name: Laravel binds `{reflection}`, the contract says
`{reflection_id}`, and that is not drift. HEAD is Laravel adding itself to
every GET, so it is dropped there; a HEAD on its own is an operation.

A contract with no operations is refused rather than matched: an empty set
agreeing with an empty route list proves nothing.

Exits 1 and names every difference, both ways.
"""

import json
import re
import sys
from urllib.parse import urlparse

METHODS = {"get", "put", "post", "delete", "patch", "options", "trace"}
PARAM = re.compile(r"\{[^}]*\}")


def normalise(path):
    return "/" + PARAM.sub("{}", path.strip("/"))


def load_contract(spec):
    base = urlparse(spec["servers"][0]["url"]).path.rstrip("/")
    operations = {
        f"{method.upper()} {normalise(path)}"
        for path, item in spec.get("paths", {}).items()
        for method in item
        if method in METHODS
    }
    return base, operations


def load_routes(routes, base):
    base = base.strip("/")
    root = base.split("/")[0]
    served = set()
    for route in routes:
        uri = route["uri"].strip("/")
        if uri == base or uri.startswith(base + "/"):
            path = normalise(uri[len(base):])
        elif uri == root or uri.startswith(root + "/"):
            # Under api/ but not api/v1/: the contract cannot declare it, so
            # it is always drift. Named in full so it is recognisable.
            path = normalise(uri)
        else:
            continue
        methods = route["method"].split("|")
        for method in methods:
            if method == "HEAD" and "GET" in methods:
                continue
            served.add(f"{method} {path}")
    return served


def main(argv):
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 2
    with open(argv[1]) as f:
        routes = json.load(f)
    with open(argv[2]) as f:
        spec = json.load(f)

    base, declared = load_contract(spec)
    if not declared:
        print("the contract declares no operations under paths: refusing to compare")
        return 1
    served = load_routes(routes, base)

    unrouted = sorted(declared - served)
    undeclared = sorted(served - declared)
    for label, items in (
        ("in the contract, not routed", unrouted),
        ("routed, not in the contract", undeclared),
    ):
        if items:
            print(f"{label}:")
            for item in items:
                print(f"  {item}")
    if unrouted or undeclared:
        return 1
    print(f"{len(declared)} operations, {len(served)} routes, all matched")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
