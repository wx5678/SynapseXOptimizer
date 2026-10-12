[CmdletBinding()]
param([string]$SourceGameRoot, [switch]$MockClosedGame)

$ErrorActionPreference = 'Stop'
$testsRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
$caseRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runtime-profile-case'))
$stateRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runtime-profile-state'))
if (-not $caseRoot.StartsWith($testsRoot, [StringComparison]::OrdinalIgnoreCase) -or -not $stateRoot.StartsWith($testsRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test path.' }

if ([string]::IsNullOrWhiteSpace($SourceGameRoot)) {
    $SourceGameRoot = [IO.Path]::Combine('D:\', 'game', ([string]([char]0x6E38) + [char]0x620F + [char]0x8717 + [char]0x725B), '9yinjh')
}

try {
    if (Test-Path -LiteralPath $caseRoot) { Remove-Item -LiteralPath $caseRoot -Recurse -Force }
    if (Test-Path -LiteralPath $stateRoot) { Remove-Item -LiteralPath $stateRoot -Recurse -Force }
    [void](New-Item -ItemType Directory -Path (Join-Path $caseRoot 'bin64') -Force)
    Copy-Item -LiteralPath (Join-Path $SourceGameRoot 'fxlaunch.exe') -Destination (Join-Path $caseRoot 'fxlaunch.exe')
    Copy-Item -LiteralPath (Join-Path $SourceGameRoot 'bin64\system_set.ini') -Destination (Join-Path $caseRoot 'bin64\system_set.ini')
    Copy-Item -LiteralPath (Join-Path $SourceGameRoot 'bin64\systeminfo.ini') -Destination (Join-Path $caseRoot 'bin64\systeminfo.ini')

    $env:SYNAPSEX_STATE_ROOT = $stateRoot
    Import-Module (Join-Path (Split-Path -Parent $PSScriptRoot) 'host\modules\JiuYinProfile.psm1') -Force
    if ($MockClosedGame) {
        & (Get-Module JiuYinProfile) {
            param($FixtureRoot)
            $script:fixtureRoot=$FixtureRoot
            $script:originalResolve=${function:Resolve-JiuYinRoot}
            function script:Resolve-JiuYinRoot([string]$GameRoot) {
                if ([IO.Path]::GetFullPath($GameRoot) -ine $script:fixtureRoot) { throw 'Mock may only address the copied fixture' }
                & $script:originalResolve $GameRoot
            }
            function script:Assert-GameClosed { }
        } $caseRoot
    }
    $catalog = Get-JiuYinConfigCatalog -GameRoot $caseRoot
    if (@($catalog.settings).Count -ne 15 -or @($catalog.protectedSettings).Count -ne 0) { throw 'JiuYin custom catalog schema is invalid.' }
    if (@($catalog.settings | Where-Object id -eq 'weather_enable').Count -ne 1) { throw 'JiuYin weather setting is missing.' }
    $before = Get-JiuYinProfilePreview -GameRoot $caseRoot -ProfileId 'shadow-only'
    $applied = Set-JiuYinProfile -GameRoot $caseRoot -ProfileId 'shadow-only'
    $after = Get-JiuYinProfilePreview -GameRoot $caseRoot -ProfileId 'shadow-only'
    $restored = Restore-JiuYinProfile -GameRoot $caseRoot -BackupId 'latest'
    $final = Get-JiuYinProfilePreview -GameRoot $caseRoot -ProfileId 'shadow-only'

    if ($after.changes[0].current -ne '0') { throw 'Apply verification failed.' }
    if ($final.changes[0].current -ne $before.changes[0].current) { throw 'Restore verification failed.' }

    $customDefinition = @($catalog.settings | Where-Object id -eq 'showself_guild')[0]
    $customValue = if ([string]$customDefinition.current -eq '0') { '1' } else { '0' }
    $radiusDefinition = @($catalog.settings | Where-Object id -eq 'visual_radius')[0]
    $radiusCurrent = [long]$radiusDefinition.current
    $radiusValue = if ($radiusCurrent -lt [long]$radiusDefinition.maximum) { ($radiusCurrent + 1).ToString() } else { ($radiusCurrent - 1).ToString() }
    $customApplied = Set-JiuYinCustomSettings -GameRoot $caseRoot -Changes @(
        [pscustomobject]@{ id = 'showself_guild'; value = $customValue },
        [pscustomobject]@{ id = 'visual_radius'; value = $radiusValue }
    )
    $customCatalog = Get-JiuYinConfigCatalog -GameRoot $caseRoot
    if ([string](@($customCatalog.settings | Where-Object id -eq 'showself_guild')[0].current) -ne $customValue) { throw 'Custom setting apply verification failed.' }
    if ([string](@($customCatalog.settings | Where-Object id -eq 'visual_radius')[0].current) -ne $radiusValue) { throw 'Numeric custom setting apply verification failed.' }
    [void](Restore-JiuYinProfile -GameRoot $caseRoot -BackupId $customApplied.backupId)
    $customFinal = Get-JiuYinConfigCatalog -GameRoot $caseRoot
    if ([string](@($customFinal.settings | Where-Object id -eq 'showself_guild')[0].current) -ne [string]$customDefinition.current) { throw 'Custom setting restore verification failed.' }
    if ([string](@($customFinal.settings | Where-Object id -eq 'visual_radius')[0].current) -ne [string]$radiusDefinition.current) { throw 'Numeric custom setting restore verification failed.' }

    [pscustomobject]@{ Passed = $true; CatalogSettings = @($catalog.settings).Count; BeforeShadow = $before.changes[0].current; AfterShadow = $after.changes[0].current; RestoredShadow = $final.changes[0].current; CustomRoundTrip = $true; NumericRoundTrip = $true; BackupId = $applied.backupId; RestoredId = $restored.backupId }
}
finally {
    Remove-Module JiuYinProfile -ErrorAction SilentlyContinue
    Remove-Item Env:SYNAPSEX_STATE_ROOT -ErrorAction SilentlyContinue
    if ($caseRoot.StartsWith($testsRoot, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $caseRoot)) { Remove-Item -LiteralPath $caseRoot -Recurse -Force }
    if ($stateRoot.StartsWith($testsRoot, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $stateRoot)) { Remove-Item -LiteralPath $stateRoot -Recurse -Force }
}
