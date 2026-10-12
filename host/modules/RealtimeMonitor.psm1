$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'MonitorSensors.psm1')
Import-Module (Join-Path $PSScriptRoot 'GameIdentity.psm1')
$script:LastGameCpu = $null
$script:LastNetwork = $null
$script:LastMonitorTargets = $null
$script:LastNvidiaSnapshot = $null
$script:LastTelemetry = $null
$script:AutoMonitorIdentity = $null

function Get-ForegroundProcessId {
    if (-not ('SynapseX.Native.WindowProbe' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace SynapseX.Native {
    public static class WindowProbe {
        [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    }
}
'@
    }
    $processId = [uint32]0
    $window = [SynapseX.Native.WindowProbe]::GetForegroundWindow()
    if ($window -ne [IntPtr]::Zero) { [void][SynapseX.Native.WindowProbe]::GetWindowThreadProcessId($window, [ref]$processId) }
    [int]$processId
}

function Get-RealtimeMonitorTargets([switch]$Force) {
    $now = [DateTime]::UtcNow
    if (-not $Force -and $script:LastMonitorTargets -and ($now - $script:LastMonitorTargets.time).TotalMilliseconds -lt 1800) { return $script:LastMonitorTargets.value }
    $foregroundId = Get-ForegroundProcessId
    $logicalProcessors = [math]::Max(1, [Environment]::ProcessorCount)
    $gpuByPid = @{}
    foreach ($engine in @(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue)) {
        if ([string]$engine.Name -match '^pid_(\d+)_') {
            $id = [int]$Matches[1]
            if (-not $gpuByPid.ContainsKey($id)) { $gpuByPid[$id] = 0.0 }
            $gpuByPid[$id] += [double]$engine.UtilizationPercentage
        }
    }
    $cpuByPid = @{}
    foreach ($counter in @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -ErrorAction SilentlyContinue)) {
        if ([int]$counter.IDProcess -gt 0) { $cpuByPid[[int]$counter.IDProcess] = [math]::Round(([double]$counter.PercentProcessorTime / $logicalProcessors), 1) }
    }
    $autoExcluded = @(
        'system','idle','registry','memory compression','secure system','svchost','csrss','lsass','services','smss','wininit','winlogon',
        'awesun','sunloginclient','rustdesk','mstsc','applicationframehost','boosterx','chatgpt','chrome','clash-verge','codex','cursor','dwm','electron','explorer','firefox',
        'gamebar','gamebarftserver','msedge','msedgewebview2','obs64','qq','rtss','searchhost','shellexperiencehost',
        'nvidia app','powershell','startmenuexperiencehost','steam','synapsex 游戏优化器','taskmgr','textinputhost','weixin','widgets','windowsterminal'
    )
    $items = foreach ($process in @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID })) {
        $name = [string]$process.ProcessName
        if ($process.Id -le 4) { continue }
        $gpu = if ($gpuByPid.ContainsKey($process.Id)) { [math]::Round([double]$gpuByPid[$process.Id], 1) } else { 0.0 }
        $cpu = if ($cpuByPid.ContainsKey($process.Id)) { [double]$cpuByPid[$process.Id] } else { 0.0 }
        $hasWindow = ($process.MainWindowHandle -ne 0 -and -not [string]::IsNullOrWhiteSpace($process.MainWindowTitle))
        $path = try { [string]$process.Path } catch { '' }
        $evidence = Get-MonitorGameEvidence -Name $name -Path $path
        $isKnownGame = $evidence -in @('known-game','unreal-game','unity-game')
        $isPinned = $script:AutoMonitorIdentity -and $script:AutoMonitorIdentity.id -eq $process.Id -and $script:AutoMonitorIdentity.name -ieq $name
        if (-not $hasWindow -and $gpu -lt 0.5 -and -not $evidence -and -not $isPinned) { continue }
        $memory = [math]::Round($process.WorkingSet64 / 1MB, 0)
        $isGamePath = $evidence -eq 'game-directory'
        $autoEligible = [bool]$evidence -and ($autoExcluded -notcontains $name.ToLowerInvariant())
        $score = [math]::Round(($gpu * 4) + [math]::Min(25, $cpu * 2) + [math]::Min(22, $memory / 45) + $(if ($process.Id -eq $foregroundId) { 28 } else { 0 }) + $(if ($isGamePath) { 45 } else { 0 }) + $(if ($isKnownGame) { 65 } else { 0 }), 1)
        [pscustomobject]@{
            processName = "$name.exe"
            processId = [int]$process.Id
            title = [string]$process.MainWindowTitle
            path = $path
            cpuPercent = $cpu
            gpuPercent = $gpu
            memoryMB = $memory
            foreground = ($process.Id -eq $foregroundId)
            autoEligible = $autoEligible
            gameEvidence = $evidence
            score = $score
        }
    }
    $sorted = @($items | Sort-Object @{ Expression = 'autoEligible'; Descending = $true }, @{ Expression = 'score'; Descending = $true }, @{ Expression = 'gpuPercent'; Descending = $true })
    # Preserve a live game across focus/GPU changes; system GPU work is not a game.
    $detected = $sorted | Where-Object { $_.autoEligible -and $_.processName -ieq 'fxgame.exe' } | Select-Object -First 1
    if (-not $detected -and $script:AutoMonitorIdentity) {
        $detected = $sorted | Where-Object { $_.autoEligible -and $_.processId -eq $script:AutoMonitorIdentity.id -and $_.processName -ieq "$($script:AutoMonitorIdentity.name).exe" } | Select-Object -First 1
    }
    if (-not $detected) { $detected = $sorted | Where-Object { $_.autoEligible } | Select-Object -First 1 }
    $script:AutoMonitorIdentity = if ($detected) { @{id=$detected.processId;name=[IO.Path]::GetFileNameWithoutExtension($detected.processName)} } else { $null }
    $result = [ordered]@{
        capturedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        detected = $detected
        candidates = @($sorted | Select-Object -First 50)
        confidence = if (-not $detected) { 'none' } elseif ($detected.score -ge 85) { 'high' } elseif ($detected.score -ge 50) { 'medium' } else { 'low' }
        note = '自动模式只选择具有已知游戏、游戏目录或引擎特征的进程，排除微信、浏览器、启动器等普通程序。切换窗口仍保持当前游戏；未识别的游戏可手动绑定，重启游戏后继续生效。'
    }
    $script:LastMonitorTargets = [ordered]@{ time = $now; value = $result }
    $result
}

