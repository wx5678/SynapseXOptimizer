$ErrorActionPreference = 'Stop'

$keybindStorageBase = if ([string]::IsNullOrWhiteSpace($env:SYNAPSEX_STATE_ROOT)) { Join-Path $env:LOCALAPPDATA 'SynapseX' } else { [IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT) }
$keybindBackupBase = if ([string]::IsNullOrWhiteSpace($env:SYNAPSEX_STATE_ROOT)) { Join-Path $env:LOCALAPPDATA 'SynapseX\state' } else { [IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT) }
$keybindProfileRoot = Join-Path $keybindStorageBase 'keybind-profiles'
$keybindBackupRoot = Join-Path $keybindBackupBase 'keybind-backups'

function Resolve-JiuYinKeybindRoot([string]$GameRoot) {
    if ([string]::IsNullOrWhiteSpace($GameRoot)) {
        $GameRoot = [IO.Path]::Combine('D:\', 'game', ([string]([char]0x6E38) + [char]0x620F + [char]0x8717 + [char]0x725B), '9yinjh')
    }
    $resolved = [IO.Path]::GetFullPath($GameRoot).TrimEnd('\')
    foreach ($relative in @('fxlaunch.exe', 'bin64\system_set.ini')) {
        if (-not (Test-Path -LiteralPath (Join-Path $resolved $relative) -PathType Leaf)) { throw "Invalid JiuYin directory; missing $relative" }
    }
    return $resolved
}

function Assert-JiuYinKeybindGameClosed {
    if (@(Get-Process -Name fxgame -ErrorAction SilentlyContinue).Count -gt 0) { throw 'fxgame.exe is running. Exit the game naturally before saving, applying, deleting, or restoring a keybind profile.' }
}

function Get-KeybindFileHash([string]$Path) {
    $stream = [IO.File]::Open($Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
        $algorithm.Dispose()
        $stream.Dispose()
    }
}

function Get-ShortcutSummary([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return [ordered]@{ exists = $false; size = 0; hash = ''; sectionCount = 0; shortcutBarCount = 0; visibleBarCount = 0 }
    }
    $bytes = [IO.File]::ReadAllBytes($Path)
    $text = [Text.Encoding]::GetEncoding(936).GetString($bytes)
    [ordered]@{
        exists = $true
        size = $bytes.Length
        hash = Get-KeybindFileHash $Path
        sectionCount = @([regex]::Matches($text, '(?m)^\s*\[[^]]+\]\s*$')).Count
        shortcutBarCount = @([regex]::Matches($text, '(?m)^\s*\[grid_shortcut_\d+_\d+\]\s*$')).Count
        visibleBarCount = @([regex]::Matches($text, '(?m)^\s*IsShow\s*=\s*1\s*$')).Count
    }
}

function Get-JiuYinAccountCatalog([string]$Root) {
    $binRoot = Join-Path $Root 'bin64'
    @(
        Get-ChildItem -LiteralPath $binRoot -Directory -ErrorAction Stop |
            Where-Object {
                (Test-Path -LiteralPath (Join-Path $_.FullName 'shortcut.ini') -PathType Leaf) -or
                (Test-Path -LiteralPath (Join-Path $_.FullName 'attach.ini') -PathType Leaf) -or
                (Test-Path -LiteralPath (Join-Path $_.FullName 'form_main.ini') -PathType Leaf)
            } |
            ForEach-Object {
                $shortcutPath = Join-Path $_.FullName 'shortcut.ini'
                $summary = Get-ShortcutSummary $shortcutPath
                $item = Get-Item -LiteralPath $shortcutPath -ErrorAction SilentlyContinue
                [ordered]@{
                    id = $_.Name
                    displayName = $_.Name
                    hasShortcut = [bool]$summary.exists
                    modifiedAt = if ($item) { $item.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss') } else { '' }
                    size = [int]$summary.size
                    hash = [string]$summary.hash
                    sectionCount = [int]$summary.sectionCount
                    shortcutBarCount = [int]$summary.shortcutBarCount
                    visibleBarCount = [int]$summary.visibleBarCount
                }
            } |
            Sort-Object @{ Expression = { $_.modifiedAt }; Descending = $true }, @{ Expression = { $_.id }; Descending = $false }
    )
}

function Get-LocalKeybindProfiles {
    if (-not (Test-Path -LiteralPath $keybindProfileRoot -PathType Container)) { return @() }
    @(
        Get-ChildItem -LiteralPath $keybindProfileRoot -Directory -ErrorAction SilentlyContinue |
            ForEach-Object {
                $manifestPath = Join-Path $_.FullName 'profile.json'
                $shortcutPath = Join-Path $_.FullName 'shortcut.ini'
                if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or -not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) { return }
                try {
                    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
                    $actual = Get-ShortcutSummary $shortcutPath
                    [ordered]@{
                        id = [string]$manifest.id
                        name = [string]$manifest.name
                        createdAt = [string]$manifest.createdAt
                        sourceAccount = [string]$manifest.sourceAccount
                        sourceModifiedAt = [string]$manifest.sourceModifiedAt
                        size = [int]$actual.size
                        hash = [string]$actual.hash
                        sectionCount = [int]$actual.sectionCount
                        shortcutBarCount = [int]$actual.shortcutBarCount
                        visibleBarCount = [int]$actual.visibleBarCount
                        integrityOk = ([string]$manifest.hash -eq [string]$actual.hash)
                    }
                } catch { }
            } |
            Sort-Object createdAt -Descending
    )
}

function Get-JiuYinKeybindCatalog([string]$GameRoot) {
    $root = Resolve-JiuYinKeybindRoot $GameRoot
    $accounts = @(Get-JiuYinAccountCatalog $root)
    [ordered]@{
        gameRoot = $root
        capturedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        gameRunning = (@(Get-Process -Name fxgame -ErrorAction SilentlyContinue).Count -gt 0)
        accounts = $accounts
        profiles = @(Get-LocalKeybindProfiles)
        suggestedSourceAccount = if (@($accounts | Where-Object hasShortcut).Count) { [string]@($accounts | Where-Object hasShortcut)[0].id } else { '' }
        profileDirectory = $keybindProfileRoot
        scope = 'shortcut-layout-only'
        note = 'Copies the local shortcut.ini layout only: positions, rows, visibility, and anchors. Server-side skill contents and bindings are not copied.'
    }
}

function Resolve-JiuYinAccount([string]$Root, [string]$AccountId, [switch]$RequireShortcut) {
    if ([string]::IsNullOrWhiteSpace($AccountId) -or $AccountId.Length -gt 128 -or $AccountId.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0 -or $AccountId -in @('.', '..')) { throw 'Invalid JiuYin account folder.' }
    $binRoot = [IO.Path]::GetFullPath((Join-Path $Root 'bin64')).TrimEnd('\') + '\'
    $accountRoot = [IO.Path]::GetFullPath((Join-Path $binRoot $AccountId))
    if (-not $accountRoot.StartsWith($binRoot, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $accountRoot -PathType Container)) { throw "JiuYin account folder not found: $AccountId" }
    $recognized = (Test-Path -LiteralPath (Join-Path $accountRoot 'shortcut.ini') -PathType Leaf) -or (Test-Path -LiteralPath (Join-Path $accountRoot 'attach.ini') -PathType Leaf) -or (Test-Path -LiteralPath (Join-Path $accountRoot 'form_main.ini') -PathType Leaf)
    if (-not $recognized) { throw "Directory is not a recognized JiuYin account folder: $AccountId" }
    $shortcutPath = Join-Path $accountRoot 'shortcut.ini'
    if ($RequireShortcut -and -not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) { throw "JiuYin account has no saved shortcut layout: $AccountId" }
    [pscustomobject]@{ Id = $AccountId; Root = $accountRoot; ShortcutPath = $shortcutPath }
}

function Write-KeybindJson([string]$Path, $Value) {
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding($false)))
}

function Write-KeybindBytesAtomic([string]$Path, [byte[]]$Bytes) {
    $parent = Split-Path -Parent $Path
    [void](New-Item -ItemType Directory -Path $parent -Force)
    $temporary = Join-Path $parent ('.synapsex-keybind-' + [guid]::NewGuid().ToString('N') + '.tmp')
    try {
        [IO.File]::WriteAllBytes($temporary, $Bytes)
        Move-Item -LiteralPath $temporary -Destination $Path -Force
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
}

function Save-JiuYinKeybindProfile([string]$GameRoot, [string]$AccountId, [string]$Name) {
    Assert-JiuYinKeybindGameClosed
    $root = Resolve-JiuYinKeybindRoot $GameRoot
    $account = Resolve-JiuYinAccount -Root $root -AccountId $AccountId -RequireShortcut
    $cleanName = $Name.Trim()
    if ([string]::IsNullOrWhiteSpace($cleanName) -or $cleanName.Length -gt 40 -or $cleanName -match '[\x00-\x1F]') { throw 'Keybind profile name must contain 1 to 40 visible characters.' }
    if (@(Get-LocalKeybindProfiles | Where-Object { $_.name -ieq $cleanName }).Count -gt 0) { throw 'A keybind profile with the same name already exists.' }
    [void](New-Item -ItemType Directory -Path $keybindProfileRoot -Force)
    $id = [guid]::NewGuid().ToString('N')
    $directory = Join-Path $keybindProfileRoot $id
    [void](New-Item -ItemType Directory -Path $directory)
    try {
        $destination = Join-Path $directory 'shortcut.ini'
        Copy-Item -LiteralPath $account.ShortcutPath -Destination $destination
        $source = Get-Item -LiteralPath $account.ShortcutPath
        $summary = Get-ShortcutSummary $destination
        $manifest = [ordered]@{
            schemaVersion = 1
            id = $id
            name = $cleanName
            createdAt = (Get-Date).ToUniversalTime().ToString('o')
            game = 'JiuYinOnline'
            sourceAccount = $account.Id
            sourceModifiedAt = $source.LastWriteTime.ToUniversalTime().ToString('o')
            file = 'shortcut.ini'
            hash = [string]$summary.hash
            size = [int]$summary.size
            scope = 'shortcut-layout-only'
        }
        Write-KeybindJson (Join-Path $directory 'profile.json') $manifest
    } catch {
        if (Test-Path -LiteralPath $directory) { Remove-Item -LiteralPath $directory -Recurse -Force }
        throw
    }
    [ordered]@{ ok = $true; profileId = $id; catalog = Get-JiuYinKeybindCatalog -GameRoot $root }
}

function Resolve-KeybindProfile([string]$ProfileId) {
    if ($ProfileId -notmatch '^[a-fA-F0-9]{32}$') { throw 'Invalid keybind profile identifier.' }
    $directory = Join-Path $keybindProfileRoot $ProfileId
    $manifestPath = Join-Path $directory 'profile.json'
    $shortcutPath = Join-Path $directory 'shortcut.ini'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf) -or -not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) { throw 'Keybind profile not found.' }
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $summary = Get-ShortcutSummary $shortcutPath
    if ([string]$manifest.id -cne $ProfileId -or [string]$manifest.hash -cne [string]$summary.hash) { throw 'Keybind profile integrity check failed.' }
    [pscustomobject]@{ Id = $ProfileId; Directory = $directory; Manifest = $manifest; ShortcutPath = $shortcutPath; Summary = $summary }
}

