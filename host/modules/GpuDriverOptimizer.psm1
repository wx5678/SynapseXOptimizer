Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:bridgePath = Join-Path (Split-Path -Parent $PSScriptRoot) 'native\GpuDriverBridge.cs'
$script:stateBase = if ([string]::IsNullOrWhiteSpace($env:SYNAPSEX_STATE_ROOT)) { Join-Path $env:LOCALAPPDATA 'SynapseX\state' } else { [IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT) }
$script:backupRoot = Join-Path $script:stateBase 'gpu-driver-backups'
$script:nvidiaSettings = @(
    [ordered]@{ key = 'power'; id = [uint32]0x1057EB71; name = '电源管理模式'; values = @{ ([uint32]0) = '自适应'; ([uint32]1) = '最高性能优先'; ([uint32]5) = '最佳功耗' }; description = '控制该游戏运行时 NVIDIA GPU 是否积极保持高性能状态。最高性能优先可减少频率切换，不会提高显卡功耗上限。' },
    [ordered]@{ key = 'shader-cache'; id = [uint32]0x00198FFF; name = '着色器磁盘缓存'; values = @{ ([uint32]0) = '关闭'; ([uint32]1) = '开启' }; description = '允许驱动复用已经编译的着色器，减少重复编译引起的卡顿。' },
    [ordered]@{ key = 'vsync'; id = [uint32]0x00A879CF; name = '垂直同步'; values = @{ ([uint32]0x60925292) = '由游戏控制'; ([uint32]0x08416747) = '强制关闭'; ([uint32]0x47814940) = '强制开启' }; description = '由游戏控制不会覆盖游戏内选择；强制关闭可解除驱动限帧，但可能出现画面撕裂。' },
    [ordered]@{ key = 'texture-quality'; id = [uint32]0x00CE2691; name = '纹理过滤质量'; values = @{ ([uint32]4294967286) = '高质量'; ([uint32]0) = '质量'; ([uint32]0x0a) = '性能'; ([uint32]0x14) = '高性能' }; description = '性能档减少驱动纹理过滤开销，可能降低远处纹理的清晰度。' }
)
$script:amdFeatures = @(
    [ordered]@{ key = 'anti-lag'; name = 'Radeon Anti-Lag'; description = '减少 CPU 提前排队的帧数以降低输入延迟；它不是提高平均帧数的功能。' },
    [ordered]@{ key = 'chill'; name = 'Radeon Chill'; description = '按输入活动动态限制帧率以降低功耗。关闭后避免它主动压低帧数。' },
    [ordered]@{ key = 'boost'; name = 'Radeon Boost'; description = '快速移动时动态降低分辨率以提高帧率。关闭后保持原始分辨率和画质。' },
    [ordered]@{ key = 'enhanced-sync'; name = '增强同步'; description = '在高帧率时降低撕裂并减少传统垂直同步等待；兼容性取决于游戏和显示模式。' },
    [ordered]@{ key = 'frtc'; name = '目标帧率控制'; description = '驱动级帧率上限。关闭后不会由 FRTC 限制游戏最高帧数。' }
)

function Initialize-GpuDriverBridge {
    if ('SynapseX.Native.NvidiaDrsBridge' -as [type]) { return }
    if (-not (Test-Path -LiteralPath $script:bridgePath -PathType Leaf)) { throw 'GPU driver bridge source is missing.' }
    Add-Type -Path $script:bridgePath
}

function Get-RealGpuDevices {
    @(
        Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | ForEach-Object {
            $pnp = [string]$_.PNPDeviceID
            $name = [string]$_.Name
            $vendor = if ($pnp -match '(?i)VEN_10DE' -or $name -match '(?i)NVIDIA') { 'nvidia' } elseif ($pnp -match '(?i)VEN_1002' -or $name -match '(?i)AMD|Radeon') { 'amd' } else { 'other' }
            [ordered]@{ name = $name; vendor = $vendor; driverVersion = [string]$_.DriverVersion; pnpDeviceId = $pnp }
        } | Where-Object vendor -ne 'other'
    )
}

