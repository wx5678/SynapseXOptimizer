param([switch]$ReadOnlyDriver)
$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('synapsex-nip-test-'+[guid]::NewGuid().ToString('N'))
$previousStateRoot=$env:SYNAPSEX_STATE_ROOT
New-Item -ItemType Directory -Path $root | Out-Null
try {
 $options=@{Path=@((Join-Path $PSScriptRoot '../host/native/NvidiaNip.cs'),(Join-Path $PSScriptRoot 'NipMock.cs'))}
 if($PSVersionTable.PSEdition -eq 'Desktop'){$options.ReferencedAssemblies=@('System.dll','System.Core.dll','System.Xml.dll')}
 Add-Type @options
 $library=Get-Content (Join-Path $PSScriptRoot '../host/nvidia-library/catalog.json') -Raw -Encoding UTF8 | ConvertFrom-Json
 if($library.items.Count -ne 8){throw 'Expected 8 NIP files'}
 foreach($item in $library.items){
  $bytes=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot ('../host/nvidia-library/'+$item.id+'.nip')))
  if([SynapseX.Nip.Importer]::Hash($bytes) -cne $item.id){throw 'Asset hash mismatch'}
  $values=[SynapseX.Nip.Importer]::Parse([SynapseX.Nip.Importer]::Decode($bytes))
  if($values.Count -lt 30){throw 'Asset did not parse completely'}
 }
 $valid='<ArrayOfProfile><Profile><ProfileName>Base Profile</ProfileName><Executeables/><Settings><ProfileSetting><SettingID>1</SettingID><SettingValue>5</SettingValue><ValueType>Dword</ValueType></ProfileSetting></Settings></Profile></ArrayOfProfile>'
 $invalid=@('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///C:/Windows/win.ini">]><ArrayOfProfile>&e;</ArrayOfProfile>', $valid.Replace('Base Profile','game'),$valid.Replace('<SettingID>1</SettingID>','<SettingID>1</SettingID><SettingID>2</SettingID>'),$valid.Replace('<SettingValue>5</SettingValue>','<SettingValue>4294967296</SettingValue>'),$valid.Replace('Dword','BadType'),$valid.Replace('<Executeables/>','<Executeables><string>game.exe</string></Executeables>'))
 foreach($text in $invalid){$caught=$false;try{[SynapseX.Nip.Importer]::Parse($text)|Out-Null}catch{$caught=$true};if(-not $caught){throw 'Invalid XML accepted'}}
 foreach($encoding in @((New-Object Text.UTF8Encoding($true)),(New-Object Text.UnicodeEncoding($false,$true)))){
  [byte[]]$bytes=@($encoding.GetPreamble())+@($encoding.GetBytes('<?xml version="1.0" encoding="utf-16"?>'+$valid))
  if([SynapseX.Nip.Importer]::Parse([SynapseX.Nip.Importer]::Decode($bytes)).Count -ne 1){throw 'Encoding mismatch handling failed'}
 }
 $cases=[NipEngineTests]::Run($root)
 $env:SYNAPSEX_STATE_ROOT=Join-Path $root 'module-state'
 Import-Module (Join-Path $PSScriptRoot '../host/modules/NvidiaNip.psm1') -Force
 & (Get-Module NvidiaNip) {
  param($root,$valid)
  $script:allowAdmin=$true;$script:sessionCount=0
  function script:Assert-NipAdmin {if(-not $script:allowAdmin){throw 'Mock admin required'}}
  function script:New-NipSession {$script:sessionCount++;New-Object NipMock}
  function MustReject([scriptblock]$Action){$caught=$false;try{& $Action|Out-Null}catch{$caught=$true};if(-not $caught){throw 'Guard failed'}}
  $file=Join-Path $root 'module-input.nip'
  [IO.File]::WriteAllText($file,$valid.Replace('<SettingValue>5</SettingValue>','<SettingValue>10</SettingValue>'))
  MustReject {Get-NvidiaNipPreview -FilePath (Join-Path $root 'script.cmd')}
  MustReject {Get-NvidiaNipPreview -Id '../../bad'}
  MustReject {Restore-NvidiaNip -BackupId '../../bad'}
  $p=Get-NvidiaNipPreview -FilePath $file
  $initial=$script:sessionCount
  MustReject {Set-NvidiaNip -Token $p.token -AcceptGlobal $false}
  $script:allowAdmin=$false;MustReject {Set-NvidiaNip -Token $p.token -AcceptGlobal $true};$script:allowAdmin=$true
  MustReject {Set-NvidiaNip -Token 'wrong' -AcceptGlobal $true}
  if($script:sessionCount -ne $initial){throw 'Validation opened write session'}
  $script:nipPreviews[$p.token].expires=(Get-Date).AddMinutes(-1)
  MustReject {Set-NvidiaNip -Token $p.token -AcceptGlobal $true}
  $p=Get-NvidiaNipPreview -FilePath $file
  [IO.File]::AppendAllText($file,' ')
  MustReject {Set-NvidiaNip -Token $p.token -AcceptGlobal $true}
  $p=Get-NvidiaNipPreview -FilePath $file
  $result=Set-NvidiaNip -Token $p.token -AcceptGlobal $true
  if(-not $result.ok -or $result.changed -ne 1 -or (Get-NvidiaNipLibrary).backups.Count -ne 1){throw 'Module apply backup contract failed'}
  MustReject {Set-NvidiaNip -Token $p.token -AcceptGlobal $true}
  $restore=Restore-NvidiaNip -BackupId $result.backupId
  if(-not $restore.ok){throw 'Module restore failed'}
 } $root $valid
 if($ReadOnlyDriver){
  Add-Type -Path (Join-Path $PSScriptRoot '../host/native/GpuDriverBridge.cs')
  [uint32[]]$ids=@(0x1057EB71,0x00198FFF,0x00A879CF,0x00CE2691)
  $existing=[SynapseX.Native.NvidiaDrsBridge]::Query('synapsex-nip-readonly-nonexistent.exe',[string[]]@('power','shader','vsync','texture'),$ids)
  if(-not $existing.Available -or $existing.ApplicationFound){throw 'Cannot cross-check base profile'}
  $session=New-Object SynapseX.Nip.NativeSession
  try{
   foreach($old in $existing.Settings){$now=$session.Read($old.Id);if($now.supported -ne $old.Supported -or $now.value -ne [string]$old.Value){throw 'Native structure cross-check failed'}}
   foreach($item in $library.items){$bytes=[IO.File]::ReadAllBytes((Join-Path $PSScriptRoot ('../host/nvidia-library/'+$item.id+'.nip')));$values=[SynapseX.Nip.Importer]::Parse([SynapseX.Nip.Importer]::Decode($bytes));$preview=[SynapseX.Nip.Importer]::Inspect($session,$values,$item.name);Write-Output ($item.name+': '+$preview.changed+' changes, '+$preview.skipped+' skipped')}
  }finally{$session.Dispose()}
 }
 Write-Output ('{"passed":true,"assets":8,"invalidXml":6,"encodings":2,"moduleCases":11,"transactionCases":'+$cases+',"realDriverWrites":0}')
} finally {
 Remove-Module NvidiaNip -ErrorAction SilentlyContinue
 $env:SYNAPSEX_STATE_ROOT=$previousStateRoot
 $resolved=[IO.Path]::GetFullPath($root);$prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\synapsex-nip-test-'
 if($resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolved)){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
