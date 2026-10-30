# cospec installer for Windows (x64 and arm64).
#
#   irm https://github.com/aligned-team/cospec/releases/latest/download/install.ps1 | iex
#
# Downloads the standalone cospec.exe for this architecture from a GitHub
# release, verifies it against that release's SHA256SUMS with Get-FileHash, and
# installs it. On a checksum mismatch nothing is written and an existing
# cospec.exe is left untouched. Needs no administrator rights.
#
# Environment:
#   COSPEC_VERSION         install this release (e.g. 0.12.0) instead of the latest
#   COSPEC_INSTALL_DIR     install directory (default: %LOCALAPPDATA%\cospec\bin)
#   COSPEC_RELEASE_BASE    release root (default:
#                          https://github.com/aligned-team/cospec/releases); a local
#                          directory with the same latest\download\ and
#                          download\v<version>\ layout is also accepted
#   COSPEC_NO_MODIFY_PATH  set to 1 to leave the user PATH alone
#
# Works on Windows PowerShell 5.1 and PowerShell 7+.

$ErrorActionPreference = 'Stop'

function Get-CospecArch {
  # OSArchitecture reports the OS, not this process: an x64 PowerShell running
  # under emulation on Windows on Arm still gets the native arm64 binary.
  try {
    $os = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  } catch {
    $os = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
  }
  switch -Regex ($os) {
    '^(X64|AMD64)$' { return 'x64' }
    '^(Arm64|ARM64)$' { return 'arm64' }
    default { throw "cospec: unsupported Windows architecture '$os' (x64 and arm64 are supported)" }
  }
}

function Get-CospecAssetSuffix {
  param([Parameter(Mandatory)][string]$Arch)
  if ($Arch -notin @('x64', 'arm64')) {
    throw "cospec: unsupported Windows architecture '$Arch' (x64 and arm64 are supported)"
  }
  return "-windows-$Arch.zip"
}

# Finds this platform's archive in SHA256SUMS text. Returns @{ Name; Hash; Version }.
function Select-CospecAsset {
  param(
    [Parameter(Mandatory)][string]$Sums,
    [Parameter(Mandatory)][string]$Arch
  )
  $suffix = Get-CospecAssetSuffix -Arch $Arch
  foreach ($line in ($Sums -split "`r?`n")) {
    $parts = $line.Trim() -split '\s+', 2
    if ($parts.Count -ne 2) { continue }
    $name = $parts[1].TrimStart('*')
    if ($name.StartsWith('cospec-') -and $name.EndsWith($suffix)) {
      $version = $name.Substring(7, $name.Length - 7 - $suffix.Length)
      return @{ Name = $name; Hash = $parts[0].ToLowerInvariant(); Version = $version }
    }
  }
  throw "cospec: no windows-$Arch archive is listed in SHA256SUMS"
}

function Get-CospecFile {
  param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$Destination
  )
  if ($Source -match '^https?://') {
    # Windows PowerShell 5.1 defaults to TLS 1.0, which GitHub refuses.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $Source -OutFile $Destination -UseBasicParsing
  } else {
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) { throw "cospec: not found: $Source" }
    Copy-Item -LiteralPath $Source -Destination $Destination
  }
}

function Install-Cospec {
  param(
    [string]$Version = $env:COSPEC_VERSION,
    [string]$InstallDir = $env:COSPEC_INSTALL_DIR,
    [string]$ReleaseBase = $env:COSPEC_RELEASE_BASE,
    [string]$Arch,
    [bool]$NoModifyPath = ($env:COSPEC_NO_MODIFY_PATH -eq '1')
  )
  if (-not $ReleaseBase) { $ReleaseBase = 'https://github.com/aligned-team/cospec/releases' }
  if (-not $InstallDir) { $InstallDir = Join-Path $env:LOCALAPPDATA 'cospec\bin' }
  if (-not $Arch) { $Arch = Get-CospecArch }
  $ReleaseBase = $ReleaseBase.TrimEnd('/', '\')
  if ($Version -eq 'latest') { $Version = '' }
  if ($Version) { $Version = $Version.TrimStart('v') }

  $sep = if ($ReleaseBase -match '^https?://') { '/' } else { [IO.Path]::DirectorySeparatorChar }
  $releaseUrl = if ($Version) {
    @($ReleaseBase, 'download', "v$Version") -join $sep
  } else {
    @($ReleaseBase, 'latest', 'download') -join $sep
  }

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("cospec-install-" + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $sumsPath = Join-Path $tmp 'SHA256SUMS'
    Get-CospecFile -Source ($releaseUrl + $sep + 'SHA256SUMS') -Destination $sumsPath
    $asset = Select-CospecAsset -Sums (Get-Content -LiteralPath $sumsPath -Raw) -Arch $Arch
    if ($Version -and $asset.Version -ne $Version) {
      throw "cospec: SHA256SUMS for v$Version lists $($asset.Name), not version $Version"
    }
    Write-Host "cospec-install: selected asset $($asset.Name)"

    $archive = Join-Path $tmp $asset.Name
    Get-CospecFile -Source ($releaseUrl + $sep + $asset.Name) -Destination $archive
    $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $asset.Hash) {
      throw "cospec: checksum mismatch for $($asset.Name) (expected $($asset.Hash), got $actual); nothing installed"
    }
    Write-Host "cospec-install: checksum OK ($actual)"

    $extract = Join-Path $tmp 'extract'
    Expand-Archive -LiteralPath $archive -DestinationPath $extract
    $exe = Join-Path $extract 'cospec.exe'
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
      throw "cospec: $($asset.Name) has no cospec.exe at its root"
    }

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    # Stage next to the target so the replace is a same-volume rename.
    $staged = Join-Path $InstallDir ".cospec.install.$PID.exe"
    Copy-Item -LiteralPath $exe -Destination $staged -Force
    Move-Item -LiteralPath $staged -Destination (Join-Path $InstallDir 'cospec.exe') -Force
    Write-Host "cospec-install: installed cospec $($asset.Version) to $(Join-Path $InstallDir 'cospec.exe')"

    if (-not $NoModifyPath) {
      $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
      $entries = @($userPath -split ';' | Where-Object { $_ })
      if ($entries -notcontains $InstallDir) {
        [Environment]::SetEnvironmentVariable('Path', (@($entries + $InstallDir) -join ';'), 'User')
        $env:Path = "$env:Path;$InstallDir"
        Write-Host "cospec-install: added $InstallDir to your user PATH (open a new terminal to pick it up)"
      }
    }
  } finally {
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Install-Cospec
