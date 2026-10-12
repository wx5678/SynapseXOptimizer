$ErrorActionPreference = 'Stop'

$logStateBase = if ([string]::IsNullOrWhiteSpace($env:SYNAPSEX_STATE_ROOT)) { Join-Path $env:LOCALAPPDATA 'SynapseX\state' } else { [IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT) }
$synapseXOperationLogPath = Join-Path $logStateBase 'operations.jsonl'

function Write-SynapseXOperation([string]$Category, [string]$Action, [string]$Result = 'success', [string]$BackupId = '', $Detail = @{}) {
    [void](New-Item -ItemType Directory -Path $logStateBase -Force)
    $entry = [ordered]@{
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        category = $Category
        action = $Action
        result = $Result
        backupId = $BackupId
        detail = $Detail
    }
    [IO.File]::AppendAllText($synapseXOperationLogPath, (($entry | ConvertTo-Json -Depth 10 -Compress) + [Environment]::NewLine), (New-Object Text.UTF8Encoding($false)))
    $entry
}

function Get-SynapseXOperationLog([int]$Limit = 100) {
    if (-not (Test-Path -LiteralPath $synapseXOperationLogPath -PathType Leaf)) { return @() }
    $bounded = [math]::Max(1, [math]::Min($Limit, 500))
    $lines = @(Get-Content -LiteralPath $synapseXOperationLogPath | Select-Object -Last $bounded)
    @($lines | ForEach-Object { try { $_ | ConvertFrom-Json } catch { } } | Sort-Object timestamp -Descending)
}

Export-ModuleMember -Function Write-SynapseXOperation, Get-SynapseXOperationLog
