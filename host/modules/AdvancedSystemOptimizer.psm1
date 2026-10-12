$ErrorActionPreference = 'Stop'
$stateBase = if ($env:SYNAPSEX_STATE_ROOT) { [IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT) } else { Join-Path $env:LOCALAPPDATA 'SynapseX\state' }
$advancedBackupRoot = Join-Path $stateBase 'advanced-system-backups'

function Get-AdvancedDefinitions {
    @(
        @{ id='service-search'; category='服务'; kind='service'; target='WSearch'; title='关闭文件搜索索引'; impact='将 Windows Search 启动方式改为禁用；已运行的服务本次不强制停止，重启后生效。'; tradeoff='文件内容搜索和 Outlook 索引搜索会受影响；不会删除已有索引。' },
        @{ id='service-sysmain'; category='服务'; kind='service'; target='SysMain'; title='关闭 SysMain 预加载服务'; impact='禁用 SysMain 的后续启动，不强制停止当前服务，也不清空预取文件。'; tradeoff='应用启动和缓存行为会改变；不能据此保证游戏帧数提高。' },
        @{ id='service-print'; category='服务'; kind='service'; target='Spooler'; title='关闭打印后台处理服务'; impact='禁用 Print Spooler 的后续启动，重启后生效。'; tradeoff='打印机和 Microsoft Print to PDF 将不可用；需要打印时恢复。' },
        @{ id='service-error-report'; category='服务'; kind='service'; target='WerSvc'; title='关闭 Windows 错误报告服务'; impact='禁用错误报告服务的后续启动，重启后生效。'; tradeoff='故障报告和部分崩溃诊断流程会受影响。' },
        @{ id='service-maps'; category='服务'; kind='service'; target='MapsBroker'; title='关闭离线地图服务'; impact='禁用下载地图管理器的后续启动，重启后生效。'; tradeoff='离线地图的后台访问和更新会受影响。' },
        @{ id='service-fax'; category='服务'; kind='service'; target='Fax'; title='关闭传真服务'; impact='禁用传真服务的后续启动；未安装此服务的电脑不提供操作。'; tradeoff='Windows 传真发送和接收不可用。' },
        @{ id='task-compatibility'; category='计划任务'; kind='task'; target='\Microsoft\Windows\Application Experience\Microsoft Compatibility Appraiser'; title='停用兼容性评估计划任务'; impact='停止此任务的后续计划触发，不终止正在执行的任务。'; tradeoff='Windows 升级前的应用兼容性评估信息可能不完整。' },
        @{ id='task-program-data'; category='计划任务'; kind='task'; target='\Microsoft\Windows\Application Experience\ProgramDataUpdater'; title='停用程序信息更新计划任务'; impact='停止 ProgramDataUpdater 的后续计划触发。'; tradeoff='应用兼容性诊断所用的信息更新会受影响。' },
        @{ id='task-disk-diagnostic'; category='计划任务'; kind='task'; target='\Microsoft\Windows\DiskDiagnostic\Microsoft-Windows-DiskDiagnosticDataCollector'; title='停用磁盘诊断数据收集任务'; impact='停止该磁盘诊断数据收集任务的后续计划触发。'; tradeoff='减少磁盘诊断数据；不关闭磁盘驱动、TRIM 或磁盘优化任务。' },
        @{ id='task-feedback'; category='计划任务'; kind='task'; target='\Microsoft\Windows\Feedback\Siuf\DmClient'; title='停用体验反馈计划任务'; impact='停止 DmClient 的后续计划触发。'; tradeoff='Windows 体验反馈相关活动会受影响。' },
        @{ id='policy-driver-updates'; category='更新'; kind='policy'; target='HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate'; name='ExcludeWUDriversInQualityUpdate'; value=1; title='Windows 更新不包含驱动程序'; impact='写入排除质量更新中驱动程序的策略，保留系统更新。'; tradeoff='驱动修复需要自行检查；不阻止厂商工具或设备安装流程更新驱动。' },
        @{ id='policy-update-notify'; category='更新'; kind='policy'; target='HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'; name='AUOptions'; value=2; title='系统更新下载前通知'; impact='将自动更新策略设为下载前通知，不停用 Windows Update 服务。'; tradeoff='需要及时手动下载更新。已有其他更新策略可影响最终行为；这里只确认策略值。' },
        @{ id='policy-store-updates'; category='更新'; kind='policy'; target='HKLM:\SOFTWARE\Policies\Microsoft\WindowsStore'; name='AutoDownload'; value=2; title='关闭商店应用自动更新'; impact='写入关闭 Microsoft Store 自动下载和安装更新的策略。'; tradeoff='需要手动更新商店应用。这里只确认策略值，不把它当作所有商店版本的行为验证。' }
    )
}

function Get-AdvancedDefinition([string]$Id) {
    $definition = @(Get-AdvancedDefinitions | Where-Object { $_.id -ceq $Id })
    if ($definition.Count -ne 1) { throw '未知的高级系统设置。' }
    $definition[0]
}

