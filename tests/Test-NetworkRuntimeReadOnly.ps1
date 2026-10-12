$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$env:SYNAPSEX_STATE_ROOT = Join-Path $env:TEMP ('SynapseX-Toolkit-Test-' + [guid]::NewGuid().ToString('N'))

try {
    Import-Module (Join-Path $root 'host\modules\NetworkToolkit.psm1') -Force
    Import-Module (Join-Path $root 'host\modules\RuntimeOptimizer.psm1') -Force
    Import-Module (Join-Path $root 'host\modules\Diagnostics.psm1') -Force
    Import-Module (Join-Path $root 'host\modules\OperationLog.psm1') -Force

    $network = Get-NetworkToolkitSnapshot
    if ($null -eq $network.adapters -or @($network.dnsPresets).Count -lt 5) { throw 'Network toolkit schema is invalid.' }
    if ($null -eq $network.tcp.raw -or $null -eq $network.qos.items) { throw 'TCP or QoS audit schema is invalid.' }
    if ($null -eq $network.acceleratorCompatibility -or $null -eq $network.recommendedPhysicalAdapter) { throw 'Accelerator compatibility schema is invalid.' }
    $targets = Get-NetworkProbeTargets
    if (@($targets.items).Count -lt 4 -or @($targets.items | Where-Object kind -eq 'public').Count -lt 4) { throw 'Network probe target catalog is incomplete.' }
    $cachePath = Join-Path $env:SYNAPSEX_STATE_ROOT 'game-endpoints.json'
    [void](New-Item -ItemType Directory -Path $env:SYNAPSEX_STATE_ROOT -Force)
    $cacheFixture = [ordered]@{ schemaVersion=1; updatedAt=(Get-Date).ToUniversalTime().ToString('o'); items=@([ordered]@{ address='203.0.113.45'; ports=@(443,30001); firstSeen=(Get-Date).AddMinutes(-5).ToUniversalTime().ToString('o'); lastSeen=(Get-Date).ToUniversalTime().ToString('o'); seenCount=3; acceleratorDetected=$false }) }
    [IO.File]::WriteAllText($cachePath, ($cacheFixture | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
    $cachedTargets = Get-NetworkProbeTargets
    if (@($cachedTargets.items | Where-Object { $_.kind -eq 'jiuyin-recent' -and $_.target -eq '203.0.113.45' }).Count -ne 1 -or $cachedTargets.cachedConnectionCount -lt 1) { throw 'Cached game endpoint was not returned.' }
    if (@($network.tcp.optimization.profiles).Count -ne 3 -or @($network.tcp.optimization.items).Count -lt 10) { throw 'Executable TCP optimization catalog is incomplete.' }
    $gameProfile = @($network.tcp.optimization.profiles | Where-Object id -eq 'game-latency')
    if ($gameProfile.Count -ne 1 -or @($gameProfile[0].itemIds).Count -lt 8) { throw 'Game TCP profile is incomplete.' }
    if ([string]::IsNullOrWhiteSpace([string]$network.hosts.path)) { throw 'Hosts audit schema is invalid.' }
    $defaultAdapter = @($network.adapters | Where-Object { $_.isDefaultRoute }) | Select-Object -First 1
    if ($null -eq $defaultAdapter) { throw 'Default-route adapter was not identified.' }
    $nic = Get-NicAdvancedAudit -InterfaceAlias ([string]$defaultAdapter.name)
    if (@($nic.properties).Count -lt 1) { throw 'NIC advanced-property audit returned no entries.' }

    $runtime = Get-GameRuntimeSnapshot
    if ($null -eq $runtime.power.items -or @($runtime.power.items).Count -lt 1) { throw 'Power scheme catalog is empty.' }
    if ($null -eq $runtime.power.cpuRecommendation -or $null -eq $runtime.power.cpuRecommendation.profiles) { throw 'CPU power recommendation schema is invalid.' }
    if ([string]::IsNullOrWhiteSpace([string]$runtime.guidance.affinity)) { throw 'Runtime guidance is missing.' }

    $amdProfile = Get-CpuPowerRecommendation -CpuName 'AMD Ryzen 7 9800X3D 8-Core Processor' -Manufacturer 'AuthenticAMD' -PhysicalCores 8 -LogicalProcessors 16 -Topology ([pscustomobject]@{ available=$true; classes=@(0); cacheDomains=1; logicalProcessors=16 })
    if ($amdProfile.architecture -ne 'amd-homogeneous' -or @($amdProfile.settings | Where-Object key -match 'scheduling-policy').Count -ne 0) { throw 'AMD CPU power classification failed.' }
    if (@($amdProfile.profiles).Count -ne 2 -or $amdProfile.profileId -ne 'amd-single-balanced-v2') { throw 'AMD topology power profile catalog is invalid.' }
    foreach ($profile in @($amdProfile.profiles)) {
        $expectedCount = if ($profile.recommended) { 4 } else { 9 }
        if (@($profile.settings).Count -ne $expectedCount) { throw "AMD profile setting count is invalid: $($profile.id)" }
        if (@($profile.settings | Where-Object key -eq 'idle-disabled' | Where-Object acValue -ne 0).Count -ne 0) { throw "AMD profile disables processor idle: $($profile.id)" }
        if (@($profile.settings | Where-Object key -eq 'autonomous-mode' | Where-Object acValue -ne 1).Count -ne 0) { throw "AMD profile disables CPPC autonomous mode: $($profile.id)" }
    }
    $intelHybridProfile = Get-CpuPowerRecommendation -CpuName '13th Gen Intel(R) Core(TM) i9-13900K' -Manufacturer 'GenuineIntel' -PhysicalCores 24 -LogicalProcessors 32 -Topology ([pscustomobject]@{ available=$true; classes=@(0,1); cacheDomains=1; logicalProcessors=32 })
    if ($intelHybridProfile.architecture -ne 'intel-hybrid') { throw 'Intel hybrid CPU classification failed.' }
    $intelScheduling = @($intelHybridProfile.settings | Where-Object key -match 'scheduling-policy')
    if ($intelScheduling.Count -ne 0) { throw 'Intel hybrid scheduling must remain platform controlled.' }
    $intelLegacyProfile = Get-CpuPowerRecommendation -CpuName 'Intel(R) Core(TM) i9-10900K CPU' -Manufacturer 'GenuineIntel' -PhysicalCores 10 -LogicalProcessors 20 -Topology ([pscustomobject]@{ available=$true; classes=@(0); cacheDomains=1; logicalProcessors=20 })
    if ($intelLegacyProfile.architecture -ne 'intel-homogeneous' -or @($intelLegacyProfile.settings | Where-Object key -match 'scheduling-policy').Count -ne 0) { throw 'Intel homogeneous CPU classification failed.' }

    $diagnostic = Get-SynapseXDiagnosticSnapshot -GameRoot ''
    if ($diagnostic.cpu.physicalCores -lt 1 -or $diagnostic.appx.count -lt 1) { throw 'Diagnostic snapshot schema is invalid.' }

    $dnsGuard = $false
    try { Test-DnsResolvers -Attempts 0 | Out-Null } catch { $dnsGuard = $true }
    if (-not $dnsGuard) { throw 'DNS benchmark attempt guard failed.' }

    $powerGuard = $false
    try { Set-SynapseXPowerScheme -Guid 'not-a-guid' | Out-Null } catch { $powerGuard = $true }
    if (-not $powerGuard) { throw 'Power scheme GUID guard failed.' }

    $mtuGuard = $false
    try { Set-SynapseXInterfaceMtu -InterfaceAlias 'invalid-adapter' -Mtu 500 | Out-Null } catch { $mtuGuard = $true }
    if (-not $mtuGuard) { throw 'MTU safety guard failed.' }

    $tcpProfileGuard = $false
    try { Set-TcpOptimizationProfile -InterfaceAlias ([string]$defaultAdapter.name) -ProfileId 'invalid-profile' | Out-Null } catch { $tcpProfileGuard = $true }
    if (-not $tcpProfileGuard) { throw 'TCP profile identifier guard failed.' }

    $qosGuard = $false
    try { Set-SynapseXGameQos -ExecutablePath 'fxgame.exe' -Dscp 64 | Out-Null } catch { $qosGuard = $true }
    if (-not $qosGuard) { throw 'QoS DSCP range guard failed.' }

    [void](Write-SynapseXOperation -Category 'test' -Action 'round-trip' -BackupId 'test-backup')
    $logs = @(Get-SynapseXOperationLog)
    if ($logs.Count -ne 1 -or $logs[0].backupId -ne 'test-backup') { throw 'Operation log round-trip failed.' }

    [pscustomobject]@{
        ok = $true
        adapters = @($network.adapters).Count
        dnsPresets = @($network.dnsPresets).Count
        qosPolicies = $network.qos.totalCount
        tcpProfiles = @($network.tcp.optimization.profiles).Count
        tcpItems = @($network.tcp.optimization.items).Count
        nicProperties = @($nic.properties).Count
        powerSchemes = @($runtime.power.items).Count
        cpuPowerArchitecture = [string]$runtime.power.cpuRecommendation.architecture
        cpuPowerSettings = @($runtime.power.cpuRecommendation.settings).Count
        cpuProfileClassification = $true
        scheduledTasks = $diagnostic.scheduledTasks.count
        appxPackages = $diagnostic.appx.count
        dnsGuard = $dnsGuard
        powerGuard = $powerGuard
        mtuGuard = $mtuGuard
        tcpProfileGuard = $tcpProfileGuard
        qosGuard = $qosGuard
        operationLogRoundTrip = $true
        probeTargets = @($targets.items).Count
        cachedProbeTarget = $true
        acceleratorDetection = [bool]$network.acceleratorCompatibility.detected
    } | ConvertTo-Json -Compress
}
finally {
    Remove-Module NetworkToolkit, RuntimeOptimizer, Diagnostics, OperationLog -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $env:SYNAPSEX_STATE_ROOT) { Remove-Item -LiteralPath $env:SYNAPSEX_STATE_ROOT -Recurse -Force }
    Remove-Item Env:SYNAPSEX_STATE_ROOT -ErrorAction SilentlyContinue
}
