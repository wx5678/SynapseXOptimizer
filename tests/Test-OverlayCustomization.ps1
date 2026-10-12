$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$monitor = Get-Content -LiteralPath (Join-Path $root 'src\components\RealtimeMonitor.tsx') -Raw
$reporter = Get-Content -LiteralPath (Join-Path $root 'src\components\GameSessionReporter.tsx') -Raw
$controller = Get-Content -LiteralPath (Join-Path $root 'electron\monitor-controller.cjs') -Raw
$main = Get-Content -LiteralPath (Join-Path $root 'electron\main.cjs') -Raw
$preload = Get-Content -LiteralPath (Join-Path $root 'electron\preload.cjs') -Raw
$types = Get-Content -LiteralPath (Join-Path $root 'src\types\desktop.d.ts') -Raw
$css = Get-Content -LiteralPath (Join-Path $root 'src\index.css') -Raw

$checks = @(
  @{ Name = 'Auto mode prioritizes fxgame'; Pass = $monitor.Contains('processName.toLowerCase() === "fxgame.exe"') }
  @{ Name = 'Horizontal overlay is available'; Pass = $monitor.Contains('layout: "horizontal"') -and $monitor.Contains('横向单行') }
  @{ Name = 'Transparent overlay is available'; Pass = $monitor.Contains('background: "transparent"') -and $monitor.Contains('完全透明') }
  @{ Name = 'Overlay metrics are selectable'; Pass = $monitor.Contains('toggleOverlayMetric') -and $monitor.Contains('overlayMetricOptions') }
  @{ Name = 'Main window can always close overlay'; Pass = $monitor.Contains('closeOverlay') }
  @{ Name = 'Automatic FPS capture is opt-in'; Pass = $controller.Contains('autoCapture:false') -and $monitor.Contains('进入游戏自动采集') }
  @{ Name = 'Performance reporter never owns FPS startup'; Pass = -not $reporter.Contains('.startFps(') }
  @{ Name = 'Overlay preferences persist'; Pass = $monitor.Contains('synapsex.monitor.overlay') }
  @{ Name = 'Electron can resize overlay'; Pass = $main.Contains('monitor:configure-overlay') -and $main.Contains('overlayDimensions') }
  @{ Name = 'Preload exposes resize bridge'; Pass = $preload.Contains('configureOverlay') }
  @{ Name = 'Desktop types expose resize bridge'; Pass = $types.Contains('configureOverlay') }
  @{ Name = 'Overlay document is transparent'; Pass = $css.Contains('html[data-overlay="1"]') -and $css.Contains('background: transparent !important') }
)

$failed = @($checks | Where-Object { -not $_.Pass })
$checks | ForEach-Object { Write-Host ("[{0}] {1}" -f ($(if ($_.Pass) { 'PASS' } else { 'FAIL' })), $_.Name) }
if ($failed.Count -gt 0) { throw "$($failed.Count) overlay customization checks failed." }
Write-Host 'Overlay customization checks passed.'
