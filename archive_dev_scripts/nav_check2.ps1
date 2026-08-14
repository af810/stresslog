$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

Write-Output "=== tap Trend tab ==="
& $adb shell input tap 540 2375
Start-Sleep -Seconds 1
& $adb shell screencap -p /sdcard/trend2.png
& $adb pull /sdcard/trend2.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\trend2.png"

Write-Output "=== tap Moments tab ==="
& $adb shell input tap 907 2375
Start-Sleep -Seconds 1
& $adb shell screencap -p /sdcard/moments2.png
& $adb pull /sdcard/moments2.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\moments2.png"

Write-Output "=== process check ==="
& $adb shell pidof com.nishi.stresslog

Write-Output "=== crash check ==="
& $adb logcat -d -t 300 | Select-String -Pattern "FATAL|AndroidRuntime"
