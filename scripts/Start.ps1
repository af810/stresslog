param([string]$LanAddress, [switch]$NoBrowser)
& "$PSScriptRoot\Initialize-Receiver.ps1" -LanAddress $LanAddress
. "$PSScriptRoot\Environment.ps1"
$node = Assert-StressLogNode
$bridgeScript = Join-Path $script:ProjectRoot 'tools\live\bridge.mjs'
$viteScript = Join-Path $script:ProjectRoot 'web\node_modules\vite\bin\vite.js'
if (-not (Test-Path -LiteralPath $viteScript)) { throw 'Run scripts\Setup.ps1 first.' }
function Start-StressLogProcess([string]$ScriptPath, [string[]]$ExtraArguments, [string]$Name, [string]$HealthUrl, [string]$ExpectedText) {
    $existing = $null
    try { $existing = Invoke-WebRequest $HealthUrl -UseBasicParsing -TimeoutSec 2 } catch {}
    $pidFile = Join-Path $script:RuntimeRoot "$Name.pid"
    if ($existing) {
        $owned = $false
        if (Test-Path -LiteralPath $pidFile) {
            $savedId = [int](Get-Content -LiteralPath $pidFile -Raw)
            $savedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $savedId"
            $owned = $savedProcess -and $savedProcess.Name -eq 'node.exe' -and $savedProcess.CommandLine.Contains($ScriptPath)
        }
        if (-not $owned -or $existing.Content -notmatch $ExpectedText) { throw "$HealthUrl is already used by another launcher or application. Stop that instance first." }
        return
    }
    $arguments = @(('"{0}"' -f $ScriptPath)) + $ExtraArguments
    $started = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory (Join-Path $script:ProjectRoot 'web') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $script:LogDir "$Name.log") -RedirectStandardError (Join-Path $script:LogDir "$Name-error.log")
    [System.IO.File]::WriteAllText($pidFile, [string]$started.Id, $script:Utf8)
    for ($attempt=0; $attempt -lt 30; $attempt++) {
        $started.Refresh()
        if ($started.HasExited) { throw "$Name exited. Check .stresslog-local/logs/$Name-error.log." }
        try {
            $response = Invoke-WebRequest $HealthUrl -UseBasicParsing -TimeoutSec 1
            if ($response.Content -match $ExpectedText) { return }
        } catch {}
        Start-Sleep -Seconds 1
    }
    throw "$Name did not become ready. Check .stresslog-local/logs."
}
Start-StressLogProcess -ScriptPath $bridgeScript -ExtraArguments @(('"{0}"' -f $script:PrivateDir)) -Name 'receiver' -HealthUrl 'http://127.0.0.1:8788/status' -ExpectedText 'stresslog-live-v1'
Start-StressLogProcess -ScriptPath $viteScript -ExtraArguments @('--host','localhost','--port','5173','--strictPort') -Name 'web' -HealthUrl 'http://localhost:5173/' -ExpectedText '<title>StressLog</title>'
$url = 'http://localhost:5173/?tab=live'
Write-Host "StressLog: $url"
if (-not $NoBrowser) { Start-Process $url }
