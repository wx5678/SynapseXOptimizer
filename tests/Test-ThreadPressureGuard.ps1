$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$diagnostics = [IO.File]::ReadAllText((Join-Path $projectRoot 'host\modules\Diagnostics.psm1'), [Text.Encoding]::UTF8)
$workspace = [IO.File]::ReadAllText((Join-Path $projectRoot 'src\components\OptimizerWorkspace.tsx'), [Text.Encoding]::UTF8)
$types = [IO.File]::ReadAllText((Join-Path $projectRoot 'src\lib\api.ts'), [Text.Encoding]::UTF8)

$checks = [ordered]@{
    processThreadConsistency = $diagnostics.Contains('$threadCpuAccountedPercent')
    invalidClassification = $diagnostics.Contains("'thread-sample-invalid'")
    validityField = $diagnostics.Contains('measurementValid = $measurementValid')
    guardedUi = $workspace.Contains('threadPressure.measurementValid')
    coverageUi = $workspace.Contains('threadPressure.threadCpuAccountedPercent')
    typedContract = $types.Contains('measurementValid: boolean')
}

$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($failed.Count) { throw "Thread pressure guard checks failed: $($failed -join ', ')" }

[ordered]@{ ok=$true; checks=$checks.Count } | ConvertTo-Json -Compress
