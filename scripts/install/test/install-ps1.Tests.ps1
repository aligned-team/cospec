# Pester 5 tests for scripts/install/install.ps1.
#
#   Invoke-Pester -Path scripts/install/test/install-ps1.Tests.ps1
#
# The installer ends by calling Install-Cospec, so it is not dot-sourced here:
# its function definitions are lifted out of the parsed AST and defined in the
# test scope, which keeps the shipped script free of test-only switches.

BeforeAll {
  $script:Installer = Join-Path (Join-Path $PSScriptRoot '..') 'install.ps1'
  $ast = [System.Management.Automation.Language.Parser]::ParseFile($script:Installer, [ref]$null, [ref]$null)
  $functions = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $false)
  foreach ($fn in $functions) {
    . ([ScriptBlock]::Create($fn.Extent.Text))
  }

  function New-FakeRelease {
    param([string]$Root, [string]$Version, [switch]$Tamper)
    $dir = Join-Path $Root (Join-Path 'download' "v$Version")
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $lines = @()
    foreach ($arch in 'x64', 'arm64') {
      $stage = Join-Path $Root "stage-$Version-$arch"
      New-Item -ItemType Directory -Force -Path $stage | Out-Null
      Set-Content -LiteralPath (Join-Path $stage 'cospec.exe') -Value "cospec $Version windows-$arch" -NoNewline
      $zip = Join-Path $dir "cospec-$Version-windows-$arch.zip"
      Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
      $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
      $lines += "$hash  cospec-$Version-windows-$arch.zip"
      if ($Tamper) { Add-Content -LiteralPath $zip -Value 'tampered' }
    }
    # Unix archives are listed too, as in a real release.
    $lines += ('0' * 64) + "  cospec-$Version-linux-x64.tar.gz"
    $lines += ('0' * 64) + "  cospec-$Version-linux-x64-musl.tar.gz"
    Set-Content -LiteralPath (Join-Path $dir 'SHA256SUMS') -Value ($lines -join "`n")
  }
}

Describe 'asset selection' {
  BeforeAll {
    $script:Sums = @(
      ('a' * 64) + '  cospec-0.12.0-linux-x64.tar.gz'
      ('b' * 64) + '  cospec-0.12.0-linux-arm64-musl.tar.gz'
      ('c' * 64) + '  cospec-0.12.0-windows-x64.zip'
      ('d' * 64) + ' *cospec-0.12.0-windows-arm64.zip'
      ('e' * 64) + '  install.ps1'
    ) -join "`n"
  }

  It 'selects the windows-x64 archive on x64' {
    $asset = Select-CospecAsset -Sums $script:Sums -Arch x64
    $asset.Name | Should -Be 'cospec-0.12.0-windows-x64.zip'
    $asset.Hash | Should -Be ('c' * 64)
    $asset.Version | Should -Be '0.12.0'
  }

  It 'selects the windows-arm64 archive on arm64 (binary-mode * marker stripped)' {
    $asset = Select-CospecAsset -Sums $script:Sums -Arch arm64
    $asset.Name | Should -Be 'cospec-0.12.0-windows-arm64.zip'
    $asset.Hash | Should -Be ('d' * 64)
  }

  It 'reads a prerelease version out of the asset name' {
    $sums = ('f' * 64) + '  cospec-1.0.0-rc.1-windows-x64.zip'
    (Select-CospecAsset -Sums $sums -Arch x64).Version | Should -Be '1.0.0-rc.1'
  }

  It 'refuses an unsupported architecture' {
    { Select-CospecAsset -Sums $script:Sums -Arch x86 } | Should -Throw '*unsupported Windows architecture*'
  }

  It 'fails when SHA256SUMS lists no archive for the architecture' {
    $sums = ('a' * 64) + '  cospec-0.12.0-windows-x64.zip'
    { Select-CospecAsset -Sums $sums -Arch arm64 } | Should -Throw '*no windows-arm64 archive*'
  }

  It 'maps the host architecture to x64 or arm64' {
    Get-CospecArch | Should -BeIn @('x64', 'arm64')
  }
}

Describe 'Install-Cospec against a local release' {
  BeforeEach {
    $script:Root = Join-Path ([IO.Path]::GetTempPath()) ("cospec-ps1-test-" + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $script:Root | Out-Null
    $script:Release = Join-Path $script:Root 'releases'
    New-FakeRelease -Root $script:Release -Version '0.12.0'
    New-FakeRelease -Root $script:Release -Version '0.12.1' -Tamper
    $script:Dir = Join-Path $script:Root 'bin'
  }
  AfterEach {
    Remove-Item -LiteralPath $script:Root -Recurse -Force -ErrorAction SilentlyContinue
  }

  It 'installs the verified <arch> binary' -ForEach @(@{ arch = 'x64' }, @{ arch = 'arm64' }) {
    Install-Cospec -Version '0.12.0' -InstallDir $script:Dir -ReleaseBase $script:Release -Arch $arch -NoModifyPath $true
    Get-Content -LiteralPath (Join-Path $script:Dir 'cospec.exe') -Raw | Should -Be "cospec 0.12.0 windows-$arch"
    @(Get-ChildItem -LiteralPath $script:Dir -Force).Name | Should -Be @('cospec.exe')
  }

  It 'accepts a v-prefixed COSPEC_VERSION' {
    Install-Cospec -Version 'v0.12.0' -InstallDir $script:Dir -ReleaseBase $script:Release -Arch x64 -NoModifyPath $true
    Get-Content -LiteralPath (Join-Path $script:Dir 'cospec.exe') -Raw | Should -Be 'cospec 0.12.0 windows-x64'
  }

  It 'refuses a tampered archive and writes nothing' {
    { Install-Cospec -Version '0.12.1' -InstallDir $script:Dir -ReleaseBase $script:Release -Arch x64 -NoModifyPath $true } |
      Should -Throw '*checksum mismatch*'
    Test-Path -LiteralPath $script:Dir | Should -BeFalse
  }

  It 'leaves an existing cospec.exe untouched on a checksum mismatch' {
    New-Item -ItemType Directory -Path $script:Dir | Out-Null
    Set-Content -LiteralPath (Join-Path $script:Dir 'cospec.exe') -Value 'previous' -NoNewline
    { Install-Cospec -Version '0.12.1' -InstallDir $script:Dir -ReleaseBase $script:Release -Arch arm64 -NoModifyPath $true } |
      Should -Throw '*checksum mismatch*'
    Get-Content -LiteralPath (Join-Path $script:Dir 'cospec.exe') -Raw | Should -Be 'previous'
    @(Get-ChildItem -LiteralPath $script:Dir -Force).Name | Should -Be @('cospec.exe')
  }

  It 'fails on a release that does not exist' {
    { Install-Cospec -Version '9.9.9' -InstallDir $script:Dir -ReleaseBase $script:Release -Arch x64 -NoModifyPath $true } |
      Should -Throw '*not found*'
  }
}
