param([Parameter(Mandatory)][string]$Source,[Parameter(Mandatory)][string]$Target,[Parameter(Mandatory)][string]$Backup,[Parameter(Mandatory)][string]$ExpectedHash,[Parameter(Mandatory)][string]$NewHash)
$ErrorActionPreference='Stop'
$fpsTarget=[IO.Path]::GetFullPath($Target)
$fpsSource=[IO.Path]::GetFullPath($Source)
$fpsBackup=[IO.Path]::GetFullPath($Backup)
if([IO.Path]::GetFileName($fpsTarget) -cne 'skin.package'){throw 'Invalid target'}
$fpsParent=[IO.Path]::GetDirectoryName($fpsTarget)
if([IO.Path]::GetDirectoryName($fpsSource) -cne $fpsParent -or [IO.Path]::GetDirectoryName($fpsBackup) -cne $fpsParent){throw 'Staging must be on the same directory and volume'}
if([IO.Path]::GetFileName($fpsSource) -notmatch '^\.synapsex-fps-[0-9a-f-]+\.tmp$' -or [IO.Path]::GetFileName($fpsBackup) -notmatch '^\.synapsex-fps-[0-9a-f-]+\.previous$'){throw 'Invalid staging name'}
foreach($fpsPath in @($fpsSource,$fpsTarget)){if((Get-Item -LiteralPath $fpsPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected resource is unsupported'}}
if(Test-Path -LiteralPath $fpsBackup){throw 'Backup target already exists'}
if(@(Get-Process fxgame -ErrorAction SilentlyContinue).Count -gt 0){throw 'Game is running; please exit first'}
if((Get-FileHash -LiteralPath $fpsSource -Algorithm SHA256).Hash -ne $NewHash -or (Get-FileHash -LiteralPath $fpsTarget -Algorithm SHA256).Hash -ne $ExpectedHash){throw 'Resource changed; replacement cancelled'}
[IO.File]::Replace($fpsSource,$fpsTarget,$fpsBackup,$false)
if((Get-FileHash -LiteralPath $fpsTarget -Algorithm SHA256).Hash -ne $NewHash){throw 'Replacement verification failed; backup retained'}
Write-Output 'Resource replacement verified'
