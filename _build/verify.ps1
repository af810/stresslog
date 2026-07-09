$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

Start-Sleep -Seconds 5
Write-Output "=== process check after 5s more ==="
& $adb shell pidof com.nishi.stresslog

Write-Output "=== full recent logcat (crash check) ==="
& $adb logcat -d -t 300 | Select-String -Pattern "FATAL|AndroidRuntime|nishi.stresslog|ActivityTaskManager: START"

Write-Output "=== screenshot ==="
& $adb shell screencap -p /sdcard/stresslog_screen.png
& $adb pull /sdcard/stresslog_screen.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\screen.png"
