# Sets up a working copy of the Reflection Diary for development on Windows.
#
# Run from inside the repository, or via the bootstrap:
#
#   irm https://dl.darkovski.dev/git/cse3cap/install.ps1 | iex
#
# Idempotent. Rerun it after pulling, or when api/ and web/ first appear.
#
# This never contains a password. It asks for the two it needs and writes
# them where they belong. If you are reading this because you are about to
# add one, do not.

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

# PowerShell 7.4 made a non-zero exit from a native command a terminating
# error when ErrorActionPreference is Stop. Every version and extension
# check below deliberately runs a command that exits non-zero to say "no",
# so leaving this on aborts the script instead of printing the warning it
# was about to print. Same class of bug as `set -o pipefail` swallowing
# `grep -q` in setup.sh.
if (Test-Path Variable:\PSNativeCommandUseErrorActionPreference) {
    $PSNativeCommandUseErrorActionPreference = $false
}

function Say  { param($m) Write-Host "==> " -ForegroundColor Blue -NoNewline; Write-Host $m }
function Ok   { param($m) Write-Host "  ok " -ForegroundColor Green -NoNewline; Write-Host $m }
function Warn { param($m) Write-Host "  !! " -ForegroundColor Yellow -NoNewline; Write-Host $m }
function Die  { param($m) Write-Host "Error: " -ForegroundColor Red -NoNewline; Write-Host $m; exit 1 }

# UTF-8 with no byte order mark. PowerShell 5.1's `-Encoding UTF8` writes a
# BOM, and a BOM at the top of a .env file becomes part of the first key, so
# Laravel reads it as "?DB_CONNECTION" and reports no database connection at
# all. Nothing about the file looks wrong when you open it.
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Write-TextFile {
    param($Path, [string[]]$Lines)
    $full = Join-Path (Get-Location) $Path
    [IO.File]::WriteAllText($full, (($Lines -join "`n") + "`n"), $Utf8NoBom)
}

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
if (-not (Test-Path 'db/01-schema.sql')) { Die "This does not look like the cse3cap repository." }

$DbHost = 'rddb.darkovski.dev'
$DbName = 'reflection_diary'

# ---------------------------------------------------------------------------
# 1. Prerequisites
# ---------------------------------------------------------------------------
Say "Checking prerequisites"

$missing = $false
function Need {
    param($Bin, $WingetId)
    $cmd = Get-Command $Bin -ErrorAction SilentlyContinue
    if ($cmd) {
        $v = (& $Bin --version 2>$null | Select-Object -First 1)
        Ok "$Bin $v"
    } else {
        Warn "$Bin is missing. Try: winget install $WingetId"
        $script:missing = $true
    }
}

Need git      'Git.Git'
Need php      'PHP.PHP.8.5'
Need composer 'Composer.Composer'
Need node     'OpenJS.NodeJS.LTS'
Need npm      'OpenJS.NodeJS.LTS'

if (Get-Command php -ErrorAction SilentlyContinue) {
    # Laravel 13 needs 8.3 or newer and we target 8.5. Below that, the
    # failure surfaces much later and is hard to trace back to here.
    & php -r 'exit(PHP_VERSION_ID >= 80300 ? 0 : 1);'
    if ($LASTEXITCODE -ne 0) {
        Warn "PHP $(& php -r 'echo PHP_VERSION;') is too old. Laravel 13 needs 8.3 or newer."
        $missing = $true
    }

    # Asked of PHP directly rather than by filtering `php -m`. It is the
    # same reasoning as setup.sh: the answer should come from the runtime,
    # not from parsing a listing whose formatting we do not control.
    #
    # On Windows these ship with PHP but are commented out in php.ini, which
    # is the single most common reason a fresh Windows setup fails here.
    foreach ($ext in @('pdo_mysql', 'mbstring', 'openssl', 'fileinfo')) {
        & php -r "exit(extension_loaded('$ext') ? 0 : 1);"
        if ($LASTEXITCODE -ne 0) {
            $ini = & php -r 'echo php_ini_loaded_file();'
            Warn "PHP extension '$ext' is not enabled. Uncomment extension=$ext in $ini"
            $missing = $true
        }
    }
}

