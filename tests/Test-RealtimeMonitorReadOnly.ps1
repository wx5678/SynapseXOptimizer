$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$modulePath = Join-Path $projectRoot 'host\modules\RealtimeMonitor.psm1'
$collectorPath = Join-Path $projectRoot 'tools\presentmon\PresentMon.exe'
$licensePath = Join-Path $projectRoot 'tools\presentmon\LICENSE.txt'

Import-Module $modulePath -Force
$targets = Get-RealtimeMonitorTargets
$first = Get-RealtimeTelemetry
Start-Sleep -Milliseconds 750
$second = Get-RealtimeTelemetry

if (-not $second.sampledAt) { throw 'Realtime sample timestamp is missing.' }
if ($null -eq $second.cpu.totalPercent) { throw 'Total CPU utilization is missing.' }
if ($second.memory.totalGB -le 0) { throw 'Memory telemetry is invalid.' }
if (-not $second.latency.target) { throw 'Latency target is missing.' }
if ($second.network.downloadMbps -lt 0 -or $second.network.uploadMbps -lt 0) { throw 'Network rate cannot be negative.' }
if ($null -eq $targets.candidates) { throw 'Monitor target candidates are missing.' }
if ($targets.confidence -notin @('high','medium','low','none')) { throw 'Monitor target confidence is invalid.' }
if (@($targets.candidates).Count -gt 0) {
    $candidate = @($targets.candidates)[0]
    $bound = Get-RealtimeTelemetry -TargetProcessName ([string]$candidate.processName) -TargetProcessId ([int]$candidate.processId)
    if ($bound.selection.requestedProcessName -cne [string]$candidate.processName) { throw 'Manual process-name binding was not preserved.' }
    if ($bound.selection.requestedProcessId -ne [int]$candidate.processId) { throw 'Manual process-id binding was not preserved.' }
}
if (-not (Test-Path -LiteralPath $collectorPath -PathType Leaf)) { throw 'Bundled PresentMon collector is missing.' }
if ((Get-Item -LiteralPath $collectorPath).Length -ne 388096) { throw 'Bundled PresentMon size does not match the official v1.10.0 x64 asset.' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $collectorPath).Hash -ne 'E57A2F8EE1DE1EF1A5516D875F1B115E881943CD729FE9C5A2F88B1DC79A8A3B') { throw 'Bundled PresentMon hash does not match the recorded official asset.' }
if (-not (Test-Path -LiteralPath $licensePath -PathType Leaf)) { throw 'PresentMon license is missing.' }

[ordered]@{
    ok = $true
    cpuPercent = $second.cpu.totalPercent
    gpuDetected = ($null -ne $second.gpu)
    latencyTarget = $second.latency.target
    latencyKind = $second.latency.kind
    adapter = $second.network.adapter
    gameRunning = ($null -ne $second.game)
    candidateCount = @($targets.candidates).Count
    automaticConfidence = $targets.confidence
    manualBindingVerified = (@($targets.candidates).Count -gt 0)
    collectorHashVerified = $true
} | ConvertTo-Json -Compress
