$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
$apk = "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\app\build\outputs\apk\debug\app-debug.apk"

Write-Output "=== force-stop ==="
& $adb shell am force-stop com.nishi.stresslog

Write-Output "=== install ==="
& $adb install -r $apk

Write-Output "=== launch ==="
& $adb shell am start -n com.nishi.stresslog/.MainActivity
Start-Sleep -Seconds 3

Write-Output "=== process check ==="
& $adb shell pidof com.nishi.stresslog

Write-Output "=== screenshot home ==="
& $adb shell screencap -p /sdcard/v2_home.png
& $adb pull /sdcard/v2_home.png "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\v2_home.png"

Write-Output "=== crash check ==="
& $adb logcat -d -t 200 | Select-String -Pattern "FATAL|AndroidRuntime"
