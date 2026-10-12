$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$modulePath = Join-Path $projectRoot 'host\modules\GpuDriverOptimizer.psm1'
$testExecutable = Join-Path $env:SystemRoot 'System32\notepad.exe'

Import-Module $modulePath -Force
$catalog = Get-GpuDriverOptimizationCatalog -ExecutablePath $testExecutable

if ([string]::IsNullOrWhiteSpace([string]$catalog.executablePath)) { throw 'GPU driver catalog did not return the target executable.' }
foreach ($provider in @($catalog.providers)) {
    if ([string]$provider.vendor -notin @('nvidia','amd')) { throw "Unexpected GPU provider: $($provider.vendor)" }
    if (@($provider.profiles).Count -lt 1) { throw "Provider has no executable profiles: $($provider.vendor)" }
    foreach ($profile in @($provider.profiles)) {
        if (@($profile.targets).Count -lt 1) { throw "GPU profile has no targets: $($profile.id)" }
        foreach ($target in @($profile.targets)) {
            if (@($provider.items | Where-Object key -eq $target.key).Count -ne 1) { throw "Profile target has no catalog item: $($target.key)" }
        }
    }
}

$nvidia = @($catalog.providers | Where-Object vendor -eq 'nvidia' | Select-Object -First 1)
if ($nvidia.Count) {
    if (-not [bool]$nvidia[0].available) { throw "NVIDIA was detected but NVAPI read failed: $($nvidia[0].error)" }
    if (@($nvidia[0].items | Where-Object supported).Count -lt 3) { throw 'NVIDIA driver did not expose the required DRS settings.' }
}

Write-Output ([ordered]@{ ok=$true; devices=@($catalog.devices).Count; providers=@($catalog.providers).Count; note='read-only; no driver values were changed' } | ConvertTo-Json -Compress)
