param([switch]$InstallNode, [switch]$SkipVerify)
. "$PSScriptRoot\Environment.ps1"
Initialize-StressLogDirectories
if ($InstallNode) {
    $toolchains = Join-Path $script:RuntimeRoot 'toolchains'
    $installedNode = Join-Path $toolchains 'node-v24.19.0-win-x64\node.exe'
    if (-not (Test-Path -LiteralPath $installedNode)) {
        New-Item -ItemType Directory -Force -Path $toolchains | Out-Null
        $archiveName = 'node-v24.19.0-win-x64.zip'
        $archive = Join-Path $toolchains $archiveName
        $baseUrl = 'https://nodejs.org/dist/v24.19.0'
        $hashText = (Invoke-WebRequest "$baseUrl/SHASUMS256.txt" -UseBasicParsing).Content
        $hashLine = @($hashText -split "`n" | Where-Object { $_ -match ('\s+' + [regex]::Escape($archiveName) + '\s*$') })
        if ($hashLine.Count -ne 1) { throw 'Official Node.js checksum was not found.' }
        $expectedHash = ($hashLine[0].Trim() -split '\s+')[0]
        Invoke-WebRequest "$baseUrl/$archiveName" -UseBasicParsing -OutFile $archive
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Node.js archive checksum mismatch.' }
        Expand-Archive -LiteralPath $archive -DestinationPath $toolchains
    }
}
$node = Assert-StressLogNode
$npm = Join-Path (Split-Path -Parent $node) 'npm.cmd'
if (-not (Test-Path -LiteralPath $npm)) { throw 'npm.cmd missing next to node.exe. Install the full Node.js distribution.' }
Push-Location (Join-Path $script:ProjectRoot 'web')
try { & $npm ci; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' } } finally { Pop-Location }
if (-not $SkipVerify) { & "$PSScriptRoot\Verify.ps1" }
Write-Host 'Ready. Run scripts\Start.ps1 to open the app. Watch setup is in docs/SETUP.md.'
