param([string]$StateRoot,[int]$TargetId)
$ErrorActionPreference='Stop'
$env:SYNAPSEX_STATE_ROOT=$StateRoot
Import-Module (Join-Path $PSScriptRoot '../host/modules/SchedulerLab.psm1') -Force
$sample=Measure-SchedulerLab $TargetId
$row=@($sample.sample.Threads|Where-Object {$_.CpuMs -gt 0 -and $_.Priority -eq 0})[0]
$result=Start-SchedulerLab $sample.offer 'thread' $row.ThreadId 30
if($result.Status -ne 'active'){throw 'Crash fixture did not apply'}
Write-Output 'READY'
[IO.File]::WriteAllText((Join-Path $StateRoot 'worker-ready'), 'ready')
Start-Sleep -Seconds 60