if ($missing) { Die "Install or enable what is missing above, then rerun this script." }

# ---------------------------------------------------------------------------
# 2. Credentials
# ---------------------------------------------------------------------------
# Two passwords, both from the team channel. diary_app is what Laravel
# connects as. diary_ro is read only and is what the MySQL MCP server uses
# so coding agents can read the schema without being able to change it.
Say "Database credentials"

function Read-Secret {
    param($Prompt)

    # Piping the bootstrap into iex can leave no interactive host, and
    # Read-Host then throws rather than returning nothing. Checked before
    # asking so an unattended run degrades to a warning, the way the
    # POSIX script does.
    if (-not [Environment]::UserInteractive) {
        Warn "No interactive terminal, skipping $Prompt. Set it yourself later."
        return ''
    }

    try {
        Write-Host "  ? " -ForegroundColor Blue -NoNewline
        $s = Read-Host -Prompt $Prompt -AsSecureString
    } catch {
        Warn "Could not read $Prompt from the terminal. Set it yourself later."
        return ''
    }

    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
    try   { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

$AppPw = Read-Secret "diary_app password (blank to skip)"
$RoPw  = Read-Secret "diary_ro password (blank to skip)"

# ---------------------------------------------------------------------------
# 3. Backend environment
# ---------------------------------------------------------------------------
Say "Backend environment"

# Rewrite a whole line rather than substitute into it. A password can
# contain characters that mean something to the regex engine, and escaping
# them correctly is harder than not needing to.
function Set-EnvValue {
    param($Path, $Key, $Value)
    $lines = @(Get-Content $Path | ForEach-Object {
        if ($_ -like "$Key=*") { "$Key=$Value" } else { $_ }
    })
    Write-TextFile $Path $lines
}

if (Test-Path 'api') {
    if (Test-Path 'api/.env') {
        Ok "api/.env already exists, leaving it alone"
    } else {
        Copy-Item '.env.example' 'api/.env'

        if ($AppPw) {
            Set-EnvValue 'api/.env' 'DB_PASSWORD' $AppPw
            Ok "wrote api/.env with the database password"
        } else {
            Ok "wrote api/.env, but DB_PASSWORD is still blank"
        }

        # One test database each. The suite runs a fresh migration, so two
        # people sharing this value would drop each other's schema mid-run.
        # Non-alphanumerics out: this becomes an identifier, and the grant
        # is on reflection_diary_test_%.
        $who = $env:USERNAME
        if (-not $who) { $who = 'dev' }
        $who = ($who.ToLower() -replace '[^a-z0-9]', '_')
        Set-EnvValue 'api/.env' 'DB_TEST_DATABASE' "reflection_diary_test_$who"
        Ok "test database is reflection_diary_test_$who"
    }

    if (Test-Path 'api/composer.json') {
        Say "Installing PHP dependencies"
        Push-Location api
        try {
            & composer install --no-interaction
            if ($LASTEXITCODE -ne 0) { Warn "composer install failed. Fix that before continuing." }

            # After composer, because artisan needs the vendor tree. APP_KEY
            # is per developer and generated, never shared, so a copied .env
            # always arrives without one.
            if ((Test-Path '.env') -and (Select-String -Path '.env' -Pattern '^APP_KEY=$' -Quiet)) {
                & php artisan key:generate | Out-Null
                if ($LASTEXITCODE -eq 0) { Ok "generated APP_KEY" }
            }
        } finally { Pop-Location }
    }
} else {
    Warn "api/ does not exist yet. Rerun this script once the Laravel app lands."
}

if (Test-Path 'web') {
    if (-not (Test-Path 'web/.env')) {
        Write-TextFile 'web/.env' @('VITE_API_BASE_URL=http://localhost:8000/api/v1')
        Ok "wrote web/.env"
    } else { Ok "web/.env already exists" }

    if (Test-Path 'web/package.json') {
        Say "Installing frontend dependencies"
        Push-Location web
        try { & npm install } finally { Pop-Location }
    }
} else {
    Warn "web/ does not exist yet. Rerun this script once the frontend lands."
}

# ---------------------------------------------------------------------------
# 4. Claude Code
# ---------------------------------------------------------------------------
# .mcp.json defaults everything except the read only password, so this one
# variable is the whole of the agent setup. Without it the MySQL MCP server
# fails to start and agents fall back to guessing from the schema file.
Say "Claude Code"

if ($RoPw) {
    $existing = [Environment]::GetEnvironmentVariable('DB_READONLY_PASSWORD', 'User')
    if ($existing) {
        Ok "DB_READONLY_PASSWORD already set for your user, leaving it alone"
    } else {
        [Environment]::SetEnvironmentVariable('DB_READONLY_PASSWORD', $RoPw, 'User')
        $env:DB_READONLY_PASSWORD = $RoPw
        Ok "set DB_READONLY_PASSWORD for your user account"
        Warn "New terminals pick this up. Existing ones, including Claude Code, need restarting."
    }
} else {
    Warn "No diary_ro password given. The MySQL MCP server will not start until DB_READONLY_PASSWORD is set."
}

# ---------------------------------------------------------------------------
# 5. Verify
# ---------------------------------------------------------------------------
Say "Verifying"

# TcpClient rather than Test-NetConnection: the latter also runs a ping and a
# route trace, which a firewall usually drops, so it sits there for twenty
# seconds before answering a question we asked about one port.
try {
    $client = New-Object Net.Sockets.TcpClient
    $wait = $client.BeginConnect($DbHost, 3306, $null, $null)
    if ($wait.AsyncWaitHandle.WaitOne(8000) -and $client.Connected) {
        Ok "$DbHost`:3306 reachable"
    } else {
        Warn "Cannot reach $DbHost`:3306. Check your network, then ask in the channel."
    }
    $client.Close()
} catch {
    Warn "Cannot reach $DbHost`:3306. Check your network, then ask in the channel."
}

# The server refuses unencrypted connections, and PDO does not negotiate TLS
# unless handed a CA file. Without it the failure reads "Access denied",
# which sends people hunting for a password problem that is not there.
if ($AppPw -and (Get-Command php -ErrorAction SilentlyContinue)) {
    $env:APP_PW = $AppPw
    $probe = @"
`$o = [PDO::MYSQL_ATTR_SSL_CA => __DIR__ . '/db/letsencrypt-roots.pem'];
try {
    `$p = new PDO('mysql:host=$DbHost;dbname=$DbName', 'diary_app', getenv('APP_PW'), `$o);
    `$n = `$p->query('SELECT COUNT(*) c FROM frameworks')->fetch()['c'];
    fwrite(STDERR, "frameworks=`$n\n");
    exit(0);
} catch (Throwable `$e) { exit(1); }
"@
    & php -r $probe 2>$null
    if ($LASTEXITCODE -eq 0) { Ok "connected to $DbName as diary_app over TLS" }
    else { Warn "Could not connect as diary_app. Wrong password, or MYSQL_ATTR_SSL_CA is not set." }
    Remove-Item Env:\APP_PW -ErrorAction SilentlyContinue
}

Say "Done"
@"

  Next:
    - Open the repo in Claude Code and trust the folder when prompted.
      Restart it if you set DB_READONLY_PASSWORD just now, since .mcp.json
      reads the environment at startup.
    - Read CLAUDE.md. It is short and it is the rules.
    - Migrations are announced in the channel before they run. The database
      is shared, so a bad one takes out everyone.

"@ | Write-Host
