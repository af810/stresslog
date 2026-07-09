$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

& $adb shell uiautomator dump /sdcard/window_dump.xml
& $adb pull /sdcard/window_dump.xml "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\window_dump.xml"
