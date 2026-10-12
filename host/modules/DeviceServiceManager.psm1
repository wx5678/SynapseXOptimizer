$ErrorActionPreference='Stop'
$dsBase=if($env:SYNAPSEX_STATE_ROOT){[IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT)}else{Join-Path $env:LOCALAPPDATA 'SynapseX\state'}
$script:dsRecords=Join-Path $dsBase 'device-service-backups'
function Get-DsHash([string]$Text){$sha=[Security.Cryptography.SHA256]::Create();try{-join($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text))|ForEach-Object{$_.ToString('x2')})}finally{$sha.Dispose()}}
function Get-DsSid{[Security.Principal.WindowsIdentity]::GetCurrent().User.Value}
function Save-DsRecord($Record){
    New-Item -ItemType Directory -Path $script:dsRecords -Force|Out-Null
    $path=Join-Path $script:dsRecords ($Record.backupId+'.json')
    [IO.File]::WriteAllText($path+'.pending',($Record|ConvertTo-Json -Depth 15),(New-Object Text.UTF8Encoding($false)))
    if([IO.File]::Exists($path)){[IO.File]::Replace($path+'.pending',$path,[NullString]::Value)}else{[IO.File]::Move($path+'.pending',$path)}
}
function Get-DsRecords{
    @(Get-ChildItem -LiteralPath $script:dsRecords -Filter '*.json' -File -ErrorAction SilentlyContinue|Sort-Object Name -Descending|ForEach-Object{try{$r=Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8|ConvertFrom-Json;if($r.sid -eq (Get-DsSid)){$r}}catch{}})
}
function Get-DsStateHash($State){Get-DsHash ($State|ConvertTo-Json -Compress -Depth 8)}
function Get-DsEntries([ValidateSet('services','devices','msi','service-host')][string]$Kind){
    if($Kind -in @('services','service-host')){
        $controllers=@{};foreach($s in Get-Service){$controllers[$s.Name]=$s}
        foreach($s in Get-CimInstance Win32_Service -ErrorAction Stop){
            $reason='';$state=$null
            try{
                $key=Get-Item -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Services\'+$s.Name)
                $state=[ordered]@{start=[int]$key.GetValue('Start');delayed=$key.GetValue('DelayedAutoStart',$null)}
                if($state.start -notin @(2,3,4)){throw '驱动或引导启动类型不在服务管理范围。'}
                if($s.Name -match '^(?i)(RpcSs|RpcEptMapper|DcomLaunch|PlugPlay|Power|EventLog|SamSs|LSM|Schedule|Winmgmt|BFE|MpsSvc|WinDefend|WdNisSvc|SecurityHealthService|wscsvc|CryptSvc|KeyIso|ProfSvc|UserManager|Appinfo|gpsvc)$'){throw '登录、管理通道、安全或基础服务保留；不通过此处停用。'}
            }catch{$reason=$_.Exception.Message}
            $serviceDll=(Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Services\'+$s.Name+'\Parameters') -Name ServiceDll -ErrorAction SilentlyContinue).ServiceDll
            $identity=Get-DsHash ($s.Name+'|'+$s.PathName+'|'+$s.StartName+'|'+$serviceDll)
            if($Kind -eq 'service-host'){
                if($s.PathName -notmatch '(?i)\\svchost\.exe(?:"|\s|$)'){continue}
                $value='default'
                try{$key=Get-Item -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Services\'+$s.Name);$raw=$key.GetValue('SvcHostSplitDisable',$null);if($null -ne $raw){if($key.GetValueKind('SvcHostSplitDisable') -ne 'DWord' -or $raw -notin @(0,1)){throw '服务分组值异常。'};$value=[string]$raw}}catch{$reason=$_.Exception.Message}
                $state=[ordered]@{value=$value}
                @{id=(Get-DsHash ('service-host|'+$s.Name));kind=$Kind;title=$s.DisplayName;target=$s.Name;detail=([string]$s.Description);current=$value;stateLabel='服务宿主分组策略';available=(!$reason);reason=$reason;identity=$identity;fingerprint=(Get-DsHash ($identity+'|'+(Get-DsStateHash $state)));before=$state;options=@(@{value='default';label='系统默认'},@{value='0';label='允许系统拆分'},@{value='1';label='禁止拆分此服务'});effect='仅管理所选 svchost 服务的 SvcHostSplitDisable，重启后生效。合并会减少进程隔离，单个服务故障可波及同组服务；禁止拆分不保证实际一定合并，不改变全局内存阈值。';dependencies=@();dependents=@();native=$s}
                continue
            }
            $dependent=@($controllers[$s.Name].DependentServices|ForEach-Object{$_.Name})
            $requires=@($controllers[$s.Name].ServicesDependedOn|ForEach-Object{$_.Name})
            $value=if($null -eq $state){''}elseif($state.start -eq 2 -and $state.delayed -eq 1){'delayed'}else{@{2='auto';3='manual';4='disabled'}[[int]$state.start]}
            @{id=(Get-DsHash ('service|'+$s.Name));kind=$Kind;title=$s.DisplayName;target=$s.Name;detail=([string]$s.Description);current=$value;stateLabel=($s.State+' · '+$s.StartMode);available=(!$reason);reason=$reason;identity=$identity;fingerprint=(Get-DsHash ($identity+'|'+(Get-DsStateHash $state)));before=$state;options=@(@{value='auto';label='自动'},@{value='delayed';label='自动（延迟）'},@{value='manual';label='手动'},@{value='disabled';label='禁用'});effect='只改变启动方式，不强制停止或启动当前服务。禁用会影响依赖此服务的功能；触发器和系统维护可能影响后续启动。';dependencies=$requires;dependents=$dependent;native=$s}
        }
        return
    }
    foreach($d in Get-CimInstance Win32_PnPEntity -ErrorAction Stop){
        if(!$d.PNPDeviceID -or $d.Present -eq $false){continue}
        $target=[string]$d.PNPDeviceID;$reason=''
        $driverKey=(Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Enum\'+$target) -Name Driver -ErrorAction SilentlyContinue).Driver
        $driverVersion='';$driverInf=''
        if($driverKey -match '^\{[a-fA-F0-9-]{36}\}\\\d{4}$'){
            $driver=Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Control\Class\'+$driverKey) -ErrorAction SilentlyContinue
            $driverVersion=[string]$driver.DriverVersion;$driverInf=[string]$driver.InfPath
        }
        $identity=Get-DsHash ($target+'|'+$d.Service+'|'+($d.HardwareID -join '|')+'|'+$driverVersion+'|'+$driverInf)
        if($Kind -eq 'msi'){
            if($target -notlike 'PCI\*'){continue}
            $path='HKLM:\SYSTEM\CurrentControlSet\Enum\'+$target+'\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties'
            if(!(Test-Path -LiteralPath $path)){continue}
            try{$key=Get-Item -LiteralPath $path;$value=$key.GetValue('MSISupported',$null);if($null -eq $value){continue};if($key.GetValueKind('MSISupported') -ne 'DWord' -or $value -notin @(0,1)){throw 'MSI 注册值格式异常。'}}catch{$reason=$_.Exception.Message;$value=$null}
            $state=[ordered]@{value=$value}
            @{id=(Get-DsHash ('msi|'+$target));kind=$Kind;title=$d.Name;target=$target;detail=([string]$d.Manufacturer+' · '+$d.Service);current=[string]$value;stateLabel=$(if($value -eq 1){'注册设置：MSI 开启'}else{'注册设置：MSI 关闭'});available=(!$reason);reason=$reason;identity=$identity;fingerprint=(Get-DsHash ($identity+'|'+(Get-DsStateHash $state)));before=$state;options=@(@{value='1';label='启用 MSI'},@{value='0';label='关闭 MSI'});effect='仅管理已存在的 MSISupported 注册项，不代表已验证硬件能力或实际中断模式。必须确认驱动支持，重启后生效；控制器不兼容可能造成设备或启动故障。不改中断亲和性或消息数量。';dependencies=@();dependents=@();native=@{path=$path}}
        }else{
            $code=[int]$d.ConfigManagerErrorCode
            # Only optional endpoint classes and explicitly identified software enumerators.
            $optional=$d.PNPClass -in @('Bluetooth','Printer','PrintQueue','Camera','Image','MEDIA','SoftwareDevice') -or $target -match '^(?i)SWD\\MSRRAS\\' -or $target -match '^(?i)ROOT\\(VDRVROOT|UMBUS|NDISVIRTUALBUS|RDPBUS|VMBUS)\\'
            if(!$optional){$reason='显示、输入、存储、物理网络及未分类基础设备不在直接停用范围。'}
            if($code -notin @(0,22)){$reason='设备存在其他故障（代码 '+$code+'），请先诊断驱动或连接。'}
            $state=[ordered]@{disabled=($code -eq 22)}
            @{id=(Get-DsHash ('pnp|'+$target));kind=$Kind;title=$d.Name;target=$target;detail=([string]$d.PNPClass+' · '+$d.Manufacturer);current=$(if($code -eq 22){'disabled'}else{'enabled'});stateLabel=([string]$d.Status+' · 问题代码 '+$code);available=(!$reason);reason=$reason;identity=$identity;fingerprint=(Get-DsHash ($identity+'|'+(Get-DsStateHash $state)));before=$state;options=@(@{value='enabled';label='启用'},@{value='disabled';label='禁用'});effect='更改所选设备启用状态。蓝牙输入、音频、摄像头、打印、VPN、虚拟机或远程会话可能断开。先确认此设备不承载当前控制通道；可能需要重启。';dependencies=@();dependents=@();native=$d}
        }
    }
}
function Get-DeviceServiceCatalog([ValidateSet('services','devices','msi','service-host')][string]$Kind){
    $records=@(Get-DsRecords)
    $items=@(Get-DsEntries $Kind|Sort-Object title|ForEach-Object{
        $item=$_;$row=@{};foreach($key in $item.Keys){if($key -notin @('native','identity','before')){$row[$key]=$item[$key]}}
        $last=$records|Where-Object{$_.id -ceq $item.id -and $_.status -in @('pending','applied','restore-failed','rollback-failed')}|Select-Object -First 1
        $row.backupId=$(if($last){$last.backupId}else{''});$row
    })
    @{items=$items;capturedAt=[DateTime]::UtcNow.ToString('o');account=[Security.Principal.WindowsIdentity]::GetCurrent().Name}
}
function Get-DsDesired($Item,[string]$Choice){
    if($Choice -cnotin @($Item.options|ForEach-Object{$_.value})){throw '无效选项。'}
    switch($Item.kind){
        services{[ordered]@{start=@{auto=2;delayed=2;manual=3;disabled=4}[$Choice];delayed=$(if($Choice -eq 'delayed'){1}elseif($Choice -eq 'auto'){0}else{$Item.before.delayed})}}
        devices{[ordered]@{disabled=($Choice -eq 'disabled')}}
        msi{[ordered]@{value=[int]$Choice}}
        'service-host'{[ordered]@{value=$Choice}}
    }
}
function Set-DsNative($Item,$State){
    switch($Item.kind){
        services{
            if([int]$State.start -notin @(2,3,4)){throw '服务备份启动类型无效。'}
            Set-Service -Name $Item.target -StartupType (@{2='Automatic';3='Manual';4='Disabled'}[[int]$State.start]) -ErrorAction Stop
            $path='HKLM:\SYSTEM\CurrentControlSet\Services\'+$Item.target
            if($null -eq $State.delayed){Remove-ItemProperty -LiteralPath $path -Name DelayedAutoStart -ErrorAction SilentlyContinue}else{New-ItemProperty -LiteralPath $path -Name DelayedAutoStart -Value $State.delayed -PropertyType DWord -Force|Out-Null}
        }
        devices{
            if($State.disabled -isnot [bool]){throw '设备备份状态无效。'}
            if($State.disabled){Disable-PnpDevice -InstanceId $Item.target -Confirm:$false -ErrorAction Stop}else{Enable-PnpDevice -InstanceId $Item.target -Confirm:$false -ErrorAction Stop}
        }
        msi{
            if($State.value -notin @(0,1)){throw 'MSI 备份值无效。'}
            New-ItemProperty -LiteralPath $Item.native.path -Name MSISupported -PropertyType DWord -Value $State.value -Force -ErrorAction Stop|Out-Null
        }
        'service-host'{
            if($State.value -cnotin @('default','0','1')){throw '服务分组备份值无效。'}
            $path='HKLM:\SYSTEM\CurrentControlSet\Services\'+$Item.target
            if($State.value -ceq 'default'){Remove-ItemProperty -LiteralPath $path -Name SvcHostSplitDisable -ErrorAction SilentlyContinue}
            else{New-ItemProperty -LiteralPath $path -Name SvcHostSplitDisable -PropertyType DWord -Value ([int]$State.value) -Force -ErrorAction Stop|Out-Null}
        }
    }
}
function Find-DsItem([string]$Kind,[string]$Id){$items=@(Get-DsEntries $Kind|Where-Object{$_.id -ceq $Id});if($items.Count -ne 1){throw '项目不存在或身份不唯一，请重新扫描。'};$items[0]}
function Test-DsEqual($A,$B){(Get-DsStateHash $A) -eq (Get-DsStateHash $B)}
function Set-DeviceServiceItem([ValidateSet('services','devices','msi','service-host')][string]$Kind,[string]$Id,[string]$Fingerprint,[string]$Choice){
    $item=Find-DsItem $Kind $Id
    if(!$item.available){throw $item.reason};if($Fingerprint -cne $item.fingerprint){throw '状态或设备身份发生变化，请重新扫描。'}
    $desired=Get-DsDesired $item $Choice
    if(Test-DsEqual $desired $item.before){return @{ok=$true;backupId='';message='当前已经是所选设置，没有重复写入。'}}
    $r=@{schema=1;backupId=((Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N'));sid=(Get-DsSid);kind=$Kind;id=$Id;target=$item.target;identity=$item.identity;title=$item.title;before=$item.before;desired=$desired;status='pending';createdAt=[DateTime]::UtcNow.ToString('o')}
    Save-DsRecord $r
    try{
        Set-DsNative $item $desired
        $after=Find-DsItem $Kind $Id
        if($after.identity -cne $item.identity -or !(Test-DsEqual $after.before $desired)){throw '写入后回读不一致。'}
        $r.status='applied';Save-DsRecord $r
    }catch{
        $failure=$_.Exception.Message
        try{$current=Find-DsItem $Kind $Id;if($current.identity -cne $item.identity){throw '身份已变更。'};Set-DsNative $current $r.before;if(!(Test-DsEqual (Find-DsItem $Kind $Id).before $r.before)){throw '回滚校验失败。'};$r.status='rolled-back'}catch{$r.status='rollback-failed';$failure+='；回滚未完成：'+$_.Exception.Message}
        $r.error=$failure;Save-DsRecord $r;throw ($failure+' 备份：'+$r.backupId)
    }
    @{ok=$true;backupId=$r.backupId;message='设置已写入并回读验证。服务启动方式和 MSI 设置需重启后使用；不代表性能提升。'}
}
function Restore-DeviceServiceItem([string]$BackupId){
    if($BackupId -notmatch '^\d{8}-\d{6}-\d{3}-[a-f0-9]{32}$'){throw '备份编号无效。'}
    $r=Get-Content -LiteralPath (Join-Path $script:dsRecords ($BackupId+'.json')) -Raw -Encoding UTF8|ConvertFrom-Json
    if($r.schema -ne 1 -or $r.sid -cne (Get-DsSid) -or $r.status -notin @('pending','applied','restore-failed','rollback-failed')){throw '备份账户、版本或状态不允许恢复。'}
    $item=Find-DsItem $r.kind $r.id
    if($item.target -cne $r.target -or $item.identity -cne $r.identity){throw '服务或设备已替换，不能套用旧备份。'}
    if(!(Test-DsEqual $item.before $r.before) -and !(Test-DsEqual $item.before $r.desired)){throw '当前设置已被其他操作更改，未覆盖。'}
    try{Set-DsNative $item $r.before;if(!(Test-DsEqual (Find-DsItem $r.kind $r.id).before $r.before)){throw '恢复后回读不一致。'};$r.status='restored';Save-DsRecord $r}catch{$r.status='restore-failed';Save-DsRecord $r;throw}
    @{ok=$true;backupId=$r.backupId;message='原设置已恢复并回读验证。服务启动类型和 MSI 设置建议重启后使用。'}
}
Export-ModuleMember -Function Get-DeviceServiceCatalog,Set-DeviceServiceItem,Restore-DeviceServiceItem
