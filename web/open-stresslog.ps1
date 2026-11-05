$ErrorActionPreference = 'Stop'

$webDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = 5173
$url = "http://localhost:$port"

function Test-PortOpen {
    param([int]$Port)
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return [bool]$conn
}

if (-not (Test-PortOpen -Port $port)) {
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c title StressLog Dev Server && cd /d `"$webDir`" && npm run dev" `
        -WindowStyle Minimized

    $elapsed = 0
    while (-not (Test-PortOpen -Port $port) -and $elapsed -lt 20) {
        Start-Sleep -Seconds 1
        $elapsed++
    }
}

Start-Process $url
