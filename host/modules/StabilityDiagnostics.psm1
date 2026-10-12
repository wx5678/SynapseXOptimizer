$ErrorActionPreference = 'Stop'

$stabilityStateBase = if ([string]::IsNullOrWhiteSpace($env:SYNAPSEX_STATE_ROOT)) { Join-Path $env:LOCALAPPDATA 'SynapseX\state' } else { [IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT) }
$gpuPreferenceBackupRoot = Join-Path $stabilityStateBase 'gpu-preference-backups'
$gpuPreferenceRegistryPath = if ([string]::IsNullOrWhiteSpace($env:SYNAPSEX_GPU_PREFERENCE_REGISTRY)) { 'HKCU:\Software\Microsoft\DirectX\UserGpuPreferences' } else { [string]$env:SYNAPSEX_GPU_PREFERENCE_REGISTRY }

function Get-GameExecutablePath([string]$ExecutablePath) {
    if ([string]::IsNullOrWhiteSpace($ExecutablePath)) { throw 'Game executable path is required.' }
    $fullPath = [IO.Path]::GetFullPath($ExecutablePath.Trim().Trim('"'))
    if ([IO.Path]::GetExtension($fullPath) -ine '.exe') { throw 'The selected game target must be an .exe file.' }
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) { throw 'The selected game executable does not exist.' }
    $fullPath
}

