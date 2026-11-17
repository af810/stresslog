. "$PSScriptRoot\Environment.ps1"
$node = Assert-StressLogNode
& "$PSScriptRoot\Verify.ps1"
if ($LASTEXITCODE -ne 0) { throw 'Original verification failed.' }
$tests = @(Get-ChildItem -LiteralPath (Join-Path $script:ProjectRoot 'tools\experimental') -Filter '*.test.mjs' | ForEach-Object { $_.FullName })
& $node --test @tests
if ($LASTEXITCODE -ne 0) { throw 'Comparison receiver tests failed.' }
Push-Location (Join-Path $script:ProjectRoot 'web')
try {
    & $node node_modules/vite/bin/vite.js build --config vite.compare.config.ts
    if ($LASTEXITCODE -ne 0) { throw 'Comparison build failed.' }
} finally { Pop-Location }
Write-Host 'Original and comparison checks passed.'
