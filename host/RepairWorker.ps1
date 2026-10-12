param([Parameter(Mandatory=$true)][ValidatePattern('^\d{8}-\d{6}-\d{3}-[a-f0-9]{32}$')][string]$JobId)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'modules\RepairJobs.psm1') -Force
Invoke-RepairWorker -JobId $JobId
