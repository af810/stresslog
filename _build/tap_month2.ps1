$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

& $adb shell input tap 872 378
Start-Sleep -Milliseconds 800
& $adb shell screencap -p /sdcard/v2_month2.png
& $adb pull /sdcard/v2_month2.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\v2_month2.png"

Write-Output "=== crash check ==="
& $adb logcat -d -t 200 | Select-String -Pattern "FATAL|AndroidRuntime"
Write-Output "=== process check ==="
& $adb shell pidof com.nishi.stresslog
