[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string]$SessionToken,
    [string]$VipToken,
    [Parameter(Mandatory = $true)][int]$OwnerProcessId
)

$ErrorActionPreference = 'Stop'
$resolvedScript = [IO.Path]::GetFullPath($ScriptPath)
if (-not (Test-Path -LiteralPath $resolvedScript -PathType Leaf)) { throw 'SynapseX host script is missing.' }
if ($SessionToken -notmatch '^[a-f0-9]{32}$') { throw 'Invalid SynapseX session token.' }
if ($VipToken -and $VipToken -notmatch '^[a-f0-9]{32}$') { throw 'Invalid VIP capability.' }
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Invalid SynapseX loopback port.' }

$supervisor = Join-Path $PSScriptRoot 'WatchLocalHost.ps1'
if (-not (Test-Path -LiteralPath $supervisor -PathType Leaf)) { throw 'SynapseX host supervisor is missing.' }
$quotedScript = '"' + $resolvedScript.Replace('"', '""') + '"'
$arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$supervisor`" -ScriptPath $quotedScript -Port $Port -SessionToken $SessionToken -OwnerProcessId $OwnerProcessId"
if ($VipToken) { $arguments += " -VipToken $VipToken" }
$service = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -WindowStyle Hidden -ArgumentList $arguments -Wait -PassThru
exit $service.ExitCode
