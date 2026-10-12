$ErrorActionPreference='Stop'
$module=Import-Module (Join-Path $PSScriptRoot '../host/modules/MonitorSensors.psm1') -Force -PassThru
try {
 & $module {
  foreach($value in @($null,'','N/A','[Not Supported]','NaN','Infinity')){if($null -ne (Convert-MonitorNumber $value)){throw 'Invalid sensor became numeric'}}
  if((Convert-MonitorNumber '65.5') -ne 65.5){throw 'Numeric parse failed'}
  $script:mode='valid'
  function script:Get-Service { param($Name,$ErrorAction) return $null }
  function script:Get-CimInstance {
   param($Namespace,$ClassName,$Filter,$OperationTimeoutSec,$ErrorAction)
   if($script:mode -eq 'absent'){throw 'provider absent'}
   @([pscustomobject]@{Parent='/lpc/0';Name='CPU';Value=99},[pscustomobject]@{Parent='/amdcpu/0';Name='CPU (Tctl/Tdie)';Value=62},[pscustomobject]@{Parent='/amdcpu/0';Name='Core';Value=68},[pscustomobject]@{Parent='/amdcpu/0';Name='Bad';Value=-1})
  }
  $script:SensorCache=$null;$sample=Get-MonitorCpuTemperature
  if($sample.temperatureC -ne 62){throw 'Must prefer CPU package and reject mainboard'}
  $script:mode='absent';$script:SensorCache=$null;$sample=Get-MonitorCpuTemperature
  if($null -ne $sample.temperatureC -or $sample.temperatureStatus -ne 'driver-missing'){throw 'Missing driver must be explicit, not a fake temperature'}
 }
 'PASS: CPU package identity, missing provider, invalid/NVIDIA N/A parsing (mock sensors only)'
}finally{Remove-Module $module.Name}
