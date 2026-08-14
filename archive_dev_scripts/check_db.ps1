$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"

& $adb shell "run-as com.nishi.stresslog sh -c `"sqlite3 /data/data/com.nishi.stresslog/databases/stresslog.db 'SELECT id,timestamp,stressScore FROM stress_readings;'`""
