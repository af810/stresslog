param([Parameter(Mandatory=$true)][string]$DeviceAddress, [string]$PairAddress, [switch]$InstallVerifiedApk)
. "$PSScriptRoot\Environment.ps1"
$adb = Get-StressLogAdb
if ($DeviceAddress -notmatch '^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$') { throw 'Use the watch IPv4 address and CONNECTION port.' }
if ($PairAddress) {
    if ($PairAddress -notmatch '^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$') { throw 'Invalid PAIRING address.' }
    & $adb pair $PairAddress
    if ($LASTEXITCODE -ne 0) { throw 'ADB pairing failed.' }
}
& $adb connect $DeviceAddress
& $adb -s $DeviceAddress get-state
if ($LASTEXITCODE -ne 0) { throw 'Watch is not connected. Check Wireless debugging.' }
$features = & $adb -s $DeviceAddress shell pm list features
if ($LASTEXITCODE -ne 0 -or ($features -join "`n") -notmatch 'feature:android.hardware.type.watch') { throw 'Selected device is not a Wear OS watch.' }
if ($InstallVerifiedApk) {
    $apk = Join-Path $script:ProjectRoot 'releases\watch\stresslog-watch-v0.5.2.apk'
    if ((Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash -ne '710e392a7cd2c22ccc1e6b4b3d79026c5dc871b6e8c4dab15ea512cb6ef06f00') { throw 'Verified APK checksum mismatch.' }
    & $adb -s $DeviceAddress install -r $apk
    if ($LASTEXITCODE -ne 0) { throw 'Installation failed. Do not uninstall automatically; see docs/SETUP.md for version/signature conflicts.' }
}
$addressFile = Join-Path $script:PrivateDir 'address.txt'
if (-not (Test-Path -LiteralPath $addressFile)) { throw 'Run scripts\Start.ps1 before configuring the watch.' }
$lan = (Get-Content -LiteralPath $addressFile -Raw).Trim()
$encoded = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes((Join-Path $script:PrivateDir 'cert.pem')))
$token = (Get-Content -LiteralPath (Join-Path $script:PrivateDir 'token.txt') -Raw).Trim()
# Suppress am output: it echoes the complete intent, including credentials.
$setupResult = & $adb -s $DeviceAddress shell am start -n com.nishi.stresslog.watchprobe/.LiveSetupActivity --es receiver "https://${lan}:8787/ingest" --es certificate $encoded --es authToken $token --ez resume false 2>&1
if ($LASTEXITCODE -ne 0 -or ($setupResult -join '') -match 'Error|Exception|Permission Denial') { throw 'Watch configuration failed. Credentials were not printed.' }
Write-Host 'Configured. On the watch, open StressLog > automatic measurement > 7-minute measurement. Allow sensor/notification permissions if requested.'
