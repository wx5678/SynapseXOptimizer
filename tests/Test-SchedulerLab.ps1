$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('synapsex-lab-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$previousState=$env:SYNAPSEX_STATE_ROOT
$child=$null
$crashWorker=$null
function Assert($condition,$message){if(!$condition){throw $message}}
function Reject([scriptblock]$action,$message){$failed=$false;try{& $action|Out-Null}catch{$failed=$true};Assert $failed $message}
try {
    $env:SYNAPSEX_STATE_ROOT=$testRoot
    $fixture=Join-Path $testRoot 'SXLabFixture.exe'
    & "$env:windir\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe ("/out:"+$fixture) (Join-Path $PSScriptRoot 'SchedulerFixture.cs')
    Assert ($LASTEXITCODE -eq 0) 'Fixture compile failed'
    Import-Module (Join-Path $root 'host/modules/SchedulerLab.psm1') -Force
    $child=Start-Process -FilePath $fixture -WindowStyle Hidden -PassThru
    Start-Sleep -Milliseconds 300
    $sample=Measure-SchedulerLab $child.Id
    $row=@($sample.sample.Threads|Where-Object {$_.CpuMs -gt 0 -and $_.Priority -eq 0})[0]
    Assert ($null -ne $row) 'Missing live thread sample'
    Reject {Start-SchedulerLab 'invented' 'thread' $row.ThreadId 30} 'Unknown offer accepted'
    Reject {Start-SchedulerLab $sample.offer 'thread' 1 30} 'Wrong thread accepted'
    $state=Start-SchedulerLab $sample.offer 'thread' $row.ThreadId 30
    Assert ($state.Status -eq 'active' -and $state.Actual -eq 1) 'Thread priority not verified'
    $check=[SynapseX.Lab.SchedulerExperiment]::Inspect($child.Id,$row.ThreadId,'thread')
    Assert ($check.Original -eq 1 -and $check.ProcessPriority -eq 32) 'Wrong process-level mutation'
    $restore=Restore-SchedulerLab
    Assert ($restore.Status -eq 'restored' -and $restore.Actual -eq 0) 'Thread restore failed'
    $sample=Measure-SchedulerLab $child.Id
    $state=Start-SchedulerLab $sample.offer 'background' 0 30
    Assert ($state.Actual -eq 16384) 'Background priority not verified'
    Assert ((Restore-SchedulerLab).Status -eq 'restored') 'Background restore failed'
    $sample=Measure-SchedulerLab $child.Id
    $row=@($sample.sample.Threads|Where-Object {$_.CpuMs -gt 0 -and $_.Priority -eq 0})[0]
    $state=Start-SchedulerLab $sample.offer 'thread' $row.ThreadId 30
    if($env:SYNAPSEX_SKIP_TIMER_TEST){Restore-SchedulerLab|Out-Null}else{Start-Sleep -Seconds 31}
    Assert ((Get-SchedulerLabState).Status -eq 'restored') 'Automatic timer restore failed'
    Assert (!(Test-Path (Join-Path $testRoot 'scheduler-lab/lease.json'))) 'Resolved journal retained'
    # Recovery with a mismatched creation token must not write to a reused ID.
    $target=[SynapseX.Lab.SchedulerExperiment]::Inspect($child.Id,$row.ThreadId,'thread')
    $target.ThreadStart='1'
    $engine=New-Object SynapseX.Lab.SchedulerExperiment
    Assert ($engine.Recover($target,1).Status -eq 'exited') 'Thread identity guard failed'
    $check=[SynapseX.Lab.SchedulerExperiment]::Inspect($child.Id,$row.ThreadId,'thread')
    Assert ($check.Original -eq 0) 'Recovery touched replacement thread'
    # A queued callback from a disposed timer must not stop a later lease.
    $fresh=[SynapseX.Lab.SchedulerExperiment]::Inspect($child.Id,$row.ThreadId,'thread')
    $raceEngine=New-Object SynapseX.Lab.SchedulerExperiment
    $raceEngine.Begin($fresh,30)|Out-Null
    $flags=[Reflection.BindingFlags]'NonPublic,Instance'
    $oldGeneration=$raceEngine.GetType().GetField('generation',$flags).GetValue($raceEngine)
    $raceEngine.Stop()|Out-Null
    $raceEngine.Begin($fresh,30)|Out-Null
    $raceEngine.GetType().GetMethod('Expire',$flags).Invoke($raceEngine,@($oldGeneration))|Out-Null
    Assert ($raceEngine.State().Status -eq 'active') 'Old timer stopped a new lease'
    Assert ($raceEngine.Stop().Status -eq 'restored') 'Race fixture restore failed'
    $out=Join-Path $testRoot 'crash-worker.txt'
    $crashArguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $PSScriptRoot 'SchedulerCrashWorker.ps1')+'"'),'-StateRoot',('"'+$testRoot+'"'),'-TargetId',[string]$child.Id)
    $crashWorker=Start-Process -FilePath "$env:windir\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $crashArguments -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError ($out+'.err')
    $deadline=[DateTime]::UtcNow.AddSeconds(15)
    while([DateTime]::UtcNow -lt $deadline -and !(Test-Path (Join-Path $testRoot 'worker-ready'))){Start-Sleep -Milliseconds 100}
    Assert (Test-Path (Join-Path $testRoot 'worker-ready')) ('Crash fixture startup failed: '+(Get-Content ($out+'.err') -Raw))
    Reject {Restore-SchedulerLab} 'Active foreign owner was modified'
    Stop-Process -Id $crashWorker.Id
    $crashWorker.WaitForExit()
    $recovered=Get-SchedulerLabState
    Assert ($recovered.Status -eq 'restored') 'Crashed worker recovery failed'
    Assert ([SynapseX.Lab.SchedulerExperiment]::Inspect($child.Id,$row.ThreadId,'thread').Original -eq 0) 'Recovered priority mismatch'
    [pscustomobject]@{ok=$true;threadApply=$true;threadRestore=$true;processClassUnchanged=$true;backgroundApplyRestore=$true;automaticRestore=(!$env:SYNAPSEX_SKIP_TIMER_TEST);identityGuard=$true;staleTimerGuard=$true;crashRecovery=$true;foreignOwnerGuard=$true;testProcessId=$child.Id;realGameModified=$false}|ConvertTo-Json -Compress
} finally {
    try {Restore-SchedulerLab|Out-Null}catch{}
    if($crashWorker -and !$crashWorker.HasExited){Stop-Process -Id $crashWorker.Id}
    if($child -and !$child.HasExited){Stop-Process -Id $child.Id}
    $env:SYNAPSEX_STATE_ROOT=$previousState
}
