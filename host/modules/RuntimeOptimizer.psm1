$ErrorActionPreference = 'Stop'

$runtimeStateBase = if ([string]::IsNullOrWhiteSpace($env:SYNAPSEX_STATE_ROOT)) { Join-Path $env:LOCALAPPDATA 'SynapseX\state' } else { [IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT) }
$runtimeBackupRoot = Join-Path $runtimeStateBase 'runtime-backups'
$powerBackupRoot = Join-Path $runtimeStateBase 'power-backups'
$cpuPowerBackupRoot = Join-Path $runtimeStateBase 'cpu-power-backups'
$runtimeOperationLogPath = Join-Path $runtimeStateBase 'operations.jsonl'

function Initialize-RuntimeNative {
    if (-not ('SynapseX.RuntimeNative' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'RuntimeNative.cs') }
}

function Get-RuntimeCpuTopology {
    try {
        Initialize-RuntimeNative
        $rows = [SynapseX.RuntimeNative]::CpuSets()
        if ($rows.Count -eq 0) { throw 'CPU sets unavailable' }
        [pscustomobject]@{
            available = $true
            classes = @($rows | ForEach-Object { $_[4] } | Sort-Object -Unique)
            cacheDomains = @($rows | ForEach-Object { "$($_[0]):$($_[3])" } | Sort-Object -Unique).Count
            logicalProcessors = $rows.Count
        }
    } catch { [pscustomobject]@{ available = $false; classes = @(); cacheDomains = 0; logicalProcessors = 0 } }
}

function Get-RuntimePriority([int]$ProcessId) {
    Initialize-RuntimeNative
    [SynapseX.RuntimeNative]::Priority($ProcessId)
}

function Get-PriorityLabel([uint32]$Value) {
    switch ($Value) { 32 { '正常' }; 64 { '空闲' }; 16384 { '低于正常' }; 32768 { '高于正常' }; 128 { '高' }; 256 { '实时' }; default { '无法读取' } }
}

function Write-RuntimeOperation([string]$Action, [string]$Result, [string]$BackupId, $Detail) {
    [void](New-Item -ItemType Directory -Path $runtimeStateBase -Force)
    $entry = [ordered]@{
        timestamp = (Get-Date).ToUniversalTime().ToString('o')
        category = 'runtime'
        action = $Action
        result = $Result
        backupId = $BackupId
        detail = $Detail
    }
    [IO.File]::AppendAllText($runtimeOperationLogPath, (($entry | ConvertTo-Json -Depth 8 -Compress) + [Environment]::NewLine), (New-Object Text.UTF8Encoding($false)))
}

function Test-SynapseXRuntimeElevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Invoke-SynapseXPowerCfg([string[]]$Arguments, [string]$FailureMessage) {
    $powerCfgPath = Join-Path $env:SystemRoot 'System32\powercfg.exe'
    $output = @(& $powerCfgPath @Arguments 2>&1 | ForEach-Object { [string]$_ })
    if ($LASTEXITCODE -ne 0) {
        $detail = ($output -join ' ').Trim()
        if ([string]::IsNullOrWhiteSpace($detail)) { $detail = $FailureMessage }
        throw $detail
    }
    @($output)
}

