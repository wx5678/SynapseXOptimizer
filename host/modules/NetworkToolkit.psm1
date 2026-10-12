$ErrorActionPreference = 'Stop'

$toolkitStateBase = if ([string]::IsNullOrWhiteSpace($env:SYNAPSEX_STATE_ROOT)) { Join-Path $env:LOCALAPPDATA 'SynapseX\state' } else { [IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT) }
$dnsBackupRoot = Join-Path $toolkitStateBase 'dns-backups'
$hostsBackupRoot = Join-Path $toolkitStateBase 'hosts-backups'
$nicBackupRoot = Join-Path $toolkitStateBase 'nic-backups'
$mtuBackupRoot = Join-Path $toolkitStateBase 'mtu-backups'
$tcpBackupRoot = Join-Path $toolkitStateBase 'tcp-backups'
$operationLogPath = Join-Path $toolkitStateBase 'operations.jsonl'
$gameEndpointCachePath = Join-Path $toolkitStateBase 'game-endpoints.json'
$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'

function Test-ToolkitElevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Write-ToolkitOperation([string]$Action, [string]$Result, [string]$BackupId, $Detail) {
    [void](New-Item -ItemType Directory -Path $toolkitStateBase -Force)
    $entry = [ordered]@{
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        category = 'network'
        action = $Action
        result = $Result
        backupId = $BackupId
        detail = $Detail
    }
    [IO.File]::AppendAllText($operationLogPath, (($entry | ConvertTo-Json -Depth 8 -Compress) + [Environment]::NewLine), (New-Object Text.UTF8Encoding($false)))
}

function Get-DnsPresetDefinitions {
    @(
        [pscustomobject]@{ id = 'cloudflare'; name = 'Cloudflare'; primary = '1.1.1.1'; secondary = '1.0.0.1'; note = '全球公共 DNS；实际速度取决于本地线路。' },
        [pscustomobject]@{ id = 'alidns'; name = '阿里公共 DNS'; primary = '223.5.5.5'; secondary = '223.6.6.6'; note = '中国大陆常用公共 DNS。' },
        [pscustomobject]@{ id = 'dnspod'; name = 'DNSPod Public+'; primary = '119.29.29.29'; secondary = '182.254.116.116'; note = '中国大陆常用公共 DNS。' },
        [pscustomobject]@{ id = 'google'; name = 'Google Public DNS'; primary = '8.8.8.8'; secondary = '8.8.4.4'; note = '部分网络环境可达性或时延可能不理想。' },
        [pscustomobject]@{ id = '114dns'; name = '114 DNS'; primary = '114.114.114.114'; secondary = '114.114.115.115'; note = '中国大陆常用公共 DNS。' }
    )
}

function Get-AcceleratorCompatibility {
    $definitions = @(
        [pscustomobject]@{ name = '网易 UU'; pattern = '(?i)^(uu|uuplugin|uu_boost|uubooster)' },
        [pscustomobject]@{ name = '迅游'; pattern = '(?i)(xunyou|xlacc|xyacc)' },
        [pscustomobject]@{ name = '雷神'; pattern = '(?i)(leigod|leishen)' },
        [pscustomobject]@{ name = '奇游'; pattern = '(?i)(qiyou|qiyouacc)' },
        [pscustomobject]@{ name = '27 加速器'; pattern = '(?i)(27game|27acc)' },
        [pscustomobject]@{ name = 'Netch'; pattern = '(?i)^netch' },
        [pscustomobject]@{ name = 'Clash / Mihomo'; pattern = '(?i)(clash|mihomo)' },
        [pscustomobject]@{ name = 'ExitLag'; pattern = '(?i)^exitlag' },
        [pscustomobject]@{ name = 'WTFast'; pattern = '(?i)^wtfast' }
    )
    $processes = @(Get-Process -ErrorAction SilentlyContinue)
    $detectedItems = @()
    foreach ($definition in $definitions) {
        $names = @($processes | Where-Object { $_.ProcessName -match $definition.pattern } | Select-Object -ExpandProperty ProcessName -Unique)
        if ($names.Count -gt 0) {
            $detectedItems += [pscustomobject][ordered]@{ name = $definition.name; processes = $names }
        }
    }
    $virtualPattern = '(?i)(wintun|tap-|tun |wireguard|clash|mihomo|netch|uu|leigod|qiyou|xunyou|加速器|虚拟)'
    $virtualAdapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Name -match $virtualPattern -or $_.InterfaceDescription -match $virtualPattern } | ForEach-Object { [string]$_.Name })
    [pscustomobject][ordered]@{
        detected = ($detectedItems.Count -gt 0)
        items = $detectedItems
        virtualAdapters = $virtualAdapters
        mode = if ($detectedItems.Count -gt 0) { 'automatic-compatible' } else { 'not-detected' }
        note = if ($detectedItems.Count -gt 0) {
            '已检测到正在运行的加速器或代理。SynapseX 不安装封包驱动，因此无需开启 WinDivert 兼容模式；网卡高级优化会优先选择承载流量的物理网卡。'
        } else {
            '未检测到正在运行的常见加速器。启动加速器后可重新检测；无需单独开启兼容模式。'
        }
    }
}

function Get-CachedGameEndpoints {
    if (-not (Test-Path -LiteralPath $gameEndpointCachePath -PathType Leaf)) { return @() }
    try {
        $document = [IO.File]::ReadAllText($gameEndpointCachePath, [Text.Encoding]::UTF8) | ConvertFrom-Json
        @($document.items | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.address) })
    } catch { @() }
}

