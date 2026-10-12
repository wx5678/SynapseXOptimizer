$ErrorActionPreference = 'Stop'

$script:stateBase = if ([string]::IsNullOrWhiteSpace($env:SYNAPSEX_STATE_ROOT)) { Join-Path $env:LOCALAPPDATA 'SynapseX\state' } else { [string]$env:SYNAPSEX_STATE_ROOT }
$script:backupRoot = Join-Path $script:stateBase 'display-adapter-backups'
$script:testInventoryPath = [string]$env:SYNAPSEX_DISPLAY_ADAPTER_TEST_INVENTORY

function Initialize-DisplayDeviceApi {
    if ('SynapseX.Native.DisplayDeviceReader' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace SynapseX.Native {
    public sealed class ActiveDisplayDevice {
        public string DeviceName { get; set; }
        public string DeviceId { get; set; }
        public bool Primary { get; set; }
    }

    public static class DisplayDeviceReader {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct DISPLAY_DEVICE {
            public int cb;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
            public int StateFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
        }

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern bool EnumDisplayDevices(string lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);

        public static ActiveDisplayDevice[] Read() {
            const int AttachedToDesktop = 0x1;
            const int PrimaryDevice = 0x4;
            var result = new List<ActiveDisplayDevice>();
            for (uint index = 0; index < 32; index++) {
                var value = new DISPLAY_DEVICE();
                value.cb = Marshal.SizeOf(value);
                if (!EnumDisplayDevices(null, index, ref value, 0)) break;
                if ((value.StateFlags & AttachedToDesktop) == 0) continue;
                result.Add(new ActiveDisplayDevice {
                    DeviceName = value.DeviceName ?? "",
                    DeviceId = value.DeviceID ?? "",
                    Primary = (value.StateFlags & PrimaryDevice) != 0
                });
            }
            return result.ToArray();
        }
    }
}
'@
}

function Get-DisplayAdapterVendor([string]$Name, [string]$InstanceId) {
    if ($InstanceId -match '(?i)VEN_8086' -or $Name -match '(?i)Intel') { return 'intel' }
    if ($InstanceId -match '(?i)VEN_1002' -or $Name -match '(?i)(AMD|Radeon)') { return 'amd' }
    if ($InstanceId -match '(?i)VEN_10DE' -or $Name -match '(?i)NVIDIA') { return 'nvidia' }
    'unknown'
}

function Get-DisplayAdapterKind([string]$Name, [string]$Vendor, [string]$CpuName) {
    if ($Name -match '(?i)(Microsoft Basic|Remote Display|Virtual Display|Parsec|DisplayLink|Indirect Display|Dummy|OrayIdd|GameViewer)') { return 'virtual' }
    if ($Vendor -eq 'nvidia') { return 'discrete' }
    if ($Vendor -eq 'intel') {
        if ($Name -match '(?i)\bArc\b') { return 'discrete' }
        if ($CpuName -match '(?i)Intel' -and $Name -match '(?i)(HD Graphics|UHD Graphics|Iris|Intel\(R\).*Graphics|Intel.*Graphics)') { return 'integrated' }
    }
    if ($Vendor -eq 'amd') {
        if ($Name -match '(?i)(Radeon\s+RX|Radeon\s+PRO|FirePro)') { return 'discrete' }
        if ($CpuName -match '(?i)(AMD|Ryzen)' -and $Name -match '(?i)(Radeon\(TM\) Graphics|AMD Radeon Graphics|Radeon Graphics|Vega\s*\d+\s*Graphics|Radeon\s+(610M|660M|680M|740M|760M|780M|820M|860M|880M))') { return 'integrated' }
    }
    'unknown'
}

function Get-ComputerPortableState {
    $system = Get-CimInstance Win32_ComputerSystem | Select-Object -First 1
    $enclosure = Get-CimInstance Win32_SystemEnclosure | Select-Object -First 1
    $portableChassis = @(8, 9, 10, 11, 12, 14, 18, 21, 30, 31, 32)
    $chassisTypes = @($enclosure.ChassisTypes | ForEach-Object { [int]$_ })
    [ordered]@{
        isPortable = ([int]$system.PCSystemType -in @(2, 8)) -or (@($chassisTypes | Where-Object { $_ -in $portableChassis }).Count -gt 0)
        model = ([string]$system.Manufacturer + ' ' + [string]$system.Model).Trim()
    }
}

function Get-TestDisplayInventory {
    if ([string]::IsNullOrWhiteSpace($script:testInventoryPath) -or -not (Test-Path -LiteralPath $script:testInventoryPath -PathType Leaf)) { return $null }
    Get-Content -LiteralPath $script:testInventoryPath -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Save-TestDisplayInventory($Inventory) {
    [IO.File]::WriteAllText($script:testInventoryPath, ($Inventory | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
}

function Get-RawDisplayAdapterInventory {
    $test = Get-TestDisplayInventory
    if ($null -ne $test) {
        return [ordered]@{
            cpuName = [string]$test.cpuName
            isPortable = [bool]$test.isPortable
            systemModel = [string]$test.systemModel
            activeDisplays = @($test.activeDisplays)
            adapters = @($test.adapters)
            testMode = $true
        }
    }

    Initialize-DisplayDeviceApi
    $cpuName = [string](Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name)
    $portable = Get-ComputerPortableState
    $activeDisplays = @([SynapseX.Native.DisplayDeviceReader]::Read() | ForEach-Object {
        [ordered]@{ deviceId = [string]$_.DeviceId; deviceName = [string]$_.DeviceName; primary = [bool]$_.Primary }
    })
    $pnpItems = @(Get-PnpDevice -Class Display -ErrorAction SilentlyContinue)
    if ($pnpItems.Count -eq 0) {
        $pnpItems = @(Get-CimInstance Win32_PnPEntity -Filter "PNPClass='DISPLAY'" -ErrorAction SilentlyContinue | ForEach-Object {
            [pscustomobject]@{ FriendlyName = [string]$_.Name; InstanceId = [string]$_.PNPDeviceID; Status = [string]$_.Status; Problem = [int]$_.ConfigManagerErrorCode }
        })
    }
    $adapters = @($pnpItems | ForEach-Object {
        $problem = if ($null -ne $_.Problem) { [int]$_.Problem } else { 0 }
        [ordered]@{
            name = [string]$_.FriendlyName
            instanceId = [string]$_.InstanceId
            status = [string]$_.Status
            problemCode = $problem
        }
    })
    [ordered]@{ cpuName = $cpuName; isPortable = [bool]$portable.isPortable; systemModel = [string]$portable.model; activeDisplays = $activeDisplays; adapters = $adapters; testMode = $false }
}

function Test-DeviceIdMatch([string]$InstanceId, [string]$DisplayDeviceId) {
    if ([string]::IsNullOrWhiteSpace($InstanceId) -or [string]::IsNullOrWhiteSpace($DisplayDeviceId)) { return $false }
    $instance = $InstanceId.ToUpperInvariant()
    $display = $DisplayDeviceId.ToUpperInvariant()
    $instance.StartsWith($display) -or $display.StartsWith($instance)
}

function Get-DisplayAdapterCatalog {
    $raw = Get-RawDisplayAdapterInventory
    $activeDetectionReliable = @($raw.activeDisplays | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.deviceId) }).Count -gt 0
    $classified = @($raw.adapters | ForEach-Object {
        $name = [string]$_.name
        $instanceId = [string]$_.instanceId
        $vendor = Get-DisplayAdapterVendor $name $instanceId
        $kind = Get-DisplayAdapterKind $name $vendor ([string]$raw.cpuName)
        $attached = @($raw.activeDisplays | Where-Object { Test-DeviceIdMatch $instanceId ([string]$_.deviceId) })
        $problemCode = [int]$_.problemCode
        $enabled = ($problemCode -ne 22 -and [string]$_.status -notin @('Error', 'Disabled', 'Unknown'))
        [ordered]@{
            name = $name
            instanceId = $instanceId
            vendor = $vendor
            kind = $kind
            status = [string]$_.status
            problemCode = $problemCode
            enabled = $enabled
            attachedToDesktop = ($attached.Count -gt 0)
            primary = (@($attached | Where-Object { $_.primary }).Count -gt 0)
        }
    })
    $discrete = @($classified | Where-Object { $_.kind -eq 'discrete' -and $_.enabled })
    $integrated = @($classified | Where-Object kind -eq 'integrated')
    $enabledDisplayCount = @($classified | Where-Object enabled).Count
    foreach ($adapter in $integrated) {
        $reasons = @()
        if (-not $adapter.enabled) { $reasons += 'already-disabled' }
        if ($discrete.Count -eq 0) { $reasons += 'no-enabled-discrete-gpu' }
        if ([bool]$raw.isPortable) { $reasons += 'portable-hybrid-system' }
        if (-not $activeDetectionReliable) { $reasons += 'active-display-not-verifiable' }
        if ($adapter.attachedToDesktop -or $adapter.primary) { $reasons += 'integrated-gpu-drives-desktop' }
        if ($enabledDisplayCount -le 1) { $reasons += 'last-enabled-display-adapter' }
        $adapter.eligible = ($reasons.Count -eq 0)
        $adapter.blockedReasons = $reasons
    }
    $eligible = @($integrated | Where-Object eligible)
    [ordered]@{
        capturedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        cpuName = [string]$raw.cpuName
        systemModel = [string]$raw.systemModel
        isPortable = [bool]$raw.isPortable
        activeDisplayDetectionReliable = $activeDetectionReliable
        hasEnabledDiscreteGpu = ($discrete.Count -gt 0)
        canDisableIntegratedGpu = ($eligible.Count -gt 0)
        adapters = $classified
        eligibleIntegratedGpuIds = @($eligible | ForEach-Object { [string]$_.instanceId })
        note = 'Device-level switch only. Drivers and BIOS settings are not removed or changed.'
    }
}

function Set-DisplayDeviceEnabled([string]$InstanceId, [bool]$Enabled) {
    $test = Get-TestDisplayInventory
    if ($null -ne $test) {
        $match = @($test.adapters | Where-Object { [string]$_.instanceId -ceq $InstanceId }) | Select-Object -First 1
        if ($null -eq $match) { throw "Display adapter not found: $InstanceId" }
        $match.status = if ($Enabled) { 'OK' } else { 'Error' }
        $match.problemCode = if ($Enabled) { 0 } else { 22 }
        Save-TestDisplayInventory $test
        return
    }
    if ($Enabled) {
        Enable-PnpDevice -InstanceId $InstanceId -Confirm:$false -ErrorAction Stop
    } else {
        Disable-PnpDevice -InstanceId $InstanceId -Confirm:$false -ErrorAction Stop
    }
}

function Disable-EligibleIntegratedGpu {
    $catalog = Get-DisplayAdapterCatalog
    $targets = @($catalog.adapters | Where-Object { $_.kind -eq 'integrated' -and $_.eligible })
    if ($targets.Count -eq 0) { throw 'No safely disableable integrated GPU was detected.' }
    [void](New-Item -ItemType Directory -Path $script:backupRoot -Force)
    $backupId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $metadata = [ordered]@{
        schemaVersion = 1
        backupId = $backupId
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        adapters = @($targets | ForEach-Object { [ordered]@{ instanceId = [string]$_.instanceId; name = [string]$_.name; wasEnabled = [bool]$_.enabled } })
    }
    [IO.File]::WriteAllText((Join-Path $script:backupRoot ($backupId + '.json')), ($metadata | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
    $changed = @()
    try {
        foreach ($target in $targets) {
            Set-DisplayDeviceEnabled -InstanceId ([string]$target.instanceId) -Enabled $false
            $changed += [string]$target.instanceId
        }
    } catch {
        foreach ($instanceId in $changed) { try { Set-DisplayDeviceEnabled -InstanceId $instanceId -Enabled $true } catch { } }
        throw
    }
    [ordered]@{ ok = $true; backupId = $backupId; changedCount = $changed.Count; restartRecommended = $true; catalog = Get-DisplayAdapterCatalog }
}

function Restore-IntegratedGpu([string]$BackupId = 'latest') {
    $backups = @(Get-ChildItem -LiteralPath $script:backupRoot -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object BaseName -Descending)
    if ($backups.Count -eq 0) { throw 'No SynapseX display adapter backup exists.' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object BaseName -eq $BackupId | Select-Object -First 1 }
    if ($null -eq $selected) { throw "Display adapter backup not found: $BackupId" }
    $metadata = Get-Content -LiteralPath $selected.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    $changed = 0
    foreach ($adapter in @($metadata.adapters)) {
        if ([bool]$adapter.wasEnabled) {
            Set-DisplayDeviceEnabled -InstanceId ([string]$adapter.instanceId) -Enabled $true
            $changed++
        }
    }
    [ordered]@{ ok = $true; backupId = $selected.BaseName; changedCount = $changed; restartRecommended = $true; catalog = Get-DisplayAdapterCatalog }
}

Export-ModuleMember -Function Get-DisplayAdapterCatalog, Disable-EligibleIntegratedGpu, Restore-IntegratedGpu