function New-SynapseXCpuPowerSetting([string]$Key, [int]$AcValue) {
    $definitions = @{
        'processor-min' = @('最小处理器状态', '893dee8e-2bef-41e0-89c6-b55d0929964c', "$AcValue%", '规定插电时 CPU 可降到的最低性能状态。', '数值越高，空闲功耗和温度越高。')
        'processor-max' = @('最大处理器状态', 'bc5038f7-23e0-4960-96da-33abaf5935ec', "$AcValue%", '允许 CPU 使用完整性能范围。', '满载功耗与温度仍受 CPU、主板和散热限制。')
        'idle-disabled' = @('处理器空闲状态', '5d76a2ca-e8c0-402f-a133-2158492d58ad', $(if ($AcValue -eq 0) { '启用 Idle' } else { '禁用 Idle' }), '允许空闲核心进入低功耗状态；两个入选方案都保持启用。', '启用 Idle 不限制负载时升频。')
        'autonomous-mode' = @('处理器自主性能管理', '8baa4a8a-14c6-4451-8e8b-14bdbd197537', $(if ($AcValue -eq 1) { '启用' } else { '关闭' }), '在平台支持时，由硬件参与性能状态选择。', '是否支持由处理器、固件和 Windows 决定，不等同于所有平台都支持 CPPC。')
        'boost-mode' = @('处理器性能提升模式', 'be337238-0d82-4146-a960-4f3749d470c7', $(if ($AcValue -eq 3) { '高效启用' } elseif ($AcValue -eq 4) { '高效积极' } elseif ($AcValue -eq 2) { '积极' } else { [string]$AcValue }), '控制负载出现时处理器进入 Boost 的策略。', '实际响应因处理器性能控制接口而异，不代表更高帧率。')
        'boost-policy' = @('处理器提升策略', '45bcc044-d885-43e2-8605-ee0ec6e96b59', "$AcValue%", '允许系统使用完整的硬件加速预算。', '最终频率仍由温度、功耗墙和固件决定。')
        'energy-preference' = @('处理器能效性能偏好 EPP', '36687f9e-e3a5-4dbf-b1dc-15eb381c6863', $(if ($AcValue -eq 0) { '0（最高性能倾向）' } else { "$AcValue（偏性能）" }), '降低突发负载进入高性能状态的决策延迟。', '数值越低，轻负载功耗越高。')
        'core-parking-min' = @('核心停放最少核心数', '0cc5b647-c1df-4637-891a-dec35c318583', "$AcValue%", '保持所有逻辑处理器可立即调度，减少核心唤醒和迁移。', '会提高空闲功耗；不会把单线程游戏变成多线程。')
        'core-parking-max' = @('核心停放最多核心数', 'ea062031-0e34-4ff1-9b6d-eb1059334028', "$AcValue%", '与最少核心数配套，保持核心可调度范围一致。', '会提高空闲功耗。')
        'performance-check' = @('性能检查间隔', '4d2b0152-7d5c-498b-88e2-34345392a2c5', "$AcValue ms", '规定 Windows 重新评估处理器性能需求的时间间隔。', '过短增加调度开销，过长会降低负载响应速度。')
        'increase-threshold' = @('升频负载阈值', '06cadf0e-64ed-448a-8927-ce7bf90eb35d', "$AcValue%", '达到该负载后触发性能状态上调。', '阈值越低，升频越敏感。')
        'decrease-threshold' = @('降频负载阈值', '12a0ab44-fe28-4fa9-b3bd-4b64f44960a6', "$AcValue%", '低于该负载后允许性能状态下调。', '阈值越低，越不容易在短暂负载间隙降频。')
        'increase-policy' = @('性能上调策略', '465e1f50-b610-473a-ab58-00d1077dc418', $(if ($AcValue -eq 2) { '理想级数' } else { [string]$AcValue }), '决定触发升频后提高性能状态的幅度。', '由 Windows 处理器电源管理执行。')
        'decrease-policy' = @('性能下调策略', '40fbefc7-2e9d-4d25-a185-0cfd8574bac6', $(if ($AcValue -eq 2) { '理想级数' } else { '单级' }), '决定触发降频后降低性能状态的幅度。', '更慢的下降会增加短时空闲功耗。')
        'scheduling-policy' = @('长任务异构调度策略', '93b8b6dc-0698-4d1c-9ee4-0644e900c85d', $(if ($AcValue -eq 0) { '所有处理器' } elseif ($AcValue -eq 5) { '自动' } else { [string]$AcValue }), '设置长线程对处理器类别的偏好；不是进程绑核。', '同类核心上的收益需实测，不会强制所有核心满载。')
        'short-scheduling-policy' = @('短任务异构调度策略', 'bae08b81-2d5e-4688-ad6a-13243356654b', $(if ($AcValue -eq 0) { '所有处理器' } elseif ($AcValue -eq 5) { '自动' } else { [string]$AcValue }), '设置短线程对处理器类别的偏好。', '只在已识别的同类核心桌面性能对比档使用所有处理器。')
    }
    if (-not $definitions.ContainsKey($Key)) { throw "Unknown CPU power setting: $Key" }
    $definition = $definitions[$Key]
    [ordered]@{
        key = $Key; name = $definition[0]; subgroup = '54533251-82be-4824-96c1-47b60b740d00'; setting = $definition[1]
        acValue = $AcValue; valueLabel = $definition[2]; purpose = $definition[3]; tradeoff = $definition[4]
    }
}

function New-SynapseXCpuPowerProfile([string]$Id, [string]$Name, [string]$Badge, [bool]$Recommended, [string]$Source, [string]$Description, [string]$Tradeoff, [hashtable]$Values) {
    $order = @('processor-min','processor-max','idle-disabled','autonomous-mode','boost-mode','boost-policy','energy-preference','core-parking-min','core-parking-max','performance-check','increase-threshold','decrease-threshold','increase-policy','decrease-policy','scheduling-policy','short-scheduling-policy')
    $settings = foreach ($key in $order) {
        if ($Values.ContainsKey($key)) { New-SynapseXCpuPowerSetting -Key $key -AcValue ([int]$Values[$key]) }
    }
    [ordered]@{ id=$Id; name=$Name; badge=$Badge; recommended=$Recommended; source=$Source; description=$Description; tradeoff=$Tradeoff; settings=@($settings) }
}

