$ErrorActionPreference = 'Stop'

$stateBase = if ([string]::IsNullOrWhiteSpace($env:SYNAPSEX_STATE_ROOT)) { Join-Path $env:LOCALAPPDATA 'SynapseX\state' } else { [IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT) }
$systemBackupRoot = Join-Path $stateBase 'system-backups'
$startupBackupRoot = Join-Path $stateBase 'startup-backups'

function Resolve-SystemRegistryPath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($env:SYNAPSEX_TEST_REGISTRY_ROOT)) { return $Path }
    $testRoot = [string]$env:SYNAPSEX_TEST_REGISTRY_ROOT
    if ($testRoot -notmatch '^HKCU:\\Software\\SynapseX\\Tests\\[A-Za-z0-9-]+$') { throw 'Unsafe SynapseX test registry root.' }
    $pathMatch = [regex]::Match($Path, '^(HKCU|HKLM):\\(.+)$')
    if (-not $pathMatch.Success) { throw 'Unsupported registry path.' }
    return (Join-Path $testRoot ($pathMatch.Groups[1].Value + '\' + $pathMatch.Groups[2].Value))
}

function New-RegistryWrite([string]$Path, [string]$Name, [string]$Type, $Value) {
    [pscustomobject]@{ path = Resolve-SystemRegistryPath $Path; name = $Name; type = $Type; desired = $Value }
}

function Get-SystemTweakDefinitions {
    @(
        [pscustomobject]@{
            id = 'game-mode'; category = '游戏'; title = '启用 Windows 游戏模式'; recommended = $true; defaultSelected = $true; risk = '低'; restartRequired = $false
            description = '把当前用户的 Windows 游戏模式开关设为开启。'
            impact = '写入 AutoGameModeEnabled=1，由 Windows 在识别游戏时启用游戏模式。'
            tradeoff = '不修改游戏画质或游戏文件；已开启时不会重复写入。'
            writes = @((New-RegistryWrite 'HKCU:\Software\Microsoft\GameBar' 'AutoGameModeEnabled' 'DWord' 1))
        },
        [pscustomobject]@{
            id = 'disable-game-capture'; category = '游戏'; title = '关闭后台游戏录制'; recommended = $true; defaultSelected = $true; risk = '低'; restartRequired = $false
            description = '关闭当前用户的 Windows Game DVR 后台录制和应用捕获。'
            impact = '把 GameDVR_Enabled 与 AppCaptureEnabled 写为 0。'
            tradeoff = 'Win+Alt+R 与 Xbox Game Bar 的系统录制功能将不可用，可精确恢复。'
            writes = @(
                (New-RegistryWrite 'HKCU:\System\GameConfigStore' 'GameDVR_Enabled' 'DWord' 0),
                (New-RegistryWrite 'HKCU:\Software\Microsoft\Windows\CurrentVersion\GameDVR' 'AppCaptureEnabled' 'DWord' 0)
            )
        },
        [pscustomobject]@{
            id = 'quiet-gamebar'; category = '游戏'; title = '关闭 Game Bar 启动提示'; recommended = $false; defaultSelected = $false; risk = '低'; restartRequired = $false
            description = '关闭 Xbox Game Bar 的启动面板和手柄呼出开关。'
            impact = '把 ShowStartupPanel 与 UseNexusForGameBarEnabled 写为 0。'
            tradeoff = '仍可从开始菜单打开 Game Bar，但手柄按键和启动提示会被关闭。'
            writes = @(
                (New-RegistryWrite 'HKCU:\Software\Microsoft\GameBar' 'ShowStartupPanel' 'DWord' 0),
                (New-RegistryWrite 'HKCU:\Software\Microsoft\GameBar' 'UseNexusForGameBarEnabled' 'DWord' 0)
            )
        },
        [pscustomobject]@{
            id = 'mmcss-game-priority'; category = '游戏'; title = '校准 MMCSS 游戏任务优先级'; recommended = $true; defaultSelected = $true; risk = '低'; restartRequired = $true
            description = '把 Windows 多媒体类计划程序的 Games 任务恢复为高调度类别和高磁盘 I/O 优先级。'
            impact = '写入 GPU Priority=8、Priority=6、Scheduling Category=High、SFIO Priority=High。'
            tradeoff = '只有主动使用 MMCSS Games 任务配置的程序会读取这些值；已是目标值时不会重复写入。'
            writes = @(
                (New-RegistryWrite 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games' 'GPU Priority' 'DWord' 8),
                (New-RegistryWrite 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games' 'Priority' 'DWord' 6),
                (New-RegistryWrite 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games' 'Scheduling Category' 'String' 'High'),
                (New-RegistryWrite 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games' 'SFIO Priority' 'String' 'High')
            )
        },
        [pscustomobject]@{
            id = 'disable-startup-delay'; category = '启动'; title = '取消登录后的启动项延迟'; recommended = $false; defaultSelected = $false; risk = '低'; restartRequired = $true
            description = '取消 Windows 登录后对传统启动项使用的延迟计时。'
            impact = '把 Explorer\Serialize 的 StartupDelayInMSec 写为 0。'
            tradeoff = '启动项会更早同时启动，开机后短时间的 CPU 和磁盘竞争可能增加。'
            writes = @((New-RegistryWrite 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Serialize' 'StartupDelayInMSec' 'DWord' 0))
        },
        [pscustomobject]@{
            id = 'disable-power-throttling'; category = '电源'; title = '关闭 Windows 后台电源节流'; recommended = $false; defaultSelected = $false; risk = '中'; restartRequired = $true
            description = '关闭 Windows 对后台进程使用的 Power Throttling 整机开关。'
            impact = '把 PowerThrottlingOff 写为 1。'
            tradeoff = '后台程序可使用更多 CPU，整机功耗和温度可能上升；台式机游戏环境更适合使用。'
            writes = @((New-RegistryWrite 'HKLM:\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling' 'PowerThrottlingOff' 'DWord' 1))
        },
        [pscustomobject]@{
            id = 'disable-map-updates'; category = '后台'; title = '关闭离线地图自动更新'; recommended = $true; defaultSelected = $true; risk = '低'; restartRequired = $false
            description = '阻止 Windows 在后台自动下载和更新离线地图数据。'
            impact = '把 Windows Maps 策略 AutoDownloadAndUpdateMapData 写为 0。'
            tradeoff = '需要离线地图时必须在系统设置中手动更新。'
            writes = @((New-RegistryWrite 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Maps' 'AutoDownloadAndUpdateMapData' 'DWord' 0))
        },
        [pscustomobject]@{
            id = 'disable-silent-content'; category = '后台'; title = '关闭推荐应用和静默内容安装'; recommended = $true; defaultSelected = $true; risk = '低'; restartRequired = $false
            description = '关闭当前用户的推荐应用、预装应用推广和静默内容安装。'
            impact = '写入 ContentDeliveryManager 的内容投放、静默安装和系统建议开关。'
            tradeoff = '开始菜单和设置中的推荐内容会减少；不会卸载已经安装的软件。'
            writes = @(
                (New-RegistryWrite 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' 'ContentDeliveryAllowed' 'DWord' 0),
                (New-RegistryWrite 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' 'OemPreInstalledAppsEnabled' 'DWord' 0),
                (New-RegistryWrite 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' 'PreInstalledAppsEnabled' 'DWord' 0),
                (New-RegistryWrite 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' 'SilentInstalledAppsEnabled' 'DWord' 0),
                (New-RegistryWrite 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' 'SystemPaneSuggestionsEnabled' 'DWord' 0),
                (New-RegistryWrite 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager' 'SubscribedContent-338388Enabled' 'DWord' 0)
            )
        },
        [pscustomobject]@{
            id = 'disable-feedback-prompts'; category = '后台'; title = '关闭 Windows 反馈询问'; recommended = $true; defaultSelected = $true; risk = '低'; restartRequired = $false
            description = '关闭 Windows 请求当前用户评价系统体验的反馈弹窗。'
            impact = '把 Siuf\Rules 的 NumberOfSIUFInPeriod 写为 0。'
            tradeoff = '系统不再主动弹出反馈频率询问。'
            writes = @((New-RegistryWrite 'HKCU:\Software\Microsoft\Siuf\Rules' 'NumberOfSIUFInPeriod' 'DWord' 0))
        },
        [pscustomobject]@{
            id = 'disable-tailored-experiences'; category = '隐私'; title = '关闭诊断数据个性化体验'; recommended = $false; defaultSelected = $false; risk = '低'; restartRequired = $false
            description = '关闭 Windows 使用诊断数据提供个性化提示、广告和建议。'
            impact = '把 TailoredExperiencesWithDiagnosticDataEnabled 写为 0。'
            tradeoff = '系统推荐内容的个性化程度会降低。'
            writes = @((New-RegistryWrite 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Privacy' 'TailoredExperiencesWithDiagnosticDataEnabled' 'DWord' 0))
        },
        [pscustomobject]@{
            id = 'reduce-taskbar-animations'; category = '桌面'; title = '关闭任务栏动画'; recommended = $false; defaultSelected = $false; risk = '低'; restartRequired = $true
            description = '关闭任务栏图标和面板使用的过渡动画。'
            impact = '把 Explorer\Advanced 的 TaskbarAnimations 写为 0。'
            tradeoff = '任务栏视觉切换会直接完成；注销或重启资源管理器后完整生效。'
            writes = @((New-RegistryWrite 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'TaskbarAnimations' 'DWord' 0))
        },
        [pscustomobject]@{
            id = 'faster-menu'; category = '桌面'; title = '菜单立即展开'; recommended = $false; defaultSelected = $false; risk = '低'; restartRequired = $true
            description = '把 Windows 菜单的悬停展开等待时间设为 0 毫秒。'
            impact = '把当前用户的 MenuShowDelay 写为 0。'
            tradeoff = '级联菜单会立即展开，桌面操作手感会明显改变。'
            writes = @((New-RegistryWrite 'HKCU:\Control Panel\Desktop' 'MenuShowDelay' 'String' '0'))
        },
        [pscustomobject]@{
            id = 'reduce-transparency'; category = '桌面'; title = '关闭 Windows 透明效果'; recommended = $false; defaultSelected = $false; risk = '低'; restartRequired = $false
            description = '关闭开始菜单、任务栏和部分窗口的半透明合成效果。'
            impact = '把当前用户的 EnableTransparency 写为 0。'
            tradeoff = 'Windows 外观会更朴素；这是桌面流畅度选项，不会改动游戏画质。'
            writes = @((New-RegistryWrite 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'EnableTransparency' 'DWord' 0))
        },
        [pscustomobject]@{
            id = 'disable-mouse-acceleration'; category = '输入'; title = '关闭 Windows 鼠标加速'; recommended = $false; defaultSelected = $false; risk = '低'; restartRequired = $true
            description = '关闭 Windows“提高指针精确度”使用的鼠标加速参数。'
            impact = '把 MouseSpeed、MouseThreshold1 和 MouseThreshold2 写为 0，使桌面指针保持线性输入。'
            tradeoff = '桌面鼠标手感会改变；不改变游戏自身的原始输入设置。注销或重新登录后可确保所有程序读取新值。'
            writes = @(
                (New-RegistryWrite 'HKCU:\Control Panel\Mouse' 'MouseSpeed' 'String' '0'),
                (New-RegistryWrite 'HKCU:\Control Panel\Mouse' 'MouseThreshold1' 'String' '0'),
                (New-RegistryWrite 'HKCU:\Control Panel\Mouse' 'MouseThreshold2' 'String' '0')
            )
        },
        [pscustomobject]@{
            id = 'reduce-window-animations'; category = '桌面'; title = '关闭窗口最小化与还原动画'; recommended = $false; defaultSelected = $false; risk = '低'; restartRequired = $true
            description = '关闭 Windows 窗口最小化和还原时的动画。'
            impact = '把当前用户的 MinAnimate 写为 0。'
            tradeoff = '窗口切换会直接完成，不再播放缩放动画；注销或重新登录后完整生效。'
            writes = @((New-RegistryWrite 'HKCU:\Control Panel\Desktop\WindowMetrics' 'MinAnimate' 'String' '0'))
        },
        [pscustomobject]@{
            id = 'limit-background-apps'; category = '后台'; title = '限制 Microsoft Store 应用后台活动'; recommended = $false; defaultSelected = $false; risk = '中'; restartRequired = $false
            description = '关闭当前用户的 Microsoft Store 应用后台访问总开关。'
            impact = '把 BackgroundAccessApplications\GlobalUserDisabled 写为 1；传统 Win32 程序不受此键控制。'
            tradeoff = '邮件、日历、天气等 Store 应用关闭后可能不再及时通知或刷新。'
            writes = @((New-RegistryWrite 'HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications' 'GlobalUserDisabled' 'DWord' 1))
        },
        [pscustomobject]@{
            id = 'disable-edge-background'; category = '后台'; title = '关闭 Microsoft Edge 启动增强和后台模式'; recommended = $false; defaultSelected = $false; risk = '低'; restartRequired = $false
            description = '阻止 Microsoft Edge 在登录时为启动增强预加载，并在关闭窗口后继续后台运行。'
            impact = '写入 Edge 的 StartupBoostEnabled=0 与 BackgroundModeEnabled=0 当前用户策略。'
            tradeoff = '首次打开 Edge 可能稍慢；浏览器扩展和通知不会在关闭 Edge 后继续运行。'
            writes = @(
                (New-RegistryWrite 'HKCU:\Software\Policies\Microsoft\Edge' 'StartupBoostEnabled' 'DWord' 0),
                (New-RegistryWrite 'HKCU:\Software\Policies\Microsoft\Edge' 'BackgroundModeEnabled' 'DWord' 0)
            )
        },
        [pscustomobject]@{
            id = 'quiet-notifications'; category = '通知'; title = '关闭 Windows 横幅通知'; recommended = $false; defaultSelected = $false; risk = '中'; restartRequired = $false
            description = '关闭当前用户的 Windows Toast 横幅通知总开关。'
            impact = '把 PushNotifications\ToastEnabled 写为 0。'
            tradeoff = '聊天、邮件、系统和其他应用的横幅通知都会隐藏，通知内容可能仍保留在应用内。'
            writes = @((New-RegistryWrite 'HKCU:\Software\Microsoft\Windows\CurrentVersion\PushNotifications' 'ToastEnabled' 'DWord' 0))
        }
    )
}

function Get-RegistrySnapshot($Write) {
    if (-not (Test-Path -LiteralPath $Write.path)) {
        return [ordered]@{ path = $Write.path; name = $Write.name; exists = $false; value = $null; kind = $null }
    }
    $key = Get-Item -LiteralPath $Write.path
    $value = $key.GetValue($Write.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    $exists = ($null -ne $value)
    $kind = if ($exists) { [string]$key.GetValueKind($Write.name) } else { $null }
    [ordered]@{ path = $Write.path; name = $Write.name; exists = $exists; value = $value; kind = $kind }
}

function Set-RegistryWrite($Write) {
    if (-not (Test-Path -LiteralPath $Write.path)) { [void](New-Item -Path $Write.path -Force) }
    [void](New-ItemProperty -LiteralPath $Write.path -Name $Write.name -PropertyType $Write.type -Value $Write.desired -Force)
}

function Restore-RegistrySnapshot($Snapshot) {
    if ([bool]$Snapshot.exists) {
        if (-not (Test-Path -LiteralPath ([string]$Snapshot.path))) { [void](New-Item -Path ([string]$Snapshot.path) -Force) }
        $kind = switch ([string]$Snapshot.kind) {
            'DWord' { 'DWord' }
            'QWord' { 'QWord' }
            'Binary' { 'Binary' }
            'MultiString' { 'MultiString' }
            'ExpandString' { 'ExpandString' }
            default { 'String' }
        }
        [void](New-ItemProperty -LiteralPath ([string]$Snapshot.path) -Name ([string]$Snapshot.name) -PropertyType $kind -Value $Snapshot.value -Force)
    } elseif (Test-Path -LiteralPath ([string]$Snapshot.path)) {
        Remove-ItemProperty -LiteralPath ([string]$Snapshot.path) -Name ([string]$Snapshot.name) -ErrorAction SilentlyContinue
    }
}

function Get-SystemOptimizationCatalog {
    $result = foreach ($definition in Get-SystemTweakDefinitions) {
        $states = @($definition.writes | ForEach-Object {
            $snapshot = Get-RegistrySnapshot $_
            [ordered]@{
                path = $_.path; name = $_.name; desired = $_.desired
                current = if ($snapshot.exists) { $snapshot.value } else { $null }
                exists = $snapshot.exists
                matches = ($snapshot.exists -and ([string]$snapshot.value -ceq [string]$_.desired))
            }
        })
        [ordered]@{
            id = $definition.id; category = $definition.category; title = $definition.title
            recommended = $definition.recommended; defaultSelected = $definition.defaultSelected
            risk = $definition.risk; restartRequired = $definition.restartRequired
            description = $definition.description; impact = $definition.impact; tradeoff = $definition.tradeoff
            applied = (($states | Where-Object { -not $_.matches }).Count -eq 0)
            states = $states
        }
    }
    @($result)
}

function Get-SystemOptimizationPreview([string[]]$Ids) {
    $definitions = @(Get-SystemTweakDefinitions)
    $selected = @($definitions | Where-Object { $Ids -contains $_.id })
    if ($selected.Count -eq 0) { throw 'No valid system optimization item was selected.' }
    [ordered]@{
        selectedCount = $selected.Count
        changes = @($selected | ForEach-Object {
            $definition = $_
            [ordered]@{
                id = $definition.id; title = $definition.title; tradeoff = $definition.tradeoff
                writes = @($definition.writes | ForEach-Object {
                    $snapshot = Get-RegistrySnapshot $_
                    [ordered]@{ path = $_.path; name = $_.name; current = if ($snapshot.exists) { $snapshot.value } else { $null }; desired = $_.desired; alreadyApplied = ($snapshot.exists -and ([string]$snapshot.value -ceq [string]$_.desired)) }
                })
            }
        })
    }
}

function Set-SystemOptimizations([string[]]$Ids) {
    $definitions = @(Get-SystemTweakDefinitions)
    $selected = @($definitions | Where-Object { $Ids -contains $_.id })
    if ($selected.Count -eq 0) { throw 'No valid system optimization item was selected.' }
    [void](New-Item -ItemType Directory -Path $systemBackupRoot -Force)
    $backupId = (Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N')
    $snapshots = @($selected | ForEach-Object { $_.writes | ForEach-Object { Get-RegistrySnapshot $_ } })
    $metadata = [ordered]@{ schemaVersion = 1; backupId = $backupId; createdAt = (Get-Date).ToUniversalTime().ToString('o'); selectedIds = @($selected.id); snapshots = $snapshots; status='pending'; error='' }
    $backupPath=Join-Path $systemBackupRoot ($backupId + '.json')
    [IO.File]::WriteAllText($backupPath, ($metadata | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
    $attempted=0
    try {
        foreach ($definition in $selected) { foreach ($write in $definition.writes) {
            $attempted++
            Set-RegistryWrite $write
            $after=Get-RegistrySnapshot $write
            if(!$after.exists -or [string]$after.value -cne [string]$write.desired -or $after.kind -ine $write.type){throw '写入后回读与目标值不一致。'}
        } }
        $metadata.status='applied'
    } catch {
        $metadata.error=$_.Exception.Message
        $metadata.status='rolled-back'
        for($i=$attempted-1;$i -ge 0;$i--){
            try {
                Restore-RegistrySnapshot $snapshots[$i]
                $restored=Get-RegistrySnapshot $snapshots[$i]
                if(($restored|ConvertTo-Json -Compress -Depth 6) -cne ($snapshots[$i]|ConvertTo-Json -Compress -Depth 6)){throw '原值回读不一致。'}
            } catch { $metadata.status='rollback-failed';$metadata.error+='；回滚未完成：'+$_.Exception.Message }
        }
        throw ($metadata.error+' 备份：'+$backupId)
    } finally {
        [IO.File]::WriteAllText($backupPath+'.pending', ($metadata | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
        [IO.File]::Replace($backupPath+'.pending',$backupPath,[NullString]::Value)
    }
    [pscustomobject]@{ ok = $true; backupId = $backupId; catalog = @(Get-SystemOptimizationCatalog) }
}

function Restore-SystemOptimizations([string]$BackupId = 'latest') {
    $backups = @(Get-ChildItem -LiteralPath $systemBackupRoot -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object BaseName -Descending)
    if ($backups.Count -eq 0) { throw 'No SynapseX system backup exists.' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object BaseName -eq $BackupId | Select-Object -First 1 }
    if ($null -eq $selected) { throw "System backup not found: $BackupId" }
    $metadata = Get-Content -LiteralPath $selected.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($snapshot in @($metadata.snapshots)) { Restore-RegistrySnapshot $snapshot }
    [pscustomobject]@{ ok = $true; backupId = $selected.BaseName; catalog = @(Get-SystemOptimizationCatalog) }
}

function Get-StartupAudit {
    $locations = @(
        [pscustomobject]@{ scope = '当前用户'; manageable = $true; path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' },
        [pscustomobject]@{ scope = '当前用户（单次）'; manageable = $true; path = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce' },
        [pscustomobject]@{ scope = '全体用户'; manageable = $true; path = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run' },
        [pscustomobject]@{ scope = '全体用户（单次）'; manageable = $true; path = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce' },
        [pscustomobject]@{ scope = '全体用户 32 位'; manageable = $true; path = 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run' },
        [pscustomobject]@{ scope = '全体用户 32 位（单次）'; manageable = $true; path = 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\RunOnce' }
    )
    $items = @(foreach ($location in $locations) {
        if (-not (Test-Path -LiteralPath $location.path)) { continue }
        $property = Get-ItemProperty -LiteralPath $location.path
        foreach ($entry in $property.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS(Path|ParentPath|ChildName|Drive|Provider)$' }) {
            [ordered]@{ id = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($location.path + '|' + $entry.Name)); name = $entry.Name; command = [string]$entry.Value; scope = $location.scope; path = $location.path; manageable = $location.manageable }
        }
    }
    )
    $startupFolders = @(
        [Environment]::GetFolderPath('Startup'),
        [Environment]::GetFolderPath('CommonStartup')
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    foreach ($folder in $startupFolders) {
        foreach ($file in @(Get-ChildItem -LiteralPath $folder -File -ErrorAction SilentlyContinue)) {
            $items += [ordered]@{ id = ''; name = $file.BaseName; command = $file.FullName; scope = '启动文件夹（下方管理）'; path = $folder; manageable = $false }
        }
    }
    [ordered]@{ items = @($items); manageableCount = @($items | Where-Object manageable).Count; totalCount = @($items).Count; note = '支持当前用户与全体用户的 Run/RunOnce 注册表启动项。整机项目需要管理员权限；启动文件夹请使用下方独立管理区域。' }
}

function Get-InstalledApplicationAudit {
    $locations = @(
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    $items = foreach ($location in $locations) {
        Get-ItemProperty -Path $location -ErrorAction SilentlyContinue | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_.DisplayName) } | ForEach-Object {
            [pscustomobject][ordered]@{ name = [string]$_.DisplayName; version = [string]$_.DisplayVersion; publisher = [string]$_.Publisher; installDate = [string]$_.InstallDate; scope = if ($location.StartsWith('HKCU:')) { '当前用户' } else { '全体用户' } }
        }
    }
    $unique = @($items | Sort-Object name, version -Unique)
    [ordered]@{ totalCount = $unique.Count; items = $unique; note = '只读清单；卸载软件属于破坏性操作，当前版本不会代替用户执行。' }
}

function Get-ServiceAudit {
    $services = @(Get-CimInstance Win32_Service -ErrorAction SilentlyContinue | Where-Object { $_.StartMode -eq 'Auto' } | Sort-Object DisplayName | ForEach-Object {
        $path = [string]$_.PathName
        [ordered]@{
            name = [string]$_.Name; displayName = [string]$_.DisplayName; state = [string]$_.State
            startName = [string]$_.StartName; path = $path
            systemComponent = ($path -match '(?i)\\Windows\\(System32|SysWOW64|servicing)')
        }
    })
    [ordered]@{ totalCount = $services.Count; runningCount = @($services | Where-Object state -eq 'Running').Count; items = $services; note = '自动服务只读审计；不会按所谓游戏优化模板批量停用服务。' }
}

function Disable-StartupEntries($Items) {
    $allowedPaths = @(
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run',
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\RunOnce'
    )
    $valid = @($Items | Where-Object { $_.manageable -eq $true -and $allowedPaths -contains ([string]$_.path) -and -not [string]::IsNullOrWhiteSpace([string]$_.name) })
    if ($valid.Count -eq 0) { throw 'No manageable startup item was selected.' }
    if ($valid.Count -ne @($Items).Count) { throw '选择中包含不可管理的启动项，请重新扫描。' }
    [void](New-Item -ItemType Directory -Path $startupBackupRoot -Force)
    $backupId = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $snapshots = foreach ($item in $valid) {
        $key = Get-Item -LiteralPath ([string]$item.path)
        $value = $key.GetValue([string]$item.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
        if ($null -eq $value) { continue }
        [ordered]@{ path = [string]$item.path; name = [string]$item.name; exists = $true; value = $value; kind = [string]$key.GetValueKind([string]$item.name) }
    }
    if (@($snapshots).Count -eq 0) { throw 'Selected startup entries no longer exist.' }
    $metadata = [ordered]@{ schemaVersion = 1; backupId = $backupId; createdAt = (Get-Date).ToUniversalTime().ToString('o'); snapshots = @($snapshots) }
    [IO.File]::WriteAllText((Join-Path $startupBackupRoot ($backupId + '.json')), ($metadata | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
    try {
        foreach ($snapshot in @($snapshots)) {
            Remove-ItemProperty -LiteralPath ([string]$snapshot.path) -Name ([string]$snapshot.name) -ErrorAction Stop
            if ((Get-RegistrySnapshot $snapshot).exists) { throw '启动项停用后回读不一致。' }
        }
    } catch {
        $failure=$_.Exception.Message
        $rollbackErrors=@()
        foreach ($snapshot in @($snapshots)) { try { Restore-RegistrySnapshot $snapshot } catch { $rollbackErrors += $_.Exception.Message } }
        throw ($failure + ' 已尝试回滚，备份：' + $backupId + $(if($rollbackErrors.Count){'；回滚异常：'+($rollbackErrors -join '；')}else{''}))
    }
    [pscustomobject]@{ ok = $true; backupId = $backupId; audit = Get-StartupAudit }
}

function Restore-StartupEntries([string]$BackupId = 'latest') {
    $backups = @(Get-ChildItem -LiteralPath $startupBackupRoot -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object BaseName -Descending)
    if ($backups.Count -eq 0) { throw 'No SynapseX startup backup exists.' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object BaseName -eq $BackupId | Select-Object -First 1 }
    if ($null -eq $selected) { throw "Startup backup not found: $BackupId" }
    $metadata = Get-Content -LiteralPath $selected.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($snapshot in @($metadata.snapshots)) {
        if ([string]$snapshot.path -notmatch '^HK(CU|LM):\\Software\\(WOW6432Node\\)?Microsoft\\Windows\\CurrentVersion\\Run(Once)?$') { throw '备份包含非启动项路径，未恢复。' }
        $current=Get-RegistrySnapshot $snapshot
        if ($current.exists -and ([string]$current.value -cne [string]$snapshot.value -or $current.kind -cne $snapshot.kind)) { throw ('启动项已被其他程序修改，不覆盖：'+$snapshot.name) }
    }
    foreach ($snapshot in @($metadata.snapshots)) {
        Restore-RegistrySnapshot $snapshot
        $after=Get-RegistrySnapshot $snapshot
        if (!$after.exists -or [string]$after.value -cne [string]$snapshot.value -or $after.kind -cne $snapshot.kind) { throw ('恢复回读失败：'+$snapshot.name) }
    }
    [pscustomobject]@{ ok = $true; backupId = $selected.BaseName; audit = Get-StartupAudit }
}

function Get-SynapseXBackups {
    $groups = @(
        [pscustomobject]@{ type = 'system'; title = '系统调整'; path = $systemBackupRoot; pattern = '*.json' },
        [pscustomobject]@{ type = 'advanced-system'; title = '服务、任务与更新（在系统调整中恢复）'; path = (Join-Path $stateBase 'advanced-system-backups'); pattern = '*.json' },
        [pscustomobject]@{ type = 'expert'; title = '高级参数（在系统调整中恢复）'; path = (Join-Path $stateBase 'expert-backups'); pattern = '*.json' },
        [pscustomobject]@{ type = 'device-service'; title = '服务与设备（在系统调整中恢复）'; path = (Join-Path $stateBase 'device-service-backups'); pattern = '*.json' },
        [pscustomobject]@{ type = 'startup'; title = '启动项'; path = $startupBackupRoot; pattern = '*.json' },
        [pscustomobject]@{ type = 'background'; title = '任务、启动文件及应用记录'; path = (Join-Path $stateBase 'background-backups'); pattern = '*.json' },
        [pscustomobject]@{ type = 'network'; title = '网络代理'; path = (Join-Path $stateBase 'network-backups'); pattern = '*.json' },
        [pscustomobject]@{ type = 'dns'; title = 'DNS 设置'; path = (Join-Path $stateBase 'dns-backups'); pattern = '*.json' },
        [pscustomobject]@{ type = 'hosts'; title = 'Hosts 文件'; path = (Join-Path $stateBase 'hosts-backups'); pattern = '*.hosts' },
        [pscustomobject]@{ type = 'nic'; title = '网卡高级属性'; path = (Join-Path $stateBase 'nic-backups'); pattern = '*.json' },
        [pscustomobject]@{ type = 'mtu'; title = '网卡 MTU'; path = (Join-Path $stateBase 'mtu-backups'); pattern = '*.json' },
        [pscustomobject]@{ type = 'runtime'; title = '游戏进程会话'; path = (Join-Path $stateBase 'runtime-backups'); pattern = '*.json' },
        [pscustomobject]@{ type = 'power'; title = '电源方案'; path = (Join-Path $stateBase 'power-backups'); pattern = '*.json' },
        [pscustomobject]@{ type = 'cpu-power'; title = 'CPU 专属电源方案'; path = (Join-Path $stateBase 'cpu-power-backups'); pattern = '*.json' },
        [pscustomobject]@{ type = 'gpu-preference'; title = '每游戏 GPU 首选项'; path = (Join-Path $stateBase 'gpu-preference-backups'); pattern = '*.json' },
        [pscustomobject]@{ type = 'gpu-driver'; title = 'NVIDIA / AMD 驱动专项'; path = (Join-Path $stateBase 'gpu-driver-backups'); pattern = '*.json' },
        [pscustomobject]@{ type = 'display-adapter'; title = '核显设备状态'; path = (Join-Path $stateBase 'display-adapter-backups'); pattern = '*.json' },
        [pscustomobject]@{ type = 'jiuyin'; title = '九阴配置'; path = (Join-Path $stateBase 'visual-profile-backups'); pattern = '*' },
        [pscustomobject]@{ type = 'jiuyin-keybinds'; title = '九阴按键方案'; path = (Join-Path $stateBase 'keybind-backups'); pattern = '*' }
    )
    $result = foreach ($group in $groups) {
        $files = @(Get-ChildItem -LiteralPath $group.path -Filter $group.pattern -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 20)
        [ordered]@{ type = $group.type; title = $group.title; path = $group.path; count = $files.Count; items = @($files | ForEach-Object { [ordered]@{ id = $_.BaseName; createdAt = $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'); size = if ($_.PSIsContainer) { $null } else { $_.Length } } }) }
    }
    @($result)
}

Export-ModuleMember -Function Get-SystemOptimizationCatalog, Get-SystemOptimizationPreview, Set-SystemOptimizations, Restore-SystemOptimizations, Get-StartupAudit, Get-InstalledApplicationAudit, Get-ServiceAudit, Disable-StartupEntries, Restore-StartupEntries, Get-SynapseXBackups