function Resolve-MonitorGame([string]$TargetProcessName, [int]$TargetProcessId) {
    if ($TargetProcessId -gt 0) {
        $byId = Get-Process -Id $TargetProcessId -ErrorAction SilentlyContinue
        if ($byId -and ([string]::IsNullOrWhiteSpace($TargetProcessName) -or "$($byId.ProcessName).exe" -ieq $TargetProcessName)) { return $byId }
        # An explicit PID is an identity, not permission to substitute another instance.
        return $null
    }
    if (-not [string]::IsNullOrWhiteSpace($TargetProcessName)) {
        $baseName = [IO.Path]::GetFileNameWithoutExtension($TargetProcessName)
        return Get-Process -Name $baseName -ErrorAction SilentlyContinue | Sort-Object StartTime | Select-Object -First 1
    }
    $targets = Get-RealtimeMonitorTargets
    if ($targets.detected) { return Get-Process -Id ([int]$targets.detected.processId) -ErrorAction SilentlyContinue }
    $null
}

function Get-MonitorNvidiaSnapshot {
    $now = [DateTime]::UtcNow
    if ($script:LastNvidiaSnapshot -and ($now - $script:LastNvidiaSnapshot.time).TotalMilliseconds -lt 1800) { return $script:LastNvidiaSnapshot.value }
    $command = Get-Command 'nvidia-smi.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    $path = if ($command) { [string]$command.Source } else { Join-Path $env:ProgramFiles 'NVIDIA Corporation\NVSMI\nvidia-smi.exe' }
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
    $lines = @(& $path '--query-gpu=name,utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw,clocks.current.graphics' '--format=csv,noheader,nounits' 2>$null)
    if ($lines.Count -eq 0) { return $null }
    $parts = @([string]$lines[0] -split ',' | ForEach-Object { $_.Trim() })
    if ($parts.Count -lt 8) { return $null }
    $result = [ordered]@{
        name = $parts[0]
        utilizationPercent = Convert-MonitorNumber $parts[1]
        memoryControllerPercent = Convert-MonitorNumber $parts[2]
        memoryUsedMB = Convert-MonitorNumber $parts[3]
        memoryTotalMB = Convert-MonitorNumber $parts[4]
        temperatureC = Convert-MonitorNumber $parts[5]
        powerWatts = Convert-MonitorNumber $parts[6]
        graphicsClockMHz = Convert-MonitorNumber $parts[7]
    }
    $script:LastNvidiaSnapshot = [ordered]@{ time = $now; value = $result }
    $result
}