function Get-CpuPowerRecommendation(
    [string]$CpuName = '',
    [string]$Manufacturer = '',
    [int]$PhysicalCores = 0,
    [int]$LogicalProcessors = 0,
    $Topology = $null,
    [string[]]$SupportedSettingIds = $null,
    [bool]$Portable = $false
) {
    $live = [string]::IsNullOrWhiteSpace($CpuName)
    if ([string]::IsNullOrWhiteSpace($CpuName)) {
        $cpu = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
        $CpuName = [string]$cpu.Name
        $Manufacturer = [string]$cpu.Manufacturer
        $PhysicalCores = [int]$cpu.NumberOfCores
        $LogicalProcessors = [int]$cpu.NumberOfLogicalProcessors
        $Topology = Get-RuntimeCpuTopology
        try { $Portable = @((Get-CimInstance Win32_SystemEnclosure -ErrorAction Stop).ChassisTypes | Where-Object { $_ -in @(8,9,10,11,14,30,31,32) }).Count -gt 0 } catch { $Portable = $true }
        try {
            $powerText = (Invoke-SynapseXPowerCfg -Arguments @('/qh','SCHEME_CURRENT','SUB_PROCESSOR') -FailureMessage '无法读取处理器电源能力') -join "`n"
            $SupportedSettingIds = @([regex]::Matches($powerText, '(?i)[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}') | ForEach-Object { $_.Value.ToLowerInvariant() } | Sort-Object -Unique)
        } catch { $SupportedSettingIds = @() }
    }

    $normalizedName = $CpuName.Trim()
    $vendor = if ($Manufacturer -match '(?i)AMD|AuthenticAMD' -or $normalizedName -match '(?i)Ryzen') { 'AMD' } elseif ($Manufacturer -match '(?i)Intel|GenuineIntel' -or $normalizedName -match '(?i)Intel') { 'Intel' } else { 'Other' }
    $architecture = 'generic'
    $architectureLabel = '通用处理器'
    if (-not $normalizedName) { $normalizedName = '未识别处理器' }
    $confidence = '未确认'
    $reason = '拓扑未完整读取；不按品牌、代数或线程比例推断大小核，保留平台调度和核心停放。'
    $topologyKnown = $null -ne $Topology -and $Topology.available -and @($Topology.classes).Count -gt 0 -and [int]$Topology.logicalProcessors -eq $LogicalProcessors
    $mixed = $topologyKnown -and @($Topology.classes).Count -gt 1
    $isAmdDesktop = $vendor -eq 'AMD' -and $normalizedName -match '(?i)Ryzen' -and $topologyKnown -and -not $mixed -and [int]$Topology.cacheDomains -eq 1 -and -not $Portable
    $isIntelDesktop = $vendor -eq 'Intel' -and $normalizedName -match '(?i)Core' -and $topologyKnown -and -not $mixed -and [int]$Topology.cacheDomains -eq 1 -and -not $Portable

    if ($mixed) {
        $architecture = if ($vendor -eq 'Intel') { 'intel-hybrid' } else { 'heterogeneous' }
        $architectureLabel = "$vendor 混合能效核心"
        $confidence = '系统检测'
        $reason = 'Windows CPU Sets 返回多个能效等级。保留系统异构调度，不统一强制 P 核、E 核或单一核心组。'
    } elseif ($vendor -eq 'AMD' -and $topologyKnown) {
        $architecture = 'amd-homogeneous'
        $architectureLabel = 'AMD 单一能效等级'
        $confidence = '系统检测'
        $reason = 'Windows 返回单一能效等级；不据此断言各核心缓存或性能完全相同。多缓存域平台保留核心停放，避免覆盖平台调度。'
    } elseif ($vendor -eq 'Intel' -and $topologyKnown) {
        $architecture = 'intel-homogeneous'
        $architectureLabel = 'Intel 单一能效等级'
        $confidence = '系统检测'
        $reason = 'Windows 返回单一能效等级；不据型号或线程比例推断大小核。同类核心桌面提供保守档和性能对比档，不强制绑核。'
    }

    $commonValues = @{ 'processor-min'=5; 'processor-max'=100; 'idle-disabled'=0 }
    $profiles = @()
    # Cache domains are a conservative gate, not a promise about CCD identity.
    # No third-party .pow is shipped or applied wholesale. Unlisted settings inherit locally.
    $basePlanGuid = '381b4222-f694-41f0-9685-ff5bb260df2e'
    $basePlanLabel = '本机 Windows 平衡方案'
    $family = 'generic'; $familyLabel = '未知平台兼容'
    if ($Portable) { $family='portable'; $familyLabel='移动设备兼容' }
    elseif ($isAmdDesktop) { $family='amd-single'; $familyLabel='AMD 单缓存域' }
    elseif ($isIntelDesktop) { $family='intel-uniform'; $familyLabel='Intel 同类核心' }
    elseif ($architecture -eq 'intel-hybrid') { $family='intel-hybrid'; $familyLabel='Intel 大小核' }
    elseif ($vendor -eq 'AMD' -and $topologyKnown -and -not $mixed -and [int]$Topology.cacheDomains -gt 1) { $family='amd-multi'; $familyLabel='AMD 多缓存域 / 多 CCD' }
    if ($family -in @('portable','generic')) { $basePlanGuid='current'; $basePlanLabel='当前电源方案（保留本机定制）' }
    $source = 'SynapseX v2 参数模板；参考微软参数定义与本地计划审计，非第三方整包导入、非跑分排名'
    $balancedValues = $commonValues.Clone()
    if ($isAmdDesktop -or $isIntelDesktop) { $balancedValues['autonomous-mode']=1 }
    $profiles = @(
        New-SynapseXCpuPowerProfile -Id ($family+'-balanced-v2') -Name ('SynapseX '+$familyLabel+' · 均衡') -Badge '保守默认' -Recommended $true -Source $source -Description ('复制'+$basePlanLabel+'；保留调度、核心停放、Boost、EPP 和性能检查间隔。仅调整表中参数。') -Tradeoff '允许处理器空闲，最大状态 100%；未验证提帧收益，不替代芯片组驱动或厂商功耗控制。' -Values $balancedValues
    )
    if ($isAmdDesktop -or $isIntelDesktop) {
        $performanceValues = $balancedValues.Clone()
        $performanceValues['energy-preference']=10
        $performanceValues['core-parking-min']=100
        $performanceValues['core-parking-max']=100
        $performanceValues['scheduling-policy']=0
        $performanceValues['short-scheduling-policy']=0
        $profiles += New-SynapseXCpuPowerProfile -Id ($family+'-response-v2') -Name ('SynapseX '+$familyLabel+' · 响应对比') -Badge '需实测' -Recommended $false -Source $source -Description '长短线程均为所有处理器，EPP 10，停放范围 100%；保留 Idle、自主性能管理及本机 Boost 策略，不设固定升降频阈值。' -Tradeoff '可能增加待机功耗、温度；同类核心不保证调度收益。请对比帧时间、1% Low 和温度，无收益则恢复。' -Values $performanceValues
    } elseif ($family -eq 'intel-hybrid') {
        $performanceValues = $commonValues.Clone(); $performanceValues['energy-preference']=20
        $profiles += New-SynapseXCpuPowerProfile -Id 'intel-hybrid-response-v2' -Name 'SynapseX Intel 大小核 · 性能偏好' -Badge '需实测' -Recommended $false -Source $source -Description '仅增加 EPP 20 性能偏好；P/E 核调度、停放及能效等级专属参数继续继承本机平衡方案。' -Tradeoff '可能增加轻负载功耗；不强制只用 P 核，不保证性能改善。' -Values $performanceValues
    }
    $skippedCount = 0
    if ($live -or $null -ne $SupportedSettingIds) {
        foreach ($profile in $profiles) {
            $before = @($profile.settings).Count
            $profile.settings = @($profile.settings | Where-Object { $SupportedSettingIds -contains $_.setting })
            $skippedCount += $before - @($profile.settings).Count
            # Do not advertise an optional response preset after silently dropping its defining knobs.
            if (-not $profile.recommended -and @($profile.settings).Count -ne $before) { $profile.settings=@() }
        }
    }
    $profiles = @($profiles | Where-Object { @($_.settings | Where-Object key -in @('processor-min','processor-max')).Count -eq 2 })
    if ($profiles.Count -eq 0) {
        return [ordered]@{ cpuName=$normalizedName; manufacturer=$Manufacturer; physicalCores=$PhysicalCores; logicalProcessors=$LogicalProcessors; architecture=$architecture; architectureLabel=$architectureLabel; confidence=$confidence; profileId=''; planName='保留当前电源方案'; reason=$reason; basePlan='Windows 平衡'; scope='没有完整公开基础处理器参数，不创建不完整方案。'; settings=@(); profiles=@(); analysisSummary='本机基础电源能力不可用或读取失败。'; rejectedSummary='可继续使用本机已有电源方案。'; skippedPolicy='保留平台调度。'; retainedMechanisms='保留平台默认'; topologyAvailable=$topologyKnown }
    }
    $recommendedProfile = @($profiles | Where-Object recommended | Select-Object -First 1)[0]

    [ordered]@{
        cpuName = $normalizedName
        manufacturer = $Manufacturer
        physicalCores = $PhysicalCores
        logicalProcessors = $LogicalProcessors
        architecture = $architecture
        architectureLabel = $architectureLabel
        confidence = $confidence
        profileId = [string]$recommendedProfile.id
        planName = [string]$recommendedProfile.name
        reason = $reason
        basePlan = $basePlanLabel
        basePlanGuid = $basePlanGuid
        profileFamily = $family
        scope = '仅修改基准方案的插电 CPU 参数；其他设备及电池参数继承基准，可能与当前方案不同。不改游戏设置。'
        settings = @($recommendedProfile.settings)
        profiles = @($profiles)
        analysisSummary = "本机匹配 $($profiles.Count) 个候选方案，过滤 $skippedCount 个未公开的参数。能力公开不代表硬件必然采用，应用后仍需实测。"
        rejectedSummary = if ($Portable) { '检测为移动设备或机型信息不完整：保留电池、停放与厂商调度策略。' } else { '不直接导入来源电脑的完整 .pow；仅使用当前平台允许的参数。' }
        skippedPolicy = '不强制绑核、不写 HETEROPOLICY；仅同类核心桌面响应对比档将长短线程设为所有处理器。未列参数继承基准方案。'
        retainedMechanisms = '保留 Idle；默认档保留调度与停放'
        topologyAvailable = $topologyKnown
    }
}

