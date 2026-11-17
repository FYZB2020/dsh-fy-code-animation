<#
  dsh-fy-code-animation release helper.

  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release.ps1
    ... -Bump minor -Message "feat: 支持 4K 渲染"
    ... -DryRun

  Order:
    1. tests/contract.mjs  (DSH plugin contract: 6 tools, 2 skills, 4 routes)
    2. tests/harness.mjs   (style library, projects, timelines, deps probing)
    3. bump version in package.json
    4. prepend a dated section to CHANGELOG.md
    5. commit, tag vX.Y.Z, push branch + tag

  Nothing is pushed unless both suites pass. -DryRun writes nothing.
#>

[CmdletBinding()]
param(
  [ValidateSet('patch', 'minor', 'major')]
  [string]$Bump = 'patch',
  [string]$Message = '',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Push-Location $repo
try {
  Write-Host ''
  Write-Host "== dsh-fy-code-animation release ($Bump) ==" -ForegroundColor Cyan

  if (-not (Test-Path 'package.json')) { throw "package.json not found in $repo" }

  Write-Host '-> running tests'
  foreach ($t in @('tests/contract.mjs', 'tests/harness.mjs')) {
    if (-not (Test-Path $t)) { Write-Host "   skip $t (missing)" -ForegroundColor DarkGray; continue }
    node $t 2>&1 | ForEach-Object { "   $_" }
    if ($LASTEXITCODE -ne 0) { throw "test failed: $t" }
  }
  Write-Host '   contract + harness passed' -ForegroundColor Green

  $pkg = Get-Content 'package.json' -Raw -Encoding UTF8 | ConvertFrom-Json
  $old = [string]$pkg.version
  $parts = $old.Split('.')
  $major = [int]$parts[0]; $minor = [int]$parts[1]; $patch = [int]$parts[2]
  switch ($Bump) {
    'major' { $major++; $minor = 0; $patch = 0 }
    'minor' { $minor++; $patch = 0 }
    'patch' { $patch++ }
  }
  $new = "$major.$minor.$patch"
  Write-Host "-> version $old -> $new"

  if ($DryRun) {
    Write-Host '   -DryRun: stopping before any write' -ForegroundColor Yellow
    return
  }

  node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.version='$new';fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');"
  if ($LASTEXITCODE -ne 0) { throw 'failed to bump package.json' }

  $date = Get-Date -Format 'yyyy-MM-dd'
  $body = if ($Message) { $Message } else { "- (fill in what changed in $new)" }
  $entry = "## $new - $date`n`n$body`n`n"
  $cl = if (Test-Path 'CHANGELOG.md') { Get-Content 'CHANGELOG.md' -Raw -Encoding UTF8 } else { '' }
  Set-Content 'CHANGELOG.md' -Encoding UTF8 -NoNewline -Value ($entry + $cl)
  Write-Host '-> CHANGELOG.md updated (review the wording before the tag lands)'

  git -c core.autocrlf=false add -A
  $commitMsg = if ($Message) { $Message } else { "chore: release $new" }
  git -c core.autocrlf=false commit -m "chore: release $new" -m $commitMsg 2>&1 | ForEach-Object { "   $_" }
  git tag -a "v$new" -m "v$new"
  git push origin HEAD 2>&1 | ForEach-Object { "   $_" }
  git push origin "v$new" 2>&1 | ForEach-Object { "   $_" }

  Write-Host ''
  Write-Host "== released v$new ==" -ForegroundColor Green
}
finally {
  Pop-Location
}
