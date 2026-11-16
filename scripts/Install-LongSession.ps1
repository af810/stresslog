param([string]$DeviceAddress)
. "$PSScriptRoot\Environment.ps1"
$adb = Get-StressLogAdb
if (-not $DeviceAddress) {
    $connected = @(& $adb devices | Where-Object { $_ -match '^\S+\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
    if ($connected.Count -eq 1) { $DeviceAddress = $connected[0] }
    else {
        $advertised = @(& $adb mdns services | Where-Object { $_ -match '_adb-tls-connect\._tcp\s+(\d{1,3}(?:\.\d{1,3}){3}:\d{1,5})' } | ForEach-Object { [regex]::Match($_,'(\d{1,3}(?:\.\d{1,3}){3}:\d{1,5})\s*$').Groups[1].Value } | Select-Object -Unique)
        if ($advertised.Count -eq 1) { $DeviceAddress = $advertised[0] }
    }
}
if (-not $DeviceAddress -or ($DeviceAddress -notmatch '^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$' -and $DeviceAddress -notmatch '^adb-[A-Za-z0-9_-]+\._adb-tls-connect\._tcp$')) { throw 'Enable Wireless debugging on one paired watch, or pass -DeviceAddress.' }
if ($DeviceAddress -match ':') { & $adb connect $DeviceAddress }
$features = & $adb -s $DeviceAddress shell pm list features
if ($LASTEXITCODE -ne 0 -or ($features -join "`n") -notmatch 'feature:android.hardware.type.watch') { throw 'Selected device is not a Wear OS watch.' }
$manifest = Get-Content -LiteralPath (Join-Path $script:ProjectRoot 'releases\watch\long-session.json') -Raw | ConvertFrom-Json
if ($manifest.packageId -ne 'com.nishi.stresslog.watchprobe' -or $manifest.versionCode -ne 13) { throw 'Unexpected long-session build manifest.' }
$apk = Join-Path $script:ProjectRoot 'releases\watch\stresslog-watch-v0.6.0.apk'
if ((Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash -ne $manifest.sha256) { throw 'Long-session APK checksum mismatch.' }
& $adb -s $DeviceAddress install -r $apk
if ($LASTEXITCODE -ne 0) { throw 'Update failed. No app was uninstalled; existing data remain.' }
& "$PSScriptRoot\Configure-Watch.ps1" -DeviceAddress $DeviceAddress
