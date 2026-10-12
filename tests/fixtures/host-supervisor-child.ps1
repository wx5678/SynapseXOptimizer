param([int]$PreferredPort, [string]$SessionToken, [string]$VipToken, [switch]$NoLaunch, [switch]$StrictPort)
$ErrorActionPreference = 'Stop'
if (-not $env:SYNAPSEX_SUPERVISOR_FIXTURE) { throw 'Fixture directory is required.' }
if ($PreferredPort -ne 49123 -or $SessionToken -ne ('a' * 32) -or $VipToken -ne ('b' * 32) -or -not $NoLaunch -or -not $StrictPort) { exit 99 }
$counter = Join-Path $env:SYNAPSEX_SUPERVISOR_FIXTURE 'attempts.txt'
Add-Content -LiteralPath $counter -Value ([string]$PID)
if ($env:SYNAPSEX_SUPERVISOR_MODE -eq 'wait') { while ($true) { Start-Sleep -Milliseconds 200 } }
if ($env:SYNAPSEX_SUPERVISOR_MODE -eq 'recover' -and @(Get-Content -LiteralPath $counter).Count -ge 2) { exit 0 }
exit 17
