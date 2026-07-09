$ErrorActionPreference = "Continue"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\akimi\Desktop\AndroidDev\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

Set-Location "C:\Users\akimi\Desktop\AndroidDev\projects\StressLog"

# local.properties で SDK 場所を明示
"sdk.dir=$($env:ANDROID_HOME -replace '\\','\\\\')" | Out-File -FilePath "local.properties" -Encoding ascii

Write-Output "=== gradlew assembleDebug ==="
& ".\gradlew.bat" assembleDebug --stacktrace
Write-Output "=== exit code: $LASTEXITCODE ==="
