$ErrorActionPreference = 'Stop'
$internetKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
$stateBase = if ([string]::IsNullOrWhiteSpace($env:SYNAPSEX_STATE_ROOT)) { Join-Path $env:LOCALAPPDATA 'SynapseX\state' } else { [IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT) }
$backupRoot = Join-Path $stateBase 'network-backups'

function Test-ProxyValueExists([string]$Name) {
    $key = Get-Item -LiteralPath $internetKey
    return ($null -ne $key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames))
}

function Get-ProxySnapshot {
    $values = Get-ItemProperty -LiteralPath $internetKey
    $names = @('ProxyEnable', 'ProxyServer', 'AutoConfigURL', 'ProxyOverride')
    $snapshot = [ordered]@{}
    foreach ($name in $names) { $snapshot[$name] = [ordered]@{ exists = (Test-ProxyValueExists $name); value = $values.$name } }
    return $snapshot
}

function Test-LoopbackText([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
    return ($Value -match '(?i)(127\.0\.0\.1|localhost|\[::1\])')
}

function Get-NetworkRecoveryState {
    $values = Get-ItemProperty -LiteralPath $internetKey -ErrorAction SilentlyContinue
    $clashProcesses = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'clash|mihomo' })
    $proxyEnabled = ([int]$values.ProxyEnable -eq 1)
    $loopbackProxy = Test-LoopbackText ([string]$values.ProxyServer)
    $loopbackPac = Test-LoopbackText ([string]$values.AutoConfigURL)
    [ordered]@{
        clashRunning = ($clashProcesses.Count -gt 0)
        clashProcesses = @($clashProcesses | ForEach-Object ProcessName | Sort-Object -Unique)
        proxyEnabled = $proxyEnabled
        proxyServer = [string]$values.ProxyServer
        autoConfigUrl = [string]$values.AutoConfigURL
        staleLoopbackCandidate = (($proxyEnabled -and $loopbackProxy) -or $loopbackPac) -and ($clashProcesses.Count -eq 0)
        repairScope = 'stale_loopback_only_with_exact_backup'
    }
}

function Notify-InternetSettingsChanged {
    if (-not ('SynapseX.WinInet' -as [type])) {
        Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
namespace SynapseX {
  public static class WinInet {
    [DllImport("wininet.dll", SetLastError=true)] public static extern bool InternetSetOption(System.IntPtr hInternet, int option, System.IntPtr buffer, int length);
  }
}
'@
    }
    [void][SynapseX.WinInet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0)
    [void][SynapseX.WinInet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0)
}

function New-NetworkBackup {
    [void](New-Item -ItemType Directory -Path $backupRoot -Force)
    $id = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $metadata = [ordered]@{ schemaVersion = 1; backupId = $id; createdAt = (Get-Date).ToUniversalTime().ToString('o'); values = Get-ProxySnapshot }
    [IO.File]::WriteAllText((Join-Path $backupRoot ($id + '.json')), ($metadata | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
    return $id
}

function Repair-StaleLoopbackProxy {
    $state = Get-NetworkRecoveryState
    if ($state.clashRunning) { throw 'Clash or Mihomo is running. Exit it before repairing stale proxy state.' }
    if (-not $state.staleLoopbackCandidate) { throw 'No stale local Clash proxy/PAC candidate was detected.' }
    $backupId = New-NetworkBackup
    Set-ItemProperty -LiteralPath $internetKey -Name ProxyEnable -Type DWord -Value 0
    if (Test-LoopbackText ([string]$state.autoConfigUrl)) { Remove-ItemProperty -LiteralPath $internetKey -Name AutoConfigURL -ErrorAction SilentlyContinue }
    Notify-InternetSettingsChanged
    [pscustomobject]@{ ok = $true; backupId = $backupId; state = Get-NetworkRecoveryState }
}

function Restore-NetworkProxy([string]$BackupId = 'latest') {
    $backups = @(Get-ChildItem -LiteralPath $backupRoot -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object BaseName -Descending)
    if ($backups.Count -eq 0) { throw 'No SynapseX network backup exists.' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object BaseName -eq $BackupId | Select-Object -First 1 }
    if ($null -eq $selected) { throw "Network backup not found: $BackupId" }
    $metadata = Get-Content -LiteralPath $selected.FullName -Raw | ConvertFrom-Json
    foreach ($name in @('ProxyEnable', 'ProxyServer', 'AutoConfigURL', 'ProxyOverride')) {
        $entry = $metadata.values.$name
        if ([bool]$entry.exists) {
            if ($name -eq 'ProxyEnable') { Set-ItemProperty -LiteralPath $internetKey -Name $name -Type DWord -Value ([int]$entry.value) }
            else { Set-ItemProperty -LiteralPath $internetKey -Name $name -Type String -Value ([string]$entry.value) }
        } else { Remove-ItemProperty -LiteralPath $internetKey -Name $name -ErrorAction SilentlyContinue }
    }
    Notify-InternetSettingsChanged
    [pscustomobject]@{ ok = $true; backupId = $selected.BaseName; state = Get-NetworkRecoveryState }
}

Export-ModuleMember -Function Get-NetworkRecoveryState, Repair-StaleLoopbackProxy, Restore-NetworkProxy