function Convert-NvidiaValueLabel($Definition, [uint32]$Value) {
    $key = [uint32]$Value
    if ($Definition.values.ContainsKey($key)) { return [string]$Definition.values[$key] }
    '0x{0:X8}' -f $key
}

function Get-NvidiaProvider([string]$ExecutablePath, $Device) {
    $keys = [string[]]@($script:nvidiaSettings | ForEach-Object key)
    $ids = [uint32[]]@($script:nvidiaSettings | ForEach-Object { [uint32]$_.id })
    $native = [SynapseX.Native.NvidiaDrsBridge]::Query($ExecutablePath, $keys, $ids)
    $items = @()
    foreach ($definition in $script:nvidiaSettings) {
        $state = @($native.Settings | Where-Object Key -eq $definition.key | Select-Object -First 1)[0]
        $items += [ordered]@{
            key = $definition.key
            name = $definition.name
            description = $definition.description
            supported = ($null -ne $state -and [bool]$state.Supported)
            currentValue = if ($state) { [uint32]$state.Value } else { $null }
            currentLabel = if ($state) { Convert-NvidiaValueLabel $definition ([uint32]$state.Value) } else { '不可读取' }
            source = if ($state -and [bool]$state.HasProfileValue) { '当前游戏 Profile' } else { '继承驱动默认值' }
        }
    }
    [ordered]@{
        vendor = 'nvidia'; vendorName = 'NVIDIA'; gpuName = [string]$Device.name; driverVersion = [string]$Device.driverVersion
        available = [bool]$native.Available; error = [string]$native.Error; scope = 'per-game'; scopeLabel = '按游戏独立生效（按可执行文件名）'
        applicationFound = [bool]$native.ApplicationFound; items = $items
        profiles = @(
            [ordered]@{ id = 'nvidia-stable'; name = 'NVIDIA 稳定高帧'; recommended = $true; qualityCost = '无画质代价'; description = '最高性能电源、着色器缓存开启，垂直同步交给游戏控制。'; targets = @([ordered]@{ key='power'; value=[uint32]1; label='最高性能优先' }, [ordered]@{ key='shader-cache'; value=[uint32]1; label='开启' }, [ordered]@{ key='vsync'; value=[uint32]0x60925292; label='由游戏控制' }) },
            [ordered]@{ id = 'nvidia-maximum-fps'; name = 'NVIDIA 最大帧数'; recommended = $false; qualityCost = '可能出现撕裂、纹理清晰度降低'; description = '在稳定高帧基础上强制关闭垂直同步，并把纹理过滤改为高性能。'; targets = @([ordered]@{ key='power'; value=[uint32]1; label='最高性能优先' }, [ordered]@{ key='shader-cache'; value=[uint32]1; label='开启' }, [ordered]@{ key='vsync'; value=[uint32]0x08416747; label='强制关闭' }, [ordered]@{ key='texture-quality'; value=[uint32]0x14; label='高性能' }) }
        )
    }
}

function Get-AmdProvider($Device) {
    $native = [SynapseX.Native.AmdAdlxBridge]::Query()
    $items = foreach ($definition in $script:amdFeatures) {
        $state = @($native.Features | Where-Object Key -eq $definition.key | Select-Object -First 1)[0]
        [ordered]@{
            key = $definition.key; name = $definition.name; description = $definition.description
            supported = ($null -ne $state -and [bool]$state.Supported)
            currentValue = if ($state -and [bool]$state.Supported) { [bool]$state.Enabled } else { $null }
            currentLabel = if ($state -and [bool]$state.Supported) { if ([bool]$state.Enabled) { '开启' } else { '关闭' } } else { '不支持' }
            source = 'AMD 驱动全局 3D 设置'
        }
    }
    [ordered]@{
        vendor = 'amd'; vendorName = 'AMD'; gpuName = if ([string]::IsNullOrWhiteSpace([string]$native.GpuName)) { [string]$Device.name } else { [string]$native.GpuName }; driverVersion = [string]$Device.driverVersion
        available = [bool]$native.Available; error = [string]$native.Error; scope = 'global'; scopeLabel = 'AMD 驱动全局生效（会影响其他游戏）'
        applicationFound = $true; items = @($items)
        profiles = @(
            [ordered]@{ id = 'amd-stable'; name = 'AMD 稳定高帧'; recommended = $true; qualityCost = '保持原始分辨率'; description = '关闭 Chill、FRTC 和 Boost，避免驱动限帧或动态降低分辨率。'; targets = @([ordered]@{ key='chill'; value=$false; label='关闭' }, [ordered]@{ key='frtc'; value=$false; label='关闭' }, [ordered]@{ key='boost'; value=$false; label='关闭' }) },
            [ordered]@{ id = 'amd-low-latency'; name = 'AMD 低延迟'; recommended = $false; qualityCost = '不降低画质；可能轻微影响峰值帧数'; description = '稳定高帧设置加上 Radeon Anti-Lag，优先降低输入排队延迟。'; targets = @([ordered]@{ key='chill'; value=$false; label='关闭' }, [ordered]@{ key='frtc'; value=$false; label='关闭' }, [ordered]@{ key='boost'; value=$false; label='关闭' }, [ordered]@{ key='anti-lag'; value=$true; label='开启' }) }
        )
    }
}

