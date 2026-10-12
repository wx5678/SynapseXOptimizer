$ErrorActionPreference='Stop'
$script:sessionRoot=Join-Path $(if($env:SYNAPSEX_STATE_ROOT){$env:SYNAPSEX_STATE_ROOT}else{Join-Path $env:LOCALAPPDATA 'SynapseX\state'}) 'session-lab'
$script:sessionEngine=$null
$script:processOffers=@{}
function Initialize-SessionLab {
    if(!('SynapseX.SessionLab.Native' -as [type])) {Add-Type -Path (Join-Path $PSScriptRoot 'SessionExperiments.cs') -ReferencedAssemblies System.Xml,System.Core,System}
    if(!$script:sessionEngine){$script:sessionEngine=New-Object SynapseX.SessionLab.Engine($script:sessionRoot)}
}
function Get-SessionLabState {Initialize-SessionLab;$script:sessionEngine.State()}
function Get-SessionLabTargets {
    Initialize-SessionLab
    $script:processOffers.Clear()
    $rows=@(foreach($p in Get-Process) {
        try {
            $target=[SynapseX.SessionLab.Native]::Inspect($p.Id)
            $offer=[guid]::NewGuid().ToString('N')
            $script:processOffers[$offer]=@{target=$target;at=[DateTime]::UtcNow}
            @{offer=$offer;id=$target.Id;name=$target.Name;path=$target.Path;title=$p.MainWindowTitle;memoryMB=[math]::Round($p.WorkingSet64/1MB)}
        } catch { }
    })
    @{targets=$rows;validUntil=[DateTime]::UtcNow.AddMinutes(5).ToString('o')}
}
function Resolve-SessionOffer([string]$Offer) {
    $entry=$script:processOffers[$Offer]
    if(!$entry -or ([DateTime]::UtcNow-$entry.at).TotalMinutes -gt 5){throw '进程列表已过期，请重新扫描。'}
    $current=[SynapseX.SessionLab.Native]::Inspect($entry.target.Id)
    if($current.Created -ne $entry.target.Created){throw '所选进程已重启，请重新扫描。'}
    $current
}
function Get-SessionLabTopology {Initialize-SessionLab;@{cpus=@([SynapseX.SessionLab.Native]::Topology())}}
function Get-SessionLabSupport([string]$Offer) {
    Initialize-SessionLab
    $target=Resolve-SessionOffer $Offer
    $items=@(foreach($kind in @('cpu','cpus','memory','gpu','eco','io')){
        try{@{kind=$kind;available=$true;value=[SynapseX.SessionLab.Native]::Read($target,$kind);message='原值可读取，写权限在应用时回读确认。'}}catch{@{kind=$kind;available=$false;message=$_.Exception.GetBaseException().Message}}
    })
    $policy=Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling' -Name PowerThrottlingOff -ErrorAction SilentlyContinue
    @{items=$items;powerThrottlingDisabled=($policy.PowerThrottlingOff -eq 1)}
}
function Start-SessionLab($Body) {
    Initialize-SessionLab
    if((Get-SchedulerLabState).Status -in @('active','restore-failed','other-instance')){throw '请先恢复单线程调度实验，避免重复调整。'}
    $target=Resolve-SessionOffer ([string]$Body.offer)
    if($Body.kind -eq 'eco' -or @($Body.kinds) -contains 'eco'){
        $policy=Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\Power\PowerThrottling' -Name PowerThrottlingOff -ErrorAction SilentlyContinue
        if($policy.PowerThrottlingOff -eq 1){throw '系统策略已关闭电源节流，与节能调度冲突；请先在系统调整中恢复该策略。'}
    }
    if($Body.mode -eq 'background-session') {
        $targets=@(foreach($offer in @($Body.targets)){Resolve-SessionOffer ([string]$offer)})
        $whitelist=@((Get-LabPreferences).whitelist)
        $script:sessionEngine.StartSession($target,[SynapseX.SessionLab.ProcessInfo[]]$targets,[string[]]$whitelist,[string[]]$Body.kinds,[double]$Body.threshold,[int]$Body.seconds)
    } elseif($Body.mode -eq 'single') {
        if($Body.kind -notin @('cpus','memory','gpu','eco','io')){throw '不支持的实验类型。'}
        $script:sessionEngine.StartSingle($target,[string]$Body.kind,[uint32[]]$Body.cpuIds,[int]$Body.seconds)
    } else {throw '不支持的会话类型。'}
}
function Stop-SessionLab {
    if(!$script:sessionEngine -and !(Test-Path -LiteralPath (Join-Path $script:sessionRoot 'session.xml'))){return @{Session=@{Status='idle'}}}
    Initialize-SessionLab;$script:sessionEngine.Stop()
}
function Invoke-LabWorkingSet([string]$Offer) {
    Initialize-SessionLab
    if($script:sessionEngine.State().Session.Status -in @('active','restore-failed')){throw '请先停止会话，再单独测试工作集回收。'}
    $target=Resolve-SessionOffer $Offer
    [SynapseX.SessionLab.Native]::Trim($target)
}
function Get-LabPreferences {
    $file=Join-Path $script:sessionRoot 'preferences.json'
    if(Test-Path -LiteralPath $file){return Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json}
    @{whitelist=@();games=@()}
}
function Set-LabPreferences($Body) {
    Initialize-SessionLab
    if($script:sessionEngine.State().Session.Status -in @('active','restore-failed')){throw '先停止会话，再修改白名单。'}
    $paths=@($Body.whitelist | Where-Object {$_} | Select-Object -Unique)
    if($paths.Count -gt 128){throw '白名单最多保存 128 条。'}
    foreach($path in $paths){if(![IO.Path]::IsPathRooted($path) -or [IO.Path]::GetExtension($path) -ine '.exe'){throw '白名单应为程序完整路径。'}}
    $games=@(foreach($game in @($Body.games)) {
        if(!$game.name -or ([string]$game.name).Length -gt 100){throw '请输入 1–100 字的游戏名称。'}
        $path=[SynapseX.SessionLab.Native]::ValidatePath([string]$game.path)
        @{name=[string]$game.name;path=$path;platform=[string]$game.platform}
    })
    if($games.Count -gt 200){throw '游戏库最多保存 200 项。'}
    New-Item -ItemType Directory -Path $script:sessionRoot -Force|Out-Null
    $result=@{whitelist=@($paths);games=@($games)}
    $file=Join-Path $script:sessionRoot 'preferences.json'
    [IO.File]::WriteAllText($file+'.pending',($result|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath ($file+'.pending') -Destination $file -Force
    $result
}
Export-ModuleMember -Function Get-SessionLabState,Get-SessionLabTargets,Get-SessionLabTopology,Get-SessionLabSupport,Start-SessionLab,Stop-SessionLab,Invoke-LabWorkingSet,Get-LabPreferences,Set-LabPreferences
if(Test-Path -LiteralPath (Join-Path $script:sessionRoot 'session.xml')){try{Initialize-SessionLab}catch{Write-Warning ('会话恢复待处理：'+$_.Exception.Message)}}
