<#
The Reflection Diary on an assessor's machine (CAP-71, ADR #67), for Windows.
The same commands as ./assess; docs/Assessor-Guide.md explains them.

  .\assess.ps1            build, start and seed, then print the address
  .\assess.ps1 ai         add, replace or remove your Anthropic key, or change the cap
  .\assess.ps1 test       the backend, AI and browser suites (or: test api|ai|web)
  .\assess.ps1 reset      reseed the demo and empty the AI's tables
  .\assess.ps1 smoke      check the running stack from outside
  .\assess.ps1 status     what is running
  .\assess.ps1 down       stop it (down --wipe also deletes its data and images)

Generated passwords, Laravel's key and your Anthropic key live in .assess\,
which git ignores. Works in PowerShell 7 and Windows PowerShell 5.1.
#>
param(
    [Parameter(Position = 0)][string]$Command = 'up',
    [Parameter(ValueFromRemainingArguments)][string[]]$Rest = @()
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$State = Join-Path $PSScriptRoot '.assess'
$ComposeFile = Join-Path $PSScriptRoot 'deploy/assess/compose.yml'
if (-not (Test-Path 'db/01-schema.sql') -or -not (Test-Path $ComposeFile)) { Write-Host 'Run this from the cse3cap repository.'; exit 1 }
$OnUnix = $PSVersionTable.Platform -eq 'Unix'

function Say($m)  { Write-Host "`n==> $m" -ForegroundColor White }
function Ok($m)   { Write-Host "    ok    $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    !!    $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "`nError: $m" -ForegroundColor Red; exit 1 }
function Port     { if ($env:ASSESS_PORT) { $env:ASSESS_PORT } else { '8080' } }
function Url      { "http://localhost:$(Port)" }

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
function Need-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Die 'Docker is not installed. Install Docker Desktop (https://docs.docker.com/get-docker/), start it, and run .\assess.ps1 again.' }
    docker info *> $null
    if ($LASTEXITCODE -ne 0) { Die 'Docker is installed but not running. Start Docker Desktop, then run .\assess.ps1 again.' }
    docker compose version *> $null
    if ($LASTEXITCODE -ne 0) { Die "Docker Compose v2 is missing ('docker compose' is not a command here). Install Docker Desktop, then run .\assess.ps1 again." }
    docker buildx version *> $null
    if ($LASTEXITCODE -ne 0) { Die 'Docker Buildx is missing. Install Docker Desktop, then run .\assess.ps1 again.' }
}

# ---------------------------------------------------------------------------
# State: .assess\
# ---------------------------------------------------------------------------
function Random-Bytes([int]$n) {
    $bytes = New-Object byte[] $n
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $bytes
}

function Secret {
    $chars = [char[]]'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    -join (Random-Bytes 32 | ForEach-Object { $chars[$_ % $chars.Length] })
}

function Write-Private($Path, [string]$Text) {
    if (-not (Test-Path $State)) {
        New-Item -ItemType Directory -Path $State | Out-Null
        if ($OnUnix) { chmod 700 $State }
    }
    [IO.File]::WriteAllText($Path, $Text.Replace("`r`n", "`n"))
    if ($OnUnix) { chmod 600 $Path }
}

function Ensure-Secrets {
    if (Test-Path "$State/env") { return }
    Write-Private "$State/env" ((@(
        "ASSESS_DB_ROOT_PASSWORD=$(Secret)",
        "ASSESS_DB_APP_PASSWORD=$(Secret)",
        "ASSESS_DB_AI_PASSWORD=$(Secret)",
        "ASSESS_DB_TEST_PASSWORD=$(Secret)",
        "ASSESS_APP_KEY=base64:$([Convert]::ToBase64String((Random-Bytes 32)))"
    ) -join "`n") + "`n")
}

function Load-Secrets {
    Get-Content "$State/env" | ForEach-Object { $n, $v = $_ -split '=', 2; Set-Item "env:$n" $v }
}

function Ai-Var($Name) {
    (Get-Content "$State/ai.env" | Where-Object { $_ -like "$Name=*" } | Select-Object -First 1) -replace "^$Name=", ''
}
function Ai-On { (Ai-Var 'AI_ENABLED') -eq 'true' }
function Set-AiVar($Name, $Value) {
    $lines = @(Get-Content "$State/ai.env" | Where-Object { $_ -notlike "$Name=*" }) + "$Name=$Value"
    Write-Private "$State/ai.env" (($lines -join "`n") + "`n")
}

function Write-ApiEnv {
    Load-Secrets
    Write-Private "$State/api.env" ((@(
        'APP_NAME="Reflection Diary"', 'APP_ENV=production', 'APP_DEBUG=false',
        "APP_URL=$(Url)", "FRONTEND_URL=$(Url)", "APP_KEY=$env:ASSESS_APP_KEY",
        'LOG_CHANNEL=stderr', 'LOG_LEVEL=warning', 'DB_CONNECTION=mysql', 'DB_HOST=mysql', 'DB_PORT=3306',
        'DB_DATABASE=reflection_diary_assess', 'DB_USERNAME=diary_app', "DB_PASSWORD=$env:ASSESS_DB_APP_PASSWORD",
        'DB_COLLATION=utf8mb4_0900_ai_ci', 'MYSQL_ATTR_SSL_CA=', 'CACHE_STORE=file', 'SESSION_DRIVER=file',
        'QUEUE_CONNECTION=sync'
    ) -join "`n") + "`n")
}

function Ensure-AiEnv {
    Load-Secrets
    if (Test-Path "$State/ai.env") { return }
    Write-Private "$State/ai.env" ((@(
        'AI_ENABLED=false', 'DIARY_API_BASE=http://diary-web/api/v1',
        "DATABASE_URL=mysql://diary_ai:$($env:ASSESS_DB_AI_PASSWORD)@mysql:3306/diary_ai",
        'DAILY_CAP_USD=1', 'ANTHROPIC_API_KEY='
    ) -join "`n") + "`n")
}

function Ensure-Personas { # the web container serves this directory (compose.yml)
    if (-not (Test-Path "$State/public")) { New-Item -ItemType Directory -Force -Path "$State/public" | Out-Null }
    if (-not (Test-Path "$State/public/personas.json")) { Write-Private "$State/public/personas.json" "[]`n" }
}
function Ensure-State { Ensure-Secrets; Write-ApiEnv; Ensure-AiEnv; Ensure-Personas }
function Compose { Load-Secrets; docker compose -f $ComposeFile @args }

# The status code, in PowerShell 7 and 5.1 alike: 5.1 throws on any non-2xx.
function Code($Uri, $Headers = @{}) {
    try { (Invoke-WebRequest -Uri $Uri -Headers $Headers -TimeoutSec 5 -UseBasicParsing).StatusCode }
    catch { if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 } }
}

