$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$main = [IO.File]::ReadAllText((Join-Path $projectRoot 'electron\main.cjs'), [Text.Encoding]::UTF8)
$preload = [IO.File]::ReadAllText((Join-Path $projectRoot 'electron\preload.cjs'), [Text.Encoding]::UTF8)
$desktopTypes = [IO.File]::ReadAllText((Join-Path $projectRoot 'src\types\desktop.d.ts'), [Text.Encoding]::UTF8)
$workspace = [IO.File]::ReadAllText((Join-Path $projectRoot 'src\components\OptimizerWorkspace.tsx'), [Text.Encoding]::UTF8)

$checks = [ordered]@{
    mainHandler = $main.Contains('ipcMain.handle("dialog:select-game-executable"')
    exeFilter = $main.Contains('extensions: ["exe"]')
    preloadBridge = $preload.Contains('selectGameExecutable: () => ipcRenderer.invoke("dialog:select-game-executable")')
    typedBridge = $desktopTypes.Contains('selectGameExecutable: () => Promise<string>')
    visibleTarget = $workspace.Contains('loadGpuTarget = async')
    detectedTarget = $workspace.Contains('useDetectedGpuTarget = async')
    browseTarget = $workspace.Contains('browseGpuTarget = async')
    confirmation = $workspace.Contains('void run(async () => loadGpuTarget(gpuExecutable')
    persistentTarget = $workspace.Contains('synapsex.gpu.gameExecutable')
}

$failed = @($checks.GetEnumerator() | Where-Object { -not $_.Value } | ForEach-Object { $_.Key })
if ($failed.Count) { throw "Desktop game picker checks failed: $($failed -join ', ')" }

[ordered]@{ ok = $true; checks = $checks.Count; features = @($checks.Keys) } | ConvertTo-Json -Compress
