#!/usr/bin/env bash
#
# PreToolUse hook. Refuses shell commands that would destroy the shared
# database.
#
# CLAUDE.md says a bad migration takes out everyone's environment. Five
# people point at one MySQL instance and a fresh migration drops every
# table before rebuilding it. tests/TestCase.php already refuses to run
# when the resolved database is reflection_diary, but that only covers
# PHPUnit; a command typed at the shell goes nowhere near it.
#
# Reads the hook payload on stdin and answers on stdout. Denies only what
# it can see is dangerous: an operation that destroys schema, aimed at
# something other than a test database.
#
# Test it with scripts/guard-shared-db.test.py, which covers the cases
# that matter including the ones this guard used to get wrong.

exec python3 -c '
import json, re, sys

try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)                     # unparseable payload is not our business

command = (payload.get("tool_input") or {}).get("command") or ""

# Heredoc bodies are text, not commands. Every commit in this repository is
# written with a heredoc, and documentation about migrations is written the
# same way, so leaving them in makes the guard fire on the words rather than
# on the act. It blocked the commit that introduced it.
#
# Quoted strings are deliberately NOT stripped. The dangerous part of a
# mysql invocation lives inside quotes, so stripping them would open the
# hole this exists to close. An echo of a dangerous string is therefore
# still refused; that costs a prompt and nothing else.
command = re.sub(
    r"<<-?\s*[\"\x27]?(\w+)[\"\x27]?\n.*?^\s*\1\s*$",
    " <heredoc> ", command, flags=re.DOTALL | re.MULTILINE)

# Operations that destroy schema rather than change it.
destructive = re.search(
    r"migrate:fresh|migrate:reset|db:wipe|schema:drop"
    r"|DROP\s+DATABASE|DROP\s+SCHEMA|TRUNCATE\s+TABLE",
    command, re.IGNORECASE)

if not destructive:
    sys.exit(0)

# A per-developer test database is fair game: the whole point of
# reflection_diary_test_% is that it can be dropped and rebuilt. Anything
# naming the shared database is not, whatever else it also names.
names_shared = re.search(r"reflection_diary(?![_a-z0-9])", command, re.IGNORECASE)
names_test = re.search(r"_test|mysql_test|DB_TEST_DATABASE", command, re.IGNORECASE)

if names_test and not names_shared:
    sys.exit(0)

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            "Blocked: this destroys database schema and does not name a test "
            "database. reflection_diary on rddb.darkovski.dev is shared by five "
            "people. Target your own reflection_diary_test_* database, or run it "
            "yourself if you really mean the shared one. "
            "Guard: scripts/guard-shared-db.sh"
        ),
    }
}))
'
