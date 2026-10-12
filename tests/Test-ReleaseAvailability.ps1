$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
foreach($name in @('MonitorSensors','NetworkToolkit','GpuDriverOptimizer','ExpertSettings','LabDiagnostics','RuntimeOptimizer')) { Import-Module (Join-Path $root "host/modules/$name.psm1") -Force }
$network=Get-NetworkToolkitSnapshot
$physical=@($network.adapters | Where-Object {$_.isDefaultRoute}) | Select-Object -First 1
$nic=if($physical){Get-NicAdvancedAudit -InterfaceAlias $physical.name}else{$null}
$expert=Get-ExpertCatalog
$gpu=Get-GpuDriverOptimizationCatalog (Join-Path $env:SystemRoot 'System32/notepad.exe')
$runtime=Get-GameRuntimeSnapshot
$result=[ordered]@{
 elevated=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
 cpuTemperature=Get-MonitorCpuTemperature
 nicTotal=@($nic.properties).Count
 nicEditable=@($nic.properties | Where-Object {@($_.options).Count -gt 0 -or ($null -ne $_.minimum -and $null -ne $_.maximum)}).Count
 nicReadOnly=@($nic.properties | Where-Object {@($_.options).Count -eq 0 -and ($null -eq $_.minimum -or $null -eq $_.maximum)} | ForEach-Object {$_.displayName})
 expertTotal=@($expert.items).Count
 expertUnavailable=@($expert.items | Where-Object {!$_.available} | ForEach-Object { [pscustomobject]$_ })
 gpuProviders=@($gpu.providers | ForEach-Object { @{vendor=$_.vendor;available=$_.available;error=$_.error;items=@($_.items | ForEach-Object {@{key=$_.key;supported=$_.supported}})} })
 diagnostics=Get-LabDiagnosticState
 powerPlans=@($runtime.power.items).Count
 tcpItems=@($network.tcp.optimization.items).Count
 systemWrites=0
}
$json=$result | ConvertTo-Json -Depth 8
if($env:SYNAPSEX_STATE_ROOT){[void](New-Item -ItemType Directory -Path $env:SYNAPSEX_STATE_ROOT -Force);[IO.File]::WriteAllText((Join-Path $env:SYNAPSEX_STATE_ROOT 'availability.json'),$json,[Text.UTF8Encoding]::new($false))}
$json
