$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

Write-Output "=== Records tab ==="
& $adb shell input tap 320 2232
Start-Sleep -Seconds 1
& $adb shell screencap -p /sdcard/v2_records.png
& $adb pull /sdcard/v2_records.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\v2_records.png"

Write-Output "=== Analysis tab ==="
& $adb shell input tap 540 2232
Start-Sleep -Seconds 1
& $adb shell screencap -p /sdcard/v2_analysis.png
& $adb pull /sdcard/v2_analysis.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\v2_analysis.png"

Write-Output "=== Advice tab ==="
& $adb shell input tap 760 2232
Start-Sleep -Seconds 1
& $adb shell screencap -p /sdcard/v2_advice.png
& $adb pull /sdcard/v2_advice.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\v2_advice.png"

Write-Output "=== Settings tab ==="
& $adb shell input tap 980 2232
Start-Sleep -Seconds 1
& $adb shell screencap -p /sdcard/v2_settings.png
& $adb pull /sdcard/v2_settings.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\v2_settings.png"

Write-Output "=== crash check ==="
& $adb logcat -d -t 300 | Select-String -Pattern "FATAL|AndroidRuntime"
Write-Output "=== process check ==="
& $adb shell pidof com.nishi.stresslog