function Get-MonitorLatency($Game) {
    $target = $null
    $kind = 'public-fallback'
    if ($Game) {
        $connections = @(Get-NetTCPConnection -OwningProcess $Game.Id -State Established -ErrorAction SilentlyContinue | Where-Object {
            $_.RemoteAddress -and $_.RemoteAddress -notin @('0.0.0.0','127.0.0.1','::','::1')
        } | Sort-Object @{ Expression = { if ($_.RemotePort -in @(80,443)) { 1 } else { 0 } } }, RemotePort)
        if ($connections.Count) { $target = [string]$connections[0].RemoteAddress; $kind = 'game-connection' }
    }
    if ([string]::IsNullOrWhiteSpace($target)) {
        $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Where-Object { $_.NextHop -ne '0.0.0.0' } | Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1
        if ($route) { $target = [string]$route.NextHop; $kind = 'default-gateway' }
    }
    if ([string]::IsNullOrWhiteSpace($target)) { $target = '223.5.5.5' }
    try {
        $ping = New-Object System.Net.NetworkInformation.Ping
        try { $reply = $ping.Send($target, 450) } finally { $ping.Dispose() }
        $reachable = ($reply.Status -eq [System.Net.NetworkInformation.IPStatus]::Success)
        [ordered]@{ target = $target; milliseconds = if ($reachable) { [double]$reply.RoundtripTime } else { $null }; reachable = $reachable; kind = $kind; status = [string]$reply.Status }
    } catch {
        [ordered]@{ target = $target; milliseconds = $null; reachable = $false; kind = $kind; status = $_.Exception.Message }
    }
}

