$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('synapsex-lab-http-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot|Out-Null
$oldState=$env:SYNAPSEX_STATE_ROOT
$service=$null;$fixture=$null
try {
    $env:SYNAPSEX_STATE_ROOT=$testRoot
    $binary=Join-Path $testRoot 'SXLabFixture.exe'
    & "$env:windir\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe ("/out:"+$binary) (Join-Path $PSScriptRoot 'SchedulerFixture.cs')
    if($LASTEXITCODE -ne 0){throw 'Fixture compilation failed'}
    $fixture=Start-Process -FilePath $binary -WindowStyle Hidden -PassThru
    $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0)
    $listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
    $token=[guid]::NewGuid().ToString('N')
    $headers=@{'X-SynapseX-Token'=$token;'X-SynapseX-Vip'=$token}
    $url="http://127.0.0.1:$port"
    $serviceArgs=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $project 'host/SynapseXHost.ps1')+'"'),'-PreferredPort',[string]$port,'-SessionToken',$token,'-VipToken',$token,'-NoLaunch','-StrictPort')
    $service=Start-Process -FilePath "$env:windir\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $serviceArgs -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $testRoot 'host.err')
    $ready=$false;$deadline=[DateTime]::UtcNow.AddSeconds(30)
    while([DateTime]::UtcNow -lt $deadline){try{$null=Invoke-RestMethod ($url+'/api/lab/state') -Headers $headers -TimeoutSec 2;$ready=$true;break}catch{Start-Sleep -Milliseconds 200}}
    if(!$ready){throw ('Host did not start: '+(Get-Content (Join-Path $testRoot 'host.err') -Raw))}
    $data=Invoke-RestMethod ($url+'/api/lab/sample') -Headers $headers -Method Post -ContentType 'application/json' -Body (@{processId=$fixture.Id}|ConvertTo-Json) -TimeoutSec 8
    $row=@($data.sample.Threads|Where-Object {$_.CpuMs -gt 0 -and $_.Priority -eq 0})[0]
    $result=Invoke-RestMethod ($url+'/api/lab/start') -Headers $headers -Method Post -ContentType 'application/json' -Body (@{offer=$data.offer;kind='thread';threadId=$row.ThreadId;seconds=30;confirmation='APPLY'}|ConvertTo-Json) -TimeoutSec 8
    if($result.Status -ne 'active' -or $result.Actual -ne 1){throw 'HTTP apply not verified'}
    $shutdown=Invoke-RestMethod ($url+'/api/shutdown') -Headers $headers -Method Post -TimeoutSec 10
    if($shutdown.labRestore.Status -ne 'restored'){throw 'Shutdown acknowledged before restore'}
    Add-Type -Path (Join-Path $project 'host/modules/SchedulerExperiment.cs')
    if([SynapseX.Lab.SchedulerExperiment]::Inspect($fixture.Id,$row.ThreadId,'thread').Original -ne 0){throw 'Target priority left behind'}
    if(!$service.WaitForExit(5000)){throw 'Host did not exit'}
    [pscustomobject]@{ok=$true;httpSampling=$true;httpApplyReadback=$true;restoredBeforeShutdownResponse=$true;hostExited=$true;realGameModified=$false}|ConvertTo-Json -Compress
} finally {
    if($service -and !$service.HasExited){try{Invoke-RestMethod ($url+'/api/shutdown') -Headers $headers -Method Post -TimeoutSec 10|Out-Null}catch{};if(!$service.WaitForExit(2000)){Stop-Process -Id $service.Id}}
    if($fixture -and !$fixture.HasExited){Stop-Process -Id $fixture.Id}
    $env:SYNAPSEX_STATE_ROOT=$oldState
}
