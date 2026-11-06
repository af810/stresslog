param([Parameter(Mandatory=$true)][string]$DeviceAddress)
. "$PSScriptRoot\Environment.ps1"
$adb = Get-StressLogAdb
if ($DeviceAddress -notmatch '^\d{1,3}(\.\d{1,3}){3}:\d{1,5}$') { throw 'Use the watch IPv4 address and CONNECTION port.' }
$manifest = Get-Content -LiteralPath (Join-Path $script:ProjectRoot 'releases\watch\ui-preview.json') -Raw | ConvertFrom-Json
if ($manifest.packageId -ne 'com.nishi.stresslog.watchprobe.preview' -or $manifest.measurementEnabled -ne $false) { throw 'Invalid UI preview manifest.' }
$apk = Join-Path $script:ProjectRoot 'releases\watch\stresslog-watch-ui-preview.apk'
if ((Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash -ne $manifest.sha256) { throw 'UI preview APK checksum mismatch.' }
& $adb connect $DeviceAddress
& $adb -s $DeviceAddress get-state
if ($LASTEXITCODE -ne 0) { throw 'Watch is not connected. Check Wireless debugging.' }
$features = & $adb -s $DeviceAddress shell pm list features
if ($LASTEXITCODE -ne 0 -or ($features -join "`n") -notmatch 'feature:android.hardware.type.watch') { throw 'The selected device is not a Wear OS watch.' }
& $adb -s $DeviceAddress install -r $apk
if ($LASTEXITCODE -ne 0) { throw 'Preview installation failed. No application was uninstalled.' }
& $adb -s $DeviceAddress shell am start -n com.nishi.stresslog.watchprobe.preview/com.nishi.stresslog.watchprobe.HomeActivity
if ($LASTEXITCODE -ne 0) { throw 'UI preview launch failed.' }
Write-Host 'UI preview opened as a separate app. It does not measure or send data. The verified measurement app is unchanged.'
