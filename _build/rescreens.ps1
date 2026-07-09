$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

Start-Sleep -Seconds 3
& $adb shell screencap -p /sdcard/v2_home2.png
& $adb pull /sdcard/v2_home2.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\v2_home2.png"

Write-Output "=== crash check ==="
& $adb logcat -d -t 200 | Select-String -Pattern "FATAL|AndroidRuntime"
Write-Output "=== process check ==="
& $adb shell pidof com.nishi.stresslog
