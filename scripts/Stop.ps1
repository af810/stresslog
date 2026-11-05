. "$PSScriptRoot\Environment.ps1"
foreach ($item in @(@{Name='web';Script='web\node_modules\vite\bin\vite.js'}, @{Name='receiver';Script='tools\live\bridge.mjs'})) {
    $pidFile = Join-Path $script:RuntimeRoot ($item.Name + '.pid')
    if (-not (Test-Path -LiteralPath $pidFile)) { continue }
    $savedId = [int](Get-Content -LiteralPath $pidFile -Raw)
    $savedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $savedId"
    $expected = Join-Path $script:ProjectRoot $item.Script
    if ($savedProcess) {
        if ($savedProcess.Name -ne 'node.exe' -or -not $savedProcess.CommandLine.Contains($expected)) { throw 'Saved process belongs to another application; left running.' }
        Stop-Process -Id $savedId
    }
    Remove-Item -LiteralPath $pidFile
}
Write-Host 'PC processes stopped. Stop measurement on the watch separately.'
