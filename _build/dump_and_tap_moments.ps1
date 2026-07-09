$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

& $adb shell uiautomator dump /sdcard/dump2.xml
& $adb pull /sdcard/dump2.xml "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog\_build\dump2.xml"
