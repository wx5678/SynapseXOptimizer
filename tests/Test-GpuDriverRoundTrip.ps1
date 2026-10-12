$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$testStateRoot = Join-Path $projectRoot 'state\test-gpu-driver-roundtrip'
$env:SYNAPSEX_STATE_ROOT = $testStateRoot
Import-Module (Join-Path $projectRoot 'host\modules\GpuDriverOptimizer.psm1') -Force

$executable = Join-Path $projectRoot 'release\SynapseX-Game-Optimizer-0.10.0.exe'
$before = Get-GpuDriverOptimizationCatalog $executable
$provider = @($before.providers | Where-Object vendor -eq 'nvidia' | Select-Object -First 1)
if ($provider.Count -eq 0) { Write-Output '{"skipped":true,"reason":"NVIDIA GPU not installed"}'; exit 0 }
if (-not [bool]$provider[0].available) { throw "NVIDIA NVAPI unavailable: $($provider[0].error)" }
if ([bool]$provider[0].applicationFound) { Write-Output '{"skipped":true,"reason":"test executable already owns an NVIDIA profile"}'; exit 0 }

$backupId = ''
try {
    $applied = Set-GpuDriverOptimizationProfile -ExecutablePath $executable -Provider 'nvidia' -ProfileId 'nvidia-stable'
    $backupId = [string]$applied.backupId
    $during = @($applied.catalog.providers | Where-Object vendor -eq 'nvidia')[0]
    if (-not [bool]$during.applicationFound) { throw 'Temporary NVIDIA profile was not created.' }
    $restored = Restore-GpuDriverOptimizationProfile -BackupId $backupId
    $after = @($restored.catalog.providers | Where-Object vendor -eq 'nvidia')[0]
    if ([bool]$after.applicationFound) { throw 'Temporary NVIDIA profile was not removed during restore.' }
    [ordered]@{ ok=$true; backupId=$backupId; changed=[int]$applied.changedCount; profileRemoved=$true } | ConvertTo-Json -Compress
} finally {
    if (-not [string]::IsNullOrWhiteSpace($backupId)) {
        $latest = Get-GpuDriverOptimizationCatalog $executable
        if ([bool](@($latest.providers | Where-Object vendor -eq 'nvidia')[0].applicationFound)) {
            Restore-GpuDriverOptimizationProfile -BackupId $backupId | Out-Null
        }
    }
    Remove-Module GpuDriverOptimizer -ErrorAction SilentlyContinue
    Remove-Item Env:SYNAPSEX_STATE_ROOT -ErrorAction SilentlyContinue
    if (([IO.Path]::GetFullPath($testStateRoot)).StartsWith(([IO.Path]::GetFullPath((Join-Path $projectRoot 'state')) + '\'), [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $testStateRoot)) {
        Remove-Item -LiteralPath $testStateRoot -Recurse -Force
    }
}