function Get-GpuDriverOptimizationCatalog([string]$ExecutablePath) {
    if ([string]::IsNullOrWhiteSpace($ExecutablePath)) { throw '请先选择游戏 EXE，再读取显卡驱动设置。' }
    $fullPath = [IO.Path]::GetFullPath($ExecutablePath)
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf) -or [IO.Path]::GetExtension($fullPath) -ine '.exe') { throw 'game executable does not exist' }
    Initialize-GpuDriverBridge
    $devices = @(Get-RealGpuDevices)
    $providers = @()
    foreach ($device in $devices) {
        if ($device.vendor -eq 'nvidia' -and @($providers | Where-Object vendor -eq 'nvidia').Count -eq 0) { $providers += Get-NvidiaProvider $fullPath $device }
        if ($device.vendor -eq 'amd' -and @($providers | Where-Object vendor -eq 'amd').Count -eq 0) { $providers += Get-AmdProvider $device }
    }
    [ordered]@{
        capturedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'); executablePath = $fullPath; devices = $devices; providers = $providers
        note = if ($providers.Count) { '只显示驱动明确支持且可读取的设置。NVIDIA 按游戏 Profile 生效；AMD ADLX 3D 设置为驱动全局范围。' } else { '未检测到 NVIDIA 或 AMD 实体显卡。Windows 每应用 GPU 首选项仍可单独使用。' }
    }
}

function Find-GpuProfile($Catalog, [string]$Provider, [string]$ProfileId) {
    $providerState = @($Catalog.providers | Where-Object vendor -eq $Provider | Select-Object -First 1)[0]
    if (-not $providerState) { throw "GPU provider is unavailable: $Provider" }
    if (-not [bool]$providerState.available) { throw "GPU provider cannot execute: $($providerState.error)" }
    $profile = @($providerState.profiles | Where-Object id -eq $ProfileId | Select-Object -First 1)[0]
    if (-not $profile) { throw "GPU driver profile is unknown: $ProfileId" }
    [ordered]@{ provider = $providerState; profile = $profile }
}

