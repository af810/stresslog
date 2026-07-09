$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

Write-Output "Waiting for device..."
& $adb wait-for-device

Write-Output "Waiting for boot completion..."
for ($i = 0; $i -lt 90; $i++) {
    $b = (& $adb shell getprop sys.boot_completed 2>$null).Trim()
    if ($b -eq "1") { Write-Output "Boot completed after ~$($i*4)s"; break }
    Start-Sleep -Seconds 4
}

$apk = "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\app\build\outputs\apk\debug\app-debug.apk"
Write-Output "=== Installing APK ==="
& $adb install -r $apk

Write-Output "=== Launching app ==="
& $adb shell am start -n com.nishi.stresslog/.MainActivity

Start-Sleep -Seconds 3
Write-Output "=== Checking process ==="
& $adb shell pidof com.nishi.stresslog

Write-Output "=== Recent logcat (app only) ==="
& $adb logcat -d -t 200 | Select-String -Pattern "nishi.stresslog|AndroidRuntime|FATAL"

Write-Output "=== DONE ==="
