#!/usr/bin/env python3
"""Generates docs/Dependency-Register.md: every dependency, its licence, and its
known advisories, dated and tied to a commit.

    ./run deps                                  from the repository root
    python3 scripts/dependency-register.py      the same thing

The handover report's SMD 8.6 asks for a dependency, licence and CVE register
that is generated rather than written, and dated so a reader knows how stale it
is. This is that generator. Nothing in it is typed by hand: licences come from
`composer licenses` and web/package-lock.json, advisories from `composer audit`
and `npm audit`, which query Packagist's and npm's advisory databases at the
moment it runs. Run it again and commit the result whenever a dependency
changes or before a release.

Needs php and composer with api/vendor installed, node and npm with
web/node_modules installed, and network access for the two audits. It writes
one file and touches nothing else.
"""

import datetime
import hashlib
import json
import pathlib
import subprocess
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "Dependency-Register.md"

# Licences a proprietary product (Alumable owns the IP) can ship without
# obligations beyond attribution. Anything else is flagged for a person.
PERMISSIVE = {
    "MIT", "MIT-0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0",
    "0BSD", "BlueOak-1.0.0", "CC0-1.0", "Unlicense", "Python-2.0", "CC-BY-4.0",
}


def run(cmd, cwd, ok_codes=(0,)):
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode not in ok_codes:
        sys.exit(f"{' '.join(cmd)} failed in {cwd} (exit {result.returncode}):\n{result.stderr}")
    return result.stdout


def version(cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True).stdout.strip().splitlines()[0]
    except (OSError, IndexError):
        return "unknown"


def composer_side():
    api = ROOT / "api"
    licences = json.loads(run(["composer", "licenses", "--format=json"], api))["dependencies"]
    # composer audit exits non-zero when it finds advisories. That is a result, not a failure.
    audit = json.loads(run(["composer", "audit", "--format=json"], api, ok_codes=range(0, 16)))
    manifest = json.loads((api / "composer.json").read_text())
    direct = {**{k: (v, False) for k, v in manifest.get("require", {}).items()},
              **{k: (v, True) for k, v in manifest.get("require-dev", {}).items()}}
    packages = {name: {"version": info["version"], "licence": " OR ".join(info["license"]) or "none"}
                for name, info in licences.items()}
    return packages, direct, composer_advisories(audit, packages, direct)


def composer_advisories(audit, packages, direct):
    # PHP encodes an empty map as [], so a clean audit says "advisories": [] not {}.
    found = audit.get("advisories") or {}
    advisories = []
    for name, items in found.items():
        for a in items:
            advisories.append({
                "ecosystem": "Composer",
                "package": name,
                "installed": packages.get(name, {}).get("version", "?"),
                "id": a.get("cve") or a.get("advisoryId") or "no id",
                "severity": (a.get("severity") or "unknown").lower(),
                "affected": a.get("affectedVersions", ""),
                "title": a.get("title", ""),
                "link": a.get("link", ""),
                "direct": name in direct,
            })
    return advisories


def npm_side():
    web = ROOT / "web"
    lock = json.loads((web / "package-lock.json").read_text())
    manifest = json.loads((web / "package.json").read_text())
    direct = {**{k: (v, False) for k, v in manifest.get("dependencies", {}).items()},
              **{k: (v, True) for k, v in manifest.get("devDependencies", {}).items()}}
    packages = {}
    for path, info in lock.get("packages", {}).items():
        if not path:
            continue
        name = path.split("node_modules/")[-1]
        packages.setdefault(name, {"version": info.get("version", "?"),
                                   "licence": info.get("license") or "none"})
    # npm audit exits 1 when it finds anything, same reasoning as composer.
    audit = json.loads(run(["npm", "audit", "--json"], web, ok_codes=(0, 1)))
    advisories = []
    for name, vuln in audit.get("vulnerabilities", {}).items():
        for via in vuln.get("via", []):
            if not isinstance(via, dict):
                continue  # a pointer to another package's advisory, listed under that package
            advisories.append({
                "ecosystem": "npm",
                "package": name,
                "installed": packages.get(name, {}).get("version", "?"),
                "id": via.get("url", "").rsplit("/", 1)[-1] or str(via.get("source", "no id")),
                "severity": (via.get("severity") or "unknown").lower(),
                "affected": via.get("range", ""),
                "title": via.get("title", ""),
                "link": via.get("url", ""),
                "direct": name in direct,
            })
    return packages, direct, advisories


def lockfile_hashes(root):
    """Each lockfile's sha256, so scripts/check-docs.py can tell when this file
    was generated from lockfiles that have since changed (a Dependabot merge with
    no ./run deps after it)."""
    return ", ".join(
        f"`{name}` sha256 `{hashlib.sha256((root / name).read_bytes()).hexdigest()}`"
        for name in ("api/composer.lock", "web/package-lock.json")
    )


def is_permissive(expression):
    """An SPDX-style expression: OR means the user may pick any one, AND means all apply."""
    return any(all(part.strip("() ") in PERMISSIVE for part in option.split(" AND "))
               for option in expression.split(" OR "))


