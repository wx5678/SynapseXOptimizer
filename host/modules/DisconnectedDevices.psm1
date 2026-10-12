$ErrorActionPreference='Stop'
$base=if($env:SYNAPSEX_STATE_ROOT){[IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT)}else{Join-Path $env:LOCALAPPDATA 'SynapseX\state'}
$script:recordRoot=Join-Path $base 'disconnected-device-records'
function Get-DisconnectedHash($Value){$sha=[Security.Cryptography.SHA256]::Create();try{-join($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes(($Value|ConvertTo-Json -Compress -Depth 8)))|ForEach-Object{$_.ToString('x2')})}finally{$sha.Dispose()}}
function Get-DisconnectedEnvironment {
    $os=Get-CimInstance Win32_OperatingSystem
    if($os.ProductType -ne 1 -or [int]$os.BuildNumber -lt 19041){throw '需要 Windows 10 2004 或更新的客户端系统。'}
    [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
}
function Get-DisconnectedNativeDevices {@(Get-PnpDevice -ErrorAction Stop)}
function ConvertTo-DisconnectedEntry($Device,[string]$Sid){
    $target=[string]$Device.InstanceId
    $offline=($null -ne $Device.Present -and $Device.Present -eq $false -and [int]$Device.ConfigManagerErrorCode -eq 45)
    $class=[string]$Device.Class
    $eligible=$offline -and $target -match '^(?i)(USB|HID|BTHENUM|BTHLEDEVICE|SWD\\MMDEVAPI|SWD\\PRINTENUM)\\' -and $class -notin @('DiskDrive','Volume','SCSIAdapter','HDC','System','Display','Net','USB')
    $state=[ordered]@{sid=$Sid;target=$target;class=$class;name=[string]$Device.FriendlyName;hardware=@($Device.HardwareID);service=[string]$Device.Service;present=$Device.Present;problem=[int]$Device.ConfigManagerErrorCode}
    @{id=Get-DisconnectedHash $target;target=$target;title=$(if($Device.FriendlyName){[string]$Device.FriendlyName}else{$target});class=$class;available=[bool]$eligible;reason=$(if(!$offline){'设备并非已断开状态。'}elseif(!$eligible){'此类别保留在系统设备管理器中处理，不直接移除基础设备或驱动。'}else{''});fingerprint=Get-DisconnectedHash $state;state=$state}
}
function Get-DisconnectedHistory([string]$Sid){
    @(Get-ChildItem -LiteralPath $script:recordRoot -Filter '*.json' -File -ErrorAction SilentlyContinue|Sort-Object Name -Descending|Select-Object -First 40|ForEach-Object{try{$r=Get-Content $_.FullName -Raw -Encoding UTF8|ConvertFrom-Json;if($r.sid -ceq $Sid){$r}}catch{}})
}
function Save-DisconnectedRecord($Record){
    New-Item -ItemType Directory -Path $script:recordRoot -Force|Out-Null
    $path=Join-Path $script:recordRoot ($Record.id+'.json')
    [IO.File]::WriteAllText($path+'.pending',($Record|ConvertTo-Json -Depth 8),[Text.UTF8Encoding]::new($false))
    if([IO.File]::Exists($path)){[IO.File]::Replace($path+'.pending',$path,[NullString]::Value)}else{[IO.File]::Move($path+'.pending',$path)}
}
function Get-DisconnectedCatalog {
    $sid=Get-DisconnectedEnvironment
    $items=@(Get-DisconnectedNativeDevices|Where-Object{$null -ne $_.Present -and $_.Present -eq $false}|ForEach-Object{ConvertTo-DisconnectedEntry $_ $sid})
    @{items=$items;records=@(Get-DisconnectedHistory $sid);capturedAt=[DateTime]::UtcNow.ToString('o')}
}
function Invoke-DisconnectedRemove([string]$Target){
    if($Target -notmatch '^[A-Za-z0-9_&{}#\\. +:-]+$' -or $Target -notmatch '\\' -or $Target.Length -gt 1024){throw '设备实例 ID 无效。'}
    $output=& (Join-Path $env:SystemRoot 'System32\pnputil.exe') '/remove-device' $Target 2>&1
    @{exitCode=$LASTEXITCODE;output=($output -join "`n")}
}
function Remove-DisconnectedDevice([string]$Id,[string]$Fingerprint){
    $sid=Get-DisconnectedEnvironment
    if($Id -notmatch '^[a-f0-9]{64}$'){throw '设备 ID 无效。'}
    $items=@(Get-DisconnectedNativeDevices|ForEach-Object{ConvertTo-DisconnectedEntry $_ $sid}|Where-Object{$_.id -ceq $Id})
    if($items.Count -ne 1 -or !$items[0].available -or $items[0].fingerprint -cne $Fingerprint){throw '设备已连接、身份已变化或不能移除，请重新扫描。'}
    $item=$items[0]
    $r=@{id=((Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N'));sid=$sid;createdAt=[DateTime]::UtcNow.ToString('o');title=$item.title;target=$item.target;before=$item.state;status='pending';message='移除结果尚未确认。';exitCode=$null;output=''}
    Save-DisconnectedRecord $r
    try{
        $fresh=@(Get-DisconnectedNativeDevices|Where-Object{$_.InstanceId -ceq $item.target})
        if($fresh.Count -ne 1 -or (ConvertTo-DisconnectedEntry $fresh[0] $sid).fingerprint -cne $Fingerprint){throw '执行前设备状态已变化，未移除。'}
        $result=Invoke-DisconnectedRemove $item.target
        $r.exitCode=$result.exitCode;$r.output=$result.output
        if($null -eq $result.exitCode -or $result.exitCode -notin @(0,3010)){throw ('系统拒绝移除设备。'+$result.output)}
        $remaining=@(Get-DisconnectedNativeDevices|Where-Object{$_.InstanceId -ceq $item.target})
        if($remaining.Count){$r.status='unverified';$r.message='系统命令已结束，但设备记录仍存在或需要重启；未标记为清理完成。'}
        else{$r.status='removed';$r.message='已移除该未连接设备实例，未删除驱动包。再次连接时由 Windows 重新识别，可能需要重新配置。'}
        if($result.exitCode -eq 3010){$r.message+=' 系统返回需要重启；不会自动重启。'}
    }catch{$r.status='failed';$r.message=$_.Exception.Message}finally{Save-DisconnectedRecord $r}
    @{ok=($r.status -eq 'removed');message=$r.message;recordId=$r.id}
}
Export-ModuleMember -Function Get-DisconnectedCatalog,Remove-DisconnectedDevice
