$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('synapsex-session-test-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot|Out-Null
$fixture=$null;$game=$null;$engine=$null;$worker=$null
function Assert($condition,$message){if(!$condition){throw $message}}
try {
    Add-Type -Path (Join-Path $project 'host/modules/SessionExperiments.cs') -ReferencedAssemblies System.Xml,System.Core,System
    $binary=Join-Path $testRoot 'SXSessionFixture.exe'
    & "$env:windir\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe ("/out:"+$binary) (Join-Path $PSScriptRoot 'SchedulerFixture.cs')
    Assert ($LASTEXITCODE -eq 0) 'Fixture compilation'
    $fixture=Start-Process -FilePath $binary -WindowStyle Hidden -PassThru
    $game=Start-Process -FilePath $binary -WindowStyle Hidden -PassThru
    $target=[SynapseX.SessionLab.Native]::Inspect($fixture.Id)
    $engine=New-Object SynapseX.SessionLab.Engine((Join-Path $testRoot 'state'))
    $results=@{}
    foreach($kind in @('memory','eco','gpu','cpus','io')) {
        try{$before=[SynapseX.SessionLab.Native]::Read($target,$kind)}catch{
            if($kind -in @('eco','gpu')){$results[$kind]='unsupported-query: '+$_.Exception.GetBaseException().Message;continue}
            throw
        }
        $ids=[uint32[]]@(([SynapseX.SessionLab.Native]::Topology()|Where-Object Available|Select-Object -First 1).Id)
        $s=$engine.StartSingle($target,$kind,$ids,30)
        Assert ($s.Session.Status -eq 'active') ($kind+' start')
        $rows=@($s.Session.Settings)
        if($rows.Count){Assert ([SynapseX.SessionLab.Native]::Read($target,$kind) -eq $rows[0].Applied) ($kind+' readback')}
        Assert ($engine.Stop().Session.Status -eq 'restored') ($kind+' restore')
        Assert ([SynapseX.SessionLab.Native]::Read($target,$kind) -eq $before) ($kind+' original')
        $results[$kind]=$true
    }
    $trim=[SynapseX.SessionLab.Native]::Trim($target)
    Assert ($trim.BeforeBytes -gt 0 -and $trim.AfterBytes -gt 0) 'Trim real measurements'
    $original=$target.Created;$target.Created='1';$blocked=$false
    try{$engine.StartSingle($target,'memory',$null,30)|Out-Null}catch{$blocked=$true}
    Assert $blocked 'Identity mismatch must fail';$target.Created=$original
    # A distinct executable avoids treating another game instance as a background target.
    $otherBinary=Join-Path $testRoot 'SXSessionGame.exe'
    Copy-Item -LiteralPath $binary -Destination $otherBinary
    Stop-Process -Id $game.Id
    $game=Start-Process -FilePath $otherBinary -WindowStyle Hidden -PassThru
    $gameTarget=[SynapseX.SessionLab.Native]::Inspect($game.Id)
    $before=[SynapseX.SessionLab.Native]::Read($target,'cpu')
    $null=$engine.StartSession($gameTarget,[SynapseX.SessionLab.ProcessInfo[]]@($target),[string[]]@($target.Path),[string[]]@('cpu'),0,30)
    Start-Sleep -Seconds 3
    Assert ([SynapseX.SessionLab.Native]::Read($target,'cpu') -eq $before) 'Whitelist'
    $null=$engine.Stop()
    $null=$engine.StartSession($gameTarget,[SynapseX.SessionLab.ProcessInfo[]]@($target),[string[]]@(),[string[]]@('cpu'),0,30)
    Start-Sleep -Seconds 3
    Assert ([SynapseX.SessionLab.Native]::Read($target,'cpu') -eq '16384') 'Dynamic apply'
    Stop-Process -Id $game.Id
    Start-Sleep -Seconds 3
    Assert ($engine.State().Session.Status -eq 'restored') 'Game exit restores'
    Assert ([SynapseX.SessionLab.Native]::Read($target,'cpu') -eq $before) 'Game exit original'
    # Another writer must not be overwritten by restoration.
    $null=$engine.StartSingle($target,'memory',$null,30)
    [SynapseX.SessionLab.Native]::Write($target,'memory','2','3')
    Assert ($engine.Stop().Session.Status -eq 'restore-failed') 'Conflict retained'
    [SynapseX.SessionLab.Native]::Write($target,'memory','3','2')
    Assert ($engine.Stop().Session.Status -eq 'restored') 'Conflict retry'
    $stateRoot=Join-Path $testRoot 'state'
    $arguments=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $PSScriptRoot 'SessionCrashWorker.ps1')+'"'),'-Root',('"'+$stateRoot+'"'),'-TargetId',[string]$fixture.Id)
    $worker=Start-Process -FilePath "$env:windir\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $testRoot 'worker.err')
    $deadline=[DateTime]::UtcNow.AddSeconds(10)
    while(!(Test-Path -LiteralPath (Join-Path $stateRoot 'ready')) -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 100}
    Assert (Test-Path -LiteralPath (Join-Path $stateRoot 'ready')) ('Crash worker not ready: '+(Get-Content -LiteralPath (Join-Path $testRoot 'worker.err') -Raw))
    $blocked=$false;try{$engine.Stop()|Out-Null}catch{$blocked=$true};Assert $blocked 'Foreign active owner must not be overwritten'
    Stop-Process -Id $worker.Id;$worker.WaitForExit()
    Assert ($engine.State().Session.Status -eq 'restored') 'Recover foreign crashed lease'
    Assert ([SynapseX.SessionLab.Native]::Read($target,'memory') -eq '5') 'Crash original restored'
    $null=$engine.StartSingle($target,'memory',$null,30)
    Start-Sleep -Seconds 31
    Assert ($engine.State().Session.Status -eq 'restored') 'Timer restore'
    [pscustomobject]@{ok=$true;features=$results;whitelist=$true;dynamicCpu=$true;gameExitRestore=$true;identityGuard=$true;conflictGuard=$true;workingSet=$true;crashRecovery=$true;foreignOwnerGuard=$true;timerRestore=$true;realUserProgramsModified=$false}|ConvertTo-Json -Depth 5 -Compress
} finally {
    if($engine){$engine.Stop()|Out-Null}
    foreach($p in @($worker,$game,$fixture)){if($p -and !$p.HasExited){Stop-Process -Id $p.Id}}
}