function Update-GameEndpointCache($Connections, [bool]$AcceleratorDetected) {
    $now = (Get-Date).ToUniversalTime()
    $items = New-Object Collections.Generic.List[object]
    foreach ($cached in @(Get-CachedGameEndpoints)) {
        $lastSeen = [datetime]::MinValue
        if (-not [datetime]::TryParse([string]$cached.lastSeen, [ref]$lastSeen) -or $lastSeen.ToUniversalTime() -lt $now.AddDays(-30)) { continue }
        [void]$items.Add([pscustomobject][ordered]@{
            address = [string]$cached.address
            ports = @($cached.ports | ForEach-Object { [int]$_ } | Sort-Object -Unique)
            firstSeen = [string]$cached.firstSeen
            lastSeen = [string]$cached.lastSeen
            seenCount = [int]$cached.seenCount
            acceleratorDetected = [bool]$cached.acceleratorDetected
        })
    }
    foreach ($connection in @($Connections)) {
        $remote = [string]$connection.RemoteAddress
        $port = [int]$connection.RemotePort
        $existing = @($items | Where-Object address -eq $remote | Select-Object -First 1)
        if ($existing.Count -eq 0) {
            $existing = @([pscustomobject][ordered]@{ address=$remote; ports=@($port); firstSeen=$now.ToString('o'); lastSeen=$now.ToString('o'); seenCount=1; acceleratorDetected=$AcceleratorDetected })
            [void]$items.Add($existing[0])
        } else {
            $existing[0].ports = @($existing[0].ports + $port | Sort-Object -Unique)
            $existing[0].lastSeen = $now.ToString('o')
            $existing[0].seenCount = [int]$existing[0].seenCount + 1
            $existing[0].acceleratorDetected = ([bool]$existing[0].acceleratorDetected -or $AcceleratorDetected)
        }
    }
    $kept = @($items | Sort-Object @{Expression='lastSeen';Descending=$true}, @{Expression='seenCount';Descending=$true} | Select-Object -First 20)
    if (@($Connections).Count -gt 0 -or $kept.Count -gt 0) {
        [void](New-Item -ItemType Directory -Path $toolkitStateBase -Force)
        $document = [ordered]@{ schemaVersion=1; updatedAt=$now.ToString('o'); items=$kept }
        [IO.File]::WriteAllText($gameEndpointCachePath, ($document | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
    }
    $kept
}

function Get-NetworkProbeTargets {
    $targets = New-Object Collections.Generic.List[object]
    $seen = @{}
    $addTarget = {
        param([string]$Target, [string]$Label, [string]$Kind, [string]$Note)
        if ([string]::IsNullOrWhiteSpace($Target) -or $seen.ContainsKey($Target)) { return }
        $seen[$Target] = $true
        [void]$targets.Add([pscustomobject][ordered]@{ target = $Target; label = $Label; kind = $Kind; note = $Note })
    }

    $gameProcesses = @(Get-Process -Name fxgame -ErrorAction SilentlyContinue)
    $accelerator = Get-AcceleratorCompatibility
    $activeConnections = @()
    foreach ($process in $gameProcesses) {
        $connections = @(Get-NetTCPConnection -OwningProcess $process.Id -ErrorAction SilentlyContinue | Where-Object { $_.State -in @('Established','SynSent','CloseWait','FinWait1','FinWait2') })
        foreach ($connection in $connections) {
            $remote = [string]$connection.RemoteAddress
            if ($remote -notmatch '^\d{1,3}(\.\d{1,3}){3}$' -or $remote -match '^(0\.|127\.|169\.254\.)') { continue }
            $activeConnections += $connection
            $activeLabel = if ([bool]$accelerator.detected) { "九阴当前加速链路 {0}:{1}" -f $remote, $connection.RemotePort } else { "九阴当前连接 {0}:{1}" -f $remote, $connection.RemotePort }
            & $addTarget $remote $activeLabel 'jiuyin-active' $(if ([bool]$accelerator.detected) { '由 fxgame.exe 当前 TCP 连接读取；检测到加速器，该地址更可能是加速节点。' } else { '由 fxgame.exe 当前 TCP 连接读取；未检测到常见加速器，可作为游戏远端候选地址。' })
        }
    }

    $cachedEndpoints = @(Update-GameEndpointCache $activeConnections ([bool]$accelerator.detected))
    foreach ($cached in $cachedEndpoints) {
        if ($seen.ContainsKey([string]$cached.address)) { continue }
        $ports = @($cached.ports | ForEach-Object { [string]$_ }) -join ','
        $cachedLabel = "九阴最近连接 {0}{1}" -f $cached.address, $(if ($ports) { ":$ports" } else { '' })
        $cachedNote = "曾由 fxgame.exe 连接读取；最后发现于 {0}。{1}" -f ([string]$cached.lastSeen), $(if ([bool]$cached.acceleratorDetected) { '抓取时检测到加速器，可能是加速节点。' } else { '抓取时未检测到常见加速器。' })
        & $addTarget ([string]$cached.address) $cachedLabel 'jiuyin-recent' $cachedNote
    }

    $defaultRoute = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
    if ($defaultRoute -and -not [string]::IsNullOrWhiteSpace([string]$defaultRoute.NextHop) -and [string]$defaultRoute.NextHop -ne '0.0.0.0') {
        & $addTarget ([string]$defaultRoute.NextHop) ("本地默认网关 {0}" -f $defaultRoute.NextHop) 'default-gateway' '用于判断电脑到路由器之间的局域网稳定性。'
    }
    & $addTarget '223.5.5.5' '阿里公共 DNS · 223.5.5.5' 'public' '中国大陆常用公网连通性目标。'
    & $addTarget '119.29.29.29' 'DNSPod · 119.29.29.29' 'public' '中国大陆常用公网连通性目标。'
    & $addTarget '114.114.114.114' '114 DNS · 114.114.114.114' 'public' '中国大陆常用公网连通性目标。'
    & $addTarget '1.1.1.1' 'Cloudflare · 1.1.1.1' 'public' '境外公共连通性目标，部分线路可能不响应。'
    $targetItems = $targets.ToArray()
    $gameConnectionCount = @($targetItems | Where-Object kind -eq 'jiuyin-active').Count
    $cachedConnectionCount = @($cachedEndpoints).Count
    [pscustomobject][ordered]@{
        capturedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        gameRunning = ($gameProcesses.Count -gt 0)
        gameConnectionCount = $gameConnectionCount
        cachedConnectionCount = $cachedConnectionCount
        items = $targetItems
        note = if ($gameProcesses.Count -eq 0 -and $cachedConnectionCount -gt 0) { "九阴真经未运行，已保留最近抓取的 $cachedConnectionCount 个远端地址。" } elseif ($gameProcesses.Count -eq 0) { '九阴真经未运行，尚无历史地址。软件会在游戏运行期间后台抓取并保存 fxgame.exe 的远端连接。' } elseif ($gameConnectionCount -eq 0 -and $cachedConnectionCount -gt 0) { "已检测到九阴真经，本次暂未发现 TCP 远端；当前显示此前保存的 $cachedConnectionCount 个地址。" } elseif ($gameConnectionCount -eq 0) { '已检测到九阴真经，但暂未发现可用 TCP 远端；软件会继续后台抓取。' } else { "已从当前 fxgame.exe 连接中读取 $gameConnectionCount 个远端地址并保存。" }
    }
}

function Get-TcpProfileDefinitions {
    @(
        [pscustomobject]@{ id='balanced'; name='均衡网络'; description='保持 Windows 自动调优，启用 RSS、RSC 与 TCP Fast Open，关闭时间戳。'; itemIds=@('rss-enabled','autotuning-normal','fast-open-enabled','timestamps-disabled','rsc-enabled') },
        [pscustomobject]@{ id='game-latency'; name='游戏低延迟'; description='在均衡档基础上设置 300 ms 初始 RTO，并对所选网卡写入 TCP 即时确认参数。'; itemIds=@('rss-enabled','autotuning-normal','fast-open-enabled','timestamps-disabled','rsc-enabled','initial-rto-300','tcp-no-delay','network-throttling-disabled','system-responsiveness-zero') },
        [pscustomobject]@{ id='throughput'; name='高吞吐'; description='在均衡档基础上确保系统 TCP 任务卸载启用，适合下载和高速局域网传输。'; itemIds=@('rss-enabled','autotuning-normal','fast-open-enabled','timestamps-disabled','rsc-enabled','task-offload-enabled') }
    )
}

function Get-TcpOptimizationDefinitions {
    @(
        [pscustomobject]@{ id='rss-enabled'; name='启用 RSS'; description='让多核处理器分担网络接收中断，避免全部接收流量集中到单个核心。'; tradeoff='网卡和驱动必须支持 RSS。'; kind='netsh'; token='rss'; desired='enabled' },
        [pscustomobject]@{ id='autotuning-normal'; name='TCP 接收窗口自动调优'; description='把 Windows TCP 接收窗口自动调优设为 Normal，由系统按链路带宽和往返时间动态调整。'; tradeoff='不会固定 TCP 窗口大小。'; kind='netsh'; token='autotuninglevel'; desired='normal' },
        [pscustomobject]@{ id='fast-open-enabled'; name='启用 TCP Fast Open'; description='允许受支持的连接在握手阶段携带数据，减少重复连接的建立开销。'; tradeoff='只对服务器和网络路径同时支持的连接生效。'; kind='netsh'; token='fastopen'; desired='enabled' },
        [pscustomobject]@{ id='timestamps-disabled'; name='关闭 TCP 时间戳'; description='关闭 RFC 1323 TCP 时间戳选项，减少每个 TCP 包的可选字段。'; tradeoff='超高速、长距离链路可能更适合保持时间戳。'; kind='netsh'; token='timestamps'; desired='disabled' },
        [pscustomobject]@{ id='rsc-enabled'; name='启用 RSC'; description='允许 Windows 合并连续接收段，降低高流量场景的 CPU 占用。'; tradeoff='这是吞吐优化，不直接降低游戏服务器延迟。'; kind='netsh'; token='rsc'; desired='enabled' },
        [pscustomobject]@{ id='initial-rto-300'; name='初始 RTO 300 ms'; description='把新 TCP 连接首次重传超时设为 300 毫秒。'; tradeoff='只影响发生丢包并需要重传的新 TCP 连接。'; kind='netsh'; token='initialrto'; desired='300' },
        [pscustomobject]@{ id='tcp-no-delay'; name='TCP 即时确认'; description='对所选网卡写入 TcpNoDelay=1、TcpAckFrequency=1、TcpDelAckTicks=0。'; tradeoff='只影响使用该网卡且遵循这些 TCP 接口参数的程序；可能增加小数据包数量。'; kind='interface-registry'; token=''; desired='1 / 1 / 0' },
        [pscustomobject]@{ id='network-throttling-disabled'; name='关闭多媒体网络节流'; description='把 NetworkThrottlingIndex 设为 0xFFFFFFFF，取消多媒体系统配置中的网络节流。'; tradeoff='属于整机设置，所有用户会共享该值。'; kind='registry'; token=''; desired='0xFFFFFFFF' },
        [pscustomobject]@{ id='system-responsiveness-zero'; name='前台任务保留 100%'; description='把 Multimedia SystemProfile 的 SystemResponsiveness 设为 0。'; tradeoff='后台多媒体任务不再获得该项预留比例。'; kind='registry'; token=''; desired='0' },
        [pscustomobject]@{ id='task-offload-enabled'; name='启用 TCP/IP 任务卸载'; description='允许 Windows 把受支持的校验和与分段工作交给网卡硬件。'; tradeoff='依赖网卡驱动正确实现卸载功能。'; kind='offload'; token=''; desired='Enabled' }
    )
}

function Get-NetshTcpTokens {
    $dump = @(& netsh interface tcp dump 2>&1 | ForEach-Object { [string]$_ })
    $line = $dump | Where-Object { $_ -match '(?i)\brss=' -and $_ -match '(?i)\bautotuninglevel=' } | Select-Object -First 1
    $tokens = [ordered]@{}
    if ($line) {
        foreach ($match in [regex]::Matches([string]$line, '(?i)\b([a-z0-9]+)=([a-z0-9]+)\b')) {
            $tokens[$match.Groups[1].Value.ToLowerInvariant()] = $match.Groups[2].Value.ToLowerInvariant()
        }
    }
    if ($tokens.Count -eq 0) {
        $show = @(& netsh interface tcp show global 2>&1 | ForEach-Object { [string]$_ })
        $values = @($show | ForEach-Object { if ($_ -match ':\s*([A-Za-z0-9]+)\s*$') { $matches[1].ToLowerInvariant() } })
        $orderedNames = @('rss','autotuninglevel','congestionprovider','ecncapability','timestamps','initialrto','rsc','nonsackrttresiliency','maxsynretransmissions','fastopen','fastopenfallback','hystart','prr','pacingprofile')
        for ($index = 0; $index -lt [math]::Min($values.Count, $orderedNames.Count); $index++) { $tokens[$orderedNames[$index]] = $values[$index] }
        if ($tokens.Count) { $line = 'set global ' + (($tokens.GetEnumerator() | ForEach-Object { $_.Key + '=' + $_.Value }) -join ' ') }
    }
    [ordered]@{ line=[string]$line; tokens=$tokens; raw=$dump }
}

function Get-RegistryValueState([string]$Path, [string]$Name) {
    $valueExists = $false; $value = $null; $kind = 'DWord'
    if (Test-Path -LiteralPath $Path) {
        try {
            $key = Get-Item -LiteralPath $Path -ErrorAction Stop
            $value = $key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
            $valueExists = $null -ne $value
            if ($valueExists) { $kind = [string]$key.GetValueKind($Name) }
        } catch { }
    }
    [ordered]@{ path=$Path; name=$Name; exists=$valueExists; kind=$kind; value=$value }
}

function Restore-RegistryValueState($State) {
    $path = [string]$State.path; $name = [string]$State.name
    if ([bool]$State.exists) {
        [void](New-Item -ItemType Directory -Path $path -Force)
        New-ItemProperty -LiteralPath $path -Name $name -Value $State.value -PropertyType ([string]$State.kind) -Force | Out-Null
    } elseif (Test-Path -LiteralPath $path) {
        Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
    }
}

function Get-TcpRegistryTargets([string]$InterfaceAlias) {
    $targets = @(
        [ordered]@{ path='HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'; name='NetworkThrottlingIndex' },
        [ordered]@{ path='HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'; name='SystemResponsiveness' },
        [ordered]@{ path='HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters'; name='DisableTaskOffload' }
    )
    if (-not [string]::IsNullOrWhiteSpace($InterfaceAlias)) {
        $adapter = Get-NetAdapter -Name $InterfaceAlias -ErrorAction Stop
        $interfacePath = Join-Path 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces' ([guid]$adapter.InterfaceGuid).ToString('B')
        $targets += @(
            [ordered]@{ path=$interfacePath; name='TcpNoDelay' },
            [ordered]@{ path=$interfacePath; name='TcpAckFrequency' },
            [ordered]@{ path=$interfacePath; name='TcpDelAckTicks' }
        )
    }
    @($targets)
}

function ConvertTo-ToolkitDword($Value) {
    # Registry DWORDs are returned as signed Int32 by Windows PowerShell.
    # Preserve their 32 bits instead of casting -1 directly to UInt32.
    if ($null -eq $Value) { return $null }
    [long]$number = 0
    if (-not [long]::TryParse([string]$Value, [ref]$number)) { return $null }
    if ($number -lt [int]::MinValue -or $number -gt [uint32]::MaxValue) { return $null }
    [long]($number -band 4294967295L)
}

function Get-TcpOptimizationState([string]$InterfaceAlias = '') {
    $netsh = Get-NetshTcpTokens
    $offload = Get-NetOffloadGlobalSetting -ErrorAction SilentlyContinue
    $registryStates = @{}
    foreach ($target in @(Get-TcpRegistryTargets -InterfaceAlias $InterfaceAlias)) {
        $state = Get-RegistryValueState -Path ([string]$target.path) -Name ([string]$target.name)
        $registryStates[[string]$target.name] = $state
    }
    $items = foreach ($definition in Get-TcpOptimizationDefinitions) {
        $currentValue = '未检测'; $matched = $false
        switch ([string]$definition.id) {
            'rss-enabled' { $currentValue=[string]$netsh.tokens.rss; $matched=$currentValue -eq 'enabled' }
            'autotuning-normal' { $currentValue=[string]$netsh.tokens.autotuninglevel; $matched=$currentValue -eq 'normal' }
            'fast-open-enabled' { $currentValue=[string]$netsh.tokens.fastopen; $matched=$currentValue -eq 'enabled' }
            'timestamps-disabled' { $currentValue=[string]$netsh.tokens.timestamps; $matched=$currentValue -eq 'disabled' }
            'rsc-enabled' { $currentValue=[string]$netsh.tokens.rsc; $matched=$currentValue -eq 'enabled' }
            'initial-rto-300' { $currentValue=[string]$netsh.tokens.initialrto; $matched=$currentValue -eq '300' }
            'tcp-no-delay' {
                $values=@($registryStates.TcpNoDelay,$registryStates.TcpAckFrequency,$registryStates.TcpDelAckTicks)
                $displayValues=@($values | ForEach-Object { if ([bool]$_.exists) { [string]$_.value } else { '未设置' } })
                $currentValue=if ([string]::IsNullOrWhiteSpace($InterfaceAlias)) {'请选择网卡'} else { $displayValues -join ' / ' }
                $matched=($values.Count -eq 3 -and [bool]$values[0].exists -and [bool]$values[1].exists -and [bool]$values[2].exists -and [int]$values[0].value -eq 1 -and [int]$values[1].value -eq 1 -and [int]$values[2].value -eq 0)
            }
            'network-throttling-disabled' { $dword=ConvertTo-ToolkitDword $registryStates.NetworkThrottlingIndex.value; $currentValue=if ($null -eq $dword) {'未设置或值无效'} elseif ($dword -eq 4294967295L) {'不限制 (0xFFFFFFFF)'} else {[string]$dword}; $matched=([bool]$registryStates.NetworkThrottlingIndex.exists -and $null -ne $dword -and $dword -eq 4294967295L) }
            'system-responsiveness-zero' { $currentValue=[string]$registryStates.SystemResponsiveness.value; $matched=([bool]$registryStates.SystemResponsiveness.exists -and [int]$registryStates.SystemResponsiveness.value -eq 0) }
            'task-offload-enabled' { $currentValue=if ($offload) {[string]$offload.TaskOffload} else {'未检测'}; $matched=$currentValue -eq 'Enabled' }
        }
        [ordered]@{ id=$definition.id; name=$definition.name; description=$definition.description; tradeoff=$definition.tradeoff; desiredValue=$definition.desired; currentValue=$currentValue; matches=$matched }
    }
    [ordered]@{ interfaceAlias=$InterfaceAlias; profiles=@(Get-TcpProfileDefinitions); items=@($items); netshGlobalLine=[string]$netsh.line }
}

function Get-TcpGlobalState([string]$InterfaceAlias = '') {
    $output = @(& netsh interface tcp show global 2>&1 | ForEach-Object { [string]$_ })
    [ordered]@{ raw=@($output | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }); note='显示 netsh 的真实全局状态；应用方案后会重新读取并核对目标值。'; optimization=Get-TcpOptimizationState -InterfaceAlias $InterfaceAlias }
}

function Get-QosPolicyAudit {
    $policies = @(Get-NetQosPolicy -PolicyStore ActiveStore -ErrorAction SilentlyContinue | ForEach-Object {
        [ordered]@{
            name = [string]$_.Name
            appPathNameMatchCondition = [string]$_.AppPathNameMatchCondition
            ipProtocol = [string]$_.IPProtocol
            networkProfile = [string]$_.NetworkProfile
            dscpAction = if ($null -eq $_.DSCPAction) { $null } else { [int]$_.DSCPAction }
            throttleRateActionBitsPerSecond = $_.ThrottleRateActionBitsPerSecond
            gameRelated = (([string]$_.AppPathNameMatchCondition -match '(?i)fxgame|9yin') -or ([string]$_.Name -match '^SynapseX_Game_'))
            managedBySynapseX = ([string]$_.Name -match '^SynapseX_Game_')
        }
    })
    [ordered]@{
        totalCount = $policies.Count
        gamePolicyCount = @($policies | Where-Object gameRelated).Count
        items = $policies
        note = 'DSCP 只是数据包标记；路由器和运营商是否采用该标记不受本机保证。'
    }
}

function Set-TcpOptimizationProfile([string]$InterfaceAlias, [string]$ProfileId, [string[]]$ItemIds = @()) {
    if (-not (Test-ToolkitElevated)) { throw 'Administrator privileges are required to change TCP settings.' }
    $profile = Get-TcpProfileDefinitions | Where-Object id -eq $ProfileId | Select-Object -First 1
    if ($null -eq $profile -and @($ItemIds).Count -eq 0) { throw 'Unknown TCP profile.' }
    $selectedIds = if (@($ItemIds).Count) { @($ItemIds | Select-Object -Unique) } else { @($profile.itemIds) }
    $definitions = @(Get-TcpOptimizationDefinitions)
    $unknown = @($selectedIds | Where-Object { $_ -notin @($definitions.id) })
    if ($unknown.Count) { throw ('Unknown TCP optimization item: ' + ($unknown -join ', ')) }
    if ('tcp-no-delay' -in $selectedIds) {
        if ([string]::IsNullOrWhiteSpace($InterfaceAlias)) { throw 'A network adapter is required for TCP immediate acknowledgement.' }
        $adapter = Get-NetAdapter -Name $InterfaceAlias -ErrorAction Stop
        if ([string]$adapter.Status -ne 'Up') { throw 'The selected network adapter is not active.' }
    }

    [void](New-Item -ItemType Directory -Path $tcpBackupRoot -Force)
    $backupId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $netsh = Get-NetshTcpTokens
    if ([string]::IsNullOrWhiteSpace([string]$netsh.line)) { throw 'Unable to capture the current TCP global configuration.' }
    $registry = @(Get-TcpRegistryTargets -InterfaceAlias $InterfaceAlias | ForEach-Object { Get-RegistryValueState -Path ([string]$_.path) -Name ([string]$_.name) })
    $offloadBefore = Get-NetOffloadGlobalSetting -ErrorAction SilentlyContinue
    $snapshot = [ordered]@{ schemaVersion=1; backupId=$backupId; createdAt=(Get-Date).ToUniversalTime().ToString('o'); interfaceAlias=$InterfaceAlias; profileId=$ProfileId; itemIds=$selectedIds; netshGlobalLine=[string]$netsh.line; taskOffload=if ($offloadBefore) { [string]$offloadBefore.TaskOffload } else { '' }; registry=$registry }
    [IO.File]::WriteAllText((Join-Path $tcpBackupRoot ($backupId + '.json')), ($snapshot | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))

    $netshTokens = @()
    foreach ($id in $selectedIds) {
        $definition = $definitions | Where-Object id -eq $id | Select-Object -First 1
        if ([string]$definition.kind -eq 'netsh') { $netshTokens += (([string]$definition.token) + '=' + ([string]$definition.desired)) }
    }
    if ($netshTokens.Count) {
        $result = @(& netsh interface tcp set global @netshTokens 2>&1)
        if ($LASTEXITCODE -ne 0) { throw ('TCP global setting failed: ' + ($result -join ' ')) }
    }
    if ('tcp-no-delay' -in $selectedIds) {
        $adapter = Get-NetAdapter -Name $InterfaceAlias -ErrorAction Stop
        $path = Join-Path 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces' ([guid]$adapter.InterfaceGuid).ToString('B')
        [void](New-Item -ItemType Directory -Path $path -Force)
        New-ItemProperty -LiteralPath $path -Name TcpNoDelay -Value 1 -PropertyType DWord -Force | Out-Null
        New-ItemProperty -LiteralPath $path -Name TcpAckFrequency -Value 1 -PropertyType DWord -Force | Out-Null
        New-ItemProperty -LiteralPath $path -Name TcpDelAckTicks -Value 0 -PropertyType DWord -Force | Out-Null
    }
    $systemProfile = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'
    if ('network-throttling-disabled' -in $selectedIds) { New-ItemProperty -LiteralPath $systemProfile -Name NetworkThrottlingIndex -Value ([uint32]::MaxValue) -PropertyType DWord -Force | Out-Null }
    if ('system-responsiveness-zero' -in $selectedIds) { New-ItemProperty -LiteralPath $systemProfile -Name SystemResponsiveness -Value 0 -PropertyType DWord -Force | Out-Null }
    if ('task-offload-enabled' -in $selectedIds) { Set-NetOffloadGlobalSetting -TaskOffload Enabled -ErrorAction Stop | Out-Null }

    $state = Get-TcpOptimizationState -InterfaceAlias $InterfaceAlias
    $failed = @($state.items | Where-Object { $_.id -in $selectedIds -and -not $_.matches })
    if ($failed.Count) { throw ('TCP settings were written but verification failed: ' + (($failed | ForEach-Object name) -join ', ')) }
    Write-ToolkitOperation 'tcp-profile-apply' 'success' $backupId @{ interfaceAlias=$InterfaceAlias; profileId=$ProfileId; itemIds=$selectedIds }
    [ordered]@{ ok=$true; backupId=$backupId; profileId=$ProfileId; appliedItemIds=$selectedIds; state=$state }
}

function Restore-TcpOptimizationProfile([string]$BackupId = 'latest') {
    if (-not (Test-ToolkitElevated)) { throw 'Administrator privileges are required to restore TCP settings.' }
    $backups = @(Get-ChildItem -LiteralPath $tcpBackupRoot -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object BaseName -Descending)
    if ($backups.Count -eq 0) { throw 'No SynapseX TCP backup exists.' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object BaseName -eq $BackupId | Select-Object -First 1 }
    if ($null -eq $selected) { throw "TCP backup not found: $BackupId" }
    $snapshot = Get-Content -LiteralPath $selected.FullName -Raw | ConvertFrom-Json
    $line = [string]$snapshot.netshGlobalLine
    $tokens = @([regex]::Matches($line, '(?i)\b([a-z0-9]+)=([a-z0-9]+)\b') | ForEach-Object { $_.Groups[1].Value.ToLowerInvariant() + '=' + $_.Groups[2].Value.ToLowerInvariant() })
    if ($tokens.Count -lt 5) { throw 'The saved TCP global configuration is invalid.' }
    $result = @(& netsh interface tcp set global @tokens 2>&1)
    if ($LASTEXITCODE -ne 0) { throw ('TCP global restore failed: ' + ($result -join ' ')) }
    if (-not [string]::IsNullOrWhiteSpace([string]$snapshot.taskOffload)) { Set-NetOffloadGlobalSetting -TaskOffload ([string]$snapshot.taskOffload) -ErrorAction Stop | Out-Null }
    foreach ($registryState in @($snapshot.registry)) { Restore-RegistryValueState $registryState }
    $state = Get-TcpOptimizationState -InterfaceAlias ([string]$snapshot.interfaceAlias)
    Write-ToolkitOperation 'tcp-profile-restore' 'success' $selected.BaseName @{ interfaceAlias=[string]$snapshot.interfaceAlias }
    [ordered]@{ ok=$true; backupId=$selected.BaseName; state=$state }
}

function Set-SynapseXGameQos([string]$ExecutablePath, [int]$Dscp = 46) {
    if (-not (Test-ToolkitElevated)) { throw 'Administrator privileges are required to create a QoS policy.' }
    if ($Dscp -lt 0 -or $Dscp -gt 63) { throw 'DSCP must be between 0 and 63.' }
    $exeName = [IO.Path]::GetFileName($ExecutablePath.Trim())
    if ([string]::IsNullOrWhiteSpace($exeName) -or [IO.Path]::GetExtension($exeName) -ine '.exe') { throw 'Choose a valid executable path or executable file name.' }
    $safeName = [regex]::Replace([IO.Path]::GetFileNameWithoutExtension($exeName), '[^A-Za-z0-9_-]', '_')
    if ([string]::IsNullOrWhiteSpace($safeName)) { $safeName = 'Game' }
    $policyName = 'SynapseX_Game_' + $safeName
    $equivalent = Get-NetQosPolicy -PolicyStore ActiveStore -ErrorAction SilentlyContinue | Where-Object { [string]$_.AppPathNameMatchCondition -ieq $exeName -and [int]$_.DSCPAction -eq $Dscp } | Select-Object -First 1
    if ($equivalent) { return [ordered]@{ ok=$true; alreadyApplied=$true; policyName=[string]$equivalent.Name; executable=$exeName; dscp=$Dscp; audit=Get-QosPolicyAudit } }
    $existingOwn = Get-NetQosPolicy -PolicyStore PersistentStore -ErrorAction SilentlyContinue | Where-Object Name -eq $policyName
    if ($existingOwn) { $existingOwn | Remove-NetQosPolicy -PolicyStore PersistentStore -Confirm:$false -ErrorAction Stop }
    New-NetQosPolicy -Name $policyName -AppPathNameMatchCondition $exeName -IPProtocolMatchCondition Both -DSCPAction ([sbyte]$Dscp) -NetworkProfile All -PolicyStore PersistentStore -ErrorAction Stop | Out-Null
    $created = Get-NetQosPolicy -PolicyStore ActiveStore -ErrorAction SilentlyContinue | Where-Object Name -eq $policyName | Select-Object -First 1
    if (-not $created) { throw 'The QoS policy was not visible in ActiveStore after creation.' }
    Write-ToolkitOperation 'game-qos-apply' 'success' '' @{ policyName=$policyName; executable=$exeName; dscp=$Dscp }
    [ordered]@{ ok=$true; alreadyApplied=$false; policyName=$policyName; executable=$exeName; dscp=$Dscp; audit=Get-QosPolicyAudit }
}

function Remove-SynapseXGameQos {
    if (-not (Test-ToolkitElevated)) { throw 'Administrator privileges are required to remove a QoS policy.' }
    $policies = @(Get-NetQosPolicy -PolicyStore PersistentStore -ErrorAction SilentlyContinue | Where-Object Name -match '^SynapseX_Game_')
    foreach ($policy in $policies) { $policy | Remove-NetQosPolicy -PolicyStore PersistentStore -Confirm:$false -ErrorAction Stop }
    Write-ToolkitOperation 'game-qos-remove' 'success' '' @{ removedCount=$policies.Count }
    [ordered]@{ ok=$true; removedCount=$policies.Count; audit=Get-QosPolicyAudit }
}

function Read-ToolkitHostsText([string]$Path) { [IO.File]::ReadAllText($Path) }

function Get-HostsAudit {
    $state = [ordered]@{
        path=$hostsPath; exists=$false; available=$false; status='unavailable'
        size=0; activeEntryCount=0; writable=$false; content=''; error=''
        note='Hosts 只影响域名解析，不会降低已经建立连接后的游戏服务器延迟。'
    }
    try {
        # Force includes hidden/system metadata; it does not change attributes or bypass ACLs.
        $item=Get-Item -LiteralPath $hostsPath -Force -ErrorAction Stop
        if ($item.PSIsContainer) { throw 'Hosts 路径不是文件。' }
        $state.exists=$true
        $content=Read-ToolkitHostsText $hostsPath
        $state.content=$content
        $state.size=$item.Length
        $state.activeEntryCount=@($content -split "`r?`n" | Where-Object { $_.Trim() -ne '' -and -not $_.TrimStart().StartsWith('#') }).Count
        $state.available=$true
        $readOnly=([int]$item.Attributes -band [int][IO.FileAttributes]::ReadOnly) -ne 0
        $state.status=if ($readOnly) { 'read-only' } else { 'ready' }
        $state.writable=(Test-ToolkitElevated) -and -not $readOnly
        if ($readOnly) { $state.error='Hosts 文件为只读，可查看内容，暂不允许覆盖。软件不会自动移除只读属性。' }
    } catch {
        $exception=$_.Exception.GetBaseException()
        $state.content=''; $state.available=$false; $state.writable=$false
        if ($_.CategoryInfo.Category -eq 'ObjectNotFound' -or $exception -is [IO.FileNotFoundException] -or $exception -is [IO.DirectoryNotFoundException]) {
            $state.exists=$false; $state.status='missing'
            $state.error='未找到 Hosts 文件；其他网络工具仍可使用。不会自动创建或重置文件。'
        } elseif ($exception -is [UnauthorizedAccessException] -or $_.CategoryInfo.Category -eq 'PermissionDenied') {
            $state.status='access-denied'
            $state.error='当前无法访问 Hosts 文件，可能受到文件权限或安全软件保护。其他网络工具仍可使用；请勿关闭安全保护。'
        } else {
            $state.status='read-failed'
            $state.error='Hosts 读取失败，文件可能正被占用或已发生变化。请稍后重新检测；其他网络工具仍可使用。'
        }
    }
    $state
}

function Get-NetworkToolkitSnapshot {
    $defaultRoute = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
    $defaultInterfaceIndex = if ($defaultRoute) { [int]$defaultRoute.InterfaceIndex } else { -1 }
    $virtualPattern = '(?i)(wintun|tap-|tun |wireguard|clash|mihomo|netch|uu|leigod|qiyou|xunyou|加速器|虚拟|hyper-v|virtual)'
    $adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Sort-Object Status, Name | ForEach-Object {
        $adapter = $_
        $ip = Get-NetIPInterface -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1
        $dns = Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1
        $statistics = Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction SilentlyContinue
        [ordered]@{
            name = [string]$adapter.Name
            description = [string]$adapter.InterfaceDescription
            interfaceIndex = [int]$adapter.ifIndex
            status = [string]$adapter.Status
            isDefaultRoute = ([int]$adapter.ifIndex -eq $defaultInterfaceIndex)
            isVirtual = ($adapter.Name -match $virtualPattern -or $adapter.InterfaceDescription -match $virtualPattern)
            linkSpeed = [string]$adapter.LinkSpeed
            mtu = if ($ip) { [int]$ip.NlMtu } else { $null }
            automaticMetric = if ($ip) { [bool]$ip.AutomaticMetric } else { $null }
            interfaceMetric = if ($ip) { [int]$ip.InterfaceMetric } else { $null }
            dnsServers = if ($dns) { @($dns.ServerAddresses) } else { @() }
            receivedBytes = if ($statistics) { [long]$statistics.ReceivedBytes } else { $null }
            sentBytes = if ($statistics) { [long]$statistics.SentBytes } else { $null }
        }
    })
    $established = @(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue).Count
    $acceleratorCompatibility = Get-AcceleratorCompatibility
    $running = @($acceleratorCompatibility.items | ForEach-Object { @($_.processes) } | Select-Object -Unique)
    $physical = $adapters | Where-Object { $_.status -eq 'Up' -and -not $_.isVirtual } | Sort-Object @{ Expression = { if ($_.isDefaultRoute) { 0 } else { 1 } } } | Select-Object -First 1
    [ordered]@{
        capturedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        elevated = (Test-ToolkitElevated)
        adapters = $adapters
        activeAdapterCount = @($adapters | Where-Object status -eq 'Up').Count
        establishedTcpConnections = $established
        acceleratorProcesses = $running
        acceleratorCompatibility = $acceleratorCompatibility
        recommendedPhysicalAdapter = if ($physical) { [string]$physical.name } else { '' }
        tcp = Get-TcpGlobalState -InterfaceAlias ([string](($adapters | Where-Object isDefaultRoute | Select-Object -First 1).name))
        qos = Get-QosPolicyAudit
        hosts = Get-HostsAudit
        dnsPresets = @(Get-DnsPresetDefinitions)
    }
}

