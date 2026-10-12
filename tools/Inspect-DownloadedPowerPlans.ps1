[CmdletBinding()]
param(
    [string]$DownloadsRoot = 'C:\Users\Administrator\Downloads',
    [string]$ExtractedRoot = 'D:\project\SynapseXOptimizer\state\download-power-plan-analysis-20260901',
    [string]$OutputPath = 'D:\project\SynapseXOptimizer\state\download-power-plan-report.json'
)

$ErrorActionPreference = 'Stop'

function Convert-PowerQueryToMap([string[]]$Lines) {
    $map = @{}
    $currentGuid = ''
    foreach ($line in $Lines) {
        if ($line -match 'Power Setting GUID:\s*([0-9a-fA-F-]{36})' -or $line -match '电源设置 GUID:\s*([0-9a-fA-F-]{36})') {
            $currentGuid = $matches[1].ToLowerInvariant()
            if (-not $map.ContainsKey($currentGuid)) { $map[$currentGuid] = [ordered]@{ ac = $null; dc = $null } }
            continue
        }
        if ([string]::IsNullOrWhiteSpace($currentGuid)) { continue }
        if ($line -match 'Current AC Power Setting Index:\s*0x([0-9a-fA-F]+)' -or $line -match '当前交流电源设置索引:\s*0x([0-9a-fA-F]+)') {
            $map[$currentGuid].ac = [Convert]::ToInt64($matches[1], 16)
        } elseif ($line -match 'Current DC Power Setting Index:\s*0x([0-9a-fA-F]+)' -or $line -match '当前直流电源设置索引:\s*0x([0-9a-fA-F]+)') {
            $map[$currentGuid].dc = [Convert]::ToInt64($matches[1], 16)
        }
    }
    $map
}

function Get-AcValue($Map, [string]$Guid) {
    $key = $Guid.ToLowerInvariant()
    if ($Map.ContainsKey($key)) { return $Map[$key].ac }
    $null
}

$allFiles = @(
    Get-ChildItem -LiteralPath $DownloadsRoot -Filter '*.pow' -File -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $ExtractedRoot) { Get-ChildItem -LiteralPath $ExtractedRoot -Filter '*.pow' -File -Recurse -ErrorAction SilentlyContinue | Where-Object Length -gt 0 }
)