function Get-SynapseXPowerLibrary {
    $file=Join-Path $PSScriptRoot '../power-library/catalog.json'
    try {
        $data=Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($data.schema -ne 1 -or @($data.items).Count -lt 1) { throw 'Invalid power library' }
        [ordered]@{items=@($data.items);unavailable=@($data.unavailable);note=[string]$data.note;error=''}
    } catch { [ordered]@{items=@();unavailable=@();note='';error='原始电源计划库未能读取，请使用完整软件包。系统已安装计划仍可选择。'} }
}

function Get-PowerSchemeCatalog {
    $lines = @(& powercfg /list 2>$null | ForEach-Object { [string]$_ })
    $items = foreach ($line in $lines) {
        if ($line -match '(?i)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})') {
            $guid = $matches[1].ToLowerInvariant()
            $name = if ($line -match '\(([^\)]+)\)') { $matches[1].Trim() } else { $guid }
            [ordered]@{ guid = $guid; name = $name; active = $line.Contains('*') }
        }
    }
    [ordered]@{
        items = @($items)
        active = @($items | Where-Object active | Select-Object -First 1)[0]
        cpuRecommendation = Get-CpuPowerRecommendation
        library = Get-SynapseXPowerLibrary
        note = '电源方案会影响处理器调度和节能策略，但“高性能”不保证提升九阴最低帧；应使用固定场景对比。'
    }
}

