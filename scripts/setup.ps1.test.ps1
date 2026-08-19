# Cases scripts/setup.ps1 has to get right.
#
#   pwsh -NoProfile -File scripts/setup.ps1.test.ps1
#
# The BOM case is not hypothetical. PowerShell 5.1's `-Encoding UTF8` writes
# a byte order mark, and a BOM at the top of a .env file becomes part of the
# first key, so Laravel reads it as "?DB_CONNECTION" and reports that there
# is no database connection configured. Nothing looks wrong in an editor.

$ErrorActionPreference = 'Stop'

$script:failures = 0
function Check {
    param($Name, $Condition, $Detail = '')
    if ($Condition) {
        Write-Host "  ok   $Name"
    } else {
        Write-Host "FAIL   $Name $Detail"
        $script:failures++
    }
}

$Setup = Join-Path $PSScriptRoot 'setup.ps1'

# --- it has to parse at all -------------------------------------------------
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile($Setup, [ref]$null, [ref]$errors) | Out-Null
Check 'setup.ps1 parses' ($errors.Count -eq 0) ($errors -join '; ')

# --- pull the real definitions out rather than restating them ---------------
$ast = [System.Management.Automation.Language.Parser]::ParseFile($Setup, [ref]$null, [ref]$null)

$encoding = $ast.FindAll({
    $args[0] -is [System.Management.Automation.Language.AssignmentStatementAst] -and
    $args[0].Left.Extent.Text -eq '$Utf8NoBom'
}, $true) | Select-Object -First 1
Check 'setup.ps1 defines $Utf8NoBom' ($null -ne $encoding)
. ([scriptblock]::Create($encoding.Extent.Text))

foreach ($name in @('Write-TextFile', 'Set-EnvValue')) {
    $fn = $ast.FindAll({
        $args[0] -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
        $args[0].Name -eq $name
    }, $true) | Select-Object -First 1
    Check "setup.ps1 defines $name" ($null -ne $fn)
    . ([scriptblock]::Create($fn.Extent.Text))
}

# --- exercise them in a scratch directory -----------------------------------
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("rd-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
Push-Location $tmp
try {
    Write-TextFile '.env' @(
        '# a comment',
        'DB_CONNECTION=mysql',
        'DB_PASSWORD=',
        'DB_TEST_DATABASE=reflection_diary_test_yourname'
    )

    $bytes = [IO.File]::ReadAllBytes((Join-Path $tmp '.env'))
    $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
    Check 'written .env has no byte order mark' (-not $hasBom) ("first bytes: {0:X2} {1:X2} {2:X2}" -f $bytes[0], $bytes[1], $bytes[2])

    $first = (Get-Content '.env')[0]
    Check 'first line survives intact' ($first -eq '# a comment') "got '$first'"

    # A password full of things that mean something to a regex engine.
    $awkward = 'p$1&x|y/z\q.*+?[]^(){}'
    Set-EnvValue '.env' 'DB_PASSWORD' $awkward

    $written = (Get-Content '.env' | Where-Object { $_ -like 'DB_PASSWORD=*' })
    Check 'password written verbatim' ($written -eq "DB_PASSWORD=$awkward") "got '$written'"

    Set-EnvValue '.env' 'DB_TEST_DATABASE' 'reflection_diary_test_jdarkovski'
    $test = (Get-Content '.env' | Where-Object { $_ -like 'DB_TEST_DATABASE=*' })
    Check 'test database rewritten' ($test -eq 'DB_TEST_DATABASE=reflection_diary_test_jdarkovski') "got '$test'"

    Check 'other lines untouched' (((Get-Content '.env') -contains 'DB_CONNECTION=mysql'))
    Check 'no line duplicated' ((Get-Content '.env').Count -eq 4) ("line count: " + (Get-Content '.env').Count)

    $bytes = [IO.File]::ReadAllBytes((Join-Path $tmp '.env'))
    $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
    Check 'still no BOM after a rewrite' (-not $hasBom)

    # The username sanitiser, as written in setup.ps1.
    foreach ($pair in @(@('J.Darkovski', 'j_darkovski'), @('CONTOSO\ada', 'contoso_ada'), @('bob', 'bob'))) {
        $got = ($pair[0].ToLower() -replace '[^a-z0-9]', '_')
        Check "username '$($pair[0])' becomes '$($pair[1])'" ($got -eq $pair[1]) "got '$got'"
    }
} finally {
    Pop-Location
    Remove-Item -Recurse -Force $tmp
}

Write-Host ''
if ($script:failures -gt 0) {
    Write-Host "$($script:failures) case(s) wrong"
    exit 1
}
Write-Host 'all cases correct'