function Test-DnsResolvers([int]$Attempts = 3) {
    if ($Attempts -lt 1 -or $Attempts -gt 5) { throw 'DNS attempts must be between 1 and 5.' }
    $results = foreach ($preset in Get-DnsPresetDefinitions) {
        $times = @()
        $errors = @()
        for ($index = 0; $index -lt $Attempts; $index++) {
            $watch = [Diagnostics.Stopwatch]::StartNew()
            try {
                [void](Resolve-DnsName -Name 'www.qq.com' -Server $preset.primary -Type A -DnsOnly -NoHostsFile -ErrorAction Stop)
                $watch.Stop()
                $times += $watch.Elapsed.TotalMilliseconds
            } catch {
                $watch.Stop()
                $errors += $_.Exception.Message
            }
        }
        [ordered]@{
            id = $preset.id
            name = $preset.name
            primary = $preset.primary
            secondary = $preset.secondary
            attempts = $Attempts
            succeeded = $times.Count
            averageMs = if ($times.Count) { [math]::Round(($times | Measure-Object -Average).Average, 1) } else { $null }
            minimumMs = if ($times.Count) { [math]::Round(($times | Measure-Object -Minimum).Minimum, 1) } else { $null }
            reachable = ($times.Count -gt 0)
            error = if ($errors.Count) { [string]$errors[0] } else { '' }
        }
    }
    [ordered]@{
        testedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        queryName = 'www.qq.com'
        items = @($results | Sort-Object @{ Expression = { if ($null -eq $_.averageMs) { [double]::PositiveInfinity } else { $_.averageMs } } })
        note = '结果只代表 DNS 查询响应，不代表游戏连接延迟。首次查询和网络波动会影响数值。'
    }
}