function Get-OverlayProcessAudit {
    $known = [ordered]@{
        GameBar = 'Xbox Game Bar'
        GameBarFTServer = 'Xbox Game Bar 捕获服务'
        NVIDIAOverlay = 'NVIDIA Overlay'
        nvsphelper64 = 'NVIDIA ShadowPlay Helper'
        Discord = 'Discord'
        steamwebhelper = 'Steam Web Helper'
        RTSS = 'RivaTuner Statistics Server'
        msedgewebview2 = 'WebView2'
        Windhawk = 'Windhawk'
    }
    $found = foreach ($entry in $known.GetEnumerator()) {
        $processes = @(Get-Process -Name $entry.Key -ErrorAction SilentlyContinue)
        if ($processes.Count) {
            [ordered]@{ processName = $entry.Key; displayName = $entry.Value; count = $processes.Count; totalWorkingSetMB = [math]::Round((($processes | Measure-Object WorkingSet64 -Sum).Sum / 1MB), 1) }
        }
    }
    @($found)
}

function Get-GameRuntimeSnapshot {
    $game = Get-Process -Name fxgame -ErrorAction SilentlyContinue | Sort-Object Id | Select-Object -First 1
    $logical = [Environment]::ProcessorCount
    $processInfo = $null
    $power = Get-PowerSchemeCatalog

    if ($game) {
        $native = Get-RuntimePriority -ProcessId $game.Id
        $start = if ($native.StartToken) { [DateTime]::FromFileTimeUtc([long]$native.StartToken).ToLocalTime() } else { $null }
        $affinity = $null
        try { $affinity = $game.ProcessorAffinity.ToInt64() } catch { }
        $processInfo = [ordered]@{
            running = $true
            id = $game.Id
            startTime = if ($start) { $start.ToString('o') } else { '' }
            startToken = [string]$native.StartToken
            ageMinutes = if ($start) { [math]::Round(((Get-Date) - $start).TotalMinutes, 1) } else { $null }
            priority = Get-PriorityLabel $native.Priority
            processorAffinityMask = $affinity
            logicalProcessorCount = $logical
            workingSetMB = [math]::Round($game.WorkingSet64 / 1MB, 1)
            privateMemoryMB = [math]::Round($game.PrivateMemorySize64 / 1MB, 1)
            totalProcessorSeconds = [math]::Round($game.TotalProcessorTime.TotalSeconds, 1)
            path = try { [string]$game.Path } catch { '' }
        }
    }
    $background = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID -and $_.ProcessName -ne 'fxgame' -and $_.WorkingSet64 -gt 150MB } | Sort-Object WorkingSet64 -Descending | Select-Object -First 12 | ForEach-Object {
        [ordered]@{ processName = $_.ProcessName; id = $_.Id; workingSetMB = [math]::Round($_.WorkingSet64 / 1MB, 1); cpuSeconds = [math]::Round($_.CPU, 1) }
    })
    [ordered]@{
        capturedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        game = $processInfo
        power = $power
        overlays = Get-OverlayProcessAudit
        largeBackgroundProcesses = $background
        guidance = [ordered]@{
            affinity = "本机：$($power.cpuRecommendation.cpuName)（$($power.cpuRecommendation.architectureLabel)）。$($power.cpuRecommendation.reason) 限制核心不能将单线程程序变成多线程，本功能不修改亲和性。"
            expectation = '进程与电源调整主要减少外部抢占，不能消除九阴在人多时的主线程对象、UI 和绘制调用瓶颈。'
        }
    }
}

