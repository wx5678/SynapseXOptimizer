$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$modulePath = Join-Path $projectRoot 'host\modules\PerformanceReports.psm1'
$previousStateRoot = $env:SYNAPSEX_STATE_ROOT
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('SynapseX-PerformanceReports-' + [guid]::NewGuid().ToString('N'))

try {
    $env:SYNAPSEX_STATE_ROOT = $testRoot
    Import-Module $modulePath -Force
    $report = [ordered]@{
        game = [ordered]@{ processName='fxgame.exe'; title='JiuYin Online'; processId=4321; path='D:\game\fxgame.exe'; bindingMode='auto'; startedAt='2026-09-01T10:00:00.000Z'; endedAt='2026-09-01T10:02:00.000Z'; durationSeconds=120 }
        samples = [ordered]@{ telemetry=60; fps=58; latency=55; unreachableLatency=5 }
        fps = [ordered]@{ average=72.4; minimum=41.2; maximum=103.8; onePercentLowAverage=51.6; frameTimeAverageMs=13.8; frameTimeP95Ms=22.4; source='PresentMon test' }
        cpu = [ordered]@{ system=[ordered]@{ average=35; minimum=20; maximum=72; p95=60 }; game=[ordered]@{ average=18; minimum=10; maximum=31; p95=27 } }
        gpu = $null
        memory = [ordered]@{ systemUsedPercent=[ordered]@{ average=42; minimum=40; maximum=45; p95=44 }; gameMB=[ordered]@{ average=1800; minimum=1750; maximum=1900; p95=1880 } }
        latency = [ordered]@{ target='203.0.113.8'; kind='game-connection'; milliseconds=[ordered]@{ average=31; minimum=28; maximum=44; p95=38 }; jitterMs=2.1; unreachableSamples=5 }
        network = [ordered]@{ adapter='Ethernet'; downloadMbps=[ordered]@{ average=0.8; minimum=0; maximum=3.2; p95=2.4 }; uploadMbps=[ordered]@{ average=0.2; minimum=0; maximum=1.1; p95=0.7 } }
        timeline = @([ordered]@{ elapsedSeconds=5; fps=72; onePercentLow=55; cpu=18; gpu=64; latency=31 })
        observations = @([ordered]@{ level='good'; title='Test'; detail='Report round-trip test.' })
    }
    $saved = Save-SynapseXPerformanceReport -Report $report
    if (-not $saved.id -or $saved.schemaVersion -ne 1) { throw 'Saved performance report metadata is invalid.' }
    $items = @(Get-SynapseXPerformanceReports)
    if ($items.Count -ne 1 -or $items[0].id -ne $saved.id -or $items[0].fps.average -ne 72.4 -or @($items[0].timeline).Count -ne 1) { throw 'Performance report round-trip failed.' }
    $removed = Remove-SynapseXPerformanceReport -Id $saved.id
    if (-not $removed.ok -or @(Get-SynapseXPerformanceReports).Count -ne 0) { throw 'Performance report removal failed.' }
    $report.id = 'session-20260916-120000-12345678'
    $report.status = 'recording'
    $live = Save-SynapseXPerformanceReport -Report $report
    $report.game.durationSeconds = 135
    $report.samples.telemetry = 65
    $checkpoint = Save-SynapseXPerformanceReport -Report $report
    if (@(Get-SynapseXPerformanceReports).Count -ne 1 -or $checkpoint.createdAt -ne $live.createdAt -or $checkpoint.game.durationSeconds -ne 135) { throw 'Idempotent checkpoint failed' }
    $report.status = 'completed'
    $final = Save-SynapseXPerformanceReport -Report $report
    $report.status = 'recording'
    $stale = Save-SynapseXPerformanceReport -Report $report
    if ($stale.status -ne 'completed') { throw 'A retry downgraded a final report' }
    $report.game.processId = 9876
    $rejected = $false
    try { Save-SynapseXPerformanceReport -Report $report } catch { $rejected = $true }
    if (-not $rejected) { throw 'Session identity collision was accepted' }
    [ordered]@{ ok=$true; reportId=$saved.id; schemaVersion=$saved.schemaVersion; roundTrip=$true } | ConvertTo-Json -Compress
}
finally {
    Remove-Module PerformanceReports -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($previousStateRoot)) { Remove-Item Env:SYNAPSEX_STATE_ROOT -ErrorAction SilentlyContinue } else { $env:SYNAPSEX_STATE_ROOT = $previousStateRoot }
    $resolvedTest = [IO.Path]::GetFullPath($testRoot)
    $allowedPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\SynapseX-PerformanceReports-'
    if (-not $resolvedTest.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe report fixture cleanup path' }
    if (Test-Path -LiteralPath $resolvedTest) { Remove-Item -LiteralPath $resolvedTest -Recurse -Force }
}
