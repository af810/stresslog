$ErrorActionPreference = 'Stop'
$script:ProjectRoot = Split-Path -Parent $PSScriptRoot
$script:RuntimeRoot = Join-Path $script:ProjectRoot '.stresslog-local'
$script:PrivateDir = Join-Path $script:RuntimeRoot 'live'
$script:LogDir = Join-Path $script:RuntimeRoot 'logs'
$script:Utf8 = [System.Text.UTF8Encoding]::new($false)
function Get-StressLogNode {
    $portable = Join-Path $script:RuntimeRoot 'toolchains\node-v24.19.0-win-x64\node.exe'
    if (Test-Path -LiteralPath $portable) { return $portable }
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $command) { throw 'Node.js 24.19+ is required. Run scripts\Setup.ps1 -InstallNode.' }
    return $command.Source
}
function Get-StressLogAdb {
    $command = Get-Command adb.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($sdk in @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk'))) {
        if ($sdk -and (Test-Path -LiteralPath (Join-Path $sdk 'platform-tools\adb.exe'))) { return (Join-Path $sdk 'platform-tools\adb.exe') }
    }
    throw 'Android SDK platform-tools required. Add adb.exe to PATH or set ANDROID_HOME. See docs/SETUP.md.'
}
function Get-StressLogOpenSsl {
    $command = Get-Command openssl.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $gitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
    $candidates = @()
    if ($gitCommand) { $candidates += Join-Path (Split-Path (Split-Path $gitCommand.Source -Parent) -Parent) 'usr\bin\openssl.exe' }
    if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'Git\usr\bin\openssl.exe' }
    if ($env:LOCALAPPDATA) { $candidates += Join-Path $env:LOCALAPPDATA 'Programs\Git\usr\bin\openssl.exe' }
    foreach ($candidate in $candidates) { if (Test-Path -LiteralPath $candidate) { return $candidate } }
    throw 'OpenSSL required for local TLS. Install Git for Windows, which includes OpenSSL. See docs/SETUP.md.'
}
function Assert-StressLogNode {
    $node = Get-StressLogNode
    $versionText = (& $node -p 'process.versions.node').Trim()
    if ($LASTEXITCODE -ne 0 -or [version]$versionText -lt [version]'24.19.0') { throw 'Node.js 24.19+ required for TypeScript execution. Run scripts\Setup.ps1 -InstallNode.' }
    return $node
}
function Initialize-StressLogDirectories {
    New-Item -ItemType Directory -Force -Path $script:PrivateDir,$script:LogDir | Out-Null
}