def cell(text):
    """A pipe inside a table cell ends the cell in GitHub markdown, even inside backticks."""
    return str(text).replace("|", "\\|")


SEVERITY_ORDER = ["critical", "high", "medium", "moderate", "low", "info", "unknown"]


def render(composer, npm):
    c_pkgs, c_direct, c_adv = composer
    n_pkgs, n_direct, n_adv = npm
    advisories = sorted(c_adv + n_adv,
                        key=lambda a: (SEVERITY_ORDER.index(a["severity"]) if a["severity"] in SEVERITY_ORDER else 99,
                                       a["package"]))
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    commit = version(["git", "-C", str(ROOT), "rev-parse", "--short", "HEAD"])
    severities = Counter(a["severity"] for a in advisories)
    licences = Counter(p["licence"] for p in list(c_pkgs.values()) + list(n_pkgs.values()))
    flagged = sorted({(name, p["licence"], eco)
                      for eco, pkgs in (("Composer", c_pkgs), ("npm", n_pkgs))
                      for name, p in pkgs.items()
                      if not is_permissive(p["licence"])})

    lines = [
        "# Dependency register",
        "",
        "Every dependency the Reflection Diary ships or builds with, its licence, and its known",
        "advisories. **Generated, not written:** `./run deps` (`scripts/dependency-register.py`)",
        "rebuilds this file from `composer licenses`, `composer audit`, `web/package-lock.json` and",
        "`npm audit`. Do not edit it by hand. Regenerate and commit it when a dependency changes.",
        "",
        "| | |",
        "| --- | --- |",
        f"| Generated | {now} |",
        f"| Commit | `{commit}` |",
        "| Lockfiles | " + lockfile_hashes(ROOT) + " |",
        f"| Tools | {version(['php', '-v']).split(' (')[0]}, {version(['composer', '--version']).split(' 20')[0]}, "
        f"Node {version(['node', '-v'])}, npm {version(['npm', '-v'])} |",
        f"| Packages | {len(c_pkgs)} Composer ({len(c_direct)} direct), {len(n_pkgs)} npm ({len(n_direct)} direct) |",
        "| Advisories | " + (f"{len(advisories)}: " + ", ".join(f"{severities[s]} {s}" for s in SEVERITY_ORDER
                                                             if severities[s]) if advisories else "none") + " |",
        "",
        "Why each direct dependency is here, and which ones were deliberately not taken, is ADR #31",
        "and the stack ADRs in `docs/adr/architecture-decision-records.md`.",
        "",
        "## Known advisories",
        "",
    ]
    if advisories:
        lines += ["| Severity | Package | Installed | Advisory | Affected versions | Direct | Summary |",
                  "| --- | --- | --- | --- | --- | --- | --- |"]
        for a in advisories:
            ident = f"[{a['id']}]({a['link']})" if a["link"] else a["id"]
            lines.append(f"| {a['severity']} | {a['ecosystem']}: `{a['package']}` | {a['installed']} | {ident} | "
                         f"`{cell(a['affected'])}` | {'yes' if a['direct'] else 'no'} | {cell(a['title'])} |")
        lines += ["", "The action for each is a person's call, recorded in `docs/Security-Review.md` (CAP-32),",
                  "not here. Check the open Dependabot pull requests first: one may already carry the fix."]
    else:
        lines.append("None at the time of generation.")

    lines += ["", "## Licences", ""]
    lines += ["| Licence | Packages |", "| --- | --- |"]
    lines += [f"| {lic} | {n} |" for lic, n in licences.most_common()]
    lines += [""]
    if flagged:
        lines += ["**Not on the permissive list, so a person should check each one:**", "",
                  "| Package | Licence | Ecosystem |", "| --- | --- | --- |"]
        lines += [f"| `{name}` | {lic} | {eco} |" for name, lic, eco in flagged]
    else:
        lines.append("Every package is under a permissive licence.")
    lines += ["", f"The permissive list is in `scripts/dependency-register.py`: {', '.join(sorted(PERMISSIVE))}."]

    for title, pkgs, direct in (("Composer (api/)", c_pkgs, c_direct), ("npm (web/)", n_pkgs, n_direct)):
        lines += ["", f"## Direct dependencies: {title}", "",
                  "| Package | Constraint | Installed | Licence | Dev only |", "| --- | --- | --- | --- | --- |"]
        for name, (constraint, dev) in sorted(direct.items()):
            p = pkgs.get(name)
            if p is None:  # php, ext-*: platform requirements, not packages
                lines.append(f"| `{name}` | `{constraint}` | platform | n/a | {'yes' if dev else 'no'} |")
            else:
                lines.append(f"| `{name}` | `{constraint}` | {p['version']} | {p['licence']} | {'yes' if dev else 'no'} |")

    lines += ["", "Transitive packages are counted above and listed in `api/composer.lock` and",
              "`web/package-lock.json`, which are the record of exactly what is installed.", ""]
    return "\n".join(lines)


def main():
    text = render(composer_side(), npm_side())
    OUT.write_text(text)
    print(f"wrote {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
