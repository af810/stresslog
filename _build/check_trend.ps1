$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

& $adb shell input tap 540 2232
Start-Sleep -Seconds 2
& $adb shell uiautomator dump /sdcard/trend_dump.xml
& $adb pull /sdcard/trend_dump.xml "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\trend_dump.xml"

Write-Output "=== process check ==="
& $adb shell pidof com.nishi.stresslog
Write-Output "=== crash check ==="
& $adb logcat -d -t 300 | Select-String -Pattern "FATAL|AndroidRuntime"
