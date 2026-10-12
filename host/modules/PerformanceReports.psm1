$ErrorActionPreference = 'Stop'

$performanceStateBase = if ([string]::IsNullOrWhiteSpace($env:SYNAPSEX_STATE_ROOT)) { Join-Path $env:LOCALAPPDATA 'SynapseX\state' } else { [IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT) }
$performanceReportRoot = Join-Path $performanceStateBase 'performance-reports'

function Test-PerformanceReportId([string]$Id) {
    -not [string]::IsNullOrWhiteSpace($Id) -and $Id -match '^session-[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$'
}

function Save-SynapseXPerformanceReport($Report) {
    if ($null -eq $Report -or $null -eq $Report.game) { throw 'Performance report is missing game information.' }
    $processName = [string]$Report.game.processName
    if ([string]::IsNullOrWhiteSpace($processName) -or $processName.Length -gt 160) { throw 'Performance report target is invalid.' }
    $durationSeconds = [double]$Report.game.durationSeconds
    if ($durationSeconds -lt 0 -or $durationSeconds -gt 604800) { throw 'Performance report duration is invalid.' }

    [void](New-Item -ItemType Directory -Path $performanceReportRoot -Force)
    $id = 'session-{0}-{1}' -f (Get-Date).ToString('yyyyMMdd-HHmmss'), ([guid]::NewGuid().ToString('N').Substring(0, 8))
    if (-not [string]::IsNullOrWhiteSpace([string]$Report.id)) {
        if (-not (Test-PerformanceReportId ([string]$Report.id))) { throw 'Performance report id is invalid.' }
        $id = [string]$Report.id
    }
    $path = Join-Path $performanceReportRoot ($id + '.json')
    $createdAt = (Get-Date).ToUniversalTime().ToString('o')
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        $existing = [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) | ConvertFrom-Json
        if ($existing.game.processName -cne $processName -or $existing.game.startedAt -cne $Report.game.startedAt -or $existing.game.processId -ne $Report.game.processId) { throw 'Performance report identity mismatch.' }
        if ([double]$existing.game.durationSeconds -gt $durationSeconds -or $existing.status -eq 'completed') { return $existing }
        $createdAt = $existing.createdAt
    }
    $status = if ([string]::IsNullOrWhiteSpace([string]$Report.status)) { 'completed' } else { [string]$Report.status }
    if ($status -notin @('recording', 'completed', 'interrupted')) { throw 'Performance report status is invalid.' }
    $normalized = [ordered]@{
        schemaVersion = 1
        id = $id
        createdAt = $createdAt
        updatedAt = (Get-Date).ToUniversalTime().ToString('o')
        status = $status
        source = 'automatic-session-recorder'
        game = $Report.game
        samples = $Report.samples
        fps = $Report.fps
        cpu = $Report.cpu
        gpu = $Report.gpu
        memory = $Report.memory
        latency = $Report.latency
        network = $Report.network
        timeline = @($Report.timeline)
        observations = @($Report.observations)
    }
    $temporary = $path + '.tmp'
    [IO.File]::WriteAllText($temporary, ($normalized | ConvertTo-Json -Depth 20), (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporary -Destination $path -Force
    [pscustomobject]$normalized
}

function Get-SynapseXPerformanceReports([int]$Limit = 50) {
    if (-not (Test-Path -LiteralPath $performanceReportRoot -PathType Container)) { return @() }
    $bounded = [math]::Max(1, [math]::Min($Limit, 200))
    @(
        Get-ChildItem -LiteralPath $performanceReportRoot -Filter 'session-*.json' -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTimeUtc -Descending |
            Select-Object -First $bounded |
            ForEach-Object { try { [IO.File]::ReadAllText($_.FullName, [Text.Encoding]::UTF8) | ConvertFrom-Json } catch { } }
    )
}

function Remove-SynapseXPerformanceReport([string]$Id) {
    if (-not (Test-PerformanceReportId -Id $Id)) { throw 'Performance report id is invalid.' }
    $path = Join-Path $performanceReportRoot ($Id + '.json')
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Performance report was not found.' }
    Remove-Item -LiteralPath $path -Force
    [ordered]@{ ok = $true; id = $Id }
}

Export-ModuleMember -Function Save-SynapseXPerformanceReport, Get-SynapseXPerformanceReports, Remove-SynapseXPerformanceReport
