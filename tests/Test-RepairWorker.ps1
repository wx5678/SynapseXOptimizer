$ErrorActionPreference='Stop'
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('Repair-Worker-Fixture-'+[guid]::NewGuid().ToString('N'))
$worker=Join-Path $PSScriptRoot 'fixtures/repair/WorkerFixture.ps1'
$process=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe') -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$worker+'"'),'-StateRoot',('"'+$fixtureRoot+'"')) -PassThru
try{
    if(!$process.WaitForExit(10000)){throw 'Fixture worker timed out'}
    $path=Join-Path $fixtureRoot 'repair-jobs/20260909-120000-000-11111111111111111111111111111111.json'
    $r=Get-Content -LiteralPath $path -Raw -Encoding UTF8|ConvertFrom-Json
    if($r.status -ne 'failed' -or $r.exitCode -ne 7){throw ('Native worker result mismatch: '+($r|ConvertTo-Json -Compress))}
    $output=Get-Content -LiteralPath ($path.Replace('.json','.out.log')) -Raw
    if($output -notmatch 'fixture-output'){throw 'Native stdout missing'}
    @{ok=$true;nativeCommand='cmd echo and exit 7 only';systemRepairs=0;persistedExitCode=$r.exitCode;outputCaptured=$true}|ConvertTo-Json
}finally{$process.Dispose()}
$helpRoot=Join-Path ([IO.Path]::GetTempPath()) ('SfcHelp-Fixture-'+[guid]::NewGuid().ToString('N'))
$process=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe') -WindowStyle Hidden -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$worker+'"'),'-StateRoot',('"'+$helpRoot+'"'),'-SfcHelp') -PassThru
try{
    if(!$process.WaitForExit(10000)){throw 'Help worker timed out'}
    $path=Join-Path $helpRoot 'repair-jobs/20260909-120000-000-11111111111111111111111111111111.out.log'
    $output=Get-Content -LiteralPath $path -Raw -Encoding UTF8
    if(!$output -or $output.Contains([string][char]0) -or $output.Contains([string][char]0xFFFD)){throw 'SFC help output corrupted'}
    @{ok=$true;nativeCommand='sfc /? only';systemRepairs=0;unicodeOutput='UTF-8 log without embedded NUL/replacement characters'}|ConvertTo-Json
}finally{$process.Dispose()}
