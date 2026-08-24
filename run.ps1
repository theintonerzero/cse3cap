# One entry point for the whole project, from the repository root.
#
#   ./run.ps1            what you can do
#   ./run.ps1 dev        both servers, one Ctrl-C stops both
#   ./run.ps1 check      everything CI runs
#
# The Windows counterpart of ./run. api/ and web/ are separate applications
# with separate toolchains; this does not hide that, it saves the cd. Every
# command it runs is printed before it runs.

#Requires -Version 5.1
[CmdletBinding()]
param([string]$Command = 'help')

$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
Set-Location $Root

function Say  { param($m) Write-Host "==> $m" -ForegroundColor Blue }
function Fail { param($m) Write-Host "Error: $m" -ForegroundColor Red; exit 1 }

# Print what is about to happen, then do it, so this stays a shortcut
# rather than a layer nobody can see through.
function Step {
    param([string]$Dir, [string]$Exe, [string[]]$Arguments)
    $shown = if ($Dir) { "$Dir $ $Exe $($Arguments -join ' ')" } else { "$ $Exe $($Arguments -join ' ')" }
    Write-Host $shown -ForegroundColor DarkGray

    if ($Dir) { Push-Location $Dir }
    try {
        & $Exe @Arguments
        if ($LASTEXITCODE -ne 0) { Fail "$Exe exited with $LASTEXITCODE" }
    } finally {
        if ($Dir) { Pop-Location }
    }
}

function Need-Api {
    if (-not (Test-Path 'api/artisan')) { Fail 'api/ is not set up. Run scripts/setup.ps1 first.' }

    # A fresh clone has artisan and no vendor/, so checking for artisan
    # alone lets every command through to a raw PHP fatal about a missing
    # autoload.php.
    if (-not (Test-Path 'api/vendor/autoload.php')) {
        Say 'Installing PHP dependencies'
        Step 'api' 'composer' @('install', '--no-interaction')
    }

    # Not fixable automatically: .env carries the database password and
    # setup.ps1 asks for it.
    if (-not (Test-Path 'api/.env')) {
        Fail 'api/.env is missing. Run scripts/setup.ps1, which asks for the database password.'
    }
}
function Need-Web { if (-not (Test-Path 'web/package.json')) { Fail 'web/ does not exist yet.' } }
function Need-WebDeps {
    Need-Web
    if (-not (Test-Path 'web/node_modules')) {
        Say 'Installing frontend dependencies'
        Step 'web' 'npm' @('install')
    }
}

# Both servers. Started as real child processes and stopped in a finally,
# because the failure that matters is leaving one holding a port after
# Ctrl-C: the next run fails on "address already in use" and the cause is
# invisible.
function Start-Dev {
    Need-Api
    Need-WebDeps

    $procs = @()
    try {
        Say 'api  http://localhost:8000/api/v1'
        Say 'web  http://localhost:5173'
        Write-Host 'Ctrl-C stops both.' -ForegroundColor DarkGray
        Write-Host ''

        $procs += Start-Process -FilePath 'php' `
            -ArgumentList 'artisan', 'serve', '--port=8000' `
            -WorkingDirectory (Join-Path $Root 'api') -NoNewWindow -PassThru
        $procs += Start-Process -FilePath 'npm' `
            -ArgumentList 'run', 'dev' `
            -WorkingDirectory (Join-Path $Root 'web') -NoNewWindow -PassThru

        while ($true) {
            Start-Sleep -Milliseconds 400
            if ($procs | Where-Object { $_.HasExited }) { break }
        }
    } finally {
        Write-Host ''
        Say 'Stopping'
        foreach ($p in $procs) {
            if ($p -and -not $p.HasExited) {
                # /T because npm spawns node as a child and killing the
                # launcher alone leaves vite holding :5173.
                & taskkill /PID $p.Id /T /F 2>&1 | Out-Null
            }
        }
        Say 'Stopped'
    }
}

switch ($Command) {
    'dev'   { Start-Dev }

    'api'   { Need-Api; Step 'api' 'php' @('artisan', 'serve', '--port=8000') }
    'web'   { Need-WebDeps; Step 'web' 'npm' @('run', 'dev') }
    'mock'  { Step $null 'npx' @('-y', '@stoplight/prism-cli', 'mock', 'docs/openapi.yaml') }

    'test'  { Need-Api; Step 'api' 'php' @('artisan', 'test') }

    'smoke' { Fail 'smoke needs bash. Use Git Bash or WSL: ./scripts/smoke.sh' }

    'verify' { Fail 'verify needs bash. Use Git Bash or WSL: ./scripts/verify-client.sh' }

    'lint' {
        Need-Api
        Step 'api' './vendor/bin/pint' @('--test')
        if (Test-Path 'web/package.json') {
            Need-WebDeps
            Step 'web' 'npm' @('run', 'lint')
            Step 'web' 'npx' @('prettier', '--check', '.')
        }
    }

    { $_ -in 'fmt', 'format' } {
        Need-Api
        Step 'api' './vendor/bin/pint' @()
        if (Test-Path 'web/package.json') { Need-WebDeps; Step 'web' 'npm' @('run', 'format') }
    }

    'build' { Need-WebDeps; Step 'web' 'npm' @('run', 'build') }

    # Everything CI runs, in CI's order, so a red pipeline is something you
    # can reproduce here rather than by pushing again.
    'check' {
        Say 'Contract'
        Step $null 'npx' @('-y', '@redocly/cli@latest', 'lint', 'docs/openapi.yaml')
        Say 'Guards'
        Step $null 'python3' @('scripts/guard-shared-db.test.py')
        Step $null 'python3' @('scripts/guard-docs-location.test.py')
        Say 'Backend'
        Need-Api
        Step 'api' './vendor/bin/pint' @('--test')
        Step 'api' 'php' @('artisan', 'test')
        if (Test-Path 'web/package.json') {
            Say 'Frontend'
            Need-WebDeps
            Step 'web' 'npm' @('run', 'lint')
            Step 'web' 'npx' @('prettier', '--check', '.')
            Step 'web' 'npm' @('run', 'build')
        }
        Write-Host ''
        Write-Host 'All checks passed.' -ForegroundColor Green
    }

    'setup' { Step $null 'pwsh' @('-NoProfile', '-File', 'scripts/setup.ps1') }

    default {
        Write-Host 'Alumable Reflection Diary' -ForegroundColor Blue
        Write-Host ''
        Write-Host '  ./run.ps1 dev      both servers. api on :8000, web on :5173'
        Write-Host '  ./run.ps1 api      backend only'
        Write-Host '  ./run.ps1 web      frontend only'
        Write-Host '  ./run.ps1 mock     mock the contract on :4010'
        Write-Host ''
        Write-Host '  ./run.ps1 test     backend test suite'
        Write-Host '  ./run.ps1 lint     pint, oxlint and prettier, checking only'
        Write-Host '  ./run.ps1 fmt      the same, writing changes'
        Write-Host '  ./run.ps1 build    production build of the frontend'
        Write-Host '  ./run.ps1 check    everything CI runs, in CI order'
        Write-Host ''
        Write-Host '  ./run.ps1 setup    first-time setup'
        Write-Host ''
        Write-Host 'api/ and web/ are separate applications. This saves the cd, nothing more.' -ForegroundColor DarkGray
        Write-Host 'See docs/Frontend-and-Backend.md for how the two connect.' -ForegroundColor DarkGray
    }
}
