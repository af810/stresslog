$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

Write-Output "=== tap Week segment ==="
& $adb shell input tap 540 545
Start-Sleep -Milliseconds 800
& $adb shell screencap -p /sdcard/seeded_trend_week.png
& $adb pull /sdcard/seeded_trend_week.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\seeded_trend_week.png"

Write-Output "=== tap Month segment ==="
& $adb shell input tap 870 545
Start-Sleep -Milliseconds 800
& $adb shell screencap -p /sdcard/seeded_trend_month.png
& $adb pull /sdcard/seeded_trend_month.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\seeded_trend_month.png"

Write-Output "=== tap Moments tab ==="
& $adb shell input tap 907 2375
Start-Sleep -Milliseconds 1000
& $adb shell screencap -p /sdcard/seeded_moments.png
& $adb pull /sdcard/seeded_moments.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\seeded_moments.png"

Write-Output "=== crash check ==="
& $adb logcat -d -t 300 | Select-String -Pattern "FATAL|AndroidRuntime.*stresslog"
Write-Output "=== process check ==="
& $adb shell pidof com.nishi.stresslog
