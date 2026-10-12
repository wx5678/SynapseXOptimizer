[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$testsRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
$caseRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runtime-keybind-case'))
$stateRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runtime-keybind-state'))
if (-not $caseRoot.StartsWith($testsRoot, [StringComparison]::OrdinalIgnoreCase) -or -not $stateRoot.StartsWith($testsRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe test path.' }

try {
    if (Test-Path -LiteralPath $caseRoot) { Remove-Item -LiteralPath $caseRoot -Recurse -Force }
    if (Test-Path -LiteralPath $stateRoot) { Remove-Item -LiteralPath $stateRoot -Recurse -Force }
    [void](New-Item -ItemType Directory -Path (Join-Path $caseRoot 'bin64\account-a') -Force)
    [void](New-Item -ItemType Directory -Path (Join-Path $caseRoot 'bin64\account-b') -Force)
    [void](New-Item -ItemType Directory -Path (Join-Path $caseRoot 'bin64\account-c') -Force)
    [IO.File]::WriteAllBytes((Join-Path $caseRoot 'fxlaunch.exe'), [byte[]](0))
    [IO.File]::WriteAllText((Join-Path $caseRoot 'bin64\system_set.ini'), "[main]`r`nName=test`r`n", [Text.Encoding]::ASCII)
    [IO.File]::WriteAllText((Join-Path $caseRoot 'bin64\account-a\shortcut.ini'), "[grid_shortcut_1_1]`r`nLeft=-244`r`nTop=-130`r`nIsShow=1`r`nClomnNum=10`r`nHAnchor=Center`r`nVAnchor=Bottom`r`n`r`n[grid_shortcut_2_1]`r`nLeft=24`r`nTop=60`r`nIsShow=0`r`nClomnNum=5`r`nHAnchor=Left`r`nVAnchor=Top`r`n`r`n[grid_shortcut_info_1]`r`nShowEmpty=1`r`n", [Text.Encoding]::ASCII)
    [IO.File]::WriteAllText((Join-Path $caseRoot 'bin64\account-b\shortcut.ini'), "[grid_shortcut_1_1]`r`nLeft=99`r`nIsShow=0`r`n", [Text.Encoding]::ASCII)
    [IO.File]::WriteAllText((Join-Path $caseRoot 'bin64\account-c\attach.ini'), "[AutoAttach]`r`n", [Text.Encoding]::ASCII)

    $originalB = [IO.File]::ReadAllBytes((Join-Path $caseRoot 'bin64\account-b\shortcut.ini'))
    $env:SYNAPSEX_STATE_ROOT = $stateRoot
    Import-Module (Join-Path (Split-Path -Parent $PSScriptRoot) 'host\modules\JiuYinKeybindProfiles.psm1') -Force

    $catalog = Get-JiuYinKeybindCatalog -GameRoot $caseRoot
    if (@($catalog.accounts).Count -ne 3 -or @($catalog.profiles).Count -ne 0) { throw 'Initial keybind catalog is invalid.' }
    $saved = Save-JiuYinKeybindProfile -GameRoot $caseRoot -AccountId 'account-a' -Name 'Test profile'
    if (@($saved.catalog.profiles).Count -ne 1 -or -not [bool]$saved.catalog.profiles[0].integrityOk) { throw 'Saved profile catalog is invalid.' }
    $preview = Get-JiuYinKeybindProfilePreview -GameRoot $caseRoot -ProfileId $saved.profileId
    if (@($preview.bars).Count -ne 2 -or $preview.bars[0].columns -ne 10 -or -not $preview.bars[0].isVisible -or $preview.bars[1].isVisible) { throw "Keybind layout preview is invalid: $($preview | ConvertTo-Json -Depth 6 -Compress)" }
    if ($preview.bars[0].horizontalAnchor -ne 'Center' -or $preview.bars[0].verticalAnchor -ne 'Bottom') { throw 'Keybind preview anchors are invalid.' }

    $duplicateRejected = $false
    try { [void](Save-JiuYinKeybindProfile -GameRoot $caseRoot -AccountId 'account-a' -Name 'Test profile') } catch { $duplicateRejected = $_.Exception.Message -match 'same name' }
    if (-not $duplicateRejected) { throw 'Duplicate profile name was not rejected.' }

    $applied = Set-JiuYinKeybindProfile -GameRoot $caseRoot -ProfileId $saved.profileId -AccountIds @('account-b', 'account-c')
    if ($applied.changedCount -ne 2) { throw 'Keybind apply count is invalid.' }
    $sourceHash = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $caseRoot 'bin64\account-a\shortcut.ini')))
    foreach ($account in @('account-b', 'account-c')) {
        $targetHash = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $caseRoot "bin64\$account\shortcut.ini")))
        if ($targetHash -ne $sourceHash) { throw "Keybind apply verification failed for $account." }
    }

    $restored = Restore-JiuYinKeybindBackup -GameRoot $caseRoot -BackupId 'latest'
    if ($restored.restoredCount -ne 2) { throw 'Keybind restore count is invalid.' }
    if ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $caseRoot 'bin64\account-b\shortcut.ini'))) -ne [Convert]::ToBase64String($originalB)) { throw 'Existing target was not restored byte-for-byte.' }
    if (Test-Path -LiteralPath (Join-Path $caseRoot 'bin64\account-c\shortcut.ini')) { throw 'Newly created target was not removed during restore.' }

    $deleted = Remove-JiuYinKeybindProfile -GameRoot $caseRoot -ProfileId $saved.profileId
    if (@($deleted.catalog.profiles).Count -ne 0) { throw 'Deleted keybind profile is still listed.' }

    [pscustomobject]@{
        Passed = $true
        Accounts = @($catalog.accounts).Count
        SavedProfile = $saved.profileId
        AppliedAccounts = $applied.changedCount
        RestoredAccounts = $restored.restoredCount
        DuplicateNameRejected = $duplicateRejected
        PreviewBars = @($preview.bars).Count
        ByteExactRoundTrip = $true
    }
}
finally {
    Remove-Module JiuYinKeybindProfiles -ErrorAction SilentlyContinue
    Remove-Item Env:SYNAPSEX_STATE_ROOT -ErrorAction SilentlyContinue
    if ($caseRoot.StartsWith($testsRoot, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $caseRoot)) { Remove-Item -LiteralPath $caseRoot -Recurse -Force }
    if ($stateRoot.StartsWith($testsRoot, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $stateRoot)) { Remove-Item -LiteralPath $stateRoot -Recurse -Force }
}
