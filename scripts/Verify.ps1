. "$PSScriptRoot\Environment.ps1"
$node = Assert-StressLogNode
$npm = Join-Path (Split-Path -Parent $node) 'npm.cmd'
Push-Location (Join-Path $script:ProjectRoot 'web')
try {
    & $npm test
    if ($LASTEXITCODE -ne 0) { throw 'Web tests failed.' }
    & $npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Web build failed.' }
} finally { Pop-Location }
$testFiles = @(Get-ChildItem -LiteralPath (Join-Path $script:ProjectRoot 'tools\live') -Filter '*.test.mjs' | ForEach-Object { $_.FullName })
$openssl = Get-StressLogOpenSsl
Initialize-StressLogDirectories
$testTls = Join-Path $script:RuntimeRoot 'test-tls'
New-Item -ItemType Directory -Force -Path $testTls | Out-Null
$previousPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    & $openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 2 -keyout (Join-Path $testTls 'key.pem') -out (Join-Path $testTls 'cert.pem') -subj '/CN=StressLog test only' -addext 'subjectAltName=IP:127.0.0.1,DNS:localhost' 2> (Join-Path $script:LogDir 'test-certificate.log')
    $certificateExit = $LASTEXITCODE
} finally { $ErrorActionPreference = $previousPreference }
if ($certificateExit -ne 0) { throw 'Test TLS certificate generation failed.' }
$previousTls = $env:STRESSLOG_TEST_TLS
try {
    $env:STRESSLOG_TEST_TLS = $testTls
    & $node --test @testFiles
    if ($LASTEXITCODE -ne 0) { throw 'Receiver tests failed.' }
} finally { $env:STRESSLOG_TEST_TLS = $previousTls }
$apk = Join-Path $script:ProjectRoot 'releases\watch\stresslog-watch-v0.5.2.apk'
if ((Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash -ne '710e392a7cd2c22ccc1e6b4b3d79026c5dc871b6e8c4dab15ea512cb6ef06f00') { throw 'Verified watch APK checksum mismatch.' }
Write-Host 'Web tests, build, receiver tests and verified watch APK checksum passed.'