function ConvertTo-KeybindInteger($Value, [int]$Fallback = 0) {
    $number = 0
    if ([int]::TryParse(([string]$Value).Trim(), [ref]$number)) { return $number }
    return $Fallback
}

function Get-KeybindIniSections([string]$Path) {
    $bytes = [IO.File]::ReadAllBytes($Path)
    $text = [Text.Encoding]::GetEncoding(936).GetString($bytes)
    $sections = [ordered]@{}
    $current = ''
    foreach ($line in ($text -split "`r?`n")) {
        if ($line -match '^\s*\[([^]]+)\]\s*$') {
            $current = [string]$Matches[1]
            if (-not $sections.Contains($current)) { $sections[$current] = [ordered]@{} }
            continue
        }
        if (-not [string]::IsNullOrWhiteSpace($current) -and $line -match '^\s*([^;#][^=]*?)\s*=\s*(.*)$') {
            $sections[$current][([string]$Matches[1]).Trim()] = ([string]$Matches[2]).Trim()
        }
    }
    return $sections
}

function Get-JiuYinKeybindProfilePreview([string]$GameRoot, [string]$ProfileId) {
    [void](Resolve-JiuYinKeybindRoot $GameRoot)
    $profile = Resolve-KeybindProfile $ProfileId
    $sections = Get-KeybindIniSections $profile.ShortcutPath
    $bars = @(
        foreach ($entry in $sections.GetEnumerator()) {
            if ([string]$entry.Key -notmatch '^grid_shortcut_(\d+)_(\d+)$') { continue }
            $barNumber = ConvertTo-KeybindInteger -Value $Matches[1] -Fallback 0
            $pageNumber = ConvertTo-KeybindInteger -Value $Matches[2] -Fallback 1
            $values = $entry.Value
            $leftRaw = $values['Left']
            $topRaw = $values['Top']
            $columnsRaw = $values['ClomnNum']
            $isShow = [string]($values['IsShow'])
            $horizontalAnchor = [string]($values['HAnchor'])
            $verticalAnchor = [string]($values['VAnchor'])
            $left = ConvertTo-KeybindInteger -Value $leftRaw -Fallback 0
            $top = ConvertTo-KeybindInteger -Value $topRaw -Fallback 0
            $columns = [Math]::Max(1, [Math]::Min(20, (ConvertTo-KeybindInteger -Value $columnsRaw -Fallback 1)))
            [pscustomobject][ordered]@{
                id = [string]$entry.Key
                barNumber = $barNumber
                pageNumber = $pageNumber
                left = $left
                top = $top
                isVisible = ($isShow -ne '0')
                columns = $columns
                horizontalAnchor = if ([string]::IsNullOrWhiteSpace($horizontalAnchor)) { 'Left' } else { $horizontalAnchor }
                verticalAnchor = if ([string]::IsNullOrWhiteSpace($verticalAnchor)) { 'Top' } else { $verticalAnchor }
            }
        }
    ) | Sort-Object barNumber, pageNumber
    [ordered]@{
        id = [string]$profile.Id
        name = [string]$profile.Manifest.name
        sourceAccount = [string]$profile.Manifest.sourceAccount
        createdAt = [string]$profile.Manifest.createdAt
        size = [int]$profile.Summary.size
        hash = [string]$profile.Summary.hash
        sectionCount = [int]$profile.Summary.sectionCount
        shortcutBarCount = [int]$profile.Summary.shortcutBarCount
        visibleBarCount = [int]$profile.Summary.visibleBarCount
        bars = $bars
        coordinateSpace = [ordered]@{ width = 1920; height = 1080; note = 'Layout uses a 1920x1080 reference space. Actual positions adapt to the game resolution through the saved anchors.' }
    }
}

