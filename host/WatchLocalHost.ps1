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
$owner = [Diagnostics.Process]::GetProcessById($OwnerProcessId)

# This supervisor inherits the single, explicitly elevated launch. Recovery
# retains the origin and credentials and never replays any API operation.
$arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $resolvedScript.Replace('"', '""') + '" -PreferredPort ' + $Port + ' -SessionToken ' + $SessionToken + ' -NoLaunch -StrictPort'
if ($VipToken) { $arguments += ' -VipToken ' + $VipToken }
for ($attempt = 0; $attempt -le 3; $attempt++) {
    if ($owner.HasExited) { exit 0 }
    $child = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -WindowStyle Hidden -ArgumentList $arguments -PassThru
    try {
        while (-not $child.WaitForExit(500)) {
            if ($owner.HasExited) {
                # Only the child created by this supervisor, never other hosts.
                $child.Kill()
                $child.WaitForExit()
                exit 0
            }
        }
        $hostExitCode = $child.ExitCode
    } finally { $child.Dispose() }
    # A successful exit is an explicit shutdown: do not resurrect the service.
    if ($hostExitCode -eq 0) { exit 0 }
    if ($attempt -lt 3) {
        for ($pause = 0; $pause -lt (5 * [Math]::Pow(2, $attempt)); $pause++) {
            if ($owner.HasExited) { exit 0 }
            Start-Sleep -Milliseconds 200
        }
    }
}
exit $hostExitCode
