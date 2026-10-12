$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('synapsex-library-test-'+[guid]::NewGuid().ToString('N'))
$previous=$env:SYNAPSEX_STATE_ROOT
try {
 $env:SYNAPSEX_STATE_ROOT=$root
 Import-Module (Join-Path $PSScriptRoot '../host/modules/RuntimeOptimizer.psm1') -Force
 $module=Get-Module RuntimeOptimizer
 & $module {
  $script:libraryTestData=Get-SynapseXPowerLibrary
  if ($script:libraryTestData.items.Count -ne 75) { throw 'Library did not load' }
  $script:safePlan=@($script:libraryTestData.items | Where-Object { -not $_.highRisk })[0]
  $script:riskPlan=@($script:libraryTestData.items | Where-Object highRisk)[0]
  $script:oldGuid='11111111-1111-1111-1111-111111111111'
  $script:newerGuid='22222222-2222-2222-2222-222222222222'
  $script:realFileHash=(Get-Command Get-FileHash).ScriptBlock
  function script:Test-SynapseXRuntimeElevated { $script:scenario -ne 'not-admin' }
  function script:Write-RuntimeOperation { param($Action,$Result,$BackupId,$Detail) }
  function script:Get-PowerSchemeCatalog { @{active=@{guid=$script:active};items=@(@{guid=$script:active})} }
  function script:Get-SynapseXPowerValues([string]$Guid) {
   if ($script:scenario -eq 'readback') { throw 'Mock unreadable import' }
   @{ 'bc5038f7-23e0-4960-96da-33abaf5935ec'=@{ac=100;dc=100} }
  }
  function script:Get-FileHash { param($LiteralPath,$Algorithm='SHA256')
   if ($script:scenario -eq 'hash') { return @{Hash='bad'} }
   & $script:realFileHash -LiteralPath $LiteralPath -Algorithm $Algorithm
  }
  function script:Invoke-SynapseXPowerCfg([string[]]$Arguments,[string]$FailureMessage) {
   $script:calls.Add(($Arguments -join '|')) | Out-Null
   if ($Arguments[0] -eq '/export') {
    if ($script:scenario -eq 'export') { throw 'Mock backup failure' }
    [IO.File]::WriteAllText($Arguments[1],'mock backup, not a real pow')
   }
   if ($Arguments[0] -eq '/import' -and $script:scenario -eq 'import') { throw 'Mock import failure' }
   if ($Arguments[0] -eq '/setactive') {
    if ($script:scenario -eq 'activate' -and $Arguments[1] -ne $script:oldGuid) { throw 'Mock activation failure' }
    if ($script:scenario -ne 'mismatch' -or $Arguments[1] -eq $script:oldGuid) { $script:active=$Arguments[1] }
   }
  }
  # Block legacy restore's native process as well: no real powercfg writes in this suite.
  function script:Start-Process { param($FilePath,$ArgumentList,$WindowStyle,[switch]$Wait,[switch]$PassThru)
   if ($FilePath -notlike '*powercfg.exe' -or $ArgumentList[0] -ne '/setactive') { throw 'Unexpected native process' }
   $script:active=$ArgumentList[1]; @{ExitCode=0}
  }
  foreach ($case in @('none','not-admin','ack','risk-ack','risk-ok','id','unknown','hash','export','import','readback','activate','mismatch')) {
   $script:scenario=$case;$script:active=$script:oldGuid;$script:calls=New-Object 'Collections.Generic.List[string]'
   $id=$script:safePlan.id
   if ($case -in @('risk-ack','risk-ok')) { $id=$script:riskPlan.id }
   if ($case -eq 'id') { $id='../../bad' }
   if ($case -eq 'unknown') { $id='0'*64 }
   $caught=$false
   try { $result=Import-SynapseXPowerLibraryPlan -Id $id -AcceptFullPlan ($case -ne 'ack') -AcceptHighRisk ($case -eq 'risk-ok') } catch { $caught=$true; if ($case -in @('none','risk-ok')) { throw } }
   if ($case -in @('none','risk-ok')) {
    if ($caught -or -not $result.ok -or $script:active -eq $script:oldGuid) { throw "Success failed: $case" }
    if (-not $script:calls[0].StartsWith('/export|') -or -not $script:calls[1].StartsWith('/import|')) { throw 'Backup/import order wrong' }
    $snapshot=Get-Content (Join-Path $powerBackupRoot ($result.backupId+'.json')) -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($snapshot.previousGuid -ne $script:oldGuid -or -not $snapshot.backupHash) { throw 'Missing recovery metadata' }
   } else {
    if (-not $caught) { throw "Failure not rejected: $case" }
    if ($case -in @('not-admin','ack','risk-ack','id','unknown','hash') -and $script:calls.Count) { throw "Wrote before validation: $case" }
    if ($case -in @('readback','activate','mismatch')) {
     if (-not $script:calls.Contains('/setactive|'+$script:oldGuid)) { throw "No rollback: $case" }
     if (@($script:calls|Where-Object {$_ -like '/delete|*'}).Count -ne 1) { throw 'No import cleanup' }
    }
    if ($script:active -ne $script:oldGuid) { throw 'Failed import left active plan changed' }
   }
  }
  $script:scenario='restore';$script:calls.Clear()
  # Numeric regular backup must win over an older library-prefixed backup.
  $latest=Join-Path $powerBackupRoot '20990101-000000.json'
  [IO.File]::WriteAllText($latest,(@{previousGuid=$script:newerGuid}|ConvertTo-Json))
  (Get-Item -LiteralPath $latest).LastWriteTimeUtc=[datetime]::UtcNow.AddMinutes(1)
  $restored=Restore-SynapseXPowerScheme
  if ($script:active -ne $script:newerGuid -or $restored.backupId -ne '20990101-000000') { throw 'Latest backup order broken' }
  # A removed original GUID is reconstructed from its verified export, not an arbitrary file.
  $libraryBackup=Get-ChildItem -LiteralPath $powerBackupRoot -Filter 'library-*.json' | Select-Object -First 1
  Restore-SynapseXPowerScheme -BackupId $libraryBackup.BaseName | Out-Null
  if ($script:active -ne $script:oldGuid -or @($script:calls|Where-Object {$_ -like '/import|*'}).Count -ne 1) { throw 'Export restoration failed' }
 }
 Write-Output '{"passed":true,"transactionCases":15,"realPowerWrites":0}'
} finally {
 Remove-Module RuntimeOptimizer -ErrorAction SilentlyContinue
 $env:SYNAPSEX_STATE_ROOT=$previous
 $resolved=[IO.Path]::GetFullPath($root)
 $prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\synapsex-library-test-'
 if ($resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolved)) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