function Set-SynapseXPowerScheme([string]$Guid) {
    $normalized = $Guid.ToLowerInvariant()
    if ($normalized -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') { throw 'Invalid power scheme GUID.' }
    $catalog = Get-PowerSchemeCatalog
    if (@($catalog.items | Where-Object guid -eq $normalized).Count -eq 0) { throw 'The selected power scheme is not installed.' }
    $active = $catalog.active
    if ($null -eq $active) { throw 'The active power scheme could not be detected.' }
    [void](New-Item -ItemType Directory -Path $powerBackupRoot -Force)
    $backupId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $snapshot = [ordered]@{ schemaVersion = 1; backupId = $backupId; createdAt = (Get-Date).ToUniversalTime().ToString('o'); previousGuid = [string]$active.guid; selectedGuid = $normalized }
    [IO.File]::WriteAllText((Join-Path $powerBackupRoot ($backupId + '.json')), ($snapshot | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
    $process = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\powercfg.exe') -ArgumentList @('/setactive',$normalized) -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw 'powercfg could not activate the selected scheme.' }
    Write-RuntimeOperation 'power-scheme-apply' 'success' $backupId @{ previousGuid = $active.guid; selectedGuid = $normalized }
    [ordered]@{ ok = $true; backupId = $backupId; power = Get-PowerSchemeCatalog }
}

function Import-SynapseXPowerLibraryPlan([string]$Id,[bool]$AcceptFullPlan=$false,[bool]$AcceptHighRisk=$false) {
    if (-not (Test-SynapseXRuntimeElevated)) { throw '导入电源计划需要 Windows 管理员权限。' }
    if (-not $AcceptFullPlan) { throw '请确认原始计划会替换整套 AC/DC 及设备电源参数。' }
    if ($Id -cnotmatch '^[a-f0-9]{64}$') { throw '无效的电源计划编号。' }
    $library=Get-SynapseXPowerLibrary
    $selected=@($library.items | Where-Object id -CEQ $Id)
    if ($selected.Count -ne 1) { throw '所选计划不在已校验的原始计划库中。' }
    $plan=$selected[0]
    if ($plan.highRisk -and -not $AcceptHighRisk) { throw '此计划包含高风险参数，请另行勾选风险确认。' }
    $file=Join-Path $PSScriptRoot ('../power-library/'+$Id+'.pow')
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $Id) { throw '电源计划文件校验失败，未执行导入。' }
    $catalog=Get-PowerSchemeCatalog
    if (-not $catalog.active) { throw '无法确认当前电源计划，已取消导入。' }
    $previous=[string]$catalog.active.guid
    $created=[guid]::NewGuid().ToString()
    $backupId='library-'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N')
    New-Item -ItemType Directory -Path $powerBackupRoot -Force | Out-Null
    $backup=Join-Path $powerBackupRoot ($backupId+'.pow')
    Invoke-SynapseXPowerCfg @('/export',$backup,$previous) '无法备份原电源计划，未导入。' | Out-Null
    $snapshot=@{previousGuid=$previous;createdGuid=$created;source='power-library';libraryId=$Id;name=$plan.name;createdAt=(Get-Date).ToString('o');backupHash=(Get-FileHash -LiteralPath $backup).Hash}
    [IO.File]::WriteAllText((Join-Path $powerBackupRoot ($backupId+'.json')),($snapshot|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
    $imported=$false
    try {
        Invoke-SynapseXPowerCfg @('/import',$file,$created) '无法导入原始电源计划。' | Out-Null
        $imported=$true
        Invoke-SynapseXPowerCfg @('/changename',$created,('SynapseX 原始 · '+[string]$plan.name)) '无法命名导入计划。' | Out-Null
        $values=Get-SynapseXPowerValues $created
        if (-not $values.ContainsKey('bc5038f7-23e0-4960-96da-33abaf5935ec')) { throw '导入计划缺少可读取的处理器参数，已取消。' }
        Invoke-SynapseXPowerCfg @('/setactive',$created) '无法启用导入计划。' | Out-Null
        $after=Get-PowerSchemeCatalog
        if ($after.active.guid -ne $created) { throw '电源计划启用回读不一致。' }
        Write-RuntimeOperation 'power-library-apply' 'success' $backupId @{libraryId=$Id;createdGuid=$created;previousGuid=$previous}
        [ordered]@{ok=$true;backupId=$backupId;createdGuid=$created;power=$after}
    } catch {
        $failure=$_.Exception.Message
        if ($imported) {
            try {
                Invoke-SynapseXPowerCfg @('/setactive',$previous) '恢复原计划失败。' | Out-Null
                Invoke-SynapseXPowerCfg @('/delete',$created) '清理未完成的导入计划失败。' | Out-Null
            } catch { throw ($failure+' 回滚未完成，请恢复备份：'+$backupId) }
        }
        throw $failure
    }
}

function Restore-SynapseXPowerScheme([string]$BackupId = 'latest') {
    $backups = @(Get-ChildItem -LiteralPath $powerBackupRoot -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc,BaseName -Descending)
    if ($backups.Count -eq 0) { throw 'No SynapseX power backup exists.' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object BaseName -eq $BackupId | Select-Object -First 1 }
    if ($null -eq $selected) { throw "Power backup not found: $BackupId" }
    $snapshot = Get-Content -LiteralPath $selected.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    $guid = [string]$snapshot.previousGuid
    if ($guid -notmatch '^[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$') { throw '备份中的电源计划编号无效。' }
    if ($snapshot.source -eq 'power-library' -and @((Get-PowerSchemeCatalog).items | Where-Object guid -eq $guid).Count -eq 0) {
        $exported=Join-Path $powerBackupRoot ($selected.BaseName+'.pow')
        if ((Get-FileHash -LiteralPath $exported).Hash -ne $snapshot.backupHash) { throw '原计划备份校验失败，未恢复。' }
        Invoke-SynapseXPowerCfg @('/import',$exported,$guid) '无法恢复原电源计划备份。' | Out-Null
    }
    $process = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\powercfg.exe') -ArgumentList @('/setactive',$guid) -WindowStyle Hidden -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw 'powercfg could not restore the previous scheme.' }
    Write-RuntimeOperation 'power-scheme-restore' 'success' $selected.BaseName @{ restoredGuid = $guid }
    [ordered]@{ ok = $true; backupId = $selected.BaseName; power = Get-PowerSchemeCatalog }
}

function Get-SynapseXPowerValues([string]$Guid) {
    $lines = Invoke-SynapseXPowerCfg -Arguments @('/qh',$Guid) -FailureMessage '无法回读电源参数。'
    $map = @{}; $key = ''
    foreach ($line in $lines) {
        if ($line -match '(?:Power Setting GUID|电源设置 GUID):\s*([0-9a-fA-F-]{36})') {
            $key = $matches[1].ToLowerInvariant(); $map[$key]=@{ ac=$null; dc=$null }
        } elseif ($key -and $line -match '(?:Current AC Power Setting Index|当前交流电源设置索引):\s*0x([0-9a-fA-F]+)') {
            $map[$key].ac=[Convert]::ToInt64($matches[1],16)
        } elseif ($key -and $line -match '(?:Current DC Power Setting Index|当前直流电源设置索引):\s*0x([0-9a-fA-F]+)') {
            $map[$key].dc=[Convert]::ToInt64($matches[1],16)
        }
    }
    if ($map.Count -lt 2) { throw '无法解析电源参数；仅支持可校验的系统输出，未激活方案。' }
    return $map
}

function Assert-SynapseXPowerValues($Before, $After, $Settings) {
    $expected=@{}
    foreach ($setting in $Settings) { $expected[[string]$setting.setting]=[long]$setting.acValue }
    if ($Before.Count -ne $After.Count) { throw '电源参数数量变化，已取消应用。' }
    foreach ($key in $Before.Keys) {
        if (-not $After.ContainsKey($key)) { throw "电源参数丢失：$key" }
        $ac = if ($expected.ContainsKey($key)) { $expected[$key] } else { $Before[$key].ac }
        if ($After[$key].ac -ne $ac -or $After[$key].dc -ne $Before[$key].dc) { throw "电源参数回读不一致：$key；已取消应用。" }
    }
    foreach ($key in $expected.Keys) {
        if (-not $After.ContainsKey($key) -or $After[$key].ac -ne $expected[$key]) { throw "目标参数未写入：$key" }
    }
}

function New-SynapseXCpuPowerPlan([string]$ProfileId = 'auto') {
    if (-not (Test-SynapseXRuntimeElevated)) { throw '创建电源方案需要以管理员身份运行 SynapseX。' }
    $recommendation = Get-CpuPowerRecommendation
    $selectedProfile = if ($ProfileId -eq 'auto') {
        @($recommendation.profiles | Where-Object recommended | Select-Object -First 1)[0]
    } else {
        @($recommendation.profiles | Where-Object id -eq $ProfileId | Select-Object -First 1)[0]
    }
    if ($null -eq $selectedProfile) { throw '所选 CPU 电源配置与本机检测结果不一致，请重新检测。' }
    $catalog = Get-PowerSchemeCatalog
    if ($null -eq $catalog.active) { throw '无法识别当前电源方案。' }

    $balancedGuid = if ($recommendation.basePlanGuid -eq 'current') { [string]$catalog.active.guid } else { [string]$recommendation.basePlanGuid }
    $baseValues = Get-SynapseXPowerValues $balancedGuid
    $createdGuid = [guid]::NewGuid().ToString().ToLowerInvariant()
    $backupId = 'cpuplan-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff')
    $appliedSettings = @()
    $skippedSettings = @()
    $created = $false
    try {
        [void](Invoke-SynapseXPowerCfg -Arguments @('/duplicatescheme', $balancedGuid, $createdGuid) -FailureMessage '无法复制本机基准电源方案；未修改原方案。')
        $created = $true
        [void](Invoke-SynapseXPowerCfg -Arguments @('/changename', $createdGuid, [string]$selectedProfile.name, 'SynapseX 可恢复的 CPU 游戏方案；仅修改插电时处理器参数。') -FailureMessage '无法命名 SynapseX 电源方案。')

        foreach ($setting in @($selectedProfile.settings)) {
            try {
                [void](Invoke-SynapseXPowerCfg -Arguments @('/setacvalueindex', $createdGuid, [string]$setting.subgroup, [string]$setting.setting, [string]$setting.acValue) -FailureMessage ('无法设置：' + [string]$setting.name))
                $appliedSettings += $setting
            } catch {
                $skippedSettings += [ordered]@{ key = [string]$setting.key; name = [string]$setting.name; reason = $_.Exception.Message }
            }
        }
        if (@($appliedSettings | Where-Object key -in @('processor-min','processor-max')).Count -lt 2 -or $skippedSettings.Count -gt 0) { throw '预览中的处理器参数未能完整写入，已取消创建并回滚，不应用残缺方案。' }
        Assert-SynapseXPowerValues -Before $baseValues -After (Get-SynapseXPowerValues $createdGuid) -Settings $appliedSettings

        [void](New-Item -ItemType Directory -Path $cpuPowerBackupRoot -Force)
        $snapshot = [ordered]@{
            schemaVersion = 2
            backupId = $backupId
            createdAt = (Get-Date).ToUniversalTime().ToString('o')
            previousGuid = [string]$catalog.active.guid
            createdGuid = $createdGuid
            profileId = [string]$selectedProfile.id
            planName = [string]$selectedProfile.name
            cpu = [ordered]@{ name = [string]$recommendation.cpuName; architecture = [string]$recommendation.architecture; physicalCores = [int]$recommendation.physicalCores; logicalProcessors = [int]$recommendation.logicalProcessors }
            appliedSettings = @($appliedSettings)
            skippedSettings = @($skippedSettings)
        }
        [IO.File]::WriteAllText((Join-Path $cpuPowerBackupRoot ($backupId + '.json')), ($snapshot | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
        [void](Invoke-SynapseXPowerCfg -Arguments @('/setactive', $createdGuid) -FailureMessage '无法激活 SynapseX CPU 电源方案。')
        Write-RuntimeOperation 'cpu-power-plan-create' 'success' $backupId @{ previousGuid = $catalog.active.guid; createdGuid = $createdGuid; profileId = $selectedProfile.id; appliedCount = $appliedSettings.Count; skippedCount = $skippedSettings.Count }
        [ordered]@{ ok = $true; backupId = $backupId; createdGuid = $createdGuid; appliedSettings = @($appliedSettings); skippedSettings = @($skippedSettings); power = Get-PowerSchemeCatalog }
    } catch {
        if ($created) {
            try {
                [void](Invoke-SynapseXPowerCfg -Arguments @('/setactive', [string]$catalog.active.guid) -FailureMessage '无法恢复原电源方案。')
                [void](Invoke-SynapseXPowerCfg -Arguments @('/delete', $createdGuid) -FailureMessage '无法删除未完成的 SynapseX 电源方案。')
            } catch { }
        }
        Write-RuntimeOperation 'cpu-power-plan-create' 'failed' $backupId @{ createdGuid = $createdGuid; error = $_.Exception.Message }
        throw
    }
}

function Restore-SynapseXCpuPowerPlan([string]$BackupId = 'latest') {
    if (-not (Test-SynapseXRuntimeElevated)) { throw '恢复电源方案需要以管理员身份运行 SynapseX。' }
    $backups = @(Get-ChildItem -LiteralPath $cpuPowerBackupRoot -Filter 'cpuplan-*.json' -File -ErrorAction SilentlyContinue | Sort-Object BaseName -Descending)
    if ($backups.Count -eq 0) { throw '没有找到 SynapseX CPU 电源方案备份。' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object BaseName -eq $BackupId | Select-Object -First 1 }
    if ($null -eq $selected) { throw "CPU power backup not found: $BackupId" }
    $snapshot = Get-Content -LiteralPath $selected.FullName -Raw | ConvertFrom-Json
    if ([int]$snapshot.schemaVersion -ne 2 -or [string]::IsNullOrWhiteSpace([string]$snapshot.createdGuid)) { throw 'CPU 电源方案备份格式无效。' }

    $catalog = Get-PowerSchemeCatalog
    $previousGuid = ([string]$snapshot.previousGuid).ToLowerInvariant()
    $createdGuid = ([string]$snapshot.createdGuid).ToLowerInvariant()
    if (@($catalog.items | Where-Object guid -eq $previousGuid).Count -eq 0) { throw '原电源方案已不存在，未执行恢复。' }
    [void](Invoke-SynapseXPowerCfg -Arguments @('/setactive', $previousGuid) -FailureMessage '无法恢复原电源方案。')

    $removed = $false
    $catalogAfterRestore = Get-PowerSchemeCatalog
    $createdPlan = @($catalogAfterRestore.items | Where-Object guid -eq $createdGuid | Select-Object -First 1)[0]
    if ($null -ne $createdPlan -and ([string]$createdPlan.name).StartsWith('SynapseX ', [StringComparison]::OrdinalIgnoreCase)) {
        [void](Invoke-SynapseXPowerCfg -Arguments @('/delete', $createdGuid) -FailureMessage '原方案已恢复，但无法删除 SynapseX 创建的方案。')
        $removed = $true
    }
    Write-RuntimeOperation 'cpu-power-plan-restore' 'success' $selected.BaseName @{ restoredGuid = $previousGuid; createdGuid = $createdGuid; removed = $removed }
    [ordered]@{ ok = $true; backupId = $selected.BaseName; removed = $removed; power = Get-PowerSchemeCatalog }
}

Export-ModuleMember -Function Get-GameRuntimeSnapshot, Get-PowerSchemeCatalog, Get-CpuPowerRecommendation, Set-SynapseXPowerScheme, Restore-SynapseXPowerScheme, New-SynapseXCpuPowerPlan, Restore-SynapseXCpuPowerPlan, Get-SynapseXPowerLibrary, Import-SynapseXPowerLibraryPlan
