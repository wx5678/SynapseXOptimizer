$ErrorActionPreference='Stop'
$script:regRoot=Join-Path $(if($env:SYNAPSEX_STATE_ROOT){$env:SYNAPSEX_STATE_ROOT}else{Join-Path $env:LOCALAPPDATA 'SynapseX\state'}) 'lab-registry'
$script:regHive=[Microsoft.Win32.Registry]::LocalMachine
$script:regOffers=@{}
function Invoke-LrExclusive([scriptblock]$Action){
    $sha=[Security.Cryptography.SHA256]::Create();try{$name='Local\SynapseX-RegLab-'+(-join($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($script:regRoot).ToLowerInvariant()))|ForEach-Object{$_.ToString('x2')}))}finally{$sha.Dispose()}
    $mutex=New-Object Threading.Mutex($false,$name);$held=$false
    try{try{$held=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$held=$true};if(!$held){throw '其他服务正在写入实验设置。'};& $Action}finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
function Get-LrSnapshot([string]$Key,[string[]]$Names) {
    $k=$script:regHive.OpenSubKey($Key,$false)
    try {
        $values=@(foreach($name in $Names){
            if($k -and $k.GetValueNames() -contains $name){
                $kind=[string]$k.GetValueKind($name);$value=$k.GetValue($name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
                if($kind -notin @('DWord','Binary')){throw ('不支持的原值类型：'+$name+' / '+$kind)}
                @{name=$name;exists=$true;kind=$kind;value=$(if($kind -eq 'Binary'){[Convert]::ToBase64String([byte[]]$value)}else{[int]$value})}
            } else {@{name=$name;exists=$false;kind='';value=$null}}
        })
        @{keyExists=($null -ne $k);values=$values}
    } finally {if($k){$k.Dispose()}}
}
function Get-LrHash($Snapshot) {
    $text=($Snapshot|ConvertTo-Json -Depth 8 -Compress);$sha=[Security.Cryptography.SHA256]::Create()
    try{[Convert]::ToBase64String($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))}finally{$sha.Dispose()}
}
function Test-LrSame($A,$B) {
    if([bool]$A.keyExists -ne [bool]$B.keyExists){return $false}
    foreach($v in @($A.values)){
        $other=@($B.values|Where-Object name -eq $v.name)
        if($other.Count -ne 1 -or [bool]$v.exists -ne [bool]$other[0].exists -or [string]$v.kind -cne [string]$other[0].kind -or [string]$v.value -cne [string]$other[0].value){return $false}
    }
    return @($A.values).Count -eq @($B.values).Count
}
function Set-LrValues([string]$Key,$State) {
    $k=$script:regHive.CreateSubKey($Key)
    try {foreach($v in @($State.values)){
        if(!$v.exists){$k.DeleteValue($v.name,$false);continue}
        if($v.kind -eq 'Binary'){$k.SetValue($v.name,[Convert]::FromBase64String($v.value),[Microsoft.Win32.RegistryValueKind]::Binary)}
        elseif($v.kind -eq 'DWord'){$k.SetValue($v.name,[int]$v.value,[Microsoft.Win32.RegistryValueKind]::DWord)}
        else{throw '无效注册表值类型。'}
    };$k.Flush()}finally{$k.Dispose()}
    if(!$State.keyExists){
        $k=$script:regHive.OpenSubKey($Key);$empty=$k -and $k.SubKeyCount -eq 0 -and $k.ValueCount -eq 0;if($k){$k.Dispose()}
        if($empty){$script:regHive.DeleteSubKey($Key,$false)} # Only the empty key created by this operation, never a subtree.
    }
}
function Restore-LrPartialWrite([string]$Key,$Before,$Desired) {
    $current=Get-LrSnapshot $Key @($Before.values.name)
    foreach($value in @($current.values)) {
        $original=@($Before.values|Where-Object name -eq $value.name)
        $applied=@($Desired.values|Where-Object name -eq $value.name)
        $one=@{keyExists=$true;values=@($value)}
        if(!(Test-LrSame $one @{keyExists=$true;values=$original}) -and !(Test-LrSame $one @{keyExists=$true;values=$applied})) {
            throw '写入期间值已被其他程序修改，未覆盖；请核对后处理。'
        }
    }
    Set-LrValues $Key $Before
    if(!(Test-LrSame (Get-LrSnapshot $Key @($Before.values.name)) $Before)){throw '恢复回读不一致。'}
}
function Save-LrRecord($Record){
    New-Item -ItemType Directory -Path $script:regRoot -Force|Out-Null
    $path=Join-Path $script:regRoot ($Record.id+'.json')
    $bytes=[Text.Encoding]::UTF8.GetBytes(($Record|ConvertTo-Json -Depth 12))
    $stream=New-Object IO.FileStream(($path+'.pending'),[IO.FileMode]::Create,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
    Move-Item -LiteralPath ($path+'.pending') -Destination $path -Force
}
function Get-LabRegistryRecords {
    @{records=@(Get-ChildItem -LiteralPath $script:regRoot -Filter '*.json' -File -ErrorAction SilentlyContinue|Sort-Object LastWriteTimeUtc -Descending|Select-Object -First 100|ForEach-Object{try{Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8|ConvertFrom-Json}catch{}})}
}
function New-LrOffer([string]$Kind,[string]$Target,[string]$Title,[string]$Key,[string[]]$Names){
    $offer=[guid]::NewGuid().ToString('N');$before=Get-LrSnapshot $Key $Names
    $script:regOffers[$offer]=@{kind=$Kind;target=$Target;title=$Title;key=$Key;names=$Names;before=$before;at=[DateTime]::UtcNow}
    @{offer=$offer;title=$Title;target=$Target;before=$before}
}
function Get-LabIrqDevices {
    $topology=Get-SessionLabTopology
    $supported=@($topology.cpus|Select-Object -ExpandProperty Group -Unique).Count -eq 1 -and @($topology.cpus|Where-Object {$_.Group -ne 0 -or $_.Logical -gt 63}).Count -eq 0
    $rows=@(foreach($d in @(Get-CimInstance Win32_PnPEntity -Filter 'ConfigManagerErrorCode = 0' -ErrorAction Stop)){
        if($d.PNPDeviceID -notmatch '^PCI\\' -or $d.PNPClass -notin @('Net','USB','HDC','SCSIAdapter','Display','MEDIA')){continue}
        $key='SYSTEM\CurrentControlSet\Enum\'+$d.PNPDeviceID+'\Device Parameters\Interrupt Management\Affinity Policy'
        try{New-LrOffer 'irq' $d.PNPDeviceID $d.Name $key @('DevicePolicy','AssignmentSetOverride')}catch{ }
    })
    @{devices=$rows;supported=$supported;cpus=@($topology.cpus);note=$(if($supported){'仅设置所选设备的中断亲和性策略，重启后由驱动处理；回读注册表不等于已验证实际中断分布。'}else{'本机包含多个处理器组，当前中断掩码编辑不支持跨组，不会写入。'})}
}
function Get-LabLaunchPriority([string]$Executable) {
    if(!('SynapseX.SessionLab.Native' -as [type])){Get-SessionLabTopology|Out-Null}
    $path=[SynapseX.SessionLab.Native]::ValidatePath($Executable);$name=[IO.Path]::GetFileName($path)
    New-LrOffer 'launch' $path $name ('SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\'+$name+'\PerfOptions') @('CpuPriorityClass')
}
function Set-LabRegistryExperimentCore($Body) {
    $o=$script:regOffers[[string]$Body.offer]
    if(!$o -or ([DateTime]::UtcNow-$o.at).TotalMinutes -gt 5){throw '预览已过期，请重新读取。'}
    $current=Get-LrSnapshot $o.key $o.names
    if(!(Test-LrSame $current $o.before)){throw '原设置已变化，请重新读取。'}
    if(@((Get-LabRegistryRecords).records|Where-Object {$_.key -eq $o.key -and $_.status -in @('pending','applied','restore-failed')}).Count){throw '请先恢复此项目上次的实验。'}
    if($o.kind -eq 'launch'){
        [void][SynapseX.SessionLab.Native]::ValidatePath($o.target)
        if([int]$Body.priority -notin @(2,6,3)){throw '仅支持正常、高于正常或高；不支持实时优先级。'}
        $desired=@{keyExists=$true;values=@(@{name='CpuPriorityClass';exists=$true;kind='DWord';value=[int]$Body.priority})}
    }else{
        $topology=Get-SessionLabTopology
        if(@($topology.cpus|Select-Object -ExpandProperty Group -Unique).Count -ne 1 -or @($topology.cpus|Where-Object Group -ne 0).Count){throw '当前处理器组不支持此中断掩码。'}
        $logical=@($Body.logical|Select-Object -Unique);if(!$logical.Count){throw '至少选择一个逻辑处理器。'}
        $mask=New-Object byte[] 8
        foreach($n in $logical){if([int]$n -lt 0 -or [int]$n -gt 63 -or [int]$n -notin @($topology.cpus.Logical)){throw '无效逻辑处理器。'};$mask[[int][math]::Floor([int]$n/8)]=$mask[[int][math]::Floor([int]$n/8)] -bor (1 -shl ([int]$n%8))}
        $device=Get-CimInstance Win32_PnPEntity -Filter 'ConfigManagerErrorCode = 0'|Where-Object PNPDeviceID -eq $o.target
        if(!$device){throw '设备已不在就绪状态。'}
        $desired=@{keyExists=$true;values=@(@{name='DevicePolicy';exists=$true;kind='DWord';value=4},@{name='AssignmentSetOverride';exists=$true;kind='Binary';value=[Convert]::ToBase64String($mask)})}
    }
    $record=@{id=[guid]::NewGuid().ToString('N');kind=$o.kind;target=$o.target;title=$o.title;key=$o.key;before=$o.before;desired=$desired;status='pending';machine=$env:COMPUTERNAME;sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;at=[DateTime]::UtcNow.ToString('o');message=''}
    Save-LrRecord $record
    try{
        Set-LrValues $o.key $desired
        if(!(Test-LrSame (Get-LrSnapshot $o.key $o.names) $desired)){throw '注册表回读失败。'}
        $record.status='applied';$record.message=$(if($o.kind -eq 'launch'){'启动策略已写入并回读。仅下次启动同名 EXE 时使用，当前进程未修改；需重新启动后核对实际优先级。'}else{'设备策略已写入并回读，需重启后由驱动应用。未重启设备或电脑。'})
        Save-LrRecord $record;$script:regOffers.Remove([string]$Body.offer);$record
    }catch{
        $record.message=$_.Exception.Message
        try{Restore-LrPartialWrite $o.key $o.before $desired;$record.status='restored'}catch{$record.status='restore-failed';$record.message+='；'+$_.Exception.Message}
        Save-LrRecord $record;throw $record.message
    }
}
function Restore-LabRegistryExperimentCore([string]$Id) {
    if($Id -notmatch '^[a-f0-9]{32}$'){throw '无效备份编号。'}
    $record=Get-Content -LiteralPath (Join-Path $script:regRoot ($Id+'.json')) -Raw -Encoding UTF8|ConvertFrom-Json
    if($record.machine -ne $env:COMPUTERNAME -or $record.sid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value){throw '备份不属于本机当前用户。'}
    $expected=if($record.kind -eq 'launch'){'SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\'+[IO.Path]::GetFileName($record.target)+'\PerfOptions'}elseif($record.kind -eq 'irq' -and $record.target -match '^PCI\\[^\r\n]+$'){'SYSTEM\CurrentControlSet\Enum\'+$record.target+'\Device Parameters\Interrupt Management\Affinity Policy'}else{throw '无效恢复目标。'}
    if($expected -cne $record.key){throw '备份目标不匹配。'}
    $names=if($record.kind -eq 'launch'){@('CpuPriorityClass')}else{@('DevicePolicy','AssignmentSetOverride')}
    if(@($record.before.values|Where-Object name -notin $names).Count -or @($record.before.values).Count -ne $names.Count){throw '无效备份字段。'}
    try {
        $current=Get-LrSnapshot $record.key $names
        if(!(Test-LrSame $current $record.before)){
            if(!(Test-LrSame $current $record.desired)){throw '值已被其他程序修改，未覆盖；请核对后处理。'}
            Set-LrValues $record.key $record.before
        }
        if(!(Test-LrSame (Get-LrSnapshot $record.key $names) $record.before)){throw '恢复回读失败。'}
        $record.status='restored';$record.message='原注册表值已恢复。启动策略下次启动生效，中断策略需重启生效。';Save-LrRecord $record;$record
    }catch{$record.status='restore-failed';$record.message=$_.Exception.Message;Save-LrRecord $record;throw}
}
function Set-LabRegistryExperiment($Body){Invoke-LrExclusive {Set-LabRegistryExperimentCore $Body}}
function Restore-LabRegistryExperiment([string]$Id){Invoke-LrExclusive {Restore-LabRegistryExperimentCore $Id}}
Export-ModuleMember -Function Get-LabRegistryRecords,Get-LabIrqDevices,Get-LabLaunchPriority,Set-LabRegistryExperiment,Restore-LabRegistryExperiment