# ---------------------------------------------------------------------------
# Seeding: scripts/demo-reset.sh's steps, against this project only
# ---------------------------------------------------------------------------
function Seeded {
    # Only the marker counts: an empty database's error text carries digits too.
    $out = (Compose run --rm -T diary-api php artisan tinker --execute 'echo "users=".App\Models\User::count();' 2>$null) -join ''
    if ($out -match 'users=(\d+)') { [int]$Matches[1] -gt 0 } else { $false }
}

function Seed {
    Say 'Seeding the demo'
    $work = Join-Path ([IO.Path]::GetTempPath()) ("assess-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $work | Out-Null
    try {
        Compose run --rm -T diary-api php artisan migrate:fresh --drop-views --seed --force --no-interaction --no-ansi | Set-Content "$work/seed.txt"
        if ($LASTEXITCODE -ne 0) { Die 'Seeding failed. Run .\assess.ps1 reset to try again, or .\assess.ps1 down --wipe for a clean start.' }
        $php = 'require "/app/scripts/lib/demo-people.php"; foreach (DEMO_PEOPLE as [$id, $name]) { $user = App\Models\User::where("display_name", $name)->first(); if ($user === null || $user->tokens()->exists()) { continue; } $token = $user->createToken("demo", ["*"], now()->addDays(Database\Seeders\DemoSeeder::TOKEN_LIFETIME_DAYS)); echo $name, " ", $token->plainTextToken, PHP_EOL; }'
        Compose run --rm -T diary-api php artisan tinker --execute $php | Add-Content "$work/seed.txt"
        # On stdin, not a bind mount: a host temp dir is not shared into every Docker VM.
        $json = Get-Content "$work/seed.txt" | Compose run --rm -T diary-api sh -c 'cat >/tmp/seed.txt && exec php /app/scripts/demo-personas.php /tmp/seed.txt'
        Write-Private "$State/public/personas.json" (($json -join "`n") + "`n")
        Compose run --rm -T diary-ai python -m sidecar.reset *> $null
        if ($LASTEXITCODE -ne 0) { Warn "The AI's tables were not emptied; they fill again as the AI is used." }
        Ok "seeded: $(([regex]::Matches((Get-Content "$State/public/personas.json" -Raw), '"token"')).Count) people to sign in as"
    }
    finally { Remove-Item -Recurse -Force $work }
}

function Wait-Web {
    for ($i = 0; $i -lt 60; $i++) { if ((Code "http://127.0.0.1:$(Port)/up") -eq 200) { return }; Start-Sleep 2 }
    Die "The app did not answer on $(Url). See the logs: docker compose -f deploy/assess/compose.yml logs"
}

# ---------------------------------------------------------------------------
# The AI key
# ---------------------------------------------------------------------------
function Check-Key($Key) {
    try {
        Invoke-WebRequest -Uri 'https://api.anthropic.com/v1/models' -Headers @{ 'x-api-key' = $Key; 'anthropic-version' = '2023-06-01' } -TimeoutSec 20 -UseBasicParsing | Out-Null
        return $true
    }
    catch {
        $body = "$($_.ErrorDetails.Message)"
        $message = try { ($body | ConvertFrom-Json).error.message } catch { $body }
        Warn "Anthropic refused the key: $message"
        if ($body -match 'workspace') { Warn 'Make the key inside a workspace: Anthropic Console > Settings > Workspaces > API keys.' }
        return $false
    }
}

function Restart-Ai {
    # Stopped: the new settings apply when .\assess.ps1 next starts it.
    if (-not (Compose ps -q diary-ai 2>$null)) { Ok 'saved; it applies when the stack next starts (.\assess.ps1)'; return }
    Compose up -d --no-deps --force-recreate diary-ai | Out-Null
    $want = if (Ai-On) { 401 } else { 404 }
    for ($i = 0; $i -lt 60; $i++) {
        if ((Code "http://127.0.0.1:$(Port)/ai/v1/status") -eq $want) { Ok "the AI answers $want"; return }
        Start-Sleep 3
    }
    Warn "The AI did not answer $want yet (it loads a model on first start). .\assess.ps1 smoke checks again."
}

function Take-Key {
    $key = ''
    if ($env:ANTHROPIC_API_KEY -and (Read-Host '    Use the key in ANTHROPIC_API_KEY? [Y/n]') -notmatch '^[nN]') { $key = $env:ANTHROPIC_API_KEY }
    else {
        $secure = Read-Host '    Paste an Anthropic API key, or press Enter to skip' -AsSecureString
        $key = (New-Object Net.NetworkCredential('', $secure)).Password
    }
    $key = $key -replace '\s', ''
    if (-not $key) { Ok 'skipped: the AI stays off'; return $false }
    if (-not (Check-Key $key)) { Warn 'nothing saved'; return $false }
    Set-AiVar 'ANTHROPIC_API_KEY' $key
    Set-AiVar 'AI_ENABLED' 'true'
    Ok 'key accepted and saved to .assess\ai.env'
    Write-Host '    Try it: Noor on her draft, or Jane starting sprint 3 (Ask me questions); Tom on an'
    Write-Host '    assessed reflection (Think about the difference); Sam in the review queue (search, themes).'
    return $true
}

function Ai-Offer {
    if (Test-Path "$State/ai-offered") { return }
    Write-Private "$State/ai-offered" ''
    Say 'AI features (optional)'
    Write-Host '    The coach, calibration questions, similar reflections, search and themes.'
    Write-Host '    They use your own Anthropic key, capped at US$1 a day.'
    if (Take-Key) { Restart-Ai }
}

function Print-Ready {
    Say 'Ready'
    Write-Host "    Open $(Url) and pick a person to sign in as."
    Write-Host '    Jane N is a student on both gigs; Sam O assesses; Dr Lee supervises.'
    if (Ai-On) { Write-Host "    AI: on, your key, capped at US`$$(Ai-Var 'DAILY_CAP_USD') a day." }
    else { Write-Host '    AI: off. .\assess.ps1 ai turns it on with your own Anthropic key.' }
    Write-Host '    Tests: .\assess.ps1 test    Stop: .\assess.ps1 down'
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
switch ($Command) {
    'up' {
        Need-Docker; Ensure-State
        if (-not (Compose ps -q diary-web 2>$null) -and (Code "http://127.0.0.1:$(Port)/") -ne 0) {
            Die "Port $(Port) is in use. Free it, or choose another: `$env:ASSESS_PORT=8090; .\assess.ps1"
        }
        Say 'Building and starting (the first run takes 5-10 minutes)'
        Compose build
        if ($LASTEXITCODE -ne 0) { Die 'A build failed (above). Check Docker has 4 GB of memory and a network, then run .\assess.ps1 again.' }
        Compose up -d mysql
        if ($LASTEXITCODE -ne 0) { Die 'MySQL did not start (above).' }
        if (-not (Seeded)) { Seed }
        Compose up -d
        if ($LASTEXITCODE -ne 0) { Die 'The stack did not start (above).' }
        Wait-Web; Ai-Offer; Print-Ready
    }
    'ai' {
        Ensure-State
        $first = if ($Rest.Count -gt 0) { $Rest[0] } else { '' }
        switch ($first) {
            '--cap' {
                $cap = if ($Rest.Count -gt 1) { $Rest[1] } else { '' }
                if ($cap -notmatch '^\d+(\.\d+)?$') { Die '--cap takes a number of US dollars a day, e.g. .\assess.ps1 ai --cap 5' }
                Set-AiVar 'DAILY_CAP_USD' $cap; Ok "cap: US`$$cap a day"; Restart-Ai
            }
            '--off' { Set-AiVar 'ANTHROPIC_API_KEY' ''; Set-AiVar 'AI_ENABLED' 'false'; Ok 'key removed, AI off'; Restart-Ai }
            '' {
                Say 'AI'
                if (Ai-On) { $k = Ai-Var 'ANTHROPIC_API_KEY'; Write-Host "    on · key …$($k.Substring($k.Length - 4)) · cap US`$$(Ai-Var 'DAILY_CAP_USD') a day" }
                else { Write-Host '    off' }
                Write-Host '    1) add or replace the key   2) change the cap   3) turn the AI off   Enter) leave it'
                switch (Read-Host '    >') {
                    '1' { if (Take-Key) { Restart-Ai } }
                    '2' { & $PSCommandPath ai --cap (Read-Host '    US$ a day') }
                    '3' { & $PSCommandPath ai --off }
                    default { Ok 'unchanged' }
                }
            }
            default { Die '.\assess.ps1 ai takes --cap N or --off, or nothing to choose.' }
        }
    }
    'test' {
        Need-Docker; Ensure-State
        $suites = @('api', 'ai', 'web')
        if ($Rest.Count -gt 0) {
            if ($Rest[0] -notin 'api', 'ai', 'web') { Die '.\assess.ps1 test takes api, ai or web, or nothing for all three.' }
            $suites = @($Rest[0])
        }
        Compose up -d mysql | Out-Null
        $results = @(); $failed = $false
        foreach ($s in $suites) {
            Say "Tests: $s"
            Compose --profile test run --rm --build "$s-test"
            if ($LASTEXITCODE -eq 0) { $results += "$s passed" } else { $results += "$s FAILED"; $failed = $true }
        }
        Say 'Summary'; Write-Host "    $($results -join ' · ')"
        if ($failed) { exit 1 }
    }
    'reset' {
        Need-Docker; Ensure-State
        Compose up -d mysql | Out-Null
        Seed
        Compose up -d | Out-Null
        Ok 'reset: everyone signed in must reload the page'
    }
    'smoke' {
        Ensure-State
        $base = "http://127.0.0.1:$(Port)"; $fails = 0
        Say 'Smoke'
        if ((Code "$base/") -eq 200) { Ok 'the page loads' } else { Warn 'the page does not load'; $fails++ }
        if ((Code "$base/up") -eq 200) { Ok '/up answers' } else { Warn '/up does not answer'; $fails++ }
        $people = try { @(Invoke-RestMethod "$base/demo/personas.json" -TimeoutSec 5).Count } catch { 0 }
        if ($people -eq 6) { Ok "personas.json lists $people people" } else { Warn "personas.json lists $people people, not 6"; $fails++ }
        $personas = @(Get-Content "$State/public/personas.json" -Raw | ConvertFrom-Json)
        $token = if ($personas.Count -gt 0) { $personas[0].token } else { '' }
        $code = Code "$base/api/v1/auth/me" @{ Authorization = "Bearer $token" }
        if ($code -eq 200) { Ok "a persona's token reads /api/v1/auth/me" } else { Warn "/api/v1/auth/me answered $code to a persona"; $fails++ }
        $want = if (Ai-On) { 401 } else { 404 }
        $code = Code "$base/ai/v1/status"
        if ($code -eq $want) { Ok "/ai/v1/status answers $code" } else { Warn "/ai/v1/status answered $code, wanted $want"; $fails++ }
        if ($fails) { Die 'Smoke failed (above).' }
    }
    'status' {
        Ensure-State
        Say 'Status'
        if (Compose ps -q diary-web 2>$null) { Ok "running at $(Url)" } else { Warn 'not running: .\assess.ps1' }
        if (Ai-On) { Ok 'AI on' } else { Ok 'AI off' }
    }
    'down' {
        Need-Docker; Ensure-State
        if ($Rest.Count -gt 0 -and $Rest[0] -eq '--wipe') {
            Compose --profile test down --volumes --rmi local
            Remove-Item -Recurse -Force $State
            Ok 'stopped, and its database, images and .assess deleted'
        }
        else { Compose --profile test down; Ok 'stopped. .\assess.ps1 starts it again with the same data' }
    }
    default { Die "Unknown command '$Command'. Get-Help .\assess.ps1 lists them." }
}
