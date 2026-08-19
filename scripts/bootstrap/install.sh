#!/usr/bin/env bash
#
# Bootstrap for https://github.com/theintonerzero/cse3cap
#
#   curl -fsSL https://dl.darkovski.dev/git/cse3cap/install.sh | bash
#
# Clones the repository to ~/cse3cap, or updates it if already present,
# then hands over to scripts/setup.sh inside the repository. Set
# CSE3CAP_DIR to put it somewhere else.
#
# Use -fsSL rather than -s on the curl: without -f, curl prints an error
# page to stdout on a 404 and bash cheerfully executes it.

set -euo pipefail

REPO_URL="https://github.com/theintonerzero/cse3cap.git"
DEST="${CSE3CAP_DIR:-$HOME/cse3cap}"
INSTALLER="scripts/setup.sh"

say()  { printf '\033[1;34m==>\033[0m %s\n' "$1"; }
die()  { printf '\033[1;31mError:\033[0m %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
    case "$(uname -s)" in
    Darwin) hint="xcode-select --install" ;;
    Linux)
        if   command -v dnf     >/dev/null 2>&1; then hint="sudo dnf install -y git"
        elif command -v apt-get >/dev/null 2>&1; then hint="sudo apt-get install -y git"
        else hint="install git with your package manager"
        fi
        ;;
    *) hint="install git" ;;
    esac
    die "git is required but not installed. Try: $hint"
fi

# ---------------------------------------------------------------------------
# Fetch or update
# ---------------------------------------------------------------------------
if [ -e "$DEST" ]; then
    [ -d "$DEST" ]        || die "$DEST exists but is not a directory. Move it and rerun."
    [ -d "$DEST/.git" ]   || die "$DEST exists but is not a git repository. Move it and rerun."

    # Refuse to pull into somebody else's checkout sitting at the same path.
    origin="$(git -C "$DEST" remote get-url origin 2>/dev/null || echo '')"
    case "$origin" in
    *theintonerzero/cse3cap*) ;;
    "") die "$DEST is a git repository with no origin remote. Move it and rerun." ;;
    *)  die "$DEST already tracks $origin, not the cse3cap repository. Move it and rerun." ;;
    esac

    if [ -n "$(git -C "$DEST" status --porcelain)" ]; then
        # Local edits here are somebody's work in progress, so stop rather
        # than stash or discard them.
        die "$DEST has uncommitted changes. Commit or stash them, then rerun."
    fi

    say "Updating $DEST"
    git -C "$DEST" pull --ff-only
else
    # Not a shallow clone. This is a working repository, not a one off
    # download, and --depth 1 breaks branching and blame straight away.
    say "Cloning into $DEST"
    git clone "$REPO_URL" "$DEST"
fi

cd "$DEST"

[ -f "$INSTALLER" ] || die "No $INSTALLER in $DEST. The repository layout has changed."
[ -x "$INSTALLER" ] || chmod +x "$INSTALLER"

# ---------------------------------------------------------------------------
# Hand over
# ---------------------------------------------------------------------------
# Piping this script into bash leaves stdin pointing at the pipe, which is
# already consumed. The installer prompts for two passwords, so reattach the
# real terminal when there is one to reattach.
say "Running $INSTALLER"

# Opened rather than tested with -r. /dev/tty exists and looks readable even
# when no terminal is attached, and it is the open that fails, so -r sent the
# installer a device it could not read from and the prompts died with
# "Device not configured".
if { : </dev/tty; } 2>/dev/null; then
    exec "./$INSTALLER" < /dev/tty
else
    exec "./$INSTALLER"
fi
