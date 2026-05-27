<#
.SYNOPSIS
  Installs the Aftertale addon into every detected WoW client by
  creating a directory junction back to the repo source.

.DESCRIPTION
  Edit the addon source once in this repo, see changes in every client.
  Reloads via /reload in-game pick up Lua edits without restarting WoW.

  Junctions on Program Files (x86) typically need an elevated shell. If you
  see "Access is denied", re-run from an Administrator PowerShell.

.PARAMETER WowRoot
  Path to the WoW installation root. Defaults to the standard install path.

.PARAMETER Unlink
  Remove the junctions instead of creating them.

.EXAMPLE
  pwsh scripts/install-addon.ps1

.EXAMPLE
  pwsh scripts/install-addon.ps1 -Unlink
#>
[CmdletBinding()]
param(
  [string]$WowRoot = 'C:\Program Files (x86)\World of Warcraft',
  [switch]$Unlink
)

$ErrorActionPreference = 'Stop'

$repoRoot   = Split-Path -Parent $PSScriptRoot
$addonName  = 'Aftertale'
$addonSrc   = Join-Path $repoRoot "addon\$addonName"

if (-not (Test-Path $addonSrc)) {
  throw "Addon source not found at $addonSrc"
}

$flavors = @('_retail_', '_classic_', '_classic_era_', '_anniversary_', '_beta_')

$results = @()

foreach ($flavor in $flavors) {
  $clientRoot = Join-Path $WowRoot $flavor
  if (-not (Test-Path $clientRoot)) {
    $results += [pscustomobject]@{ Flavor = $flavor; Status = 'skipped (not installed)' }
    continue
  }

  $addonsDir = Join-Path $clientRoot 'Interface\AddOns'
  $linkPath  = Join-Path $addonsDir $addonName

  if ($Unlink) {
    if (Test-Path $linkPath) {
      try {
        # Remove junction without recursing into the target.
        (Get-Item $linkPath).Delete()
        $results += [pscustomobject]@{ Flavor = $flavor; Status = 'unlinked' }
      } catch {
        $results += [pscustomobject]@{ Flavor = $flavor; Status = "ERROR: $($_.Exception.Message)" }
      }
    } else {
      $results += [pscustomobject]@{ Flavor = $flavor; Status = 'nothing to unlink' }
    }
    continue
  }

  try {
    if (-not (Test-Path $addonsDir)) {
      New-Item -ItemType Directory -Path $addonsDir -Force | Out-Null
    }

    if (Test-Path $linkPath) {
      $existing = Get-Item $linkPath -Force
      if ($existing.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        (Get-Item $linkPath).Delete()
      } else {
        throw "$linkPath exists and is NOT a junction. Refusing to overwrite a real folder."
      }
    }

    New-Item -ItemType Junction -Path $linkPath -Target $addonSrc | Out-Null
    $results += [pscustomobject]@{ Flavor = $flavor; Status = "linked -> $addonSrc" }
  } catch {
    $results += [pscustomobject]@{ Flavor = $flavor; Status = "ERROR: $($_.Exception.Message)" }
  }
}

$results | Format-Table -AutoSize
