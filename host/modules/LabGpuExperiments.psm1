$ErrorActionPreference='Stop'
$script:gpuLabRoot=Join-Path $(if($env:SYNAPSEX_STATE_ROOT){$env:SYNAPSEX_STATE_ROOT}else{Join-Path $env:LOCALAPPDATA 'SynapseX\state'}) 'lab-gpu'
# Setting identifiers and scalar enum values are from NVIDIA's public NVAPI contract.
$script:gpuLabDefs=@(
    @{key='ansel';id=[uint32]0x1075D972;name='Ansel 游戏摄影';values=@(@{value=0;label='关闭'},@{value=1;label='开启'});note='仅对支持 Ansel 的游戏起作用。关闭不等于关闭所有覆盖层。'},
    @{key='battery-fps';id=[uint32]0x10115C8C;name='Battery Boost 帧率覆盖';values=@(@{value=0;label='不覆盖'},@{value=30;label='30 FPS'},@{value=60;label='60 FPS'});note='笔记本 Battery Boost 使用的应用帧率策略；不覆盖不等于关闭 Battery Boost。'},
    @{key='dlss-override';id=[uint32]0x10E41E01;name='DLSS 超分辨率覆盖';values=@(@{value=0;label='关闭驱动覆盖'},@{value=1;label='开启驱动覆盖'});note='需要游戏原生支持 DLSS、兼容的 RTX 显卡与驱动。不会给九阴添加 DLSS。'},
    @{key='dlss-preset';id=[uint32]0x10E41DF3;name='DLSS 超分辨率预设';values=@(@{value=0;label='不指定'},@{value=11;label='预设 K'},@{value=16777215;label='驱动最新预设'});note='与 DLSS 驱动覆盖配合。预设是否实际采用取决于游戏和驱动，不承诺画质或帧数提升。'}
)
function Initialize-LabGpu {if(!('SynapseX.Native.NvidiaDrsBridge' -as [type])){Add-Type -Path (Join-Path (Split-Path $PSScriptRoot -Parent) 'native\GpuDriverBridge.cs')}}
function Get-LabGpuCatalog([string]$Path) {
    Initialize-LabGpu
    if(![IO.Path]::IsPathRooted($Path) -or [IO.Path]::GetExtension($Path) -ine '.exe' -or !(Test-Path -LiteralPath $Path -PathType Leaf)){throw '请选择存在的 EXE 完整路径。'}
    $path=[IO.Path]::GetFullPath($Path)
    $native=[SynapseX.Native.NvidiaDrsBridge]::Query($Path,[string[]]$script:gpuLabDefs.key,[uint32[]]$script:gpuLabDefs.id)
    $items=@(foreach($d in $script:gpuLabDefs){$row=@($native.Settings|Where-Object Key -eq $d.key)[0];@{key=$d.key;id=$d.id;name=$d.name;options=$d.values;note=$d.note;available=($native.Available -and $native.ApplicationFound -and $row.Supported);value=$(if($row){$row.Value}else{$null});local=$(if($row){$row.HasProfileValue}else{$false})}})
    @{path=$Path;items=$items;available=$native.Available;profileFound=$native.ApplicationFound;message=$(if(!$native.Available){$native.Error}elseif(!$native.ApplicationFound){'该 EXE 尚无 NVIDIA 应用配置，请先在 NVIDIA 控制面板添加游戏，再重新读取。实验不创建或删除整个驱动配置。'}else{'按 EXE 文件名生效。保存后建议重新启动游戏；驱动回读不代表游戏已采用。'})}
}
function Save-LabGpuRecord($Record){
    New-Item -ItemType Directory -Path $script:gpuLabRoot -Force|Out-Null
    $path=Join-Path $script:gpuLabRoot ($Record.id+'.json');$bytes=[Text.Encoding]::UTF8.GetBytes(($Record|ConvertTo-Json -Depth 10));$s=New-Object IO.FileStream(($path+'.pending'),[IO.FileMode]::Create,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$s.Write($bytes,0,$bytes.Length);$s.Flush($true)}finally{$s.Dispose()};Move-Item -LiteralPath ($path+'.pending') -Destination $path -Force
}
function Get-LabGpuRecords {@{records=@(Get-ChildItem -LiteralPath $script:gpuLabRoot -Filter '*.json' -File -ErrorAction SilentlyContinue|Sort-Object LastWriteTimeUtc -Descending|Select-Object -First 100|ForEach-Object{Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8|ConvertFrom-Json})}}
function Set-LabGpuItem($Body){
    $catalog=Get-LabGpuCatalog ([string]$Body.path)
    $item=@($catalog.items|Where-Object key -eq $Body.key)[0]
    if(!$item -or !$item.available -or [uint32]$Body.value -notin @($item.options.value)){throw '当前驱动不支持所选项目或数值。'}
    if([uint32]$item.value -ne [uint32]$Body.expected -or [bool]$item.local -ne [bool]$Body.expectedLocal){throw '驱动值已变化，请重新读取。'}
    if([uint32]$Body.value -eq [uint32]$item.value){return @{message='当前值相同，没有重复写入。'}}
    $record=@{id=[guid]::NewGuid().ToString('N');path=$catalog.path;key=$item.key;settingId=$item.id;name=$item.name;original=$item.value;originalLocal=$item.local;applied=[uint32]$Body.value;status='pending';at=[DateTime]::UtcNow.ToString('o');message='';machine=$env:COMPUTERNAME}
    Save-LabGpuRecord $record
    $native=[SynapseX.Native.NvidiaDrsBridge]::ApplyExistingChecked($catalog.path,[string[]]@($item.key),[uint32[]]@($item.id),[uint32[]]@($record.applied),[bool[]]@($false),[uint32[]]@($item.value),[bool[]]@($item.local))
    if(!$native.Available){$record.message=$native.Error;Save-LabGpuRecord $record;throw ('驱动写入失败或结果未确认，已保留恢复记录：'+$native.Error)}
    $after=@((Get-LabGpuCatalog $catalog.path).items|Where-Object key -eq $item.key)[0]
    if($after.value -ne $record.applied -or !$after.local){$record.message='保存后回读不一致。';Save-LabGpuRecord $record;throw $record.message}
    $record.status='applied';$record.message='驱动已保存并回读确认。';Save-LabGpuRecord $record;$record
}
function Restore-LabGpuItem([string]$Id){
    if($Id -notmatch '^[a-f0-9]{32}$'){throw '无效记录编号。'}
    $r=Get-Content -LiteralPath (Join-Path $script:gpuLabRoot ($Id+'.json')) -Raw -Encoding UTF8|ConvertFrom-Json
    if($r.machine -ne $env:COMPUTERNAME){throw '不属于本机的记录。'}
    $definition=@($script:gpuLabDefs|Where-Object key -eq $r.key)[0];if(!$definition -or $definition.id -ne $r.settingId){throw '备份字段无效。'}
    $current=@((Get-LabGpuCatalog $r.path).items|Where-Object key -eq $r.key)[0]
    if(!$current.available){throw '当前驱动配置不可读取。'}
    if($current.value -ne $r.original -or $current.local -ne $r.originalLocal){
        if($current.value -ne $r.applied -or !$current.local){throw '该项已被其他程序更改，未覆盖。'}
        $native=[SynapseX.Native.NvidiaDrsBridge]::ApplyExistingChecked($r.path,[string[]]@($r.key),[uint32[]]@($r.settingId),[uint32[]]@($r.original),[bool[]]@(!$r.originalLocal),[uint32[]]@($current.value),[bool[]]@($current.local))
        if(!$native.Available){throw $native.Error}
    }
    $after=@((Get-LabGpuCatalog $r.path).items|Where-Object key -eq $r.key)[0]
    if($after.value -ne $r.original -or $after.local -ne $r.originalLocal){throw '恢复后回读不一致，保留记录。'}
    $r.status='restored';$r.message='已恢复原值及继承状态。';Save-LabGpuRecord $r;$r
}
Export-ModuleMember -Function Get-LabGpuCatalog,Get-LabGpuRecords,Set-LabGpuItem,Restore-LabGpuItem