function New-KeybindBackup([string]$Root, [object[]]$Accounts, [string]$ProfileId) {
    [void](New-Item -ItemType Directory -Path $keybindBackupRoot -Force)
    $id = (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
    $directory = Join-Path $keybindBackupRoot $id
    [void](New-Item -ItemType Directory -Path $directory)
    $items = foreach ($account in $Accounts) {
        $existed = Test-Path -LiteralPath $account.ShortcutPath -PathType Leaf
        if ($existed) {
            $accountBackup = Join-Path $directory $account.Id
            [void](New-Item -ItemType Directory -Path $accountBackup)
            Copy-Item -LiteralPath $account.ShortcutPath -Destination (Join-Path $accountBackup 'shortcut.ini')
        }
        [ordered]@{ accountId = $account.Id; existed = $existed; relativePath = if ($existed) { "$($account.Id)\shortcut.ini" } else { '' } }
    }
    $manifest = [ordered]@{ schemaVersion = 1; backupId = $id; createdAt = (Get-Date).ToUniversalTime().ToString('o'); gameRoot = $Root; profileId = $ProfileId; items = @($items) }
    Write-KeybindJson (Join-Path $directory 'backup.json') $manifest
    [pscustomobject]@{ Id = $id; Directory = $directory; Manifest = $manifest }
}

function Set-JiuYinKeybindProfile([string]$GameRoot, [string]$ProfileId, [string[]]$AccountIds) {
    Assert-JiuYinKeybindGameClosed
    $root = Resolve-JiuYinKeybindRoot $GameRoot
    $profile = Resolve-KeybindProfile $ProfileId
    $ids = @($AccountIds | ForEach-Object { ([string]$_).Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    if ($ids.Count -lt 1 -or $ids.Count -gt 100) { throw 'Select between 1 and 100 target accounts.' }
    $accounts = @($ids | ForEach-Object { Resolve-JiuYinAccount -Root $root -AccountId $_ })
    $backup = New-KeybindBackup -Root $root -Accounts $accounts -ProfileId $ProfileId
    $bytes = [IO.File]::ReadAllBytes($profile.ShortcutPath)
    try {
        foreach ($account in $accounts) {
            Write-KeybindBytesAtomic -Path $account.ShortcutPath -Bytes $bytes
            $writtenHash = Get-KeybindFileHash $account.ShortcutPath
            if ($writtenHash -cne [string]$profile.Summary.hash) { throw "Keybind profile verification failed for account: $($account.Id)" }
        }
    } catch {
        foreach ($item in @($backup.Manifest.items)) {
            $account = Resolve-JiuYinAccount -Root $root -AccountId ([string]$item.accountId)
            if ([bool]$item.existed) { Copy-Item -LiteralPath (Join-Path $backup.Directory ([string]$item.relativePath)) -Destination $account.ShortcutPath -Force }
            elseif (Test-Path -LiteralPath $account.ShortcutPath) { Remove-Item -LiteralPath $account.ShortcutPath -Force }
        }
        throw
    }
    [ordered]@{ ok = $true; backupId = $backup.Id; changedCount = $accounts.Count; catalog = Get-JiuYinKeybindCatalog -GameRoot $root }
}

function Get-KeybindBackups([string]$Root) {
    if (-not (Test-Path -LiteralPath $keybindBackupRoot -PathType Container)) { return @() }
    @(
        Get-ChildItem -LiteralPath $keybindBackupRoot -Directory -ErrorAction SilentlyContinue |
            ForEach-Object {
                $manifestPath = Join-Path $_.FullName 'backup.json'
                if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { return }
                try {
                    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
                    if ([IO.Path]::GetFullPath([string]$manifest.gameRoot).TrimEnd('\') -ieq $Root.TrimEnd('\')) { [pscustomobject]@{ Directory = $_.FullName; Manifest = $manifest; Name = $_.Name } }
                } catch { }
            } |
            Sort-Object Name -Descending
    )
}

function Restore-JiuYinKeybindBackup([string]$GameRoot, [string]$BackupId = 'latest') {
    Assert-JiuYinKeybindGameClosed
    $root = Resolve-JiuYinKeybindRoot $GameRoot
    $backups = @(Get-KeybindBackups $root)
    if ($backups.Count -eq 0) { throw 'No SynapseX keybind backup exists.' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object Name -eq $BackupId | Select-Object -First 1 }
    if ($null -eq $selected) { throw "Keybind backup not found: $BackupId" }
    $restored = 0
    foreach ($item in @($selected.Manifest.items)) {
        $account = Resolve-JiuYinAccount -Root $root -AccountId ([string]$item.accountId)
        if ([bool]$item.existed) {
            $source = Join-Path $selected.Directory ([string]$item.relativePath)
            if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Keybind backup file is missing for account: $($account.Id)" }
            Write-KeybindBytesAtomic -Path $account.ShortcutPath -Bytes ([IO.File]::ReadAllBytes($source))
        } elseif (Test-Path -LiteralPath $account.ShortcutPath -PathType Leaf) {
            Remove-Item -LiteralPath $account.ShortcutPath -Force
        }
        $restored++
    }
    [ordered]@{ ok = $true; backupId = $selected.Name; restoredCount = $restored; catalog = Get-JiuYinKeybindCatalog -GameRoot $root }
}

function Remove-JiuYinKeybindProfile([string]$GameRoot, [string]$ProfileId) {
    Assert-JiuYinKeybindGameClosed
    $root = Resolve-JiuYinKeybindRoot $GameRoot
    $profile = Resolve-KeybindProfile $ProfileId
    Remove-Item -LiteralPath $profile.Directory -Recurse -Force
    [ordered]@{ ok = $true; profileId = $ProfileId; catalog = Get-JiuYinKeybindCatalog -GameRoot $root }
}

Export-ModuleMember -Function Get-JiuYinKeybindCatalog, Get-JiuYinKeybindProfilePreview, Save-JiuYinKeybindProfile, Set-JiuYinKeybindProfile, Restore-JiuYinKeybindBackup, Remove-JiuYinKeybindProfile