function Get-MonitorNetworkRate {
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Where-Object { $_.NextHop -ne '0.0.0.0' } | Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1
    $adapter = if ($route) { Get-NetAdapter -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue } else { Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up' | Select-Object -First 1 }
    if (-not $adapter) { return [ordered]@{ adapter = ''; downloadMbps = 0; uploadMbps = 0 } }
    $statistics = Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction SilentlyContinue
    if (-not $statistics) { return [ordered]@{ adapter = [string]$adapter.Name; downloadMbps = 0; uploadMbps = 0 } }
    $now = [DateTime]::UtcNow
    $download = 0.0
    $upload = 0.0
    if ($script:LastNetwork -and $script:LastNetwork.interfaceIndex -eq [int]$adapter.ifIndex) {
        $seconds = ($now - $script:LastNetwork.time).TotalSeconds
        if ($seconds -gt 0.1 -and $seconds -lt 10) {
            $download = [math]::Max(0, (([long]$statistics.ReceivedBytes - $script:LastNetwork.received) * 8 / 1MB) / $seconds)
            $upload = [math]::Max(0, (([long]$statistics.SentBytes - $script:LastNetwork.sent) * 8 / 1MB) / $seconds)
        }
    }
    $script:LastNetwork = [ordered]@{ interfaceIndex = [int]$adapter.ifIndex; time = $now; received = [long]$statistics.ReceivedBytes; sent = [long]$statistics.SentBytes }
    [ordered]@{ adapter = [string]$adapter.Name; downloadMbps = [math]::Round($download, 2); uploadMbps = [math]::Round($upload, 2) }
}

function Get-RealtimeTelemetry([string]$TargetProcessName = '', [int]$TargetProcessId = 0) {
    $now = [DateTime]::UtcNow
    $cacheKey = "{0}|{1}" -f $TargetProcessName.ToLowerInvariant(), $TargetProcessId
    if ($script:LastTelemetry -and $script:LastTelemetry.key -eq $cacheKey -and ($now - $script:LastTelemetry.time).TotalMilliseconds -lt 700) { return $script:LastTelemetry.value }
    $game = Resolve-MonitorGame -TargetProcessName $TargetProcessName -TargetProcessId $TargetProcessId
    $totalCpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction SilentlyContinue
    $os = Get-CimInstance Win32_OperatingSystem
    $gameCpu = $null
    if ($game) {
        $totalMs = [double]$game.TotalProcessorTime.TotalMilliseconds
        if ($script:LastGameCpu -and $script:LastGameCpu.id -eq $game.Id) {
            $seconds = ($now - $script:LastGameCpu.time).TotalSeconds
            if ($seconds -gt 0.1 -and $seconds -lt 10) {
                $gameCpu = [math]::Round([math]::Max(0, (($totalMs - $script:LastGameCpu.totalMs) / 1000) / ($seconds * [Environment]::ProcessorCount) * 100), 1)
            }
        }
        $script:LastGameCpu = [ordered]@{ id = $game.Id; time = $now; totalMs = $totalMs }
    } else {
        $script:LastGameCpu = $null
    }
    $temperature = Get-MonitorCpuTemperature
    $result = [ordered]@{
        sampledAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        selection = [ordered]@{ requestedProcessName = $TargetProcessName; requestedProcessId = $TargetProcessId; resolvedProcessName = if ($game) { "$($game.ProcessName).exe" } else { '' }; resolvedProcessId = if ($game) { [int]$game.Id } else { 0 } }
        game = if ($game) { [ordered]@{ running = $true; name = "$($game.ProcessName).exe"; title = [string]$game.MainWindowTitle; id = $game.Id; cpuPercent = $gameCpu; memoryMB = [math]::Round($game.WorkingSet64 / 1MB, 0); priority = [string]$game.PriorityClass } } else { $null }
        cpu = [ordered]@{ totalPercent = if ($totalCpu) { [double]$totalCpu.PercentProcessorTime } else { $null }; logicalProcessors = [Environment]::ProcessorCount; temperatureC = $temperature.temperatureC; temperatureSource = $temperature.temperatureSource; temperatureStatus = $temperature.temperatureStatus; temperatureMessage = $temperature.temperatureMessage }
        memory = [ordered]@{ usedPercent = [math]::Round((1 - ($os.FreePhysicalMemory / [double]$os.TotalVisibleMemorySize)) * 100, 1); usedGB = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB, 1); totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1) }
        gpu = Get-MonitorNvidiaSnapshot
        latency = Get-MonitorLatency $game
        network = Get-MonitorNetworkRate
        note = '连接延迟优先探测当前绑定游戏的 TCP 对端；若对端禁用 ICMP，会显示不可达而不是伪造数值。没有游戏连接时显示默认网关延迟。'
    }
    $script:LastTelemetry = [ordered]@{ key = $cacheKey; time = $now; value = $result }
    $result
}

Export-ModuleMember -Function Get-RealtimeTelemetry, Get-RealtimeMonitorTargets
