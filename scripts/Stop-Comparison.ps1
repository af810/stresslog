. "$PSScriptRoot\Environment.ps1"
foreach ($item in @(@{Name='comparison-web';Marker='web\vite.compare.config.ts'},@{Name='comparison-api';Marker='tools\experimental\server.mjs'})) {
    $pidFile = Join-Path $script:RuntimeRoot ($item.Name + '.pid')
    if (-not (Test-Path -LiteralPath $pidFile)) { continue }
    $savedId = [int](Get-Content -LiteralPath $pidFile -Raw)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $savedId"
    $expected = Join-Path $script:ProjectRoot $item.Marker
    if ($process) {
        if ($process.Name -ne 'node.exe' -or -not $process.CommandLine.Contains($expected)) { throw 'Saved process belongs to another application; left running.' }
        Stop-Process -Id $savedId
    }
    Remove-Item -LiteralPath $pidFile
}
Write-Host 'Comparison stopped. The original app, receiver and watch are unchanged.'
