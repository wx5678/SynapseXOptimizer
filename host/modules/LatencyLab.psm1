$ErrorActionPreference='Stop'
$script:latencyRoot=Join-Path $(if($env:SYNAPSEX_STATE_ROOT){$env:SYNAPSEX_STATE_ROOT}else{Join-Path $env:LOCALAPPDATA 'SynapseX\state'}) 'latency-lab'
function Initialize-LatencyLab {
    if(!('SynapseX.LatencyLab.Probe' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'LatencyProbe.cs') -ReferencedAssemblies System,System.Core,System.Runtime.Serialization,System.Xml}
}
function Get-LatencyLabState {
    if('SynapseX.LatencyLab.Probe' -as [type]){[SynapseX.LatencyLab.Probe]::State()}else{@{Status='idle';Message='尚未测试';Points=@()}}
}
function Start-LatencyLab($Body) {
    if([string]$Body.confirmation -cne 'MEASURE'){throw 'Explicit MEASURE required.'}
    $diagnostics=Get-LabDiagnosticState
    if($diagnostics.mouse.Status -eq 'running' -or $diagnostics.dpc.Status -in @('running','analyzing')){throw '请先停止鼠标或 DPC 采样，避免同时采集干扰结果。'}
    Initialize-LatencyLab
    $power=(& "$env:windir/System32/powercfg.exe" /getactivescheme 2>$null | Out-String).Trim()
    [SynapseX.LatencyLab.Probe]::Start($script:latencyRoot,[int]$Body.seconds,[string]$Body.label,$power)
}
function Stop-LatencyLab {
    if('SynapseX.LatencyLab.Probe' -as [type]){[SynapseX.LatencyLab.Probe]::Stop()}else{Get-LatencyLabState}
}
function Get-LatencyLabHistory {
    @{records=@(Get-ChildItem -LiteralPath $script:latencyRoot -Filter '*.json' -File -ErrorAction SilentlyContinue|Where-Object {$_.BaseName -match '^[a-f0-9]{32}$' -and $_.Length -lt 500000}|Sort-Object LastWriteTimeUtc -Descending|Select-Object -First 50|ForEach-Object{try{Get-Content -LiteralPath $_.FullName -Encoding UTF8 -Raw|ConvertFrom-Json}catch{}})}
}
function Get-LabNoticePreference {
    $path=Join-Path $script:latencyRoot 'notice-preference.json'
    try{$data=Get-Content -LiteralPath $path -Raw -Encoding UTF8|ConvertFrom-Json;@{suppressed=($data.suppressed -is [bool] -and $data.suppressed)}}catch{@{suppressed=$false}}
}
function Set-LabNoticePreference($Body) {
    if($Body.suppressed -isnot [bool]){throw '无效提醒设置。'}
    New-Item -ItemType Directory -Path $script:latencyRoot -Force|Out-Null
    $path=Join-Path $script:latencyRoot 'notice-preference.json'
    $temp=$path+'.'+[guid]::NewGuid().ToString('N')+'.pending'
    $data=@{suppressed=[bool]$Body.suppressed}
    $bytes=[Text.Encoding]::UTF8.GetBytes(($data|ConvertTo-Json -Compress))
    $stream=New-Object IO.FileStream($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
    Move-Item -LiteralPath $temp -Destination $path -Force
    $data
}
Export-ModuleMember -Function Get-LatencyLabState,Start-LatencyLab,Stop-LatencyLab,Get-LatencyLabHistory,Get-LabNoticePreference,Set-LabNoticePreference
