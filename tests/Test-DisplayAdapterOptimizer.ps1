$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$modulePath = Join-Path $projectRoot 'host\modules\DisplayAdapterOptimizer.psm1'
$testRoot = Join-Path $projectRoot 'state\test-display-adapter-optimizer'
[void](New-Item -ItemType Directory -Path $testRoot -Force)

function Invoke-DisplayAdapterRoundTrip([string]$CpuName, [string]$IntegratedName, [string]$IntegratedId, [string]$DiscreteName, [string]$DiscreteId) {
    $inventoryPath = Join-Path $testRoot (([guid]::NewGuid().ToString('N')) + '.json')
    $stateRoot = Join-Path $testRoot ([guid]::NewGuid().ToString('N'))
    $inventory = [ordered]@{
        cpuName = $CpuName
        isPortable = $false
        systemModel = 'SynapseX test desktop'
        activeDisplays = @([ordered]@{ deviceId = ($DiscreteId -replace '\\4&TEST$',''); deviceName = '\\.\DISPLAY1'; primary = $true })
        adapters = @(
            [ordered]@{ name = $IntegratedName; instanceId = $IntegratedId; status = 'OK'; problemCode = 0 },
            [ordered]@{ name = $DiscreteName; instanceId = $DiscreteId; status = 'OK'; problemCode = 0 }
        )
    }
    [IO.File]::WriteAllText($inventoryPath, ($inventory | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
    $env:SYNAPSEX_DISPLAY_ADAPTER_TEST_INVENTORY = $inventoryPath
    $env:SYNAPSEX_STATE_ROOT = $stateRoot
    Remove-Module DisplayAdapterOptimizer -ErrorAction SilentlyContinue
    Import-Module $modulePath -Force

    $before = Get-DisplayAdapterCatalog
    if (-not $before.canDisableIntegratedGpu) { throw "$IntegratedName should be eligible in the simulated desktop." }
    $applied = Disable-EligibleIntegratedGpu
    $disabled = $applied.catalog.adapters | Where-Object instanceId -eq $IntegratedId
    if ($disabled.enabled -or [int]$disabled.problemCode -ne 22) { throw "$IntegratedName was not disabled in simulation." }
    $restored = Restore-IntegratedGpu -BackupId $applied.backupId
    $enabled = $restored.catalog.adapters | Where-Object instanceId -eq $IntegratedId
    if (-not $enabled.enabled -or [int]$enabled.problemCode -ne 0) { throw "$IntegratedName was not restored in simulation." }
    [ordered]@{ cpu = $CpuName; integrated = $IntegratedName; backupId = $applied.backupId; roundTrip = $true }
}

try {
    $intel = Invoke-DisplayAdapterRoundTrip '13th Gen Intel(R) Core(TM) i7-13700K' 'Intel(R) UHD Graphics 770' 'PCI\VEN_8086&DEV_A780&SUBSYS_TEST\3&TEST' 'NVIDIA GeForce RTX 4080' 'PCI\VEN_10DE&DEV_2704&SUBSYS_TEST\4&TEST'
    $amd = Invoke-DisplayAdapterRoundTrip 'AMD Ryzen 7 8700G w/ Radeon 780M Graphics' 'AMD Radeon(TM) Graphics' 'PCI\VEN_1002&DEV_15BF&SUBSYS_TEST\3&TEST' 'AMD Radeon RX 7900 XTX' 'PCI\VEN_1002&DEV_744C&SUBSYS_TEST\4&TEST'
    [ordered]@{ ok = $true; intel = $intel; amd = $amd } | ConvertTo-Json -Depth 6
} finally {
    Remove-Module DisplayAdapterOptimizer -ErrorAction SilentlyContinue
    Remove-Item Env:SYNAPSEX_DISPLAY_ADAPTER_TEST_INVENTORY -ErrorAction SilentlyContinue
    Remove-Item Env:SYNAPSEX_STATE_ROOT -ErrorAction SilentlyContinue
}
