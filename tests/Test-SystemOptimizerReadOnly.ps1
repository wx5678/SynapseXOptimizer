$ErrorActionPreference = 'Stop'
$module = Join-Path (Split-Path -Parent $PSScriptRoot) 'host\modules\SystemOptimizer.psm1'
$env:SYNAPSEX_STATE_ROOT = Join-Path $env:TEMP ('SynapseX-System-Test-' + [guid]::NewGuid().ToString('N'))
$fixtureStateRoot = [IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT)
$testRegistryId = [guid]::NewGuid().ToString('N')
$env:SYNAPSEX_TEST_REGISTRY_ROOT = 'HKCU:\Software\SynapseX\Tests\' + $testRegistryId
Import-Module $module -Force

try {
    $catalog = @(Get-SystemOptimizationCatalog)
    if ($catalog.Count -lt 9) { throw 'System optimization catalog is unexpectedly small.' }
    if (@($catalog | Where-Object { [string]::IsNullOrWhiteSpace($_.description) -or [string]::IsNullOrWhiteSpace($_.tradeoff) }).Count -gt 0) { throw 'A catalog item is missing its explanation or tradeoff.' }
    $expectedIds = @('game-mode', 'disable-game-capture', 'quiet-gamebar', 'mmcss-game-priority', 'disable-startup-delay', 'disable-power-throttling', 'disable-map-updates', 'disable-silent-content', 'disable-feedback-prompts', 'disable-tailored-experiences', 'reduce-taskbar-animations', 'faster-menu', 'reduce-transparency', 'disable-mouse-acceleration', 'reduce-window-animations', 'limit-background-apps', 'disable-edge-background', 'quiet-notifications')
    if (@($expectedIds | Where-Object { @($catalog.id) -notcontains $_ }).Count -gt 0) { throw 'System optimization catalog is missing an expected item.' }
    if (@($catalog | Where-Object recommended).Count -lt 6) { throw 'Recommended system optimization catalog is incomplete.' }

    $preview = Get-SystemOptimizationPreview -Ids @($catalog[0].id)
    if ($preview.selectedCount -ne 1 -or @($preview.changes).Count -ne 1) { throw 'System preview schema is invalid.' }

    $applied = Set-SystemOptimizations -Ids @('disable-edge-background')
    $appliedItem = @(Get-SystemOptimizationCatalog | Where-Object id -eq 'disable-edge-background')[0]
    if (-not $appliedItem.applied) { throw ('System optimization apply verification failed: ' + ($appliedItem.states | ConvertTo-Json -Compress)) }
    [void](Restore-SystemOptimizations -BackupId $applied.backupId)
    $restoredItem = @(Get-SystemOptimizationCatalog | Where-Object id -eq 'disable-edge-background')[0]
    if ($restoredItem.applied) { throw 'System optimization restore verification failed.' }

    $startup = Get-StartupAudit
    if ($null -eq $startup.items -or $startup.totalCount -lt 0) { throw 'Startup audit schema is invalid.' }

    $blocked = $false
    try {
        Disable-StartupEntries -Items @([pscustomobject]@{ manageable = $true; path = 'HKCU:\Software\SynapseX\NotAllowed'; name = 'Value' }) | Out-Null
    } catch { $blocked = $true }
    if (-not $blocked) { throw 'Startup path allowlist did not reject an out-of-scope registry path.' }

    $apps = Get-InstalledApplicationAudit
    $services = Get-ServiceAudit
    if ($apps.totalCount -lt 1) { throw 'Installed application audit returned no entries.' }
    if ($services.totalCount -lt 1) { throw 'Service audit returned no entries.' }

    [pscustomobject]@{
        ok = $true
        catalogItems = $catalog.Count
        systemRoundTrip = $true
        startupItems = $startup.totalCount
        installedApplications = $apps.totalCount
        automaticServices = $services.totalCount
        startupAllowlistProtected = $blocked
    } | ConvertTo-Json -Compress
}
finally {
    Remove-Module SystemOptimizer -ErrorAction SilentlyContinue
    if ($env:SYNAPSEX_TEST_REGISTRY_ROOT -match '^HKCU:\\Software\\SynapseX\\Tests\\[A-Za-z0-9-]+$' -and (Test-Path -LiteralPath $env:SYNAPSEX_TEST_REGISTRY_ROOT)) { Remove-Item -LiteralPath $env:SYNAPSEX_TEST_REGISTRY_ROOT -Recurse -Force }
    if ([IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT) -ceq $fixtureStateRoot -and $fixtureStateRoot -like (Join-Path $env:TEMP 'SynapseX-System-Test-*') -and (Test-Path -LiteralPath $fixtureStateRoot)) { Remove-Item -LiteralPath $fixtureStateRoot -Recurse -Force }
    Remove-Item Env:SYNAPSEX_TEST_REGISTRY_ROOT -ErrorAction SilentlyContinue
    Remove-Item Env:SYNAPSEX_STATE_ROOT -ErrorAction SilentlyContinue
}
