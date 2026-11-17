param([switch]$NoBrowser)
. "$PSScriptRoot\Environment.ps1"
# Reuse the existing paired receiver. This does not start or modify watch measurement.
& "$PSScriptRoot\Start.ps1" -NoBrowser
$node = Assert-StressLogNode
$comparisonRoot = Join-Path $script:RuntimeRoot 'comparison'
New-Item -ItemType Directory -Force -Path $comparisonRoot | Out-Null
function Start-ComparisonProcess([string]$ScriptPath,[string[]]$ExtraArguments,[string]$Name,[string]$HealthUrl,[string]$ExpectedText,[string]$OwnerMarker) {
    $pidFile = Join-Path $script:RuntimeRoot "$Name.pid"
    $existing = $null
    try { $existing = Invoke-WebRequest $HealthUrl -UseBasicParsing -TimeoutSec 2 } catch {}
    if ($existing) {
        if (-not (Test-Path -LiteralPath $pidFile)) { throw 'Comparison port is used by another application.' }
        $savedId = [int](Get-Content -LiteralPath $pidFile -Raw)
        $process = Get-CimInstance Win32_Process -Filter "ProcessId = $savedId"
        if (-not $process -or $process.Name -ne 'node.exe' -or -not $process.CommandLine.Contains($OwnerMarker) -or $existing.Content -notmatch $ExpectedText) { throw 'Comparison process ownership could not be confirmed.' }
        return
    }
    $arguments = @(('"{0}"' -f $ScriptPath)) + $ExtraArguments
    $process = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory (Join-Path $script:ProjectRoot 'web') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $script:LogDir "$Name.log") -RedirectStandardError (Join-Path $script:LogDir "$Name-error.log")
    [System.IO.File]::WriteAllText($pidFile,[string]$process.Id,$script:Utf8)
    for ($attempt=0; $attempt -lt 25; $attempt++) {
        $process.Refresh()
        if ($process.HasExited) { throw "$Name exited. Check comparison logs." }
        try { if ((Invoke-WebRequest $HealthUrl -UseBasicParsing -TimeoutSec 1).Content -match $ExpectedText) { return } } catch {}
        Start-Sleep -Seconds 1
    }
    throw "$Name did not become ready. Check comparison logs."
}
$service = Join-Path $script:ProjectRoot 'tools\experimental\server.mjs'
$vite = Join-Path $script:ProjectRoot 'web\node_modules\vite\bin\vite.js'
$config = Join-Path $script:ProjectRoot 'web\vite.compare.config.ts'
Start-ComparisonProcess -ScriptPath $service -ExtraArguments @(('"{0}"' -f $comparisonRoot)) -Name 'comparison-api' -HealthUrl 'http://127.0.0.1:8786/snapshot' -ExpectedText 'stresslog-comparison-v1' -OwnerMarker $service
Start-ComparisonProcess -ScriptPath $vite -ExtraArguments @('--config',('"{0}"' -f $config)) -Name 'comparison-web' -HealthUrl 'http://localhost:5174/compare.html' -ExpectedText 'StressLog' -OwnerMarker $config
$url = 'http://localhost:5174/compare.html'
Write-Host "StressLog comparison: $url"
if (-not $NoBrowser) { Start-Process $url }
