$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
$root=Join-Path ([IO.Path]::GetTempPath()) ('sx-latency-test-'+[guid]::NewGuid().ToString('N'))
$oldRoot=$env:SYNAPSEX_STATE_ROOT;$env:SYNAPSEX_STATE_ROOT=$root
try {
    Import-Module (Join-Path $project 'host/modules/LabDiagnostics.psm1') -Force
    Import-Module (Join-Path $project 'host/modules/LatencyLab.psm1') -Force
    if((Get-LatencyLabState).Status -ne 'idle'){throw 'Unexpected automatic collector'}
    if((Get-LabNoticePreference).suppressed){throw 'Notice hidden by default'}
    $null=Set-LabNoticePreference @{suppressed=$true}
    Import-Module (Join-Path $project 'host/modules/LatencyLab.psm1') -Force
    if(!(Get-LabNoticePreference).suppressed){throw 'Notice not persistent'}
    $null=Set-LabNoticePreference @{suppressed=$false}
    if((Get-LabNoticePreference).suppressed){throw 'Notice not restored'}
    $null=Start-LatencyLab @{seconds=15;label='native validation';confirmation='MEASURE'}
    $samples=[SynapseX.LatencyLab.Probe]::Summarize([double[]](1..100))
    if($samples.MeanMs -ne 50.5 -or $samples.P95Ms -ne 95 -or $samples.P99Ms -ne 99 -or $samples.MaximumMs -ne 100){throw 'Percentile definition incorrect'}
    $duplicate=$false;try{$null=Start-LatencyLab @{seconds=15;confirmation='MEASURE'}}catch{$duplicate=$true}
    if(!$duplicate){throw 'Duplicate measurement accepted'}
    $deadline=[DateTime]::UtcNow.AddSeconds(22)
    do{Start-Sleep -Milliseconds 250;$r=Get-LatencyLabState}while($r.Status -eq 'running' -and [DateTime]::UtcNow -lt $deadline)
    if($r.Status -ne 'complete' -or $r.Count -lt 10 -or $r.ElapsedSeconds -lt 15 -or $r.MaximumMs -lt $r.P99Ms -or $r.P99Ms -lt $r.P95Ms){throw ('Real timer test failed: '+($r|ConvertTo-Json -Compress))}
    $history=Get-LatencyLabHistory
    if($history.records.Count -ne 1 -or $history.records[0].Id -ne $r.Id){throw 'Completed result not saved'}
    $null=Start-LatencyLab @{seconds=60;label='cancel';confirmation='MEASURE'}
    Start-Sleep -Milliseconds 800
    $watch=[Diagnostics.Stopwatch]::StartNew();$stopped=Stop-LatencyLab
    if($stopped.Status -ne 'cancelled' -or $watch.ElapsedMilliseconds -gt 1500){throw 'Cancel was not prompt'}
    if((Get-LatencyLabHistory).records.Count -ne 2){throw 'Cancelled result missing'}
    [pscustomobject]@{ok=$true;percentiles=$true;realNativeTimer=$true;timerMode=$r.TimerMode;samples=$r.Count;meanMs=$r.MeanMs;p99Ms=$r.P99Ms;duration=$r.ElapsedSeconds;duplicateRejected=$duplicate;cancel=$true;history=$true;noticePersistence=$true;noticeRestore=$true;changedSystemSettings=$false}|ConvertTo-Json -Compress
} finally {Stop-LatencyLab|Out-Null;$env:SYNAPSEX_STATE_ROOT=$oldRoot}