function Save-GpuDriverBackup($Metadata) {
    [void](New-Item -ItemType Directory -Path $script:backupRoot -Force)
    $backupId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $Metadata.backupId = $backupId
    $Metadata.createdAt = (Get-Date).ToUniversalTime().ToString('o')
    [IO.File]::WriteAllText((Join-Path $script:backupRoot ($backupId + '.json')), ($Metadata | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
    $backupId
}

function Set-GpuDriverOptimizationProfile([string]$ExecutablePath, [string]$Provider, [string]$ProfileId) {
    $catalog = Get-GpuDriverOptimizationCatalog $ExecutablePath
    $selection = Find-GpuProfile $catalog $Provider $ProfileId
    $supportedKeys = @($selection.provider.items | Where-Object supported | ForEach-Object key)
    $targets = @($selection.profile.targets | Where-Object {
        if ($supportedKeys -notcontains $_.key) { return $false }
        $current = @($selection.provider.items | Where-Object key -eq $_.key | Select-Object -First 1)[0]
        ("$($current.currentValue)" -cne "$($_.value)")
    })
    if ($targets.Count -eq 0) { throw 'The selected GPU profile has no supported settings on this driver.' }
    if ($Provider -eq 'nvidia') {
        $definitions = @($targets | ForEach-Object { $target = $_; $script:nvidiaSettings | Where-Object key -eq $target.key | Select-Object -First 1 })
        $native = [SynapseX.Native.NvidiaDrsBridge]::Apply([IO.Path]::GetFullPath($ExecutablePath), [string[]]@($targets.key), [uint32[]]@($definitions.id), [uint32[]]@($targets.value))
        if (-not [bool]$native.Available) { throw "NVIDIA DRS apply failed: $($native.Error)" }
        $metadata = [ordered]@{ schemaVersion=1; provider='nvidia'; profileId=$ProfileId; executablePath=[IO.Path]::GetFullPath($ExecutablePath); createdProfile=[bool]$native.CreatedProfile; settings=@($native.Settings | ForEach-Object { [ordered]@{ key=[string]$_.Key; id=[uint32]$_.Id; value=[uint32]$_.Value; hadProfileValue=[bool]$_.HasProfileValue } }) }
    } elseif ($Provider -eq 'amd') {
        $before = @($selection.provider.items | Where-Object { $targets.key -contains $_.key -and $_.supported } | ForEach-Object { [ordered]@{ key=$_.key; enabled=[bool]$_.currentValue } })
        $native = [SynapseX.Native.AmdAdlxBridge]::Apply([string[]]@($targets.key), [bool[]]@($targets.value))
        if (-not [bool]$native.Available) {
            if ($before.Count) { [void][SynapseX.Native.AmdAdlxBridge]::Apply([string[]]@($before.key), [bool[]]@($before.enabled)) }
            throw "AMD ADLX apply failed: $($native.Error)"
        }
        $metadata = [ordered]@{ schemaVersion=1; provider='amd'; profileId=$ProfileId; executablePath=[IO.Path]::GetFullPath($ExecutablePath); settings=$before }
    } else { throw "Unsupported GPU provider: $Provider" }
    $backupId = Save-GpuDriverBackup $metadata
    [ordered]@{ ok=$true; backupId=$backupId; provider=$Provider; profileId=$ProfileId; changedCount=$targets.Count; catalog=(Get-GpuDriverOptimizationCatalog $ExecutablePath) }
}

function Restore-GpuDriverOptimizationProfile([string]$BackupId = 'latest') {
    Initialize-GpuDriverBridge
    $backups = @(Get-ChildItem -LiteralPath $script:backupRoot -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object BaseName -Descending)
    if ($backups.Count -eq 0) { throw 'No SynapseX GPU driver backup exists.' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object BaseName -eq $BackupId | Select-Object -First 1 }
    if (-not $selected) { throw "GPU driver backup not found: $BackupId" }
    $metadata = Get-Content -LiteralPath $selected.FullName -Raw | ConvertFrom-Json
    if ([string]$metadata.provider -eq 'nvidia') {
        $settings = @($metadata.settings)
        $native = [SynapseX.Native.NvidiaDrsBridge]::Restore([string]$metadata.executablePath, [string[]]@($settings.key), [uint32[]]@($settings.id), [uint32[]]@($settings.value), [bool[]]@($settings.hadProfileValue), [bool]$metadata.createdProfile)
        if (-not [bool]$native.Available) { throw "NVIDIA DRS restore failed: $($native.Error)" }
    } elseif ([string]$metadata.provider -eq 'amd') {
        $settings = @($metadata.settings)
        $native = [SynapseX.Native.AmdAdlxBridge]::Apply([string[]]@($settings.key), [bool[]]@($settings.enabled))
        if (-not [bool]$native.Available) { throw "AMD ADLX restore failed: $($native.Error)" }
    } else { throw 'GPU driver backup provider is invalid.' }
    [ordered]@{ ok=$true; backupId=$selected.BaseName; provider=[string]$metadata.provider; catalog=(Get-GpuDriverOptimizationCatalog ([string]$metadata.executablePath)) }
}

Export-ModuleMember -Function Get-GpuDriverOptimizationCatalog, Set-GpuDriverOptimizationProfile, Restore-GpuDriverOptimizationProfile
