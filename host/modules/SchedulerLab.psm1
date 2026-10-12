$ErrorActionPreference='Stop'
$script:labRoot=Join-Path $(if($env:SYNAPSEX_STATE_ROOT){$env:SYNAPSEX_STATE_ROOT}else{Join-Path $env:LOCALAPPDATA 'SynapseX\state'}) 'scheduler-lab'
$script:journal=Join-Path $script:labRoot 'lease.json'
$script:engine=$null
$script:offers=@{}
$script:leaseId=''
$hash=[Security.Cryptography.SHA256]::Create()
try {$script:mutexName='Local\SynapseX-Lab-'+(-join($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($script:labRoot).ToLowerInvariant()))|ForEach-Object{$_.ToString('x2')}))} finally {$hash.Dispose()}
function Invoke-LabExclusive([scriptblock]$Action) {
    $mutex=New-Object Threading.Mutex($false,$script:mutexName)
    $held=$false
    try {
        try {$held=$mutex.WaitOne(0)} catch [Threading.AbandonedMutexException] {$held=$true}
        if(!$held){throw '其他本地服务正在处理实验，请稍后重试。'}
        & $Action
    } finally {if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
function Initialize-SchedulerLab {
    if(!$script:engine) {
        if(!('SynapseX.Lab.SchedulerExperiment' -as [type])){ Add-Type -Path (Join-Path $PSScriptRoot 'SchedulerExperiment.cs') }
        $script:engine=New-Object SynapseX.Lab.SchedulerExperiment
    }
}
function Assert-LabTarget([int]$ProcessId) {
    $p=Get-Process -Id $ProcessId -ErrorAction Stop
    if(!$p.Path -or $p.Path.StartsWith($env:windir.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw '系统目录进程不参与实验。'}
    if($p.ProcessName -match '(?i)(anticheat|easyanticheat|battleye|vgc|vgtray|ace-base|tenprotect|tguard|synapsex|presentmon|clash|uuaccelerator|qiyou|leigod|wegame|steam|epicgameslauncher)'){throw '系统保护、加速器、启动器或采集程序不参与实验。'}
    if($p.SessionId -ne [Diagnostics.Process]::GetCurrentProcess().SessionId){throw '不能调整其他会话的进程。'}
    $p
}
function Get-LabJournal { if(Test-Path -LiteralPath $script:journal){Get-Content -LiteralPath $script:journal -Raw -Encoding UTF8 | ConvertFrom-Json} }
function Test-LabForeignOwner($Record) {
    if(!$Record -or $Record.ownerId -eq $PID){return $false}
    $owner=Get-Process -Id $Record.ownerId -ErrorAction SilentlyContinue
    $owner -and ([string]$owner.StartTime.ToUniversalTime().Ticks -eq [string]$Record.ownerStart)
}
function Clear-LabJournal($State) {
    if($State.Status -in @('restored','exited','unchanged') -and (Test-Path -LiteralPath $script:journal)) {
        $current=Get-LabJournal
        if(!$script:leaseId -or $current.leaseId -ne $script:leaseId){throw '恢复记录已变化，未删除。'}
        Remove-Item -LiteralPath $script:journal -Force
    }
}
function Get-SchedulerLabStateCore {
    Initialize-SchedulerLab
    $record=Get-LabJournal
    if(Test-LabForeignOwner $record){return @{Status='other-instance';Message='另一个本地服务正在执行实验，请在那里停止。'}}
    $state=$script:engine.State()
    if($record -and ($state.Status -eq 'idle' -or $record.ownerId -ne $PID -or $record.leaseId -ne $script:leaseId)){return Restore-SchedulerLab}
    if($record){Clear-LabJournal $state}
    $state
}
function Measure-SchedulerLabCore([int]$ProcessId) {
    Initialize-SchedulerLab
    [void](Assert-LabTarget $ProcessId)
    $sample=[SynapseX.Lab.SchedulerExperiment]::Measure($ProcessId)
    $id=[guid]::NewGuid().ToString('N')
    # Apply accepts only a recent host-created offer, not arbitrary renderer IDs.
    $script:offers.Clear()
    $script:offers[$id]=@{sample=$sample;at=[DateTime]::UtcNow}
    @{offer=$id;sample=$sample;note='按本次 CPU 时间增量排序，不代表已经识别到游戏渲染线程。';validUntil=[DateTime]::UtcNow.AddMinutes(2).ToString('o')}
}
function Start-SchedulerLabCore([string]$Offer,[ValidateSet('thread','background')][string]$Kind,[int]$ThreadId,[ValidateSet(30,60,300)][int]$Seconds=60) {
    Initialize-SchedulerLab
    $state=Get-SchedulerLabState
    if($state.Status -in @('active','restore-failed','other-instance')){throw '请先停止并恢复现有实验。'}
    $pending=$script:offers[$Offer]
    if(!$pending -or ([DateTime]::UtcNow-$pending.at).TotalMinutes -gt 2){throw '采样已过期，请重新采样。'}
    $snapshot=$pending.sample
    [void](Assert-LabTarget $snapshot.Process.ProcessId)
    $target=[SynapseX.Lab.SchedulerExperiment]::Inspect($snapshot.Process.ProcessId,$ThreadId,$Kind)
    if($target.ProcessStart -ne $snapshot.Process.ProcessStart){throw '进程已重新启动。'}
    if($target.ProcessPriority -notin @(32,32768)){throw '仅支持当前为正常或高于正常优先级的进程。'}
    if($Kind -eq 'thread' -and $target.Original -notin @(0,1)){throw '所选线程不需要或不适合本次提优。'}
    if($Kind -eq 'thread') {
        $row=@($snapshot.Threads | Where-Object ThreadId -eq $ThreadId)
        if($row.Count -ne 1 -or $row[0].ThreadStart -ne $target.ThreadStart -or $row[0].CpuMs -le 0 -or $row[0].Priority -ne $target.Original){throw '所选线程不在有效采样中或状态已变化。'}
    }
    New-Item -ItemType Directory -Path $script:labRoot -Force | Out-Null
    $script:leaseId=[guid]::NewGuid().ToString('N')
    $record=@{version=1;leaseId=$script:leaseId;target=$target;applied=$(if($Kind -eq 'thread'){$target.Original+1}else{16384});ownerId=$PID;ownerStart=[string][Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().Ticks}
    [IO.File]::WriteAllText($script:journal+'.pending',($record|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath ($script:journal+'.pending') -Destination $script:journal -Force
    try {$result=$script:engine.Begin($target,$Seconds);$script:offers.Clear();$result}
    catch {Clear-LabJournal ($script:engine.State());throw $_.Exception.GetBaseException().Message}
}
function Restore-SchedulerLabCore {
    if(!$script:engine -and !(Test-Path -LiteralPath $script:journal)){return @{Status='idle';Message='没有待恢复实验。'}}
    Initialize-SchedulerLab
    $record=Get-LabJournal
    if(Test-LabForeignOwner $record){throw '实验由另一个本地服务执行，不能接管。'}
    $state=$script:engine.State()
    if($state.Status -eq 'active'){$state=$script:engine.Stop()}
    elseif($record) {
        $script:leaseId=[string]$record.leaseId
        if($record.version -ne 1 -or $record.target.Kind -notin @('thread','background') -or $record.target.ProcessId -le 4 -or $record.target.Original -notin @(0,1,32,32768)){throw '恢复记录无效，已保留原文件。'}
        $target=New-Object SynapseX.Lab.Target
        foreach($name in @('Kind','Name','ProcessId','ThreadId','ProcessStart','ThreadStart','ProcessPriority','Original')){$target.$name=$record.target.$name}
        $expected=if($target.Kind -eq 'thread'){$target.Original+1}else{16384}
        if($record.applied -ne $expected){throw '恢复记录的应用值无效。'}
        $state=$script:engine.Recover($target,$expected)
    }
    Clear-LabJournal $state
    $state
}
function Get-SchedulerLabState { Invoke-LabExclusive {Get-SchedulerLabStateCore} }
function Measure-SchedulerLab([int]$ProcessId) {Invoke-LabExclusive {Measure-SchedulerLabCore $ProcessId}}
function Start-SchedulerLab([string]$Offer,[ValidateSet('thread','background')][string]$Kind,[int]$ThreadId,[ValidateSet(30,60,300)][int]$Seconds=60) {Invoke-LabExclusive {Start-SchedulerLabCore $Offer $Kind $ThreadId $Seconds}}
function Restore-SchedulerLab {Invoke-LabExclusive {Restore-SchedulerLabCore}}
Export-ModuleMember -Function Get-SchedulerLabState,Measure-SchedulerLab,Start-SchedulerLab,Restore-SchedulerLab
if(Test-Path -LiteralPath $script:journal) { try { Get-SchedulerLabState | Out-Null } catch { Write-Warning ('实验恢复记录待处理：'+$_.Exception.Message) } }
