param([string]$LanAddress)
. "$PSScriptRoot\Environment.ps1"
$node = Assert-StressLogNode
$openssl = Get-StressLogOpenSsl
Initialize-StressLogDirectories
if (-not $LanAddress) {
    $routes = @(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -AddressFamily IPv4 | Sort-Object RouteMetric)
    foreach ($route in $routes) {
        $address = Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1
        if ($address) { $LanAddress = $address.IPAddress; break }
    }
}
$parsedAddress = $null
if (-not [System.Net.IPAddress]::TryParse($LanAddress, [ref]$parsedAddress) -or $parsedAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { throw 'LAN IPv4 required. Specify -LanAddress if necessary.' }
$cert = Join-Path $script:PrivateDir 'cert.pem'
$key = Join-Path $script:PrivateDir 'key.pem'
$tokenFile = Join-Path $script:PrivateDir 'token.txt'
$addressFile = Join-Path $script:PrivateDir 'address.txt'
if ((Test-Path -LiteralPath $cert) -or (Test-Path -LiteralPath $key)) {
    if (-not (Test-Path -LiteralPath $cert) -or -not (Test-Path -LiteralPath $key)) { throw 'Incomplete TLS configuration. See docs/SETUP.md before resetting it.' }
    & $openssl x509 -in $cert -noout -checkip $LanAddress | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'PC address changed. Follow certificate reset instructions in docs/SETUP.md, then reconfigure the watch.' }
    & $openssl x509 -in $cert -noout -checkend 0 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Local TLS certificate expired. Reset it following docs/SETUP.md.' }
} else {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 365 -keyout $key -out $cert -subj '/CN=StressLog local receiver' -addext "subjectAltName=IP:$LanAddress,IP:127.0.0.1,DNS:localhost" 2> (Join-Path $script:LogDir 'certificate-generation.log')
        $certificateExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    if ($certificateExit -ne 0) { throw 'Local TLS certificate generation failed.' }
}
if (-not (Test-Path -LiteralPath $tokenFile)) {
    $randomBytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($randomBytes) } finally { $rng.Dispose() }
    [System.IO.File]::WriteAllText($tokenFile, ([BitConverter]::ToString($randomBytes).Replace('-','').ToLowerInvariant()), $script:Utf8)
}
if ((Get-Content -LiteralPath $tokenFile -Raw).Trim() -notmatch '^[a-f0-9]{64}$') { throw 'Invalid local receiver token.' }
[System.IO.File]::WriteAllText($addressFile, $LanAddress, $script:Utf8)
Write-Host "Receiver configuration ready for https://${LanAddress}:8787. Secrets remain local."