$groups = @($allFiles | ForEach-Object {
    [pscustomobject]@{ file = $_; hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
} | Group-Object hash)

$activeBefore = (& powercfg.exe /GETACTIVESCHEME | Out-String).Trim()
$results = New-Object Collections.Generic.List[object]

foreach ($group in $groups) {
    $entry = $group.Group | Select-Object -First 1
    $file = $entry.file
    $guid = [guid]::NewGuid().ToString()
    $importOutput = @(& powercfg.exe /IMPORT $file.FullName $guid 2>&1 | ForEach-Object { [string]$_ })
    $imported = ($LASTEXITCODE -eq 0)
    try {
        if (-not $imported) {
            [void]$results.Add([pscustomobject][ordered]@{
                hash = $group.Name; name = $file.BaseName; source = $file.FullName; sources = @($group.Group.file.FullName)
                imported = $false; verdict = 'invalid'; reasons = @($importOutput)
            })
            continue
        }

        $query = @(& powercfg.exe /QH $guid 2>&1 | ForEach-Object { [string]$_ })
        if ($LASTEXITCODE -ne 0) { throw "Unable to query imported plan: $($file.FullName)" }
        $map = Convert-PowerQueryToMap $query
        if ($map.Count -eq 0) { throw 'No settings parsed; do not report an empty plan as valid.' }
        $schemeLine = $query | Where-Object { $_ -match '(?i)Power Scheme GUID|电源方案 GUID' } | Select-Object -First 1
        $schemeName = if ($schemeLine -match '\((.+)\)') { $matches[1] } else { $file.BaseName }
        $values = [ordered]@{
            minProcessor = Get-AcValue $map '893dee8e-2bef-41e0-89c6-b55d0929964c'
            maxProcessor = Get-AcValue $map 'bc5038f7-23e0-4960-96da-33abaf5935ec'
            idleDisabled = Get-AcValue $map '5d76a2ca-e8c0-402f-a133-2158492d58ad'
            autonomousMode = Get-AcValue $map '8baa4a8a-14c6-4451-8e8b-14bdbd197537'
            boostMode = Get-AcValue $map 'be337238-0d82-4146-a960-4f3749d470c7'
            boostPolicy = Get-AcValue $map '45bcc044-d885-43e2-8605-ee0ec6e96b59'
            energyPreference = Get-AcValue $map '36687f9e-e3a5-4dbf-b1dc-15eb381c6863'
            coreParkingMin = Get-AcValue $map '0cc5b647-c1df-4637-891a-dec35c318583'
            coreParkingMax = Get-AcValue $map 'ea062031-0e34-4ff1-9b6d-eb1059334028'
            performanceCheckMs = Get-AcValue $map '4d2b0152-7d5c-498b-88e2-34345392a2c5'
            increaseThreshold = Get-AcValue $map '06cadf0e-64ed-448a-8927-ce7bf90eb35d'
            decreaseThreshold = Get-AcValue $map '12a0ab44-fe28-4fa9-b3bd-4b64f44960a6'
            increasePolicy = Get-AcValue $map '465e1f50-b610-473a-ab58-00d1077dc418'
            decreasePolicy = Get-AcValue $map '40fbefc7-2e9d-4d25-a185-0cfd8574bac6'
            coolingPolicy = Get-AcValue $map '94d3a615-a899-4ac5-ae2b-e4d8f634367f'
            heteroPolicy = Get-AcValue $map '7f2f5cfa-f10c-4823-b5e1-e93ae85f46b5'
            schedulingPolicy = Get-AcValue $map '93b8b6dc-0698-4d1c-9ee4-0644e900c85d'
            shortSchedulingPolicy = Get-AcValue $map 'bae08b81-2d5e-4688-ad6a-13243356654b'
            pcieLinkState = Get-AcValue $map 'ee12f906-d277-404b-b6da-e5fa1a576df5'
            usbSelectiveSuspend = Get-AcValue $map '48e6b7a6-50f5-4782-a5d4-53bb8f07e226'
        }

        $reasons = New-Object Collections.Generic.List[string]
        if ($null -eq $values.maxProcessor -or $values.maxProcessor -lt 100) { [void]$reasons.Add('最大处理器状态缺失或低于 100%；非通用游戏默认') }
        if ($values.idleDisabled -eq 1) { [void]$reasons.Add('禁用处理器空闲状态；不纳入通用方案') }
        if ($values.autonomousMode -eq 0) { [void]$reasons.Add('关闭自主性能管理；硬件相关，不直接套用') }
        if ($values.boostMode -eq 0) { [void]$reasons.Add('关闭 Boost；可能是降温取舍而非性能优化') }
        if ($null -ne $values.performanceCheckMs -and $values.performanceCheckMs -lt 5) { [void]$reasons.Add('性能检查间隔小于 5ms；无实测收益证据') }
        if ($values.schedulingPolicy -in @(1,3) -or $values.shortSchedulingPolicy -in @(1,3)) { [void]$reasons.Add('限制线程使用某类处理器；不适合跨 CPU 通用') }
        if ($values.schedulingPolicy -eq 0 -and $values.shortSchedulingPolicy -eq 0) { [void]$reasons.Add('长短线程均为所有处理器；不等于所有核心常驻工作') }
        if ($values.pcieLinkState -eq 0 -or $values.usbSelectiveSuspend -eq 0) { [void]$reasons.Add('还改动 PCIe/USB 节能；新 CPU 方案不复制这些设备参数') }
        if ($values.minProcessor -eq 100) { [void]$reasons.Add('最低处理器状态 100%，待机功耗和温度更高') }
        if ($values.coreParkingMin -eq 100) { [void]$reasons.Add('关闭核心停放，适合固定场景测试但会提高空闲功耗') }
        if ($reasons.Count -eq 0) { [void]$reasons.Add('已读取；不代表经性能测试验证') }
        $verdict = if ($values.idleDisabled -eq 1 -or $values.schedulingPolicy -in @(1,3) -or $values.shortSchedulingPolicy -in @(1,3)) { 'not-universal' } else { 'reference-only' }

        [void]$results.Add([pscustomobject][ordered]@{
            hash = $group.Name
            name = $schemeName
            source = $file.FullName
            sources = @($group.Group.file.FullName)
            imported = $true
            verdict = $verdict
            values = [pscustomobject]$values
            allSettings = $map
            reasons = @($reasons)
        })
    } finally {
        if ($imported) {
            & powercfg.exe /DELETE $guid 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Temporary plan cleanup failed: $guid" }
        }
    }
}

$activeAfter = (& powercfg.exe /GETACTIVESCHEME | Out-String).Trim()
$report = [pscustomobject][ordered]@{
    generatedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    activeSchemeUnchanged = ($activeBefore -eq $activeAfter)
    uniquePlanCount = $groups.Count
    validPlanCount = @($results | Where-Object imported).Count
    invalidPlanCount = @($results | Where-Object { -not $_.imported }).Count
    interpretation = '本机 powercfg 解析结果（含系统解析的缺省值），不是跨硬件性能测评；AC/DC 原始值均保留。临时导入用于读取，未激活。'
    plans = @($results | Sort-Object -Property name)
}

$directory = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $directory)) { [void](New-Item -ItemType Directory -Path $directory -Force) }
[IO.File]::WriteAllText($OutputPath, ($report | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
$report
