$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

& $adb shell input tap 907 2232
Start-Sleep -Milliseconds 1000
& $adb shell screencap -p /sdcard/seeded_moments2.png
& $adb pull /sdcard/seeded_moments2.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\seeded_moments2.png"

Write-Output "=== crash check ==="
& $adb logcat -d -t 300 | Select-String -Pattern "FATAL|AndroidRuntime.*stresslog"
Write-Output "=== process check ==="
& $adb shell pidof com.nishi.stresslog
