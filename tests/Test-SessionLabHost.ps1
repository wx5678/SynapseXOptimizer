$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('synapsex-session-http-'+[guid]::NewGuid().ToString('N'))
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
    $candidates=Invoke-RestMethod ($url+'/api/lab/session/targets') -Headers $headers -TimeoutSec 20
    $target=@($candidates.targets|Where-Object id -eq $fixture.Id)[0]
    if(!$target.offer){throw 'Fixture not in process picker'}
    $topology=Invoke-RestMethod ($url+'/api/lab/session/topology') -Headers $headers -TimeoutSec 10
    if(!$topology.cpus.Count){throw 'No CPU sets exposed'}
    $support=Invoke-RestMethod ($url+'/api/lab/session/support') -Headers $headers -Method Post -ContentType 'application/json' -Body (@{offer=$target.offer}|ConvertTo-Json) -TimeoutSec 10
    if(!@($support.items|Where-Object {$_.kind -eq 'memory' -and $_.available}).Count){throw 'Memory query not available'}
    $prefs=Invoke-RestMethod ($url+'/api/lab/session/preferences') -Headers $headers -Method Post -ContentType 'application/json' -Body (@{games=@(@{name='Fixture';path=$binary;platform='test'});whitelist=@($binary);confirmation='SAVE'}|ConvertTo-Json -Depth 5) -TimeoutSec 10
    if($prefs.games[0].path -ne $binary){throw 'Local library not saved'}
    $diag=Invoke-RestMethod ($url+'/api/lab/session/diagnostics') -Headers $headers -TimeoutSec 10
    if($diag.mouse.Status -ne 'idle' -or $diag.dpc.Status -ne 'idle'){throw 'Diagnostics must not autostart'}
    $notice=Invoke-RestMethod ($url+'/api/lab/session/notice') -Headers $headers -Method Post -ContentType 'application/json' -Body '{"suppressed":true}'
    if(!$notice.suppressed -or !(Invoke-RestMethod ($url+'/api/lab/session/notice') -Headers $headers).suppressed){throw 'Notice preference HTTP failed'}
    $latency=Invoke-RestMethod ($url+'/api/lab/session/latency-start') -Headers $headers -Method Post -ContentType 'application/json' -Body '{"seconds":60,"label":"shutdown test","confirmation":"MEASURE"}' -TimeoutSec 10
    if($latency.Status -ne 'running'){throw 'Latency HTTP start failed'}
    $refused=$false
    try{Invoke-RestMethod ($url+'/api/lab/session/diagnostic-start') -Headers $headers -Method Post -ContentType 'application/json' -Body '{"kind":"mouse","confirmation":"MEASURE"}' -TimeoutSec 5|Out-Null}catch{$refused=$true}
    if(!$refused){throw 'Overlapping diagnostic allowed'}
    $result=Invoke-RestMethod ($url+'/api/lab/session/start') -Headers $headers -Method Post -ContentType 'application/json' -Body (@{offer=$target.offer;mode='single';kind='memory';seconds=60;confirmation='APPLY'}|ConvertTo-Json) -TimeoutSec 10
    if($result.Session.Status -ne 'active' -or $result.Session.Settings[0].Status -ne 'applied'){throw 'Session apply not verified'}
    $shutdown=Invoke-RestMethod ($url+'/api/shutdown') -Headers $headers -Method Post -TimeoutSec 10
    if($shutdown.sessionRestore.Session.Status -ne 'restored'){throw 'Session not restored before shutdown acknowledgement'}
    Add-Type -Path (Join-Path $project 'host/modules/SessionExperiments.cs') -ReferencedAssemblies System.Xml,System.Core,System
    $nativeTarget=[SynapseX.SessionLab.Native]::Inspect($fixture.Id)
    if([SynapseX.SessionLab.Native]::Read($nativeTarget,'memory') -ne '5'){throw 'Memory priority left behind'}
    if(!$service.WaitForExit(5000)){throw 'Host did not exit'}
    $latencyRecord=Get-Content -LiteralPath (Join-Path $testRoot ('latency-lab/'+$latency.Id+'.json')) -Raw -Encoding UTF8|ConvertFrom-Json
    if($latencyRecord.Status -ne 'cancelled'){throw 'Latency not stopped and saved during shutdown'}
    [pscustomobject]@{ok=$true;processPicker=$true;topology=$true;localLibrary=$true;diagnosticsOff=$true;httpApplyReadback=$true;latencyHttp=$true;latencyCancelledOnShutdown=$true;noticeHttp=$true;diagnosticOverlapRejected=$true;restoredBeforeShutdownResponse=$true;hostExited=$true;realGameModified=$false}|ConvertTo-Json -Compress
} finally {
    if($service -and !$service.HasExited){try{Invoke-RestMethod ($url+'/api/shutdown') -Headers $headers -Method Post -TimeoutSec 10|Out-Null}catch{};if(!$service.WaitForExit(2000)){Stop-Process -Id $service.Id}}
    if($fixture -and !$fixture.HasExited){Stop-Process -Id $fixture.Id}
    $env:SYNAPSEX_STATE_ROOT=$oldState
}
