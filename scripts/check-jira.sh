#!/usr/bin/env bash
#
# Proves your Jira credentials work before an agent depends on them, and
# tells you how to get them if they do not.
#
#   ./run jira
#   ./scripts/check-jira.sh
#
# Agents read ticket state from Jira rather than from docs/jira/*.csv, which
# are the import files the tickets were created from and carry no status
# column at all. That only works if every developer can reach the API, so
# this is the check that says whether you can.
#
# It reads two variables from your shell environment, the same way the MySQL
# MCP server reads DB_READONLY_PASSWORD:
#
#   JIRA_EMAIL      the address you sign in to Atlassian with
#   JIRA_API_TOKEN  a token from id.atlassian.com, not your password
#
# It only reads. It does not transition anything, and it creates nothing.
# The write check asks Jira which transitions an issue would allow, which is
# a GET; it never performs one.

set -uo pipefail

SITE="${JIRA_SITE:-https://latrobecomsci.atlassian.net}"
PROJECT="${JIRA_PROJECT:-COA4}"
EMAIL="${JIRA_EMAIL:-}"
TOKEN="${JIRA_API_TOKEN:-}"

if [ -t 1 ]; then
    dim=$'\033[2m'; red=$'\033[1;31m'; green=$'\033[1;32m'
    yellow=$'\033[1;33m'; blue=$'\033[1;34m'; off=$'\033[0m'
else
    dim=''; red=''; green=''; yellow=''; blue=''; off=''
fi

pass=0; fail=0
say() { printf '\n%s==>%s %s\n' "$blue" "$off" "$1"; }
ok()  { pass=$((pass+1)); printf '  %sok%s     %-46s %s\n' "$green" "$off" "$1" "${2:-}"; }
bad() { fail=$((fail+1)); printf '  %sFAIL%s   %-46s %s\n' "$red" "$off" "$1" "${2:-}"; }

# --------------------------------------------------------------------------
# How to get a token. Printed whenever the credentials are missing or
# rejected, because being told "401" without being told what to do about it
# is the thing that makes people give up and go back to the stale CSVs.
# --------------------------------------------------------------------------
how_to_get_one() {
    cat <<INSTRUCTIONS

${yellow}Getting Jira API access — once per person, about two minutes${off}

  1. Sign in to ${SITE}
     If you cannot see the COA4 board at all, you need to be added to the
     project first. Ask whoever administers the Jira site; no token will
     help until then.

  2. Create an API token. From any Atlassian page, click your avatar in
     the top right, then:

     ${dim}Account settings  ->  Security  ->  API tokens  ->  Create API token${off}

     or go straight to it:

     ${dim}https://id.atlassian.com/manage-profile/security/api-tokens${off}

     Name it something you will recognise later, like "cse3cap agent", and
     copy the value. ${red}Atlassian shows it once.${off} If you lose it, revoke
     that token and create another; there is no way to read it back.

  3. Put both values in your shell profile, next to DB_READONLY_PASSWORD:

     ${dim}# ~/.zshrc, or ~/.bashrc
     export JIRA_EMAIL="you@students.latrobe.edu.au"
     export JIRA_API_TOKEN="paste-the-token"${off}

  4. Open a new terminal, or 'source' the file, then run this again:

     ${dim}./run jira${off}

  ${red}The token is a credential.${off} It goes in your shell profile, never in
  the repository, never in .env, never pasted into a chat. It is yours
  alone and it carries your Jira permissions: an agent using it acts as
  you, including any ticket it transitions.

INSTRUCTIONS
}

# --------------------------------------------------------------------------
say "The MCP server's runtime"
# --------------------------------------------------------------------------
# .mcp.json starts mcp-atlassian with uvx, which ships with uv. The MySQL
# server uses npx, so uv is the one new prerequisite this adds. Checked here
# rather than left to fail inside Claude Code, where a server that will not
# start looks like a server that has nothing to say.
# Looked for on PATH and then in the places Homebrew and uv's own installer
# put it. A plain non-interactive shell does not source a login profile, so
# /opt/homebrew/bin is frequently absent from PATH even on a machine where
# uv is installed and working -- which reported a missing prerequisite that
# was not missing, the first time this ran.
UVX=''
for candidate in uvx "$HOME/.local/bin/uvx" /opt/homebrew/bin/uvx /usr/local/bin/uvx; do
    if command -v "$candidate" >/dev/null 2>&1; then UVX="$candidate"; break; fi
done

if [ -n "$UVX" ]; then
    ok "uvx" "$("$UVX" --version 2>/dev/null | head -1)"
    case ":$PATH:" in
        *":$(dirname "$(command -v "$UVX")"):"*) ;;
        *) printf '  %snote%s   %s\n' "$dim" "$off" \
             "found at $UVX but not on PATH; Claude Code may not see it. Add its directory to PATH in your shell profile." ;;
    esac
else
    bad "uvx" "not on PATH — the atlassian MCP server cannot start"
    cat <<UV

  ${yellow}Install uv, once per machine${off}

    ${dim}curl -LsSf https://astral.sh/uv/install.sh | sh${off}     macOS and Linux
    ${dim}brew install uv${off}                                     if you prefer brew
    ${dim}powershell -c "irm https://astral.sh/uv/install.ps1 | iex"${off}   Windows

  Then open a new terminal. Everything below still works without it -- these
  checks talk to Jira over plain HTTP -- but Claude Code will not be able to
  read or move tickets until uvx exists.

UV
fi

