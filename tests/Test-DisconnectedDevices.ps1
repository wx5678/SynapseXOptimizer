$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$originalRoot=$env:SYNAPSEX_STATE_ROOT
$env:SYNAPSEX_STATE_ROOT=Join-Path ([IO.Path]::GetTempPath()) ('Disconnected-Test-'+[guid]::NewGuid().ToString('N'))
$m=Import-Module (Join-Path $repo 'host/modules/DisconnectedDevices.psm1') -Force -PassThru
try{
 $real=Get-DisconnectedCatalog
 & $m {
  $script:fixture=[pscustomobject]@{InstanceId='HID\VID_0001&PID_0002\FIXTURE';FriendlyName='Fixture';Class='HIDClass';Present=$false;ConfigManagerErrorCode=45;HardwareID=@('fixture');Service='fixture'}
  $script:gone=$false;$script:code=0;$script:retain=$false;$script:calls=0;$script:reads=0;$script:reconnectOnRead=0
  function script:Get-DisconnectedEnvironment {'fixture-user'}
  function script:Get-DisconnectedNativeDevices {$script:reads++;if($script:reconnectOnRead -eq $script:reads){$script:fixture.Present=$true};if(!$script:gone){$script:fixture}}
  function script:Invoke-DisconnectedRemove($Target){
   if($Target -cne $script:fixture.InstanceId){throw 'Wrong device target'}
   if(!@(Get-DisconnectedHistory 'fixture-user').Count){throw 'No pre-operation record'}
   $script:calls++;if(!$script:retain -and $script:code -eq 0){$script:gone=$true};@{exitCode=$script:code;output='Fixture only'}
  }
  function Assert-Blocked($Work){$blocked=$false;try{&$Work|Out-Null}catch{$blocked=$true};if(!$blocked){throw 'Expected refusal'}}
  $item=(Get-DisconnectedCatalog).items[0]
  Assert-Blocked {Remove-DisconnectedDevice $item.id 'stale'}
  $script:fixture.Present=$true;Assert-Blocked {Remove-DisconnectedDevice $item.id $item.fingerprint};$script:fixture.Present=$false
  $script:fixture.Class='DiskDrive';if((Get-DisconnectedCatalog).items[0].available){throw 'Storage allowed'};$script:fixture.Class='HIDClass'
  $script:fixture.HardwareID=@('replacement');Assert-Blocked {Remove-DisconnectedDevice $item.id $item.fingerprint};$script:fixture.HardwareID=@('fixture')
  $script:code=5;$result=Remove-DisconnectedDevice $item.id $item.fingerprint;if($result.ok){throw 'Failure reported success'}
  $script:code=0;$script:retain=$true;$result=Remove-DisconnectedDevice $item.id $item.fingerprint;if($result.ok){throw 'Unchanged record reported success'}
  $script:retain=$false;$result=Remove-DisconnectedDevice $item.id $item.fingerprint;if(!$result.ok){throw 'Verified removal not reported'}
  Assert-Blocked {Remove-DisconnectedDevice $item.id $item.fingerprint}
  $script:gone=$false;$script:reconnectOnRead=$script:reads+2;$before=$script:calls
  $result=Remove-DisconnectedDevice $item.id $item.fingerprint
  if($result.ok -or $script:calls -ne $before){throw 'Reconnect-before-execution was not refused'}
  Assert-Blocked {Remove-DisconnectedDevice '..\other' 'invalid'}
 }
 @{ok=$true;readOnlyDevices=$real.items.Count;nativeRemovals=0;tests='identity/state changes; connected/storage refusal; pre-record; native failure; readback; repeat and reconnect'}|ConvertTo-Json
}finally{$env:SYNAPSEX_STATE_ROOT=$originalRoot;Remove-Module $m.Name}
