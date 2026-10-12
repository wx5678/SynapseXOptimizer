$ErrorActionPreference='Stop'
$fpsTestDirectory=Join-Path ([IO.Path]::GetTempPath()) ('synapsex-fps-native-test-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($fpsTestDirectory)
$fpsScript=Join-Path $PSScriptRoot '../host/ReplaceJiuYinFpsResource.ps1'
$fpsTarget=Join-Path $fpsTestDirectory 'skin.package'
$fpsSource=Join-Path $fpsTestDirectory '.synapsex-fps-11111111-1111-1111-1111-111111111111.tmp'
$fpsPrevious=Join-Path $fpsTestDirectory '.synapsex-fps-11111111-1111-1111-1111-111111111111.previous'
# This adapter simulates process state for TEMP FILES ONLY. No game path is used.
$fpsFixtureRunning=$false
function Get-Process { param([string]$Name,[string]$ErrorAction) if($fpsFixtureRunning){[pscustomobject]@{Id=1;ProcessName='fxgame'}} }
try {
  [IO.File]::WriteAllText($fpsTarget,'synthetic-original')
  [IO.File]::WriteAllText($fpsSource,'synthetic-candidate')
  $fpsOldHash=(Get-FileHash -LiteralPath $fpsTarget -Algorithm SHA256).Hash
  $fpsNewHash=(Get-FileHash -LiteralPath $fpsSource -Algorithm SHA256).Hash
  $fpsFixtureRunning=$true
  $fpsRejected=$false
  try { & $fpsScript -Source $fpsSource -Target $fpsTarget -Backup $fpsPrevious -ExpectedHash $fpsOldHash -NewHash $fpsNewHash } catch {$fpsRejected=$true}
  if(-not $fpsRejected -or [IO.File]::ReadAllText($fpsTarget) -ne 'synthetic-original'){throw 'Running-process guard failed'}
  $fpsFixtureRunning=$false
  $fpsRejected=$false
  try { & $fpsScript -Source $fpsSource -Target $fpsTarget -Backup $fpsPrevious -ExpectedHash ('0'*64) -NewHash $fpsNewHash } catch {$fpsRejected=$true}
  if(-not $fpsRejected -or [IO.File]::ReadAllText($fpsTarget) -ne 'synthetic-original'){throw 'Hash guard failed'}
  & $fpsScript -Source $fpsSource -Target $fpsTarget -Backup $fpsPrevious -ExpectedHash $fpsOldHash -NewHash $fpsNewHash
  if([IO.File]::ReadAllText($fpsTarget) -ne 'synthetic-candidate' -or [IO.File]::ReadAllText($fpsPrevious) -ne 'synthetic-original' -or (Test-Path -LiteralPath $fpsSource)){throw 'Atomic replacement failed'}
  Write-Output 'PASS: running guard, hash guard, atomic replacement and displaced backup'
} finally {
  $fpsResolved=[IO.Path]::GetFullPath($fpsTestDirectory)
  if([IO.Path]::GetDirectoryName($fpsResolved).TrimEnd('\') -ne ([IO.Path]::GetTempPath()).TrimEnd('\') -or [IO.Path]::GetFileName($fpsResolved) -notlike 'synapsex-fps-native-test-*'){throw 'Unsafe fixture cleanup target'}
  Remove-Item -LiteralPath $fpsResolved -Recurse -Force
}
