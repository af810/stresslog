$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

for ($i = 0; $i -lt 5; $i++) {
    & $adb shell input tap 540 1428
    Start-Sleep -Seconds 1
}

Start-Sleep -Seconds 1
& $adb shell screencap -p /sdcard/stresslog_after.png
& $adb pull /sdcard/stresslog_after.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\screen_after.png"

Write-Output "=== process check ==="
& $adb shell pidof com.nishi.stresslog
Write-Output "=== crash check ==="
& $adb logcat -d -t 200 | Select-String -Pattern "FATAL|AndroidRuntime"
