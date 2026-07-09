$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

Write-Output "=== tap Trend tab ==="
& $adb shell input tap 540 2350
Start-Sleep -Seconds 1
& $adb shell screencap -p /sdcard/trend.png
& $adb pull /sdcard/trend.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\trend.png"

Write-Output "=== tap Moments tab ==="
& $adb shell input tap 907 2350
Start-Sleep -Seconds 1
& $adb shell screencap -p /sdcard/moments.png
& $adb pull /sdcard/moments.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\moments.png"

Write-Output "=== process check ==="
& $adb shell pidof com.nishi.stresslog

Write-Output "=== crash check ==="
& $adb logcat -d -t 300 | Select-String -Pattern "FATAL|AndroidRuntime"
