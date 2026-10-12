$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$beforeEnv=$env:SYNAPSEX_STATE_ROOT
$env:SYNAPSEX_STATE_ROOT=Join-Path ([IO.Path]::GetTempPath()) ('SynapseX-Repair-Test-'+[guid]::NewGuid().ToString('N'))
$module=Import-Module (Join-Path $repo 'host/modules/RepairJobs.psm1') -Force -PassThru
try{
    if((Get-RepairJobs).items.Count -ne 10){throw 'Missing repair definitions'}
    & $module {
        $script:launches=0;$script:exitCode=3010
        function Assert-Blocked($Work){$blocked=$false;try{&$Work|Out-Null}catch{$blocked=$true};if(!$blocked){throw 'Expected refusal'}}
        function script:Start-RepairNative($Definition,$JobId){
            if(!(Test-Path -LiteralPath (Join-Path $script:repairRoot ($JobId+'.json')))){throw 'No pre-launch record'}
            $script:launches++
            $p=[pscustomobject]@{Id=9876;HasExited=$false};$p|Add-Member ScriptMethod Dispose {};return $p
        }
        function script:Invoke-RepairNative {
            param($Definition,$JobId)
            if($Definition.arguments -cne '/Online /Cleanup-Image /CheckHealth /English'){throw 'Wrong compiled command'}
            return $script:exitCode
        }
        Assert-Blocked {Start-RepairJob 'arbitrary-command'}
        $job=Start-RepairJob 'dism-check'
        Assert-Blocked {Start-RepairJob 'dism-check'}
        Invoke-RepairWorker $job.jobId
        $result=(Get-RepairJobs).jobs[0]
        if($result.status -ne 'completed' -or $result.exitCode -ne 3010 -or !$result.restartRequired){throw 'Worker did not persist correct native result'}
        $script:exitCode=5;$job=Start-RepairJob 'dism-check';Invoke-RepairWorker $job.jobId
        if(((Get-RepairJobs).jobs|Where-Object{$_.jobId -eq $job.jobId}).status -ne 'failed'){throw 'Nonzero exit code reported success'}
        $job=Start-RepairJob 'dism-check';$r=Get-RepairJobRecords|Where-Object{$_.jobId -eq $job.jobId};$r.createdAt=[DateTime]::UtcNow.AddMinutes(-1).ToString('o');Save-RepairJob $r
        $interrupted=(Get-RepairJobs).jobs|Where-Object{$_.jobId -eq $job.jobId}
        if($interrupted.status -ne 'unknown'){throw ('Interrupted startup reported success: '+$interrupted.status)}
        Assert-Blocked {Invoke-RepairWorker '..\other'}
    }
    [pscustomobject]@{ok=$true;nativeExecutions=0;definitions=10;tests='pre-launch record, single job, worker result, reboot, failure, interrupted startup'}|ConvertTo-Json
}finally{$env:SYNAPSEX_STATE_ROOT=$beforeEnv;Remove-Module $module.Name}