# --------------------------------------------------------------------------
say "Credentials"
# --------------------------------------------------------------------------
missing=''
[ -z "$EMAIL" ] && missing="$missing JIRA_EMAIL"
[ -z "$TOKEN" ] && missing="$missing JIRA_API_TOKEN"

if [ -n "$missing" ]; then
    bad "environment" "not set:$missing"
    how_to_get_one
    exit 1
fi
ok "JIRA_EMAIL" "$EMAIL"
ok "JIRA_API_TOKEN" "set, ${#TOKEN} characters"

# curl into a temp file so the body is available whatever the status.
BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT INT TERM

# jira <path> -> STATUS, body in $BODY
jira() {
    STATUS="$(curl -s -o "$BODY" -w '%{http_code}' --max-time 20 \
        -u "$EMAIL:$TOKEN" -H 'Accept: application/json' "$SITE$1")"
}

field() { python3 -c "import json,sys;print(json.load(sys.stdin)$1)" < "$BODY" 2>/dev/null; }

# --------------------------------------------------------------------------
say "Who Jira thinks you are"
# --------------------------------------------------------------------------
jira "/rest/api/3/myself"
case "$STATUS" in
    200)
        ok "authenticated" "$(field '["displayName"]') <$(field '["emailAddress"]')>"
        ;;
    401)
        bad "authenticated" "401 — the email or the token is wrong"
        printf '\n  %sA 401 here is almost always a token that was revoked, mistyped, or\n' "$dim"
        printf '  belongs to a different Atlassian account than JIRA_EMAIL.%s\n' "$off"
        how_to_get_one
        exit 1
        ;;
    403)
        bad "authenticated" "403 — the account exists but is not allowed in"
        how_to_get_one
        exit 1
        ;;
    *)
        bad "authenticated" "$STATUS from $SITE"
        printf '  %s%s%s\n' "$dim" "$(head -c 160 "$BODY")" "$off"
        exit 1
        ;;
esac

# --------------------------------------------------------------------------
say "The project and its board"
# --------------------------------------------------------------------------
jira "/rest/api/3/project/$PROJECT"
if [ "$STATUS" = 200 ]; then
    ok "project $PROJECT" "$(field '["name"]')"
else
    bad "project $PROJECT" "$STATUS — you are authenticated but cannot see it"
    printf '\n  %sYour token works, so this is project permission rather than login.\n' "$dim"
    printf '  Ask to be added to %s.%s\n\n' "$PROJECT" "$off"
    exit 1
fi

# --------------------------------------------------------------------------
say "Finding a ticket by its CAP key"
# --------------------------------------------------------------------------
# The repository calls tickets CAP-n and Jira calls them COA4-nn. There is no
# mapping file and no arithmetic between them -- CAP-1 is COA4-59 and CAP-6 is
# COA4-65, so the offset is not constant. What makes this work is that the CAP
# key is inside the Jira summary: "CAP-11 · Entry stepper, student mode".
# Searching the summary is therefore how any agent resolves one to the other.
JQL="project%20%3D%20$PROJECT%20AND%20summary%20~%20%22CAP-1%22%20ORDER%20BY%20key"
jira "/rest/api/3/search/jql?jql=$JQL&maxResults=3&fields=summary,status,assignee"

if [ "$STATUS" = 200 ]; then
    found="$(field '["issues"].__len__()')"
    if [ "${found:-0}" -gt 0 ]; then
        ok "summary search resolves CAP keys" "$found match(es)"
        python3 - "$BODY" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
for i in d.get("issues",[])[:3]:
    f=i["fields"]
    who=(f.get("assignee") or {}).get("displayName","unassigned")
    print(f"           {i['key']:<10} {f['status']['name']:<12} {who:<16} {f['summary'][:38]}")
PY
    else
        bad "summary search resolves CAP keys" "0 results — are the tickets named 'CAP-n · ...'?"
    fi
else
    bad "summary search" "$STATUS"
    printf '  %s%s%s\n' "$dim" "$(head -c 200 "$BODY")" "$off"
fi

# --------------------------------------------------------------------------
say "Whether you can move a ticket, not just read it"
# --------------------------------------------------------------------------
# Agents transition tickets, so read access is not enough. Asking for an
# issue's available transitions is a GET and changes nothing, but it comes
# back empty for an account that may only look.
ISSUE="$(field '["issues"][0]["key"]')"
if [ -n "${ISSUE:-}" ]; then
    jira "/rest/api/3/issue/$ISSUE/transitions"
    if [ "$STATUS" = 200 ]; then
        n="$(field '["transitions"].__len__()')"
        if [ "${n:-0}" -gt 0 ]; then
            ok "can transition issues" "$n available on $ISSUE: $(python3 -c "
import json;print(', '.join(t['name'] for t in json.load(open('$BODY'))['transitions'][:4]))" 2>/dev/null)"
        else
            bad "can transition issues" "none offered on $ISSUE — read-only access"
        fi
    else
        bad "can transition issues" "$STATUS asking for transitions on $ISSUE"
    fi
else
    printf '  %s--%s     %s\n' "$yellow" "$off" "skipped, no issue found above to ask about"
fi

# --------------------------------------------------------------------------
printf '\n%s%s passed%s' "$green" "$pass" "$off"
[ "$fail" -gt 0 ] && printf ', %s%s failed%s' "$red" "$fail" "$off"
printf '\n'

if [ "$fail" -eq 0 ]; then
    printf '%sJira is reachable. Agents can read ticket state and move tickets as you.%s\n' "$dim" "$off"
    exit 0
fi
exit 1