function Set-NetworkDnsPreset([string]$InterfaceAlias, [string]$PresetId) {
    if (-not (Test-ToolkitElevated)) { throw 'Administrator privileges are required to change DNS.' }
    $preset = Get-DnsPresetDefinitions | Where-Object id -eq $PresetId | Select-Object -First 1
    if ($null -eq $preset) { throw 'Unknown DNS preset.' }
    $adapter = Get-NetAdapter -Name $InterfaceAlias -ErrorAction Stop
    if ($adapter.Status -ne 'Up') { throw 'The selected network adapter is not active.' }
    $current = Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction Stop | Select-Object -First 1
    [void](New-Item -ItemType Directory -Path $dnsBackupRoot -Force)
    $backupId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $snapshot = [ordered]@{
        schemaVersion = 1
        backupId = $backupId
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        interfaceAlias = [string]$adapter.Name
        interfaceIndex = [int]$adapter.ifIndex
        serverAddresses = @($current.ServerAddresses)
        presetId = $PresetId
    }
    [IO.File]::WriteAllText((Join-Path $dnsBackupRoot ($backupId + '.json')), ($snapshot | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
    Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses @($preset.primary, $preset.secondary) -ErrorAction Stop
    Clear-DnsClientCache -ErrorAction SilentlyContinue
    Write-ToolkitOperation 'dns-apply' 'success' $backupId @{ interfaceAlias = $InterfaceAlias; presetId = $PresetId }
    [ordered]@{ ok = $true; backupId = $backupId; interfaceAlias = $InterfaceAlias; servers = @($preset.primary, $preset.secondary) }
}

function Restore-NetworkDns([string]$BackupId = 'latest') {
    if (-not (Test-ToolkitElevated)) { throw 'Administrator privileges are required to restore DNS.' }
    $backups = @(Get-ChildItem -LiteralPath $dnsBackupRoot -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object BaseName -Descending)
    if ($backups.Count -eq 0) { throw 'No SynapseX DNS backup exists.' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object BaseName -eq $BackupId | Select-Object -First 1 }
    if ($null -eq $selected) { throw "DNS backup not found: $BackupId" }
    $snapshot = Get-Content -LiteralPath $selected.FullName -Raw | ConvertFrom-Json
    if (@($snapshot.serverAddresses).Count) {
        Set-DnsClientServerAddress -InterfaceIndex ([int]$snapshot.interfaceIndex) -ServerAddresses @($snapshot.serverAddresses) -ErrorAction Stop
    } else {
        Set-DnsClientServerAddress -InterfaceIndex ([int]$snapshot.interfaceIndex) -ResetServerAddresses -ErrorAction Stop
    }
    Clear-DnsClientCache -ErrorAction SilentlyContinue
    Write-ToolkitOperation 'dns-restore' 'success' $selected.BaseName @{ interfaceAlias = [string]$snapshot.interfaceAlias }
    [ordered]@{ ok = $true; backupId = $selected.BaseName; interfaceAlias = [string]$snapshot.interfaceAlias; servers = @($snapshot.serverAddresses) }
}

function Invoke-SynapseXDnsFlush {
    Clear-DnsClientCache -ErrorAction Stop
    Write-ToolkitOperation 'dns-flush' 'success' '' @{}
    [ordered]@{ ok = $true; completedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') }
}

function Test-PathMtu([string]$Target = '223.5.5.5') {
    $parsed = $null
    if (-not [Net.IPAddress]::TryParse($Target, [ref]$parsed)) { throw 'MTU target must be an IP address.' }
    $smallProbe = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\ping.exe') -ArgumentList @('-n','1','-w','1200','-f','-l','32',$Target) -WindowStyle Hidden -Wait -PassThru
    if ($smallProbe.ExitCode -ne 0) { throw 'The MTU target did not answer a small probe. Choose another reachable IPv4 address.' }
    $low = 548
    $high = 1472
    $best = 32
    while ($low -le $high) {
        $mid = [int][math]::Floor(($low + $high) / 2)
        $probe = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\ping.exe') -ArgumentList @('-n','1','-w','1200','-f','-l',[string]$mid,$Target) -WindowStyle Hidden -Wait -PassThru
        if ($probe.ExitCode -eq 0) { $best = $mid; $low = $mid + 1 } else { $high = $mid - 1 }
    }
    [ordered]@{
        target = $Target
        maximumPayloadBytes = $best
        suggestedIpv4Mtu = $best + 28
        testedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        applied = $false
        note = '建议值包含 20 字节 IPv4 头和 8 字节 ICMP 头。本次只探测，不修改网卡。'
    }
}

function Set-SynapseXInterfaceMtu([string]$InterfaceAlias, [int]$Mtu) {
    if (-not (Test-ToolkitElevated)) { throw 'Administrator privileges are required to change interface MTU.' }
    if ($Mtu -lt 576 -or $Mtu -gt 1500) { throw 'IPv4 MTU must be between 576 and 1500.' }
    $adapter = Get-NetAdapter -Name $InterfaceAlias -ErrorAction Stop
    if ([string]$adapter.Status -ne 'Up') { throw 'The selected network adapter is not active.' }
    $ip = Get-NetIPInterface -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction Stop | Select-Object -First 1
    if ($null -eq $ip) { throw 'The selected adapter has no IPv4 interface.' }
    if ([int]$ip.NlMtu -eq $Mtu) { throw 'The selected adapter already uses this MTU.' }

    [void](New-Item -ItemType Directory -Path $mtuBackupRoot -Force)
    $backupId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $snapshot = [ordered]@{
        schemaVersion = 1
        backupId = $backupId
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        interfaceAlias = [string]$adapter.Name
        interfaceDescription = [string]$adapter.InterfaceDescription
        interfaceIndex = [int]$adapter.ifIndex
        previousMtu = [int]$ip.NlMtu
        selectedMtu = $Mtu
    }
    [IO.File]::WriteAllText((Join-Path $mtuBackupRoot ($backupId + '.json')), ($snapshot | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
    Set-NetIPInterface -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -NlMtuBytes $Mtu -ErrorAction Stop
    $current = Get-NetIPInterface -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction Stop | Select-Object -First 1
    Write-ToolkitOperation 'mtu-apply' 'success' $backupId @{ interfaceAlias = [string]$adapter.Name; previousMtu = [int]$ip.NlMtu; selectedMtu = $Mtu }
    [ordered]@{ ok = $true; backupId = $backupId; interfaceAlias = [string]$adapter.Name; previousMtu = [int]$ip.NlMtu; currentMtu = [int]$current.NlMtu }
}

function Restore-SynapseXInterfaceMtu([string]$BackupId = 'latest') {
    if (-not (Test-ToolkitElevated)) { throw 'Administrator privileges are required to restore interface MTU.' }
    $backups = @(Get-ChildItem -LiteralPath $mtuBackupRoot -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object BaseName -Descending)
    if ($backups.Count -eq 0) { throw 'No SynapseX MTU backup exists.' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object BaseName -eq $BackupId | Select-Object -First 1 }
    if ($null -eq $selected) { throw "MTU backup not found: $BackupId" }
    $snapshot = Get-Content -LiteralPath $selected.FullName -Raw | ConvertFrom-Json
    $adapter = Get-NetAdapter -Name ([string]$snapshot.interfaceAlias) -ErrorAction Stop
    if ([string]$adapter.InterfaceDescription -ne [string]$snapshot.interfaceDescription) { throw 'The saved network adapter identity no longer matches.' }
    $previousMtu = [int]$snapshot.previousMtu
    if ($previousMtu -lt 576 -or $previousMtu -gt 65535) { throw 'The saved MTU is invalid.' }
    Set-NetIPInterface -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -NlMtuBytes $previousMtu -ErrorAction Stop
    $current = Get-NetIPInterface -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction Stop | Select-Object -First 1
    Write-ToolkitOperation 'mtu-restore' 'success' $selected.BaseName @{ interfaceAlias = [string]$adapter.Name; restoredMtu = $previousMtu }
    [ordered]@{ ok = $true; backupId = $selected.BaseName; interfaceAlias = [string]$adapter.Name; currentMtu = [int]$current.NlMtu }
}

function Measure-NetworkThroughput([int]$Milliseconds = 1000) {
    if ($Milliseconds -lt 500 -or $Milliseconds -gt 5000) { throw 'Network sample duration must be between 500 and 5000 milliseconds.' }
    $adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up')
    $before = @{}
    foreach ($adapter in $adapters) {
        $statistics = Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction SilentlyContinue
        if ($statistics) { $before[[int]$adapter.ifIndex] = [ordered]@{ received = [long]$statistics.ReceivedBytes; sent = [long]$statistics.SentBytes } }
    }
    $watch = [Diagnostics.Stopwatch]::StartNew()
    Start-Sleep -Milliseconds $Milliseconds
    $watch.Stop()
    $seconds = $watch.Elapsed.TotalSeconds
    $items = foreach ($adapter in $adapters) {
        if (-not $before.ContainsKey([int]$adapter.ifIndex)) { continue }
        $statistics = Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction SilentlyContinue
        if (-not $statistics) { continue }
        $receivedPerSecond = [math]::Max(0, ([long]$statistics.ReceivedBytes - [long]$before[[int]$adapter.ifIndex].received) / $seconds)
        $sentPerSecond = [math]::Max(0, ([long]$statistics.SentBytes - [long]$before[[int]$adapter.ifIndex].sent) / $seconds)
        [ordered]@{ name = [string]$adapter.Name; interfaceIndex = [int]$adapter.ifIndex; downloadBytesPerSecond = [math]::Round($receivedPerSecond, 0); uploadBytesPerSecond = [math]::Round($sentPerSecond, 0); downloadMbps = [math]::Round(($receivedPerSecond * 8) / 1MB, 2); uploadMbps = [math]::Round(($sentPerSecond * 8) / 1MB, 2) }
    }
    $totalDownloadMbps = 0.0
    $totalUploadMbps = 0.0
    foreach ($item in @($items)) {
        $totalDownloadMbps += [double]$item.downloadMbps
        $totalUploadMbps += [double]$item.uploadMbps
    }
    [ordered]@{
        sampledAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        durationSeconds = [math]::Round($seconds, 2)
        items = @($items)
        totalDownloadMbps = [math]::Round($totalDownloadMbps, 2)
        totalUploadMbps = [math]::Round($totalUploadMbps, 2)
        establishedTcpConnections = @(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue).Count
        note = '这是网卡计数器的短时速率，不会主动下载测试文件，也不会消耗额外测速流量。'
    }
}

function Get-NicAdvancedAudit([string]$InterfaceAlias) {
    $adapter = Get-NetAdapter -Name $InterfaceAlias -ErrorAction Stop
    $properties = @(Get-NetAdapterAdvancedProperty -Name $adapter.Name -ErrorAction SilentlyContinue | ForEach-Object {
        $registryOptions = @($_.ValidRegistryValues | Where-Object { $null -ne $_ })
        $displayOptions = @($_.ValidDisplayValues | Where-Object { $null -ne $_ })
        [ordered]@{
            displayName = [string]$_.DisplayName
            displayValue = [string]$_.DisplayValue
            registryKeyword = [string]$_.RegistryKeyword
            registryValue = @($_.RegistryValue)
            options = @(for ($i=0; $i -lt $registryOptions.Count; $i++) { [ordered]@{ value=[string]$registryOptions[$i]; label=if ($i -lt $displayOptions.Count) { [string]$displayOptions[$i] } else { [string]$registryOptions[$i] } } })
            minimum = $_.NumericParameterMinValue
            maximum = $_.NumericParameterMaxValue
            step = $_.NumericParameterStepValue
        }
    })
    $power = Get-NetAdapterPowerManagement -Name $adapter.Name -ErrorAction SilentlyContinue
    $latencyKeywords = @('*EEE','AdvancedEEE','EnableGreenEthernet','GigaLite','PowerSavingMode')
    $candidates = @($properties | Where-Object { $latencyKeywords -contains $_.registryKeyword } | ForEach-Object {
        $current = if (@($_.registryValue).Count) { [string]@($_.registryValue)[0] } else { '' }
        [ordered]@{
            displayName = $_.displayName
            registryKeyword = $_.registryKeyword
            currentValue = $current
            desiredValue = '0'
            matches = ($current -eq '0')
            reason = '关闭网卡节能／绿色以太网，避免空闲后恢复链路时增加偶发延迟。平均帧数通常不受影响。'
        }
    })
    [ordered]@{
        interfaceAlias = [string]$adapter.Name
        description = [string]$adapter.InterfaceDescription
        status = [string]$adapter.Status
        elevated = (Test-ToolkitElevated)
        properties = $properties
        latencyCandidates = $candidates
        pendingCandidateCount = @($candidates | Where-Object { -not $_.matches }).Count
        powerManagement = if ($power) { [ordered]@{ allowComputerToTurnOffDevice = [string]$power.AllowComputerToTurnOffDevice; selectiveSuspend = [string]$power.SelectiveSuspend; wakeOnMagicPacket = [string]$power.WakeOnMagicPacket; wakeOnPattern = [string]$power.WakeOnPattern } } else { $null }
        recommendation = '只把 EEE、绿色以太网和网卡省电作为可选低延迟项；不自动关闭校验和、RSS、LSO、RSC 或强制固定速率。'
        restartNote = '写入使用 NoRestart，不会立即断网；重启 Windows 或手动重启网卡后驱动才会完整重新加载。'
    }
}

function Set-NicPropertyValue([string]$InterfaceAlias, [string]$Keyword, [string]$Value, [string]$Expected) {
    if (-not (Test-ToolkitElevated)) { throw 'Administrator privileges are required.' }
    $adapters = @(Get-NetAdapter -ErrorAction Stop | Where-Object Name -CEQ $InterfaceAlias)
    if ($adapters.Count -ne 1) { throw 'Select exactly one current network adapter.' }
    $adapter = $adapters[0]
    $properties = @(Get-NetAdapterAdvancedProperty -Name ([WildcardPattern]::Escape($adapter.Name)) -ErrorAction Stop | Where-Object RegistryKeyword -CEQ $Keyword)
    if ($properties.Count -ne 1) { throw 'Driver property no longer exists. Refresh first.' }
    $property = $properties[0]
    if (@($property.RegistryValue).Count -ne 1 -or [string]$property.RegistryValue[0] -cne $Expected) { throw 'Driver value changed. Refresh before applying.' }
    $valid = @($property.ValidRegistryValues | Where-Object { $null -ne $_ })
    if ($valid.Count) {
        if ($valid -cnotcontains $Value) { throw 'Value is not offered by this driver.' }
    } else {
        $number = 0L
        if ($null -eq $property.NumericParameterMinValue -or $null -eq $property.NumericParameterMaxValue -or $Value -notmatch '^\d+$' -or -not [long]::TryParse($Value,[ref]$number)) { throw 'Driver does not expose an editable range.' }
        $minimum=[long]$property.NumericParameterMinValue; $maximum=[long]$property.NumericParameterMaxValue; $step=[math]::Max(1,[long]$property.NumericParameterStepValue)
        if ($number -lt $minimum -or $number -gt $maximum -or (($number-$minimum)%$step) -ne 0) { throw 'Value is outside the driver range or step.' }
    }
    if ($Value -ceq $Expected) { return @{ok=$true;backupId='';restartRequired=$false;audit=(Get-NicAdvancedAudit $InterfaceAlias)} }
    [void](New-Item -ItemType Directory -Path $nicBackupRoot -Force)
    $backupId = (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
    $metadata = [ordered]@{ schemaVersion=2; backupId=$backupId; createdAt=[DateTime]::UtcNow.ToString('o'); interfaceAlias=$adapter.Name; interfaceDescription=$adapter.InterfaceDescription; interfaceGuid=[string]$adapter.InterfaceGuid; properties=@(@{registryKeyword=$Keyword;registryValue=@($property.RegistryValue);displayName=$property.DisplayName}); allowComputerToTurnOffDevice=$null }
    [IO.File]::WriteAllText((Join-Path $nicBackupRoot ($backupId+'.json')),($metadata|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
    try {
        Set-NetAdapterAdvancedProperty -Name ([WildcardPattern]::Escape($adapter.Name)) -RegistryKeyword ([WildcardPattern]::Escape($Keyword)) -RegistryValue $Value -NoRestart -ErrorAction Stop
        $audit = Get-NicAdvancedAudit $InterfaceAlias
        $actual = @($audit.properties | Where-Object registryKeyword -CEQ $Keyword)
        if ($actual.Count -ne 1 -or [string]$actual[0].registryValue[0] -cne $Value) { throw 'Driver did not retain the requested value.' }
    } catch { Write-ToolkitOperation 'nic-property-apply' 'failed' $backupId @{interfaceAlias=$InterfaceAlias;keyword=$Keyword}; throw "Property apply failed; backup $backupId retained. $($_.Exception.Message)" }
    Write-ToolkitOperation 'nic-property-apply' 'success' $backupId @{interfaceAlias=$InterfaceAlias;keyword=$Keyword}
    return @{ok=$true;backupId=$backupId;restartRequired=$true;audit=$audit}
}
Export-ModuleMember -Function Set-NicPropertyValue

function Set-NicLatencyProfile([string]$InterfaceAlias) {
    if (-not (Test-ToolkitElevated)) { throw 'Administrator privileges are required to change network adapter properties.' }
    $audit = Get-NicAdvancedAudit -InterfaceAlias $InterfaceAlias
    $candidates = @($audit.latencyCandidates)
    if ($candidates.Count -eq 0) { throw 'The selected adapter exposes no supported energy-saving property.' }
    $adapter = Get-NetAdapter -Name $InterfaceAlias -ErrorAction Stop
    $allProperties = @(Get-NetAdapterAdvancedProperty -Name $adapter.Name -ErrorAction Stop)
    $snapshots = foreach ($candidate in $candidates) {
        $property = $allProperties | Where-Object RegistryKeyword -eq ([string]$candidate.registryKeyword) | Select-Object -First 1
        if ($property) { [ordered]@{ registryKeyword = [string]$property.RegistryKeyword; registryValue = @($property.RegistryValue); displayName = [string]$property.DisplayName } }
    }
    $power = Get-NetAdapterPowerManagement -Name $adapter.Name -ErrorAction SilentlyContinue
    [void](New-Item -ItemType Directory -Path $nicBackupRoot -Force)
    $backupId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $metadata = [ordered]@{
        schemaVersion = 1
        backupId = $backupId
        createdAt = (Get-Date).ToUniversalTime().ToString('o')
        interfaceAlias = [string]$adapter.Name
        interfaceDescription = [string]$adapter.InterfaceDescription
        properties = @($snapshots)
        allowComputerToTurnOffDevice = if ($power) { [string]$power.AllowComputerToTurnOffDevice } else { $null }
    }
    [IO.File]::WriteAllText((Join-Path $nicBackupRoot ($backupId + '.json')), ($metadata | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
    foreach ($snapshot in @($snapshots)) {
        if (@($snapshot.registryValue).Count -and [string]@($snapshot.registryValue)[0] -ne '0') {
            Set-NetAdapterAdvancedProperty -Name $adapter.Name -RegistryKeyword ([string]$snapshot.registryKeyword) -RegistryValue 0 -NoRestart -ErrorAction Stop
        }
    }
    if ($power -and [string]$power.AllowComputerToTurnOffDevice -ne 'Disabled') {
        Set-NetAdapterPowerManagement -Name $adapter.Name -AllowComputerToTurnOffDevice Disabled -ErrorAction Stop
    }
    Write-ToolkitOperation 'nic-latency-profile-apply' 'success' $backupId @{ interfaceAlias = $InterfaceAlias }
    [ordered]@{ ok = $true; backupId = $backupId; restartRequired = $true; audit = Get-NicAdvancedAudit -InterfaceAlias $InterfaceAlias }
}

function Restore-NicLatencyProfile([string]$BackupId = 'latest') {
    if (-not (Test-ToolkitElevated)) { throw 'Administrator privileges are required to restore network adapter properties.' }
    $backups = @(Get-ChildItem -LiteralPath $nicBackupRoot -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object BaseName -Descending)
    if ($backups.Count -eq 0) { throw 'No SynapseX network adapter backup exists.' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object BaseName -eq $BackupId | Select-Object -First 1 }
    if ($null -eq $selected) { throw "Network adapter backup not found: $BackupId" }
    $metadata = Get-Content -LiteralPath $selected.FullName -Raw | ConvertFrom-Json
    $adapter = Get-NetAdapter -Name ([string]$metadata.interfaceAlias) -ErrorAction Stop
    if ($metadata.interfaceGuid -and [string]$adapter.InterfaceGuid -ne [string]$metadata.interfaceGuid) { throw 'This backup belongs to a different network adapter.' }
    foreach ($snapshot in @($metadata.properties)) {
        $values = @($snapshot.registryValue)
        if ($values.Count) { Set-NetAdapterAdvancedProperty -Name $adapter.Name -RegistryKeyword ([string]$snapshot.registryKeyword) -RegistryValue $values -NoRestart -ErrorAction Stop }
    }
    if (-not [string]::IsNullOrWhiteSpace([string]$metadata.allowComputerToTurnOffDevice)) {
        Set-NetAdapterPowerManagement -Name $adapter.Name -AllowComputerToTurnOffDevice ([string]$metadata.allowComputerToTurnOffDevice) -ErrorAction Stop
    }
    Write-ToolkitOperation 'nic-latency-profile-restore' 'success' $selected.BaseName @{ interfaceAlias = [string]$adapter.Name }
    [ordered]@{ ok = $true; backupId = $selected.BaseName; restartRequired = $true; audit = Get-NicAdvancedAudit -InterfaceAlias ([string]$adapter.Name) }
}

function Set-SynapseXHostsContent([string]$Content) {
    if (-not (Test-ToolkitElevated)) { throw 'Administrator privileges are required to edit Hosts.' }
    $audit=Get-HostsAudit
    if (-not $audit.available -or -not $audit.writable) { throw ('无法安全保存 Hosts：'+$audit.error) }
    if ($Content.Length -gt 262144) { throw 'Hosts content exceeds the 256 KB safety limit.' }
    if ($Content.IndexOf([char]0) -ge 0) { throw 'Hosts content contains invalid null characters.' }
    [void](New-Item -ItemType Directory -Path $hostsBackupRoot -Force)
    $backupId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $backupPath = Join-Path $hostsBackupRoot ($backupId + '.hosts')
    if (Test-Path -LiteralPath $hostsPath) { Copy-Item -LiteralPath $hostsPath -Destination $backupPath -Force } else { [IO.File]::WriteAllText($backupPath, '', (New-Object Text.UTF8Encoding($false))) }
    [IO.File]::WriteAllText($hostsPath, $Content, (New-Object Text.UTF8Encoding($false)))
    Clear-DnsClientCache -ErrorAction SilentlyContinue
    Write-ToolkitOperation 'hosts-save' 'success' $backupId @{ path = $hostsPath }
    [ordered]@{ ok = $true; backupId = $backupId; state = Get-HostsAudit }
}

function Restore-SynapseXHosts([string]$BackupId = 'latest') {
    if (-not (Test-ToolkitElevated)) { throw 'Administrator privileges are required to restore Hosts.' }
    $audit=Get-HostsAudit
    if ($audit.status -ne 'missing' -and (-not $audit.available -or -not $audit.writable)) { throw ('无法安全恢复 Hosts：'+$audit.error) }
    $backups = @(Get-ChildItem -LiteralPath $hostsBackupRoot -Filter '*.hosts' -File -ErrorAction SilentlyContinue | Sort-Object BaseName -Descending)
    if ($backups.Count -eq 0) { throw 'No SynapseX Hosts backup exists.' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object BaseName -eq $BackupId | Select-Object -First 1 }
    if ($null -eq $selected) { throw "Hosts backup not found: $BackupId" }
    Copy-Item -LiteralPath $selected.FullName -Destination $hostsPath -Force
    Clear-DnsClientCache -ErrorAction SilentlyContinue
    Write-ToolkitOperation 'hosts-restore' 'success' $selected.BaseName @{ path = $hostsPath }
    [ordered]@{ ok = $true; backupId = $selected.BaseName; state = Get-HostsAudit }
}

function Get-SynapseXOperationLog([int]$Limit = 100) {
    if (-not (Test-Path -LiteralPath $operationLogPath -PathType Leaf)) { return @() }
    $lines = @(Get-Content -LiteralPath $operationLogPath | Select-Object -Last ([math]::Max(1, [math]::Min($Limit, 500))))
    @($lines | ForEach-Object { try { $_ | ConvertFrom-Json } catch { } } | Sort-Object timestamp -Descending)
}

Export-ModuleMember -Function Get-NetworkToolkitSnapshot, Get-NetworkProbeTargets, Measure-NetworkThroughput, Test-DnsResolvers, Set-NetworkDnsPreset, Restore-NetworkDns, Invoke-SynapseXDnsFlush, Test-PathMtu, Set-SynapseXInterfaceMtu, Restore-SynapseXInterfaceMtu, Get-NicAdvancedAudit, Set-NicLatencyProfile, Restore-NicLatencyProfile, Set-SynapseXHostsContent, Restore-SynapseXHosts, Get-SynapseXOperationLog, Get-TcpOptimizationState, Set-TcpOptimizationProfile, Restore-TcpOptimizationProfile, Set-SynapseXGameQos, Remove-SynapseXGameQos
