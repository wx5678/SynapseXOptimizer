$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
$root=Join-Path ([IO.Path]::GetTempPath()) ('sx-diagnostic-test-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root|Out-Null
Add-Type -Path (Join-Path $project 'host/modules/DpcProbe.cs')
Add-Type -Path (Join-Path $project 'host/modules/RawMouseProbe.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Core,System
$row=[SynapseX.InputLab.RawMouseProbe]::Summarize('fixture',[double[]]@(0,8,16,24,32))
if($row.ObservedHz -ne 125 -or $row.Reports -ne 5){throw 'Input statistic mismatch'}
$xperf=Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\Windows Performance Toolkit\xperf.exe'
try {
    $null=[SynapseX.DpcLab.DpcProbe]::Start($root,$xperf)
    $deadline=[DateTime]::UtcNow.AddSeconds(55)
    do {Start-Sleep -Milliseconds 500;$s=[SynapseX.DpcLab.DpcProbe]::State()}while($s.Status -in @('running','analyzing') -and [DateTime]::UtcNow -lt $deadline)
    if($s.Status -ne 'complete'){throw ($s.Status+': '+$s.Message)}
    if(!$s.Report -or !(Test-Path -LiteralPath $s.Trace)){throw 'Missing DPC report'}
    if(Test-Path -LiteralPath (Join-Path $root 'active-dpc.txt')){throw 'ETW ownership not cleaned'}
    [pscustomobject]@{ok=$true;rawInputStatistic=$true;dpcCapture=$true;dpcReport=$true;trace=$s.Trace;reportPreview=$s.Report.Substring(0,[math]::Min(2500,$s.Report.Length))}|ConvertTo-Json -Depth 4
} finally {[SynapseX.DpcLab.DpcProbe]::Stop();[SynapseX.InputLab.RawMouseProbe]::Stop()}
