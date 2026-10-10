#!/usr/bin/env python3
"""Cases scripts/guard-shared-db.sh has to get right.

Run from the repository root:

    python3 scripts/guard-shared-db.test.py

The false-positive cases at the bottom are not hypothetical. The first
version of the guard blocked the commit that introduced it, because the
commit message named the commands it was blocking.
"""

import json
import pathlib
import subprocess
import sys

GUARD = pathlib.Path(__file__).with_name("guard-shared-db.sh")

DENY = "deny"
ALLOW = "allow"

CASES = [
    # The thing this exists to stop.
    (DENY, "php artisan migrate:fresh"),
    (DENY, "php artisan migrate:reset"),
    (DENY, "php artisan db:wipe"),
    # A permission prefix rule cannot see past the cd; the guard can.
    (DENY, "cd api && php artisan migrate:fresh --force"),
    # The dangerous part is inside quotes, which is why quotes are not stripped.
    (DENY, 'mysql -e "DROP DATABASE reflection_diary"'),
    (DENY, "mysql --defaults-file=x -e 'DROP SCHEMA reflection_diary'"),
    # Names a test database and the shared one. Conservative: refuse.
    (DENY, "php artisan migrate:fresh --database=mysql_test --seed # reflection_diary"),

    # Found by review. DROP DATABASE was covered and DROP TABLE was not,
    # though it is the one an agent reaches for first to tidy one table.
    (DENY, 'mysql -e "DROP TABLE reflection_diary.users"'),
    (DENY, 'mysql -e "DROP VIEW v_radar"'),
    # MySQL treats TABLE as optional, so the bare form walked past a guard
    # that caught its own synonym.
    (DENY, 'mysql -e "TRUNCATE reflection_diary.users"'),
    # Data rather than schema, but the seeded frameworks and levels are
    # reference data five people share.
    (DENY, 'mysql -e "DELETE FROM reflection_diary.frameworks"'),

    # A per-developer test database is meant to be dropped and rebuilt.
    (ALLOW, "php artisan migrate:fresh --database=mysql_test"),
    (ALLOW, "DB_TEST_DATABASE=reflection_diary_test_jdarkovski php artisan migrate:fresh"),
    (ALLOW, "php artisan migrate:fresh --drop-views --database=mysql_test"),
    (ALLOW, 'mysql -e "DROP TABLE reflection_diary_test_jdarkovski.users"'),
    (ALLOW, 'mysql -e "TRUNCATE reflection_diary_test_jdarkovski.scores"'),
    (ALLOW, 'mysql -e "DELETE FROM reflection_diary_test_jdarkovski.scores"'),

    # Not destructive at all.
    (ALLOW, "php artisan test"),
    (ALLOW, "php artisan migrate"),
    (ALLOW, "php artisan migrate:status"),
    (ALLOW, "git status"),
    # Reading is not destroying. DELETE FROM must not make every query
    # mentioning a table look dangerous.
    (ALLOW, 'mysql -e "SELECT * FROM reflection_diary.users"'),
    (ALLOW, 'mysql -e "UPDATE reflection_diary.users SET display_name = \'x\'"'),

    # Text about the dangerous commands, not the commands themselves.
    (ALLOW, "git commit -F- <<'EOF'\n"
            "fix(db): stop a fresh migration reaching the shared instance\n\n"
            "php artisan migrate:fresh and db:wipe both DROP DATABASE contents.\n"
            "EOF"),
    (ALLOW, "cat > docs/note.md <<'MD'\n"
            "Never run php artisan migrate:fresh against reflection_diary.\n"
            "MD"),
]


def decision(command: str) -> str:
    result = subprocess.run(
        [str(GUARD)],
        input=json.dumps({"tool_input": {"command": command}}),
        capture_output=True,
        text=True,
    )
    out = result.stdout.strip()
    if not out:
        return ALLOW
    return json.loads(out)["hookSpecificOutput"]["permissionDecision"]


def main() -> int:
    failures = 0

    for expected, command in CASES:
        actual = decision(command)
        ok = actual == expected
        failures += not ok
        print("%s  want=%-5s got=%-5s  %s"
              % ("  ok" if ok else "FAIL", expected, actual,
                 command.split("\n")[0][:64]))

    print()
    if failures:
        print("%d case(s) wrong" % failures)
        return 1

    print("all %d cases correct" % len(CASES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