function Get-GameGpuPreference([string]$ExecutablePath) {
    $fullPath = Get-GameExecutablePath $ExecutablePath
    $value = $null
    if (Test-Path -LiteralPath $gpuPreferenceRegistryPath) {
        $value = (Get-Item -LiteralPath $gpuPreferenceRegistryPath).GetValue($fullPath, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    }
    $mode = if ([string]$value -match '(?i)GpuPreference\s*=\s*2') { 'high-performance' } elseif ([string]$value -match '(?i)GpuPreference\s*=\s*1') { 'power-saving' } else { 'system-default' }
    [ordered]@{
        executablePath = $fullPath
        currentValue = if ($null -eq $value) { '' } else { [string]$value }
        mode = $mode
        applied = ($mode -eq 'high-performance')
        note = 'Windows 每应用 GPU 首选项。多显卡电脑可避免游戏误用核显；只有一张可用 GPU 时通常不会改变帧数。设置在下次启动游戏时生效。'
    }
}

function Set-GameHighPerformanceGpu([string]$ExecutablePath) {
    $state = Get-GameGpuPreference $ExecutablePath
    [void](New-Item -ItemType Directory -Path $gpuPreferenceBackupRoot -Force)
    $backupId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $metadata = [ordered]@{
        schemaVersion = 1
        backupId = $backupId
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        executablePath = [string]$state.executablePath
        existed = (-not [string]::IsNullOrWhiteSpace([string]$state.currentValue))
        value = [string]$state.currentValue
    }
    [IO.File]::WriteAllText((Join-Path $gpuPreferenceBackupRoot ($backupId + '.json')), ($metadata | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
    [void](New-Item -Path $gpuPreferenceRegistryPath -Force)
    [void](New-ItemProperty -LiteralPath $gpuPreferenceRegistryPath -Name ([string]$state.executablePath) -PropertyType String -Value 'GpuPreference=2;' -Force)
    [ordered]@{ ok = $true; backupId = $backupId; state = Get-GameGpuPreference ([string]$state.executablePath) }
}

function Restore-GameGpuPreference([string]$BackupId = 'latest') {
    $backups = @(Get-ChildItem -LiteralPath $gpuPreferenceBackupRoot -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object BaseName -Descending)
    if ($backups.Count -eq 0) { throw 'No SynapseX GPU preference backup exists.' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object BaseName -eq $BackupId | Select-Object -First 1 }
    if ($null -eq $selected) { throw "GPU preference backup not found: $BackupId" }
    $metadata = Get-Content -LiteralPath $selected.FullName -Raw | ConvertFrom-Json
    [void](New-Item -Path $gpuPreferenceRegistryPath -Force)
    if ([bool]$metadata.existed) {
        [void](New-ItemProperty -LiteralPath $gpuPreferenceRegistryPath -Name ([string]$metadata.executablePath) -PropertyType String -Value ([string]$metadata.value) -Force)
    } else {
        Remove-ItemProperty -LiteralPath $gpuPreferenceRegistryPath -Name ([string]$metadata.executablePath) -ErrorAction SilentlyContinue
    }
    [ordered]@{ ok = $true; backupId = $selected.BaseName; state = Get-GameGpuPreference ([string]$metadata.executablePath) }
}

function Get-SystemGameReadiness {
    $os = Get-CimInstance Win32_OperatingSystem
    $pageFiles = @(Get-CimInstance Win32_PageFileUsage -ErrorAction SilentlyContinue | ForEach-Object {
        [ordered]@{ name = [string]$_.Name; allocatedMB = [int]$_.AllocatedBaseSize; currentUsageMB = [int]$_.CurrentUsage; peakUsageMB = [int]$_.PeakUsage }
    })
    $disks = @(Get-PhysicalDisk -ErrorAction SilentlyContinue | ForEach-Object {
        [ordered]@{ name = [string]$_.FriendlyName; mediaType = [string]$_.MediaType; busType = [string]$_.BusType; health = [string]$_.HealthStatus; operationalStatus = [string](@($_.OperationalStatus) -join ', '); sizeGB = [math]::Round([double]$_.Size / 1GB, 0) }
    })
    $trimRaw = @(& (Join-Path $env:SystemRoot 'System32\fsutil.exe') behavior query DisableDeleteNotify 2>$null | ForEach-Object { [string]$_ })
    $trimEnabled = (@($trimRaw | Where-Object { $_ -match 'DisableDeleteNotify\s*=\s*0' }).Count -gt 0)
    $processor = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction SilentlyContinue
    $recommendations = @()
    if ($pageFiles.Count -eq 0) { $recommendations += '未检测到分页文件。内存耗尽时游戏或后台程序可能直接崩溃，建议保持 Windows 自动管理。' }
    if (@($disks | Where-Object { $_.health -ne 'Healthy' }).Count) { $recommendations += '检测到磁盘健康状态异常，应先备份数据并检查硬盘，而不是继续做性能参数调整。' }
    if (-not $trimEnabled) { $recommendations += '未确认 TRIM 已启用。SSD 长期写入性能可能受影响，请先核对文件系统与磁盘驱动支持。' }
    if ([double]$processor.PercentDPCTime -ge 3 -or [double]$processor.PercentInterruptTime -ge 5) { $recommendations += '当前 DPC/中断占用偏高，可能存在驱动或设备抢占；建议在卡顿发生时运行三秒抢占采样。' }
    if ($recommendations.Count -eq 0) { $recommendations += '分页文件、磁盘健康和 TRIM 未发现明显风险；这些项目通常不需要为了游戏手动修改。' }
    [ordered]@{
        capturedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        memory = [ordered]@{ totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1); freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1); pageFiles = $pageFiles }
        disks = $disks
        trim = [ordered]@{ enabled = $trimEnabled; raw = $trimRaw }
        scheduler = [ordered]@{ cpuPercent = if ($processor) { [double]$processor.PercentProcessorTime } else { $null }; dpcPercent = if ($processor) { [double]$processor.PercentDPCTime } else { $null }; interruptPercent = if ($processor) { [double]$processor.PercentInterruptTime } else { $null }; interruptsPerSecond = if ($processor) { [double]$processor.InterruptsPersec } else { $null } }
        recommendations = $recommendations
        note = '只读健康检查。不会关闭分页文件、TRIM、安全功能、核心停车或系统计时器。'
    }
}

function Measure-SystemContention([int]$Seconds = 3) {
    $Seconds = [math]::Max(2, [math]::Min($Seconds, 10))
    $logical = [math]::Max(1, [Environment]::ProcessorCount)
    $before = @{}
    foreach ($process in @(Get-Process -ErrorAction SilentlyContinue)) {
        try { $before[$process.Id] = [double]$process.TotalProcessorTime.TotalMilliseconds } catch { }
    }
    $samples = @()
    $started = [DateTime]::UtcNow
    for ($index = 0; $index -lt ($Seconds * 2); $index++) {
        Start-Sleep -Milliseconds 500
        $counter = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction SilentlyContinue
        if ($counter) { $samples += [ordered]@{ cpu = [double]$counter.PercentProcessorTime; dpc = [double]$counter.PercentDPCTime; interrupt = [double]$counter.PercentInterruptTime; interrupts = [double]$counter.InterruptsPersec } }
    }
    $elapsed = [math]::Max(0.1, ([DateTime]::UtcNow - $started).TotalSeconds)
    $processes = foreach ($process in @(Get-Process -ErrorAction SilentlyContinue)) {
        if (-not $before.ContainsKey($process.Id)) { continue }
        try {
            $delta = [math]::Max(0, [double]$process.TotalProcessorTime.TotalMilliseconds - [double]$before[$process.Id])
            if ($delta -lt 5) { continue }
            [ordered]@{ processName = "$($process.ProcessName).exe"; processId = [int]$process.Id; machineCpuPercent = [math]::Round(($delta / 1000) / ($elapsed * $logical) * 100, 1); oneCorePercent = [math]::Round(($delta / 1000) / $elapsed * 100, 1); workingSetMB = [math]::Round($process.WorkingSet64 / 1MB, 0) }
        } catch { }
    }
    $average = { param([string]$Name) if ($samples.Count) { [math]::Round(((@($samples | ForEach-Object { [double]$_[$Name] }) | Measure-Object -Average).Average), 2) } else { $null } }
    [ordered]@{
        measuredAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        durationSeconds = [math]::Round($elapsed, 2)
        averageCpuPercent = & $average 'cpu'
        averageDpcPercent = & $average 'dpc'
        averageInterruptPercent = & $average 'interrupt'
        averageInterruptsPerSecond = & $average 'interrupts'
        topProcesses = @($processes | Sort-Object { [double]$_['machineCpuPercent'] } -Descending | Select-Object -First 12)
        classification = if ((& $average 'dpc') -ge 3 -or (& $average 'interrupt') -ge 5) { 'driver-interrupt-pressure' } elseif ((& $average 'cpu') -ge 85) { 'cpu-contention' } else { 'no-major-system-contention' }
        note = '短时采样用于寻找游戏外部的 CPU、DPC 与中断抢占。一次正常结果不能排除只在特定战斗场景出现的驱动尖峰。'
    }
}

function Test-NetworkProbeTarget([string]$Target) {
    $value = $Target.Trim()
    if ($value -notmatch '^[A-Za-z0-9][A-Za-z0-9\.\-:]{0,252}$') { throw 'Invalid network probe target.' }
    try { [void][Net.Dns]::GetHostAddresses($value) } catch { throw 'The network probe target cannot be resolved.' }
    $value
}

function Get-NetworkAdapterHealth {
    $items = foreach ($adapter in @(Get-NetAdapter -ErrorAction SilentlyContinue | Sort-Object Status, Name)) {
        $statistics = Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction SilentlyContinue
        [ordered]@{
            name = [string]$adapter.Name
            description = [string]$adapter.InterfaceDescription
            status = [string]$adapter.Status
            linkSpeed = [string]$adapter.LinkSpeed
            receivedErrors = if ($statistics) { [long]$statistics.ReceivedPacketErrors } else { 0 }
            outboundErrors = if ($statistics) { [long]$statistics.OutboundPacketErrors } else { 0 }
            receivedDiscards = if ($statistics) { [long]$statistics.ReceivedDiscardedPackets } else { 0 }
            outboundDiscards = if ($statistics) { [long]$statistics.OutboundDiscardedPackets } else { 0 }
            receivedBytes = if ($statistics) { [long]$statistics.ReceivedBytes } else { 0 }
            sentBytes = if ($statistics) { [long]$statistics.SentBytes } else { 0 }
            healthy = (-not $statistics -or (([long]$statistics.ReceivedPacketErrors + [long]$statistics.OutboundPacketErrors + [long]$statistics.ReceivedDiscardedPackets + [long]$statistics.OutboundDiscardedPackets) -eq 0))
        }
    }
    [ordered]@{ capturedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'); items = @($items); issueCount = @($items | Where-Object { -not $_.healthy }).Count; note = '错误和丢弃计数来自网卡驱动累计值。持续增长才有诊断意义；历史非零但不再增长不代表当前网络仍异常。' }
}

function Measure-NetworkStability([string]$Target = '223.5.5.5', [int]$Count = 20) {
    $targetValue = Test-NetworkProbeTarget $Target
    $Count = [math]::Max(5, [math]::Min($Count, 60))
    $results = @()
    $ping = New-Object Net.NetworkInformation.Ping
    try {
        for ($index = 0; $index -lt $Count; $index++) {
            try {
                $reply = $ping.Send($targetValue, 650)
                if ($reply.Status -eq [Net.NetworkInformation.IPStatus]::Success) { $results += [double]$reply.RoundtripTime }
            } catch { }
            if ($index -lt ($Count - 1)) { Start-Sleep -Milliseconds 80 }
        }
    } finally { $ping.Dispose() }
    $sorted = @($results | Sort-Object)
    $differences = for ($index = 1; $index -lt $results.Count; $index++) { [math]::Abs([double]$results[$index] - [double]$results[$index - 1]) }
    $average = if ($results.Count) { [math]::Round((($results | Measure-Object -Average).Average), 1) } else { $null }
    $jitter = if (@($differences).Count) { [math]::Round((($differences | Measure-Object -Average).Average), 1) } else { $null }
    $p95 = if ($sorted.Count) { [double]$sorted[[math]::Min($sorted.Count - 1, [math]::Ceiling($sorted.Count * 0.95) - 1)] } else { $null }
    $loss = [math]::Round((($Count - $results.Count) / [double]$Count) * 100, 1)
    [ordered]@{
        testedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        target = $targetValue
        sent = $Count
        received = $results.Count
        lossPercent = $loss
        minimumMs = if ($sorted.Count) { [double]$sorted[0] } else { $null }
        averageMs = $average
        p95Ms = $p95
        maximumMs = if ($sorted.Count) { [double]$sorted[-1] } else { $null }
        jitterMs = $jitter
        classification = if ($loss -gt 0) { 'packet-loss' } elseif ($jitter -ge 15) { 'high-jitter' } elseif ($p95 -ne $null -and $average -ne $null -and ($p95 - $average) -ge 20) { 'latency-spikes' } else { 'stable' }
        note = '连续 ICMP 样本用于观察丢包、抖动和尖峰。服务器禁用 ICMP 时会全部超时，不能据此认定真实游戏连接丢包。'
    }
}

function Trace-NetworkPath([string]$Target = '223.5.5.5') {
    $targetValue = Test-NetworkProbeTarget $Target
    $lines = @(& (Join-Path $env:SystemRoot 'System32\tracert.exe') '-d' '-h' '12' '-w' '350' $targetValue 2>&1 | ForEach-Object { [string]$_ })
    [ordered]@{ tracedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'); target = $targetValue; raw = @($lines); note = '路由跟踪只用于定位从哪一跳开始超时或延迟上升。中间路由器不响应 ICMP 很常见，单个星号不等于该跳发生丢包。' }
}

Export-ModuleMember -Function Get-GameGpuPreference, Set-GameHighPerformanceGpu, Restore-GameGpuPreference, Get-SystemGameReadiness, Measure-SystemContention, Get-NetworkAdapterHealth, Measure-NetworkStability, Trace-NetworkPath
