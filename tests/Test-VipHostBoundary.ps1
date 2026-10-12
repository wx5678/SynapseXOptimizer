$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
$isolated=Join-Path ([IO.Path]::GetTempPath()) ('synapsex-vip-host-'+[guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $isolated)
$oldState=$env:SYNAPSEX_STATE_ROOT;$service=$null
try {
    $env:SYNAPSEX_STATE_ROOT=$isolated
    $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback,0)
    $listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
    $token=[guid]::NewGuid().ToString('N');$vip=[guid]::NewGuid().ToString('N')
    $headers=@{'X-SynapseX-Token'=$token};$url="http://127.0.0.1:$port"
    $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $project 'host/SynapseXHost.ps1')+'"'),'-PreferredPort',[string]$port,'-SessionToken',$token,'-VipToken',$vip,'-NoLaunch','-StrictPort')
    $service=Start-Process -FilePath "$env:windir\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $args -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $isolated 'host.err')
    $ready=$false;$deadline=[DateTime]::UtcNow.AddSeconds(30)
    while([DateTime]::UtcNow -lt $deadline){try{Invoke-RestMethod ($url+'/api/status') -Headers $headers -TimeoutSec 2|Out-Null;$ready=$true;break}catch{Start-Sleep -Milliseconds 200}}
    if(!$ready){throw 'Host did not start'}
    foreach($route in @('/api/network/tcp/apply','/api/network/nic/property')) {
        $code=0;try{Invoke-WebRequest ($url+$route) -Headers $headers -Method Get -UseBasicParsing|Out-Null}catch{$code=[int]$_.Exception.Response.StatusCode}
        if($code -ne 403){throw "GET must not bypass VIP: $route ($code)"}
    }
    foreach($route in @('/api/system/expert/apply','/api/network/tcp/apply','/api/network/nic/property','/api/lab/start')) {
        $code=0;try{Invoke-WebRequest ($url+$route) -Headers $headers -Method Post -Body '{}' -ContentType 'application/json' -UseBasicParsing|Out-Null}catch{$code=[int]$_.Exception.Response.StatusCode}
        if($code -ne 403){throw "Direct free request not blocked: $route ($code)"}
    }
    $headers['X-SynapseX-Vip']=$vip
    $code=0;try{Invoke-WebRequest ($url+'/api/network/nic/property') -Headers $headers -Method Post -Body '{}' -ContentType 'application/json' -UseBasicParsing|Out-Null}catch{$code=[int]$_.Exception.Response.StatusCode}
    if($code -ne 400){throw "VIP request did not reach confirmation validation ($code)"}
    Write-Output 'PASS: real host blocks direct protected requests; desktop capability reaches validation. No system writes performed.'
} finally {
    if($service -and !$service.HasExited){try{Invoke-RestMethod ($url+'/api/shutdown') -Headers $headers -Method Post -TimeoutSec 10|Out-Null}catch{};if(!$service.WaitForExit(10000)){Stop-Process -Id $service.Id -Force}}
    $env:SYNAPSEX_STATE_ROOT=$oldState
}
