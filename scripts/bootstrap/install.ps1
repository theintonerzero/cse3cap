# Bootstrap for https://github.com/theintonerzero/cse3cap
#
#   irm https://dl.darkovski.dev/git/cse3cap/install.ps1 | iex
#
# Clones the repository to ~\cse3cap, or updates it if already present, then
# hands over to scripts\setup.ps1 inside the repository. Set CSE3CAP_DIR to
# put it somewhere else.
#
# Verify before running, which is worth doing for anything piped to a shell:
#
#   irm https://dl.darkovski.dev/git/cse3cap/SHA256SUMS

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

# PowerShell 7.4 made a non-zero exit from a native command a terminating
# error when ErrorActionPreference is Stop. `git remote get-url origin` exits
# non-zero when there is no origin, which is a case handled below with a
# clear message, so leaving this on replaced that message with a raw
# PowerShell stack trace.
if (Test-Path Variable:\PSNativeCommandUseErrorActionPreference) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$RepoUrl   = 'https://github.com/theintonerzero/cse3cap.git'
$Dest      = if ($env:CSE3CAP_DIR) { $env:CSE3CAP_DIR } else { Join-Path $HOME 'cse3cap' }
$Installer = 'scripts\setup.ps1'

function Say { param($m) Write-Host "==> " -ForegroundColor Blue -NoNewline; Write-Host $m }
function Die { param($m) Write-Host "Error: " -ForegroundColor Red -NoNewline; Write-Host $m; exit 1 }

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Die "git is required but not installed. Try: winget install Git.Git"
}

# ---------------------------------------------------------------------------
# Fetch or update
# ---------------------------------------------------------------------------
if (Test-Path $Dest) {
    if (-not (Test-Path $Dest -PathType Container)) { Die "$Dest exists but is not a directory. Move it and rerun." }
    if (-not (Test-Path (Join-Path $Dest '.git')))  { Die "$Dest exists but is not a git repository. Move it and rerun." }

    # Refuse to pull into somebody else's checkout sitting at the same path.
    $origin = (& git -C $Dest remote get-url origin 2>$null)
    if (-not $origin)                      { Die "$Dest is a git repository with no origin remote. Move it and rerun." }
    if ($origin -notlike '*theintonerzero/cse3cap*') { Die "$Dest already tracks $origin, not the cse3cap repository. Move it and rerun." }

    if (& git -C $Dest status --porcelain) {
        # Local edits here are somebody's work in progress, so stop rather
        # than stash or discard them.
        Die "$Dest has uncommitted changes. Commit or stash them, then rerun."
    }

    Say "Updating $Dest"
    & git -C $Dest pull --ff-only
} else {
    # Not a shallow clone. This is a working repository, not a one off
    # download, and --depth 1 breaks branching and blame straight away.
    Say "Cloning into $Dest"
    & git clone $RepoUrl $Dest
}

Set-Location $Dest

$InstallerPath = Join-Path $Dest $Installer
if (-not (Test-Path $InstallerPath)) { Die "No $Installer in $Dest. The repository layout has changed." }

# ---------------------------------------------------------------------------
# Hand over
# ---------------------------------------------------------------------------
# Piping into iex means this script has no script file of its own, so the
# installer is invoked by path rather than dot sourced. It prompts for two
# passwords, and Read-Host reads the console directly, so prompts survive.
Say "Running $Installer"
& $InstallerPath
