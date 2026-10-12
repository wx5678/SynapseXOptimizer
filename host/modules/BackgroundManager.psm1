$ErrorActionPreference='Stop'
$base=if($env:SYNAPSEX_STATE_ROOT){[IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT)}else{Join-Path $env:LOCALAPPDATA 'SynapseX\state'}
$recordsRoot=Join-Path $base 'background-backups'

function Get-BackgroundHash([string]$Text) {
    $sha=[Security.Cryptography.SHA256]::Create()
    try { -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)) | ForEach-Object {$_.ToString('x2')}) } finally {$sha.Dispose()}
}
function Get-BackgroundSid { [Security.Principal.WindowsIdentity]::GetCurrent().User.Value }
function Get-BackgroundRecords {
    @(Get-ChildItem -LiteralPath $recordsRoot -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object Name -Descending | ForEach-Object {
        try {Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json} catch {}
    })
}
function Save-BackgroundRecord($Record) {
    New-Item -ItemType Directory -Path $recordsRoot -Force | Out-Null
    $path=Join-Path $recordsRoot ($Record.backupId+'.json')
    [IO.File]::WriteAllText($path+'.pending',($Record|ConvertTo-Json -Depth 15),(New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath ($path+'.pending') -Destination $path -Force -ErrorAction Stop
}
function Get-StartupFolders {
    @([Environment]::GetFolderPath('Startup'),[Environment]::GetFolderPath('CommonStartup')) | Where-Object {$_} | Select-Object -Unique
}
function Get-TaskSignature($Task) {
    Get-BackgroundHash ((@($Task.Actions | ForEach-Object { $_.CimClass.CimClassName; $_.Execute; $_.Arguments; $_.WorkingDirectory; $_.ClassId }) + @($Task.Principal.UserId,$Task.Principal.GroupId,$Task.Principal.RunLevel)) -join '|')
}
function Get-TaskDefinitionHash([string]$Xml) {
    [xml]$document=$Xml
    # Enabled is the one field this manager changes; every other definition field must match.
    foreach($node in @($document.SelectNodes("//*[local-name()='Settings']/*[local-name()='Enabled']"))) { [void]$node.ParentNode.RemoveChild($node) }
    Get-BackgroundHash $document.OuterXml
}
function Get-BackgroundEntries([ValidateSet('tasks','packages','folders')][string]$Kind) {
    switch($Kind) {
        'tasks' {
            foreach($task in @(Get-ScheduledTask -ErrorAction Stop)) {
                $target=$task.TaskPath+$task.TaskName
                $reason=if($target -match '(?i)\\(Windows Defender|ExploitGuard|CertificateServicesClient|BitLocker|UpdateOrchestrator|WindowsUpdate|Servicing|TaskScheduler)\\'){'安全、更新或调度基础任务不参与此处停用。'}else{''}
                @{id=(Get-BackgroundHash ('task|'+$target));kind=$Kind;title=$task.TaskName;target=$target;detail=([string]$task.Description);state=$(if($task.Settings.Enabled){'已启用'}else{'已停用'});enabled=[bool]$task.Settings.Enabled;fingerprint=(Get-TaskSignature $task);canApply=(!$reason);reason=$reason;actionLabel=$(if($task.Settings.Enabled){'停用任务'}else{'启用任务'});effect='只改变后续触发的启用状态，不结束当前实例，也不删除任务。请核对用途，停用后相应更新、维护或应用功能可能不再自动运行。';native=$task}
            }
        }
        'packages' {
            foreach($package in @(Get-AppxPackage -PackageTypeFilter Main,Bundle -ErrorAction Stop)) {
                $reason=if($package.NonRemovable -or $package.IsFramework -or $package.IsResourcePackage -or $package.Name -match '(?i)(WindowsStore|StorePurchaseApp|DesktopAppInstaller|SecHealthUI|ShellExperience|StartMenuExperience|AAD.Broker|AccountsControl|WebExperience|Client.CBS|Client.Core|GamingServices|VCLibs|UI.Xaml|WindowsAppRuntime)'){'系统组件、商店、安装器或共享运行库不在精简范围。'}else{''}
                @{id=(Get-BackgroundHash ('package|'+$package.PackageFullName));kind=$Kind;title=$package.Name;target=$package.PackageFullName;detail=([string]$package.Publisher);state='已安装';enabled=$true;fingerprint=(Get-BackgroundHash ([string]$package.PackageFullName));canApply=(!$reason);reason=$reason;actionLabel='卸载此应用';effect='仅卸载当前执行账户的应用，不删除系统预配包。应用本地数据可能丢失。这里只记录安装信息，不能备份应用数据；安装文件被系统回收后需从商店重新下载。';native=$package}
            }
        }
        'folders' {
            foreach($folder in Get-StartupFolders) {
                if(!(Test-Path -LiteralPath $folder)){continue}
                foreach($file in @(Get-ChildItem -LiteralPath $folder -File -ErrorAction Stop | Where-Object {$_.Name -ne 'desktop.ini'})) {
                    $reason=if(($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or ((Get-Item -LiteralPath $folder).Attributes -band [IO.FileAttributes]::ReparsePoint)){'链接重定向项目需在原目录管理。'}else{''}
                    @{id=(Get-BackgroundHash ('folder|'+$file.FullName));kind=$Kind;title=$file.Name;target=$file.FullName;detail='登录时启动';state='已启用';enabled=$true;fingerprint=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash;canApply=(!$reason);reason=$reason;actionLabel='停用启动文件';effect='将该文件移至本软件的备份目录，不删除程序，也不结束正在运行的进程。下次登录时不再从此启动文件启动。';native=$file}
                }
            }
        }
    }
}
function Get-BackgroundCatalog([string]$Kind) {
    $entries=@(Get-BackgroundEntries $Kind)
    $records=@(Get-BackgroundRecords | Where-Object {$_.kind -eq $Kind -and $_.sid -eq (Get-BackgroundSid) -and $_.status -in @('pending','applied','restore-failed','rollback-failed')})
    $rows=@(foreach($entry in $entries) {
        $entry.Remove('native'); $entry
    })
    @{items=$rows;backups=@($records | ForEach-Object {@{backupId=$_.backupId;id=$_.id;title=$_.title;target=$_.target;createdAt=$_.createdAt;status=$_.status;kind=$_.kind}});capturedAt=(Get-Date).ToUniversalTime().ToString('o');account=[Security.Principal.WindowsIdentity]::GetCurrent().Name}
}
function Get-BackgroundSnapshot($Entry) {
    switch($Entry.kind) {
        'tasks' {
            $xml=Export-ScheduledTask -TaskName $Entry.native.TaskName -TaskPath $Entry.native.TaskPath -ErrorAction Stop
            @{enabled=$Entry.enabled;signature=$Entry.fingerprint;xml=$xml;definitionHash=(Get-TaskDefinitionHash $xml)}
        }
        'packages' {
            $manifest=Join-Path ([string]$Entry.native.InstallLocation) 'AppxManifest.xml'
            @{fullName=$Entry.native.PackageFullName;family=$Entry.native.PackageFamilyName;manifest=$manifest;manifestHash=$(if(Test-Path -LiteralPath $manifest -PathType Leaf){(Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash}else{''})}
        }
        'folders' {@{hash=$Entry.fingerprint}}
    }
}
function Invoke-BackgroundChange($Entry,[string]$Action,$Record) {
    switch($Entry.kind) {
        'tasks' {
            if($Action -eq 'enable'){Enable-ScheduledTask -TaskPath $Entry.native.TaskPath -TaskName $Entry.native.TaskName -ErrorAction Stop | Out-Null}
            else{Disable-ScheduledTask -TaskPath $Entry.native.TaskPath -TaskName $Entry.native.TaskName -ErrorAction Stop | Out-Null}
        }
        'packages' {Remove-AppxPackage -Package $Entry.native.PackageFullName -ErrorAction Stop}
        'folders' {
            # Both absolute paths originate from the enumerated startup folder and our exact backup ID.
            $destination=Join-Path $recordsRoot ($Record.backupId+'.payload')
            Move-Item -LiteralPath $Entry.target -Destination $destination -ErrorAction Stop
        }
    }
}
function Test-BackgroundApplied($Entry,[string]$Action) {
    $current=@(Get-BackgroundEntries $Entry.kind | Where-Object id -ceq $Entry.id)
    if($Entry.kind -eq 'tasks'){return ($current.Count -eq 1 -and $current[0].fingerprint -ceq $Entry.fingerprint -and $current[0].enabled -eq ($Action -eq 'enable'))}
    $current.Count -eq 0
}
function Invoke-BackgroundRestore($Record) {
    switch($Record.kind) {
        'tasks' {
            $task=@(Get-BackgroundEntries 'tasks' | Where-Object id -ceq $Record.id)
            if($task.Count -ne 1 -or $task[0].target -cne $Record.target -or $task[0].fingerprint -cne $Record.before.signature){throw '任务已删除或执行内容发生变化，未覆盖当前任务。'}
            $currentXml=Export-ScheduledTask -TaskName $task[0].native.TaskName -TaskPath $task[0].native.TaskPath -ErrorAction Stop
            if((Get-TaskDefinitionHash $currentXml) -cne $Record.before.definitionHash){throw '任务定义或触发条件已被修改，未覆盖当前任务。'}
            Invoke-BackgroundChange $task[0] $(if($Record.before.enabled){'enable'}else{'disable'}) $Record
            $after=@(Get-BackgroundEntries 'tasks' | Where-Object id -ceq $Record.id)
            if($after.Count -ne 1 -or $after[0].enabled -ne $Record.before.enabled){throw '任务恢复回读失败。'}
        }
        'packages' {
            $existing=@(Get-AppxPackage -ErrorAction Stop | Where-Object PackageFamilyName -ceq $Record.before.family)
            if($existing.Count){return}
            $manifest=[string]$Record.before.manifest
            if(!(Test-Path -LiteralPath $manifest -PathType Leaf) -or !$Record.before.manifestHash -or (Get-FileHash -LiteralPath $manifest -Algorithm SHA256).Hash -cne $Record.before.manifestHash){throw '原安装文件已被回收或已变化，请从 Microsoft Store 重新安装。记录不包含应用数据。'}
            [xml]$xml=Get-Content -LiteralPath $manifest -Raw -Encoding UTF8
            $identityName=[string]$xml.Package.Identity.Name
            if(!$identityName -or $Record.before.fullName -notlike ($identityName+'_*')){throw '安装清单与原应用身份不匹配。'}
            Add-AppxPackage -Register $manifest -DisableDevelopmentMode -ErrorAction Stop
            if(!@(Get-AppxPackage -ErrorAction Stop | Where-Object PackageFamilyName -ceq $Record.before.family).Count){throw '重新注册后未检测到原应用。'}
        }
        'folders' {
            $parent=Split-Path -Parent ([string]$Record.target)
            if(@(Get-StartupFolders) -notcontains $parent -or (Get-Item -LiteralPath $parent -ErrorAction Stop).Attributes -band [IO.FileAttributes]::ReparsePoint){throw '原路径不再是可恢复的启动文件夹。'}
            $payload=Join-Path $recordsRoot ($Record.backupId+'.payload')
            if(Test-Path -LiteralPath $Record.target){
                if((Get-FileHash -LiteralPath $Record.target -Algorithm SHA256).Hash -ceq $Record.before.hash){return}
                throw '原目录已存在不同的同名文件，不会覆盖。'
            }
            if(!(Test-Path -LiteralPath $payload -PathType Leaf) -or (Get-FileHash -LiteralPath $payload -Algorithm SHA256).Hash -cne $Record.before.hash){throw '备份文件缺失或校验失败。'}
            Move-Item -LiteralPath $payload -Destination $Record.target -ErrorAction Stop
            if((Get-FileHash -LiteralPath $Record.target -Algorithm SHA256).Hash -cne $Record.before.hash){throw '恢复后的文件校验失败。'}
        }
        default{throw '备份类型无效。'}
    }
}
function Set-BackgroundItem([string]$Kind,[string]$Id,[string]$Fingerprint,[string]$Action) {
    $matches=@(Get-BackgroundEntries $Kind | Where-Object id -ceq $Id)
    if($matches.Count -ne 1){throw '项目不存在或已变化，请重新扫描。'}
    $entry=$matches[0]
    if(!$entry.canApply){throw $entry.reason}
    if($entry.fingerprint -cne $Fingerprint){throw '项目内容已改变，请重新扫描后确认。'}
    $expected=if($Kind -eq 'tasks'){@('enable','disable')}elseif($Kind -eq 'packages'){@('uninstall')}else{@('disable')}
    if($Action -notin $expected){throw '操作不适用于此项目。'}
    if($Kind -eq 'tasks' -and $entry.enabled -eq ($Action -eq 'enable')){return @{ok=$true;message='已经是目标状态，未重复写入。';backupId=''}}
    $record=@{schemaVersion=1;backupId=((Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N'));sid=(Get-BackgroundSid);kind=$Kind;id=$Id;title=$entry.title;target=$entry.target;createdAt=(Get-Date).ToUniversalTime().ToString('o');before=(Get-BackgroundSnapshot $entry);action=$Action;status='pending'}
    Save-BackgroundRecord $record
    try{
        Invoke-BackgroundChange $entry $Action $record
        if(!(Test-BackgroundApplied $entry $Action)){throw '操作后状态校验失败。'}
        $record.status='applied';Save-BackgroundRecord $record
    }catch{
        $failure=$_.Exception.Message
        if($Kind -ne 'packages'){
            try{Invoke-BackgroundRestore $record;$record.status='rolled-back'}catch{$record.status='rollback-failed';$failure+=' 回滚未完成：'+$_.Exception.Message}
        }else{$record.status='restore-failed'}
        Save-BackgroundRecord $record
        throw ($failure+' 操作记录：'+$record.backupId)
    }
    @{ok=$true;backupId=$record.backupId;message=$(if($Kind -eq 'packages'){'应用已卸载。安装信息已记录，但不包含应用数据；需要时可尝试重新注册，安装文件被回收则需从商店重新安装。'}else{'修改已完成并校验；当前运行中的程序或任务未被终止。'})}
}
function Restore-BackgroundItem([string]$BackupId) {
    if($BackupId -notmatch '^\d{8}-\d{6}-\d{3}-[a-f0-9]{32}$'){throw '无效的备份编号。'}
    $record=Get-Content -LiteralPath (Join-Path $recordsRoot ($BackupId+'.json')) -Raw -Encoding UTF8 | ConvertFrom-Json
    if($record.schemaVersion -ne 1 -or $record.sid -cne (Get-BackgroundSid)){throw '备份版本或用户账户不匹配。'}
    if($record.status -notin @('applied','pending','restore-failed','rollback-failed')){throw '此记录无需再次恢复。'}
    try{Invoke-BackgroundRestore $record;$record.status='restored';Save-BackgroundRecord $record}
    catch{$record.status='restore-failed';Save-BackgroundRecord $record;throw}
    @{ok=$true;backupId=$BackupId;message='恢复已完成并校验。应用重新注册不恢复已丢失的应用数据。'}
}
Export-ModuleMember -Function Get-BackgroundCatalog,Set-BackgroundItem,Restore-BackgroundItem