function Get-AdvancedPolicySupport {
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
    $edition = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction Stop).EditionID
    if ($os.ProductType -ne 1 -or [int]$os.BuildNumber -lt 14393 -or $edition -notmatch '^(Professional|Enterprise|Education|IoTEnterprise)') { throw '此策略仅在受支持的 Windows 10/11 专业版、企业版或教育版提供；当前版本不在验证范围。' }
}

function Get-AdvancedValue($Definition) {
    switch ($Definition.kind) {
        'service' {
            $service = Get-Service -Name $Definition.target -ErrorAction Stop
            $path = 'HKLM:\SYSTEM\CurrentControlSet\Services\' + $Definition.target
            $key = Get-Item -LiteralPath $path -ErrorAction Stop
            $start = [int]$key.GetValue('Start')
            if ($start -notin @(2,3,4)) { throw '此服务启动类型不适用于本工具。' }
            @{ start=$start; delayed=$key.GetValue('DelayedAutoStart',$null); running=[string]$service.Status; matches=($start -eq 4); label=(@{2='自动';3='手动';4='禁用'}[$start] + ' · ' + @{Running='运行中';Stopped='已停止';Paused='已暂停'}[[string]$service.Status]) }
        }
        'task' {
            $split = $Definition.target.LastIndexOf('\')
            $task = Get-ScheduledTask -TaskPath $Definition.target.Substring(0,$split+1) -TaskName $Definition.target.Substring($split+1) -ErrorAction Stop
            @{ enabled=[bool]$task.Settings.Enabled; matches=(-not [bool]$task.Settings.Enabled); label=$(if ($task.Settings.Enabled) {'已启用'} else {'已停用'}) }
        }
        'policy' {
            Get-AdvancedPolicySupport
            $value=$null; $kind=$null
            if (Test-Path -LiteralPath $Definition.target) {
                $key=Get-Item -LiteralPath $Definition.target
                $value=$key.GetValue($Definition.name,$null)
                if ($null -ne $value) { $kind=[string]$key.GetValueKind($Definition.name) }
            }
            if ($null -ne $value -and $kind -ne 'DWord') { throw '策略值类型异常，请先检查原设置。' }
            @{ value=$value; exists=($null -ne $value); kind=$kind; matches=($null -ne $value -and $value -eq $Definition.value); label=$(if ($null -eq $value) {'未配置'} elseif ($value -eq $Definition.value) {'已写入目标策略'} else {'其他策略值：' + $value}) }
        }
    }
}

function Set-AdvancedValue($Definition, $Snapshot, [bool]$Restore) {
    switch ($Definition.kind) {
        'service' {
            $startup = if ($Restore) { @{2='Automatic';3='Manual';4='Disabled'}[[int]$Snapshot.start] } else { 'Disabled' }
            if (-not $startup) { throw '备份服务启动类型无效。' }
            Set-Service -Name $Definition.target -StartupType $startup -ErrorAction Stop
            # Preserve the delayed-auto flag without stopping or starting live services.
            $path = 'HKLM:\SYSTEM\CurrentControlSet\Services\' + $Definition.target
            if ($null -eq $Snapshot.delayed) { Remove-ItemProperty -LiteralPath $path -Name DelayedAutoStart -ErrorAction SilentlyContinue }
            else { New-ItemProperty -LiteralPath $path -Name DelayedAutoStart -Value $Snapshot.delayed -PropertyType DWord -Force -ErrorAction Stop | Out-Null }
        }
        'task' {
            $split=$Definition.target.LastIndexOf('\')
            $params=@{TaskPath=$Definition.target.Substring(0,$split+1); TaskName=$Definition.target.Substring($split+1); ErrorAction='Stop'}
            if ($Restore -and [bool]$Snapshot.enabled) { Enable-ScheduledTask @params | Out-Null }
            else { Disable-ScheduledTask @params | Out-Null }
        }
        'policy' {
            if ($Restore -and -not $Snapshot.exists) {
                if ((Test-Path -LiteralPath $Definition.target) -and $null -ne (Get-Item -LiteralPath $Definition.target).GetValue($Definition.name,$null)) { Remove-ItemProperty -LiteralPath $Definition.target -Name $Definition.name -ErrorAction Stop }
            } else {
                New-Item -Path $Definition.target -Force -ErrorAction Stop | Out-Null
                $value=if ($Restore) {$Snapshot.value} else {$Definition.value}
                New-ItemProperty -LiteralPath $Definition.target -Name $Definition.name -PropertyType DWord -Value $value -Force -ErrorAction Stop | Out-Null
            }
        }
    }
}

function Test-AdvancedRestored($Definition, $Before, $After) {
    switch ($Definition.kind) {
        'service' { ($Before.start -eq $After.start -and $Before.delayed -eq $After.delayed) }
        'task' { ($Before.enabled -eq $After.enabled) }
        'policy' { ($Before.exists -eq $After.exists -and $Before.value -eq $After.value -and $Before.kind -eq $After.kind) }
    }
}

function Save-AdvancedRecord($Record) {
    New-Item -ItemType Directory -Path $advancedBackupRoot -Force | Out-Null
    $path=Join-Path $advancedBackupRoot ($Record.backupId + '.json')
    $temporary=$path+'.pending'
    [IO.File]::WriteAllText($temporary, ($Record | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporary -Destination $path -Force -ErrorAction Stop
}

function Get-AdvancedRecords {
    @(Get-ChildItem -LiteralPath $advancedBackupRoot -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object Name -Descending | ForEach-Object {
        try { Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json } catch { }
    })
}

function Get-AdvancedSystemCatalog {
    $records=@(Get-AdvancedRecords)
    $items=@(foreach ($definition in Get-AdvancedDefinitions) {
        $state=$null; $reason=''
        try { $state=Get-AdvancedValue $definition } catch { $reason=$_.Exception.Message }
        $last=$records | Where-Object { $_.id -ceq $definition.id -and $_.status -in @('applied','pending','restore-failed','rollback-failed') } | Select-Object -First 1
        [ordered]@{ id=$definition.id; category=$definition.category; title=$definition.title; target=$definition.target; impact=$definition.impact; tradeoff=$definition.tradeoff; available=($null -ne $state); reason=$reason; applied=($null -ne $state -and $state.matches); currentLabel=$(if($null -ne $state){$state.label}else{'无法操作'}); backupId=$(if($last){$last.backupId}else{''}); restartRequired=($definition.kind -ne 'task') }
    })
    @{ items=$items; capturedAt=(Get-Date).ToUniversalTime().ToString('o') }
}

function Set-AdvancedSystemItem([string]$Id) {
    $definition=Get-AdvancedDefinition $Id
    $before=Get-AdvancedValue $definition
    if ($before.matches) { return @{ok=$true; changed=$false; backupId=''; message='当前已经是目标设置，没有重复写入。'} }
    $record=@{ schemaVersion=1; backupId=((Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N')); id=$Id; target=$definition.target; status='pending'; createdAt=(Get-Date).ToUniversalTime().ToString('o'); before=$before }
    Save-AdvancedRecord $record
    try {
        Set-AdvancedValue $definition $before $false
        $after=Get-AdvancedValue $definition
        if (-not $after.matches) { throw '写入后回读与目标值不一致。' }
        $record.status='applied'; Save-AdvancedRecord $record
    } catch {
        $failure=$_.Exception.Message
        try {
            Set-AdvancedValue $definition $before $true
            if (-not (Test-AdvancedRestored $definition $before (Get-AdvancedValue $definition))) { throw '回滚校验失败。' }
            $record.status='rolled-back'
        } catch { $record.status='rollback-failed'; $failure+=' 回滚未完成：'+$_.Exception.Message }
        $record.error=$failure; Save-AdvancedRecord $record
        throw ('应用失败：'+$failure+' 备份：'+$record.backupId)
    }
    @{ok=$true; changed=$true; backupId=$record.backupId; message=$(if($definition.kind -eq 'service'){'启动方式已修改；当前服务未被强制停止，重启后生效。'}elseif($definition.kind -eq 'task'){'后续计划触发已停用，当前运行实例不受影响。'}else{'策略已写入并回读验证；系统策略刷新或重启后由 Windows 处理。'})}
}

function Restore-AdvancedSystemItem([string]$Id, [string]$BackupId) {
    $definition=Get-AdvancedDefinition $Id
    if ($BackupId -notmatch '^\d{8}-\d{6}-\d{3}-[a-f0-9]{32}$') { throw '备份编号无效。' }
    $record=Get-Content -LiteralPath (Join-Path $advancedBackupRoot ($BackupId+'.json')) -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($record.schemaVersion -ne 1 -or $record.id -cne $Id -or $record.target -cne $definition.target) { throw '备份与当前项目不匹配。' }
    if ($record.status -notin @('applied','pending','restore-failed','rollback-failed')) { throw '此备份无需再次恢复。' }
    # Restore only a compiled-in target, never a path supplied by the client or backup.
    Get-AdvancedValue $definition | Out-Null
    try {
        Set-AdvancedValue $definition $record.before $true
        if (-not (Test-AdvancedRestored $definition $record.before (Get-AdvancedValue $definition))) { throw '恢复后回读与备份不一致。' }
        $record.status='restored'; Save-AdvancedRecord $record
    } catch {
        $record.status='restore-failed'; Save-AdvancedRecord $record
        throw ('恢复未完成，备份仍保留：'+$BackupId+'；'+$_.Exception.Message)
    }
    @{ok=$true; backupId=$BackupId; message='原设置已恢复并回读验证。服务或策略项目建议重启后使用。'}
}

Export-ModuleMember -Function Get-AdvancedSystemCatalog,Set-AdvancedSystemItem,Restore-AdvancedSystemItem
