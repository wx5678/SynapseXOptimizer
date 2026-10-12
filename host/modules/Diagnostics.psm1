$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'MonitorSensors.psm1')
function Get-NvidiaSmiPath {
    $command = Get-Command 'nvidia-smi.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return [string]$command.Source }
    $candidate = Join-Path $env:ProgramFiles 'NVIDIA Corporation\NVSMI\nvidia-smi.exe'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    $null
}

function Get-NvidiaSnapshot {
    $path = Get-NvidiaSmiPath
    if ([string]::IsNullOrWhiteSpace($path)) { return $null }
    $lines = @(& $path '--query-gpu=name,driver_version,utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw,clocks.current.graphics' '--format=csv,noheader,nounits' 2>$null)
    if ($lines.Count -eq 0) { return $null }
    $parts = @([string]$lines[0] -split ',' | ForEach-Object { $_.Trim() })
    if ($parts.Count -lt 9) { return $null }
    [ordered]@{
        name = $parts[0]
        driverVersion = $parts[1]
        gpuUtilizationPercent = Convert-MonitorNumber $parts[2]
        memoryControllerPercent = Convert-MonitorNumber $parts[3]
        memoryUsedMB = Convert-MonitorNumber $parts[4]
        memoryTotalMB = Convert-MonitorNumber $parts[5]
        temperatureC = Convert-MonitorNumber $parts[6]
        powerWatts = Convert-MonitorNumber $parts[7]
        graphicsClockMHz = Convert-MonitorNumber $parts[8]
    }
}

function Get-PendingRebootState {
    $component = Test-Path -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending'
    $update = Test-Path -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'
    $session = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue
    [ordered]@{ pending = ($component -or $update -or $null -ne $session); componentServicing = $component; windowsUpdate = $update; fileRenameOperations = ($null -ne $session) }
}

function Get-IfeoFxGameAudit {
    $paths = @(
        'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\fxgame.exe',
        'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\fxgame.exe'
    )
    $items = foreach ($path in $paths) {
        if (-not (Test-Path -LiteralPath $path)) { continue }
        $properties = Get-ItemProperty -LiteralPath $path
        $values = [ordered]@{}
        foreach ($property in $properties.PSObject.Properties | Where-Object Name -notmatch '^PS(Path|ParentPath|ChildName|Drive|Provider)$') { $values[$property.Name] = $property.Value }
        [ordered]@{ path = $path; values = $values }
    }
    [ordered]@{ found = @($items).Count -gt 0; items = @($items); note = 'IFEO 可被调试器、兼容性工具或所谓优化器使用。SynapseX 只读显示，不自动删除。' }
}

function Get-ThirdPartyScheduledTaskAudit {
    $items = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.State -ne 'Disabled' -and $_.TaskPath -notlike '\Microsoft\*' } | Sort-Object TaskPath, TaskName | Select-Object -First 80 | ForEach-Object {
        [ordered]@{ taskName = [string]$_.TaskName; taskPath = [string]$_.TaskPath; state = [string]$_.State; author = [string]$_.Author }
    })
    [ordered]@{ count = $items.Count; items = $items; truncated = ($items.Count -ge 80); note = '仅列出非 Microsoft 且未禁用的任务；不会按名单批量停用。' }
}

function Get-UserAppxAudit {
    $items = @(Get-AppxPackage -ErrorAction SilentlyContinue | Where-Object { -not $_.IsFramework -and -not $_.IsResourcePackage } | Sort-Object Name | ForEach-Object {
        [ordered]@{ name = [string]$_.Name; version = [string]$_.Version; publisher = [string]$_.Publisher; nonRemovable = [bool]$_.NonRemovable }
    })
    [ordered]@{ count = $items.Count; removableCount = @($items | Where-Object { -not $_.nonRemovable }).Count; items = $items; note = '只读清单。移除 AppX 会改变系统功能，当前不会代替用户批量卸载。' }
}

function Get-SynapseXDiagnosticSnapshot([string]$GameRoot) {
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $os = Get-CimInstance Win32_OperatingSystem
    $game = Get-Process -Name fxgame -ErrorAction SilentlyContinue | Sort-Object StartTime | Select-Object -First 1
    $driveName = if ([string]::IsNullOrWhiteSpace($GameRoot)) { $env:SystemDrive } else { [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($GameRoot)).TrimEnd('\') }
    $drive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$driveName'" -ErrorAction SilentlyContinue
    $systemCpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction SilentlyContinue
    $memoryUsed = [math]::Round((1 - ($os.FreePhysicalMemory / [double]$os.TotalVisibleMemorySize)) * 100, 1)
    [ordered]@{
        capturedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        cpu = [ordered]@{ name = $cpu.Name.Trim(); physicalCores = [int]$cpu.NumberOfCores; logicalProcessors = [int]$cpu.NumberOfLogicalProcessors; totalUtilizationPercent = if ($systemCpu) { [double]$systemCpu.PercentProcessorTime } else { $null } }
        memory = [ordered]@{ usedPercent = $memoryUsed; freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1); totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1) }
        gameDrive = [ordered]@{ name = $driveName; freeGB = if ($drive) { [math]::Round($drive.FreeSpace / 1GB, 1) } else { $null }; totalGB = if ($drive) { [math]::Round($drive.Size / 1GB, 1) } else { $null } }
        gpu = Get-NvidiaSnapshot
        game = if ($game) { [ordered]@{ running = $true; id = $game.Id; priority = [string]$game.PriorityClass; threads = $game.Threads.Count; handles = $game.HandleCount; workingSetMB = [math]::Round($game.WorkingSet64 / 1MB, 1) } } else { $null }
        pendingReboot = Get-PendingRebootState
        ifeo = Get-IfeoFxGameAudit
        scheduledTasks = Get-ThirdPartyScheduledTaskAudit
        appx = Get-UserAppxAudit
        note = '这是单点系统快照。要判断九阴单线程压力，请在稳定场景运行“测量主线程压力”。'
    }
}

