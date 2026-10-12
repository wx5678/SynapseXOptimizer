$ErrorActionPreference='Stop'
$expertBase=if($env:SYNAPSEX_STATE_ROOT){[IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT)}else{Join-Path $env:LOCALAPPDATA 'SynapseX\state'}
$script:expertRoot=Join-Path $expertBase 'expert-backups'
. (Join-Path $PSScriptRoot 'PrivacyDefinitions.ps1')
function Get-ExpertDefinitions {
    $tri=@(@{value='default';label='未配置（由系统决定）'},@{value='0';label='关闭'},@{value='1';label='开启'})
    $system='HKLM:\SOFTWARE\Policies\Microsoft\Windows\System'
    @(
        @{id='mpo';title='多平面叠加 MPO';category='显示';kind='registry';path='HKLM:\SOFTWARE\Microsoft\Windows\Dwm';name='OverlayTestMode';options=@(@{value='default';label='系统默认'},@{value='5';label='禁用 MPO'});effect='修改 Windows 桌面合成设置，重启后生效。用于排查闪烁或显示兼容性，关闭后可能增加功耗；不保证提高帧率。'},
        @{id='mmcss';title='多媒体任务的后台 CPU 保留比例';category='调度';kind='registry';path='HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile';name='SystemResponsiveness';options=@(@{value='default';label='系统默认'},@{value='10';label='10%'},@{value='20';label='20%'},@{value='30';label='30%'});effect='调整 MMCSS 为低优先级工作保留的 CPU 比例，重启后对照测试。不修改游戏进程优先级；低于 10 的值会被 Windows 按 20 处理。'},
        @{id='ntfs-8dot3';title='NTFS 短文件名生成';category='存储';kind='fsutil';name='disable8dot3';options=@(@{value='0';label='所有卷开启'},@{value='1';label='所有卷关闭'},@{value='2';label='按卷设置'},@{value='3';label='仅系统卷开启'});effect='只调整之后创建文件时的 8.3 短名称生成策略，不删除已有短名称。旧安装程序和脚本可能依赖短路径，修改后应测试兼容性。'},
        @{id='ntfs-access';title='NTFS 最后访问时间更新';category='存储';kind='fsutil';name='disablelastaccess';options=@(@{value='0';label='用户管理：开启'},@{value='1';label='用户管理：关闭'},@{value='2';label='系统管理：开启'},@{value='3';label='系统管理：关闭'});effect='更改文件最后访问时间更新策略，不修改最后写入时间。依赖访问时间的备份、归档软件会受影响；重启后验证。'},
        @{id='ntfs-memory';title='NTFS 内存使用模式';category='存储';kind='fsutil';name='memoryusage';options=@(@{value='1';label='默认内存使用'},@{value='2';label='增加文件系统缓存阈值'});effect='提高阈值会占用更多内核内存；内存紧张时可能降低整体性能。不是内存清理功能，重启后验证。'},
        @{id='reserved-storage';title='Windows 保留存储';category='存储';kind='reserved';options=@(@{value='Enabled';label='启用'},@{value='Disabled';label='停用'});effect='管理供 Windows 更新使用的保留空间。停用后更新可能需要手动腾出空间；系统正在维护时会拒绝更改，不强制解锁。'},
        @{id='activity-feed';title='用户活动源';category='隐私';kind='registry';policy=$true;path=$system;name='EnableActivityFeed';options=$tri;effect='控制应用能否发布用户活动。仅管理 Windows 活动源策略，不清除已保存的历史。'},
        @{id='activity-publish';title='发布用户活动';category='隐私';kind='registry';policy=$true;path=$system;name='PublishUserActivities';options=$tri;effect='控制用户活动发布策略；不修改游戏数据。已取消相关活动功能的 Windows 版本不会因此新增功能。'},
        @{id='activity-upload';title='上传用户活动';category='隐私';kind='registry';policy=$true;path=$system;name='UploadUserActivities';options=$tri;effect='控制用户活动上传策略，不删除云端已有内容。实际行为还取决于系统版本和账户设置。'},
        @{id='clipboard-history';title='剪贴板历史';category='隐私';kind='registry';policy=$true;path=$system;name='AllowClipboardHistory';options=$tri;effect='管理剪贴板历史策略。关闭会影响 Win+V 历史功能，不是清空剪贴板操作。'},
        @{id='clipboard-sync';title='跨设备剪贴板';category='隐私';kind='registry';policy=$true;path=$system;name='AllowCrossDeviceClipboard';options=$tri;effect='管理跨设备剪贴板同步策略；不影响普通本机复制粘贴。'},
        @{id='telemetry';title='Windows 诊断数据级别';category='隐私';kind='registry';policy=$true;path='HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection';name='AllowTelemetry';options=@(@{value='default';label='未配置'},@{value='1';label='必需诊断数据'},@{value='3';label='可选诊断数据'});effect='仅管理 Windows 诊断数据策略，不承诺关闭所有网络连接或第三方遥测。关闭级别仅对支持它的企业、教育版本提供。'},
        @{id='automatic-updates';title='Windows 自动更新';category='更新';kind='registry';policy=$true;path='HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU';name='NoAutoUpdate';options=@(@{value='default';label='未配置'},@{value='0';label='允许自动更新（遵循其他更新策略）'},@{value='1';label='关闭自动更新'});effect='关闭后需要主动检查并安装安全更新。不停用更新服务，也不拦截手动更新；已有组织策略可能覆盖此值。'},
        @{id='smartscreen';title='文件资源管理器 SmartScreen';category='安全';kind='registry';policy=$true;path=$system;name='EnableSmartScreen';options=$tri;effect='关闭会减少对下载程序和文件的信誉检查，增加运行恶意文件的风险。只改变此开关，保留原警告或阻止级别；不关闭浏览器的独立保护。'},
        @{id='security-notifications';title='Windows 安全中心通知';category='安全';kind='registry';policy=$true;path='HKLM:\SOFTWARE\Policies\Microsoft\Windows Defender Security Center\Notifications';name='DisableNotifications';options=@(@{value='default';label='未配置'},@{value='0';label='显示通知'},@{value='1';label='隐藏所有通知'});effect='隐藏会漏看防护和健康警报；不会停用 Defender、防火墙或后台扫描。需要诊断时应恢复通知。'},
        @{id='uac';title='用户账户控制 UAC';category='安全';kind='registry';path='HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System';name='EnableLUA';options=@(@{value='1';label='启用管理员批准模式'},@{value='0';label='关闭管理员批准模式'});effect='关闭会改变管理员权限隔离，减少提权保护并影响依赖 UAC 的应用；不是游戏推荐。必须重启生效；不修改其他提示等级。'},
        @{id='defender-realtime';title='Defender 实时保护';category='安全';kind='defender';options=@(@{value='enabled';label='开启实时保护'},@{value='disabled';label='请求暂时关闭实时保护'});effect='关闭后恶意文件可能不被实时拦截。仅使用 Defender 官方接口，系统可能自动重新开启；不卸载防护、不添加排除项、不绕过篡改保护。'},
        @{id='firewall-domain';title='防火墙：域网络';category='安全';kind='firewall';name='Domain';options=@(@{value='True';label='启用'},@{value='False';label='关闭'},@{value='NotConfigured';label='本地未配置'});effect='修改域网络的本地防火墙开关。关闭会失去该配置文件的流量过滤保护；保留所有规则，组织策略可能覆盖本地配置。'},
        @{id='firewall-private';title='防火墙：专用网络';category='安全';kind='firewall';name='Private';options=@(@{value='True';label='启用'},@{value='False';label='关闭'},@{value='NotConfigured';label='本地未配置'});effect='修改专用网络的本地防火墙开关，不删除规则。关闭会增加未授权连接风险；不等于降低游戏服务器延迟。'},
        @{id='firewall-public';title='防火墙：公用网络';category='安全';kind='firewall';name='Public';options=@(@{value='True';label='启用'},@{value='False';label='关闭'},@{value='NotConfigured';label='本地未配置'});effect='修改公用网络的本地防火墙开关。在公共 Wi-Fi 等不可信网络关闭保护会增加暴露风险；不会停止防火墙基础服务。'},
        @{id='boot-platform-clock';title='平台性能计数器';category='启动调试';kind='bcd';name='useplatformclock';options=@(@{value='default';label='未覆盖（系统选择）'},@{value='yes';label='强制平台时钟'},@{value='no';label='不强制平台时钟'});effect='Microsoft 将此参数列为调试用途，不是通用提帧设置。修改启动配置可能影响计时和启动，必须重启；保留原启动项及原值。'},
        @{id='boot-platform-tick';title='平台时钟 Tick';category='启动调试';kind='bcd';name='useplatformtick';options=@(@{value='default';label='未覆盖（系统选择）'},@{value='yes';label='强制平台来源'},@{value='no';label='不强制平台来源'});effect='仅用于计时兼容性调试，不保证降低延迟。修改后重启；与性能计数器是不同参数，不绑定应用。'},
        @{id='boot-dynamic-tick';title='动态 Tick';category='启动调试';kind='bcd';name='disabledynamictick';options=@(@{value='default';label='未覆盖（系统选择）'},@{value='yes';label='禁用动态 Tick'},@{value='no';label='不禁用动态 Tick'});effect='调试启动参数。关闭动态 Tick 会改变空闲计时行为，可能增加功耗；需重启对照，不加入游戏推荐。'},
        @{id='boot-tsc';title='TSC 同步策略';category='启动调试';kind='bcd';name='tscsyncpolicy';options=@(@{value='default';label='未覆盖（系统选择）'},@{value='Default';label='显式 Default'},@{value='Legacy';label='Legacy'},@{value='Enhanced';label='Enhanced'});effect='仅用于时间戳计数器同步调试，不按 CPU 品牌或型号套用。修改启动配置后必须重启；不修改安全启动或加密状态。'}
    )
    Get-PrivacyDefinitions
}
function Get-ExpertEnvironment {
    $os=Get-CimInstance Win32_OperatingSystem
    $edition=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion').EditionID
    @{build=[int]$os.BuildNumber;client=($os.ProductType -eq 1);edition=$edition;identity=((Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography').MachineGuid+'|'+[Security.Principal.WindowsIdentity]::GetCurrent().User.Value)}
}
function Get-ExpertDefinition([string]$Id,$Environment){
    $d=@(Get-ExpertDefinitions|Where-Object{$_.id -ceq $Id});if($d.Count -ne 1){throw '未知的高级参数。'};$d=$d[0]
    if(!$Environment.client -or $Environment.build -lt 19041){throw '此参数集适用于 Windows 10 2004 及以上客户端系统。'}
    if($d.policy -and $Environment.edition -notmatch '^(Professional|Enterprise|Education|IoTEnterprise)'){throw '当前 Windows 版本不在此组策略的支持范围。'}
    if($Id -eq 'telemetry' -and $Environment.edition -match '^(Enterprise|Education|IoTEnterprise)'){$d.options+=@{value='0';label='关闭诊断数据（受支持版本）'}}
    if($d.kind -eq 'bcd'){
        if(!$Environment.ContainsKey('bootReason')){$Environment.bootReason=Get-ExpertBootRestriction}
        if($Environment.bootReason){throw $Environment.bootReason}
    }
    $d
}
function Get-ExpertBootRestriction {
    try{
        $volumes=@(Get-CimInstance -Namespace 'root\CIMV2\Security\MicrosoftVolumeEncryption' -ClassName Win32_EncryptableVolume -ErrorAction Stop|Where-Object{$_.DriveLetter -eq $env:SystemDrive})
        if($volumes.Count -ne 1){return '未能核验系统盘加密状态，不提供启动参数写入。'}
        $conversion=Invoke-CimMethod -InputObject $volumes[0] -MethodName GetConversionStatus -ErrorAction Stop
        if($conversion.ReturnValue -ne 0 -or $conversion.ConversionStatus -ne 0){return '系统盘已加密或状态未知；修改 BCD 可能触发恢复密钥验证。此处不会关闭加密或自动修改启动参数。'}
    }catch{return '无法核验系统盘加密状态；启动参数保留不变。'}
    ''
}
function Invoke-ExpertBcd([string[]]$Arguments){
    $output=& (Join-Path $env:SystemRoot 'System32\bcdedit.exe') @Arguments 2>&1
    if($LASTEXITCODE -ne 0){throw ($output -join "`n")};$output -join "`n"
}
function Get-ExpertBcdValue($Definition){
    $output=Invoke-ExpertBcd @('/enum','{current}','/v')
    # The first identifier belongs to the requested current loader, not its resume entry.
    if($output -notmatch '(?m)^\S+\s+(\{[a-fA-F0-9-]{36}\})\s*$'){throw '无法核对当前 Windows 启动项标识。'};$bootId=$Matches[1]
    $value='default';$pattern='(?m)^'+[regex]::Escape($Definition.name)+'\s+(\S+)\s*$'
    if($output -match $pattern){
        $raw=$Matches[1]
        if($Definition.name -eq 'tscsyncpolicy'){$value=$raw}
        elseif($raw -imatch '^(yes|是)$'){$value='yes'}elseif($raw -imatch '^(no|否)$'){$value='no'}else{throw '启动参数值无法识别，未开放修改。'}
    }
    if($value -cnotin @($Definition.options|ForEach-Object{$_.value})){throw '当前启动参数不在此版本可识别范围。'}
    [ordered]@{value=$value;bootId=$bootId}
}
function Invoke-ExpertFsutil([string[]]$Arguments){
    $output=& (Join-Path $env:SystemRoot 'System32\fsutil.exe') @Arguments 2>&1
    if($LASTEXITCODE -ne 0){throw ($output -join "`n")};$output -join "`n"
}
function Get-ExpertValue($Definition){
    switch($Definition.kind){
        defender{
            $status=Get-MpComputerStatus -ErrorAction Stop
            if(!$status.AMServiceEnabled -or $status.AMRunningMode -ne 'Normal'){throw 'Defender 未处于主动防护模式，不能用此开关控制第三方安全软件。'}
            if(!$status.PSObject.Properties['IsTamperProtected'] -or $status.IsTamperProtected){throw '篡改保护已开启或状态未知，不通过此工具关闭防护。'}
            $preference=Get-MpPreference -ErrorAction Stop
            [ordered]@{value=$(if($preference.DisableRealtimeMonitoring){'disabled'}else{'enabled'})}
        }
        firewall{
            $profile=@(Get-NetFirewallProfile -PolicyStore PersistentStore -Name $Definition.name -ErrorAction Stop)
            if($profile.Count -ne 1){throw '不能唯一识别防火墙配置文件。'}
            $value=[string]$profile[0].Enabled
            if($value -cnotin @($Definition.options|ForEach-Object{$_.value})){throw '防火墙配置值无法识别。'}
            [ordered]@{value=$value}
        }
        bcd{Get-ExpertBcdValue $Definition}
        registry{
            $value=$null
            if(Test-Path -LiteralPath $Definition.path){$key=Get-Item -LiteralPath $Definition.path;$value=$key.GetValue($Definition.name,$null);if($null -ne $value -and $key.GetValueKind($Definition.name) -ne 'DWord'){throw '原注册值不是 DWORD，未开放修改。'}}
            if($null -ne $value){$value=[long]$value;if($value -lt 0){$value+=4294967296}}
            [ordered]@{value=$(if($null -eq $value){'default'}else{[string]$value})}
        }
        fsutil{
            $output=Invoke-ExpertFsutil @('behavior','query',$Definition.name)
            # First field only; never scrape digits from translated explanatory text.
            if($output -notmatch '(?m)^\s*[^\r\n:=]+[:=]\s*([0-3])(?:\s|$)'){throw '不能识别 fsutil 返回的设置值，保留原设置。'}
            [ordered]@{value=[string]$Matches[1]}
        }
        reserved{
            $value=Get-WindowsReservedStorageState -ErrorAction Stop
            $state=if($value.PSObject.Properties['State']){[string]$value.State}else{[string]$value}
            if($state -cnotin @('Enabled','Disabled')){throw '保留存储状态未知。'}
            [ordered]@{value=$state}
        }
    }
}
function Set-ExpertNative($Definition,$State){
    if($Definition.kind -eq 'registry'){
        if($State.value -ceq 'default'){if(Test-Path -LiteralPath $Definition.path){Remove-ItemProperty -LiteralPath $Definition.path -Name $Definition.name -ErrorAction SilentlyContinue};return}
        $number=0L;if(![long]::TryParse([string]$State.value,[ref]$number) -or $number -lt 0 -or $number -gt 4294967295){throw '备份中的 DWORD 无效。'}
        $signed=[BitConverter]::ToInt32([BitConverter]::GetBytes([uint32]$number),0)
        New-Item -Path $Definition.path -Force|Out-Null
        New-ItemProperty -LiteralPath $Definition.path -Name $Definition.name -PropertyType DWord -Value $signed -Force -ErrorAction Stop|Out-Null
    }elseif($State.value -cnotin @($Definition.options|ForEach-Object{$_.value})){throw '系统工具参数超出白名单。'}
    elseif($Definition.kind -eq 'fsutil'){Invoke-ExpertFsutil @('behavior','set',$Definition.name,[string]$State.value)|Out-Null}
    elseif($Definition.kind -eq 'reserved'){Set-WindowsReservedStorageState -State $State.value -ErrorAction Stop|Out-Null}
    elseif($Definition.kind -eq 'firewall'){Set-NetFirewallProfile -PolicyStore PersistentStore -Name $Definition.name -Enabled $State.value -ErrorAction Stop}
    elseif($Definition.kind -eq 'defender'){
        $null=Get-ExpertValue $Definition
        Set-MpPreference -DisableRealtimeMonitoring ($State.value -ceq 'disabled') -ErrorAction Stop
    }
    elseif($Definition.kind -eq 'bcd'){
        $current=Get-ExpertBcdValue $Definition
        if(!$State.bootId -or $current.bootId -cne $State.bootId){throw 'Windows 启动项已变更，不能套用此备份。'}
        if($State.value -ceq 'default'){if($current.value -cne 'default'){Invoke-ExpertBcd @('/deletevalue',$State.bootId,$Definition.name)|Out-Null}}
        else{Invoke-ExpertBcd @('/set',$State.bootId,$Definition.name,$State.value)|Out-Null}
    }
}
function Get-ExpertHash($Value){$sha=[Security.Cryptography.SHA256]::Create();try{-join($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Compress -Depth 10)))|ForEach-Object{$_.ToString('x2')})}finally{$sha.Dispose()}}
function Save-ExpertRecord($Record){
    New-Item -ItemType Directory -Path $script:expertRoot -Force|Out-Null
    $path=Join-Path $script:expertRoot ($Record.backupId+'.json')
    [IO.File]::WriteAllText($path+'.pending',($Record|ConvertTo-Json -Depth 10),(New-Object Text.UTF8Encoding($false)))
    if([IO.File]::Exists($path)){[IO.File]::Replace($path+'.pending',$path,[NullString]::Value)}else{[IO.File]::Move($path+'.pending',$path)}
}
function Get-ExpertRecords{
    @(Get-ChildItem -LiteralPath $script:expertRoot -Filter '*.json' -File -ErrorAction SilentlyContinue|Sort-Object Name -Descending|ForEach-Object{try{Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8|ConvertFrom-Json}catch{}})
}
function Get-ExpertCatalog {
    $environment=Get-ExpertEnvironment;$records=Get-ExpertRecords
    $items=@(foreach($base in Get-ExpertDefinitions){
        $d=$base;$reason='';$state=$null;$fingerprint=''
        try{$d=Get-ExpertDefinition $base.id $environment;$state=Get-ExpertValue $d;$fingerprint=Get-ExpertHash @($environment.identity,$d.id,$state)}catch{$reason=$_.Exception.Message}
        $last=$records|Where-Object{$_.id -ceq $d.id -and $_.identity -ceq $environment.identity -and $_.status -in @('pending','applied','rollback-failed','restore-failed')}|Select-Object -First 1
        @{id=$d.id;title=$d.title;category=$d.category;effect=$d.effect;current=$(if($state){$state.value}else{''});options=$d.options;available=(!$reason);reason=$reason;fingerprint=$fingerprint;backupId=$(if($last){$last.backupId}else{''})}
    })
    @{items=$items;capturedAt=[DateTime]::UtcNow.ToString('o');edition=$environment.edition;build=$environment.build}
}
function Set-ExpertSetting([string]$Id,[string]$Fingerprint,[string]$Choice){
    $environment=Get-ExpertEnvironment;$d=Get-ExpertDefinition $Id $environment
    if($Choice -cnotin @($d.options|ForEach-Object{$_.value})){throw '选项不适用于当前系统。'}
    $before=Get-ExpertValue $d;if($Fingerprint -cne (Get-ExpertHash @($environment.identity,$d.id,$before))){throw '设置已变化，请重新读取后再应用。'}
    if($before.value -ceq $Choice){return @{ok=$true;backupId='';message='当前已是所选值，没有重复写入。'}}
    $r=@{schema=1;id=$Id;identity=$environment.identity;backupId=((Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N'));createdAt=[DateTime]::UtcNow.ToString('o');before=$before;desired=[ordered]@{value=$Choice};status='pending'}
    if($d.kind -eq 'bcd'){$r.desired.bootId=$before.bootId}
    Save-ExpertRecord $r
    try{Set-ExpertNative $d $r.desired;if((Get-ExpertValue $d).value -cne $Choice){throw '写入后回读不一致。'};$r.status='applied';Save-ExpertRecord $r}
    catch{
        $failure=$_.Exception.Message
        try{Set-ExpertNative $d $before;if((Get-ExpertValue $d).value -cne $before.value){throw '回滚后回读不一致。'};$r.status='rolled-back'}catch{$r.status='rollback-failed';$failure+='；回滚未完成：'+$_.Exception.Message}
        $r.error=$failure;Save-ExpertRecord $r;throw ($failure+' 备份：'+$r.backupId)
    }
    @{ok=$true;backupId=$r.backupId;message='参数已写入并回读。策略值不等于运行效果证明；请按选项说明重启或重新打开相关应用。'}
}
function Restore-ExpertSetting([string]$BackupId){
    if($BackupId -notmatch '^\d{8}-\d{6}-\d{3}-[a-f0-9]{32}$'){throw '备份编号无效。'}
    $r=Get-Content -LiteralPath (Join-Path $script:expertRoot ($BackupId+'.json')) -Raw -Encoding UTF8|ConvertFrom-Json
    $environment=Get-ExpertEnvironment
    if($r.schema -ne 1 -or $r.identity -cne $environment.identity -or $r.status -notin @('pending','applied','rollback-failed','restore-failed')){throw '备份不属于当前电脑、账户或不可恢复。'}
    $d=Get-ExpertDefinition $r.id $environment;$current=Get-ExpertValue $d
    if($d.kind -eq 'bcd' -and $current.bootId -cne $r.before.bootId){throw '当前启动项与备份不一致，未恢复。'}
    if($current.value -cne $r.before.value -and $current.value -cne $r.desired.value){throw '当前值已被其他操作改变，未覆盖。'}
    try{Set-ExpertNative $d $r.before;if((Get-ExpertValue $d).value -cne $r.before.value){throw '恢复后回读不一致。'};$r.status='restored';Save-ExpertRecord $r}catch{$r.status='restore-failed';Save-ExpertRecord $r;throw}
    @{ok=$true;backupId=$BackupId;message='已恢复原参数并回读确认。原先未配置的注册值已移除，不影响同一路径下的其他设置。'}
}
Export-ModuleMember -Function Get-ExpertCatalog,Set-ExpertSetting,Restore-ExpertSetting
