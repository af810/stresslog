$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

Write-Output "=== launch app ==="
& $adb shell am start -n com.nishi.stresslog/.MainActivity
Start-Sleep -Seconds 3

Write-Output "=== process check ==="
& $adb shell pidof com.nishi.stresslog

Write-Output "=== screenshot dashboard ==="
& $adb shell screencap -p /sdcard/seeded_dashboard.png
& $adb pull /sdcard/seeded_dashboard.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\seeded_dashboard.png"

Write-Output "=== tap Trend tab ==="
& $adb shell input tap 540 2232
Start-Sleep -Seconds 1
& $adb shell screencap -p /sdcard/seeded_trend_day.png
& $adb pull /sdcard/seeded_trend_day.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\seeded_trend_day.png"

Write-Output "=== crash check ==="
& $adb logcat -d -t 300 | Select-String -Pattern "FATAL|AndroidRuntime.*stresslog"
