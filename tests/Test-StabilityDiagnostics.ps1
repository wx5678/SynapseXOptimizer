$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$modulePath = Join-Path $projectRoot 'host\modules\StabilityDiagnostics.psm1'
$testId = [guid]::NewGuid().ToString('N')
$testState = Join-Path $env:TEMP ("SynapseX-Stability-Test-$testId")
$testRegistry = "HKCU:\Software\SynapseX\Tests\GpuPreference-$testId"
$env:SYNAPSEX_STATE_ROOT = $testState
$env:SYNAPSEX_GPU_PREFERENCE_REGISTRY = $testRegistry

try {
    Import-Module $modulePath -Force
    $readiness = Get-SystemGameReadiness
    $contention = Measure-SystemContention -Seconds 2
    $adapterHealth = Get-NetworkAdapterHealth
    $stability = Measure-NetworkStability -Target '127.0.0.1' -Count 5
    $trace = Trace-NetworkPath -Target '127.0.0.1'

    if ($readiness.memory.totalGB -le 0) { throw 'System readiness memory data is invalid.' }
    if ($null -eq $readiness.trim.enabled) { throw 'TRIM state is missing.' }
    if ($contention.durationSeconds -lt 2) { throw 'Contention sample is too short.' }
    if ($null -eq $adapterHealth.items) { throw 'Network adapter health items are missing.' }
    if ($stability.received -ne 5 -or $stability.lossPercent -ne 0) { throw 'Loopback stability test failed.' }
    if (@($trace.raw).Count -eq 0) { throw 'Network trace output is missing.' }

    $executable = (Get-Process -Id $PID).Path
    $before = Get-GameGpuPreference -ExecutablePath $executable
    $applied = Set-GameHighPerformanceGpu -ExecutablePath $executable
    if (-not $applied.state.applied) { throw 'High-performance GPU preference was not applied.' }
    $restored = Restore-GameGpuPreference -BackupId $applied.backupId
    if ($restored.state.currentValue -cne $before.currentValue) { throw 'GPU preference did not round-trip to the original value.' }

    [ordered]@{
        ok = $true
        diskCount = @($readiness.disks).Count
        pageFileCount = @($readiness.memory.pageFiles).Count
        contentionClass = $contention.classification
        adapterCount = @($adapterHealth.items).Count
        stabilityClass = $stability.classification
        traceLines = @($trace.raw).Count
        gpuPreferenceRoundTrip = $true
    } | ConvertTo-Json -Compress
} finally {
    Remove-Module StabilityDiagnostics -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $testRegistry -Recurse -Force -ErrorAction SilentlyContinue
    if ((Test-Path -LiteralPath $testState) -and ([IO.Path]::GetFullPath($testState)).StartsWith([IO.Path]::GetFullPath($env:TEMP), [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $testState -Recurse -Force -ErrorAction SilentlyContinue
    }
    Remove-Item Env:SYNAPSEX_STATE_ROOT -ErrorAction SilentlyContinue
    Remove-Item Env:SYNAPSEX_GPU_PREFERENCE_REGISTRY -ErrorAction SilentlyContinue
}