function Measure-GameThreadPressure([int]$Seconds = 3) {
    if ($Seconds -lt 2 -or $Seconds -gt 10) { throw 'Thread pressure duration must be between 2 and 10 seconds.' }
    $game = Get-Process -Name fxgame -ErrorAction Stop | Sort-Object StartTime | Select-Object -First 1
    $processId = $game.Id
    $startTime = $game.StartTime.ToString('o')
    $beforeProcessMs = $game.TotalProcessorTime.TotalMilliseconds
    $beforeThreads = @{}
    foreach ($thread in @($game.Threads)) {
        try { $beforeThreads[[int]$thread.Id] = [double]$thread.TotalProcessorTime.TotalMilliseconds } catch { }
    }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    Start-Sleep -Seconds $Seconds
    $watch.Stop()
    $gameAfter = Get-Process -Id $processId -ErrorAction Stop
    if ($gameAfter.ProcessName -ne 'fxgame' -or $gameAfter.StartTime.ToString('o') -ne $startTime) { throw 'The game process changed during measurement.' }
    $elapsedMs = $watch.Elapsed.TotalMilliseconds
    $processDeltaMs = [math]::Max(0, $gameAfter.TotalProcessorTime.TotalMilliseconds - $beforeProcessMs)
    $threadItems = foreach ($thread in @($gameAfter.Threads)) {
        if (-not $beforeThreads.ContainsKey([int]$thread.Id)) { continue }
        try {
            $delta = [math]::Max(0, $thread.TotalProcessorTime.TotalMilliseconds - [double]$beforeThreads[[int]$thread.Id])
            [ordered]@{ id = [int]$thread.Id; cpuMilliseconds = [math]::Round($delta, 1); oneCoreUtilizationPercent = [math]::Round(($delta / $elapsedMs) * 100, 1); state = [string]$thread.ThreadState; waitReason = try { [string]$thread.WaitReason } catch { '' } }
        } catch { }
    }
    $sorted = @($threadItems | Sort-Object oneCoreUtilizationPercent -Descending)
    $hottest = if ($sorted.Count) { $sorted[0] } else { $null }
    $equivalentCores = [math]::Round($processDeltaMs / $elapsedMs, 2)
    $logical = [Environment]::ProcessorCount
    $wholeMachinePercent = [math]::Round(($processDeltaMs / ($elapsedMs * $logical)) * 100, 1)
    $threadDeltaTotal = [double](($sorted | ForEach-Object { [double]$_.cpuMilliseconds } | Measure-Object -Sum).Sum)
    $threadCpuAccountedPercent = if ($processDeltaMs -gt 0) { [math]::Min(100.0, [math]::Round(($threadDeltaTotal / $processDeltaMs) * 100, 1)) } else { 100.0 }
    $measurementValid = -not ($equivalentCores -ge 0.25 -and ($null -eq $hottest -or [double]$hottest.oneCoreUtilizationPercent -le 0 -or $threadCpuAccountedPercent -lt 10))
    $dominantShare = if ($processDeltaMs -gt 0 -and $hottest) { [math]::Round(($hottest.cpuMilliseconds / $processDeltaMs) * 100, 1) } else { 0 }
    $classification = if (-not $measurementValid) { 'thread-sample-invalid' } elseif ($hottest -and $hottest.oneCoreUtilizationPercent -ge 80) { 'main-thread-saturated' } elseif ($hottest -and $hottest.oneCoreUtilizationPercent -ge 55) { 'main-thread-heavy' } else { 'not-saturated-in-this-sample' }
    $explanation = switch ($classification) {
        'thread-sample-invalid' { '游戏进程正在消耗 CPU，但本次线程明细没有覆盖到对应 CPU 时间，不能据此判断主线程是否饱和。请保持场景不变后重新测量。' }
        'main-thread-saturated' { '最忙线程接近占满一个逻辑处理器。这符合九阴多人场景由主线程对象、UI 和绘制提交限制最低帧的特征。' }
        'main-thread-heavy' { '最忙线程负载较高，但本样本尚未完全占满一个逻辑处理器；场景、帧率上限或等待 GPU/网络都可能影响结果。' }
        default { '本次样本没有看到最忙线程持续饱和，不能据此排除更重场景中的主线程瓶颈。' }
    }
    [ordered]@{
        measuredAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        durationSeconds = [math]::Round($elapsedMs / 1000, 2)
        processId = $processId
        processPriority = [string]$gameAfter.PriorityClass
        equivalentCpuCoresUsed = $equivalentCores
        processWholeMachinePercent = $wholeMachinePercent
        measurementValid = $measurementValid
        readableThreadCount = $sorted.Count
        activeThreadCount = @($sorted | Where-Object cpuMilliseconds -gt 0).Count
        threadCpuAccountedPercent = $threadCpuAccountedPercent
        hottestThread = $hottest
        dominantThreadCpuSharePercent = $dominantShare
        topThreads = @($sorted | Select-Object -First 8)
        classification = $classification
        explanation = $explanation
        gpu = Get-NvidiaSnapshot
        limitation = '线程 CPU 时间能确认单线程压力，但不是帧时间。最终收益仍需相同人数、相同镜头的前后帧时间对比。'
    }
}

Export-ModuleMember -Function Get-SynapseXDiagnosticSnapshot, Measure-GameThreadPressure
