$ErrorActionPreference = 'Stop'
$manifestPath = Join-Path $PSScriptRoot 'visual-tradeoff-profiles.json'
$stateRoot = if ([string]::IsNullOrWhiteSpace($env:SYNAPSEX_STATE_ROOT)) { Join-Path $env:LOCALAPPDATA 'SynapseX\state\visual-profile-backups' } else { Join-Path ([IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT)) 'visual-profile-backups' }

function Resolve-JiuYinRoot([string]$GameRoot) {
    if ([string]::IsNullOrWhiteSpace($GameRoot)) {
        throw '请先选择本机的九阴真经安装目录，不使用其他电脑的默认路径。'
    }
    $resolved = [IO.Path]::GetFullPath($GameRoot)
    foreach ($relative in @('fxlaunch.exe', 'bin64\system_set.ini', 'bin64\systeminfo.ini')) {
        $required = Join-Path $resolved $relative
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Invalid JiuYin directory; missing $relative" }
    }
    return $resolved
}

function Get-Manifest { Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json }

function Get-Profile([string]$Id) {
    $manifest = Get-Manifest
    $matches = @($manifest.profiles | Where-Object id -eq $Id)
    if ($matches.Count -ne 1) { throw "Unknown profile: $Id" }
    [pscustomobject]@{ Manifest = $manifest; Profile = $matches[0] }
}

function Get-ConfigPaths([string]$Root) {
    @{ 'system_set.ini' = Join-Path $Root 'bin64\system_set.ini'; 'systeminfo.ini' = Join-Path $Root 'bin64\systeminfo.ini' }
}

function Read-TextDocument([string]$Path) {
    $bytes = [IO.File]::ReadAllBytes($Path)
    $encoding = $null; $preamble = 0
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { $encoding = New-Object Text.UTF8Encoding($true, $true); $preamble = 3 }
    elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { $encoding = New-Object Text.UnicodeEncoding($false, $true, $true); $preamble = 2 }
    else {
        try { $encoding = New-Object Text.UTF8Encoding($false, $true); [void]$encoding.GetString($bytes) }
        catch { $encoding = [Text.Encoding]::GetEncoding(936) }
    }
    [pscustomobject]@{ Path = $Path; Text = $encoding.GetString($bytes, $preamble, $bytes.Length - $preamble); Encoding = $encoding; HasBom = ($preamble -gt 0) }
}

function Get-IniValue([string]$Text, [string]$Section, [string]$Key) {
    $current = $null
    foreach ($line in ($Text -split "`r?`n")) {
        if ($line -match '^\s*\[([^]]+)\]\s*$') { $current = $Matches[1]; continue }
        if ($current -eq $Section -and $line -match '^\s*([^;#][^=]*?)\s*=\s*(.*)$' -and $Matches[1].Trim() -eq $Key) { return $Matches[2].Trim() }
    }
    return $null
}

function Set-IniValue([string]$Text, [string]$Section, [string]$Key, [string]$Value) {
    $newline = if ($Text.Contains("`r`n")) { "`r`n" } else { "`n" }
    $lines = $Text -split "`r?`n", -1; $current = $null; $found = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        if ($lines[$index] -match '^\s*\[([^]]+)\]\s*$') { $current = $Matches[1]; continue }
        if ($current -eq $Section -and $lines[$index] -match '^(\s*)([^;#][^=]*?)(\s*)=(\s*)(.*)$' -and $Matches[2].Trim() -eq $Key) {
            $lines[$index] = $Matches[1] + $Matches[2].TrimEnd() + $Matches[3] + '=' + $Matches[4] + $Value; $found = $true; break
        }
    }
    if (-not $found) {
        $header = [regex]::Match($Text, '(?m)^\s*\[' + [regex]::Escape($Section) + '\]\s*$')
        if (-not $header.Success) { throw "Required INI section not found: [$Section]" }
        return $Text.Insert($header.Index + $header.Length, ($newline + $Key + '=' + $Value))
    }
    return ($lines -join $newline)
}

function Write-TextDocumentAtomic($Document) {
    $temporary = Join-Path (Split-Path -Parent $Document.Path) ('.synapsex-' + [guid]::NewGuid().ToString('N') + '.tmp')
    try {
        $body = $Document.Encoding.GetBytes($Document.Text)
        if ($Document.HasBom) { $bom = $Document.Encoding.GetPreamble(); $output = New-Object byte[] ($bom.Length + $body.Length); [Buffer]::BlockCopy($bom, 0, $output, 0, $bom.Length); [Buffer]::BlockCopy($body, 0, $output, $bom.Length, $body.Length) } else { $output = $body }
        [IO.File]::WriteAllBytes($temporary, $output)
        Move-Item -LiteralPath $temporary -Destination $Document.Path -Force
    } finally { if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force } }
}

function Get-ProtectedSnapshot([string]$Root, $Manifest) {
    $paths = Get-ConfigPaths $Root; $documents = @{}
    foreach ($name in $paths.Keys) { $documents[$name] = Read-TextDocument $paths[$name] }
    @($Manifest.protectedSettings | ForEach-Object { [pscustomobject]@{ file = $_.file; section = $_.section; key = $_.key; value = Get-IniValue $documents[$_.file].Text $_.section $_.key; reason = $_.reason } })
}

function Get-JiuYinProfilePreview([string]$GameRoot, [string]$ProfileId) {
    $root = Resolve-JiuYinRoot $GameRoot; $definition = Get-Profile $ProfileId; $paths = Get-ConfigPaths $root
    $changes = @($definition.Profile.changes | ForEach-Object { $document = Read-TextDocument $paths[$_.file]; [pscustomobject]@{ file = $_.file; section = $_.section; key = $_.key; current = Get-IniValue $document.Text $_.section $_.key; proposed = [string]$_.value } })
    [pscustomobject]@{ id = $definition.Profile.id; displayName = $definition.Profile.displayName; expectedTarget = $definition.Profile.expectedTarget; tradeoff = $definition.Profile.tradeoff; confidence = $definition.Profile.confidence; protectedSettings = @(Get-ProtectedSnapshot $root $definition.Manifest); changes = $changes }
}

function Get-JiuYinConfigCatalog([string]$GameRoot) {
    $root = Resolve-JiuYinRoot $GameRoot
    $manifest = Get-Manifest
    $paths = Get-ConfigPaths $root
    $documents = @{}
    foreach ($name in $paths.Keys) { $documents[$name] = Read-TextDocument $paths[$name] }
    $settings = @($manifest.editableSettings | ForEach-Object {
        $current = Get-IniValue $documents[$_.file].Text $_.section $_.key
        [ordered]@{
            id = [string]$_.id
            file = [string]$_.file
            section = [string]$_.section
            key = [string]$_.key
            name = [string]$_.name
            description = [string]$_.description
            current = $current
            inputType = if ([string]::IsNullOrWhiteSpace([string]$_.inputType)) { 'select' } else { [string]$_.inputType }
            minimum = if ($null -eq $_.minimum) { $null } else { [long]$_.minimum }
            maximum = if ($null -eq $_.maximum) { $null } else { [long]$_.maximum }
            step = if ($null -eq $_.step) { $null } else { [long]$_.step }
            advanced = [bool]$_.advanced
            values = @($_.values | ForEach-Object { [ordered]@{ value = [string]$_.value; label = [string]$_.label } })
        }
    })
    [ordered]@{
        gameRoot = $root
        capturedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        gameRunning = (@(Get-Process -Name fxgame -ErrorAction SilentlyContinue).Count -gt 0)
        settings = $settings
        protectedSettings = @(Get-ProtectedSnapshot $root $manifest)
        profiles = @($manifest.profiles | ForEach-Object { [ordered]@{ id = [string]$_.id; displayName = [string]$_.displayName; description = [string]$_.expectedTarget; tradeoff = [string]$_.tradeoff; changeCount = @($_.changes).Count } })
        note = '当前值直接读取自游戏 INI。只写入用户实际改动的项目；应用前自动备份两份配置文件，游戏程序文件不会修改。'
    }
}

function Assert-GameClosed { if (@(Get-Process -Name fxgame -ErrorAction SilentlyContinue).Count -gt 0) { throw 'fxgame.exe is running. Exit the game naturally before applying or restoring.' } }

function New-ProfileBackup([string]$Root, [string]$ProfileId, $Manifest) {
    [void](New-Item -ItemType Directory -Path $stateRoot -Force)
    $id = Get-Date -Format 'yyyyMMdd-HHmmss-fff'; $directory = Join-Path $stateRoot $id; [void](New-Item -ItemType Directory -Path $directory)
    $paths = Get-ConfigPaths $Root
    Copy-Item -LiteralPath $paths['system_set.ini'] -Destination (Join-Path $directory 'system_set.ini')
    Copy-Item -LiteralPath $paths['systeminfo.ini'] -Destination (Join-Path $directory 'systeminfo.ini')
    $metadata = [ordered]@{ schemaVersion = 1; backupId = $id; createdAt = (Get-Date).ToUniversalTime().ToString('o'); gameRoot = $Root; requestedProfile = $ProfileId; protectedSnapshot = @(Get-ProtectedSnapshot $Root $Manifest) }
    [IO.File]::WriteAllText((Join-Path $directory 'backup.json'), ($metadata | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
    [pscustomobject]@{ Id = $id; Directory = $directory }
}

function Set-JiuYinProfile([string]$GameRoot, [string]$ProfileId) {
    Assert-GameClosed
    $root = Resolve-JiuYinRoot $GameRoot; $definition = Get-Profile $ProfileId; $paths = Get-ConfigPaths $root
    $before = @(Get-ProtectedSnapshot $root $definition.Manifest); $backup = New-ProfileBackup $root $ProfileId $definition.Manifest; $documents = @{}
    foreach ($name in $paths.Keys) { $documents[$name] = Read-TextDocument $paths[$name] }
    try {
        foreach ($change in $definition.Profile.changes) { $documents[$change.file].Text = Set-IniValue $documents[$change.file].Text $change.section $change.key ([string]$change.value) }
        foreach ($name in $documents.Keys) { Write-TextDocumentAtomic $documents[$name] }
        $after = @(Get-ProtectedSnapshot $root $definition.Manifest)
        foreach ($item in $before) { $match = $after | Where-Object { $_.file -eq $item.file -and $_.key -eq $item.key } | Select-Object -First 1; if ($null -eq $match -or $match.value -ne $item.value) { throw "Protected setting changed unexpectedly: $($item.key)" } }
    } catch {
        Copy-Item -LiteralPath (Join-Path $backup.Directory 'system_set.ini') -Destination $paths['system_set.ini'] -Force
        Copy-Item -LiteralPath (Join-Path $backup.Directory 'systeminfo.ini') -Destination $paths['systeminfo.ini'] -Force
        throw
    }
    [pscustomobject]@{ ok = $true; backupId = $backup.Id }
}

function Set-JiuYinCustomSettings([string]$GameRoot, [object[]]$Changes) {
    Assert-GameClosed
    $root = Resolve-JiuYinRoot $GameRoot
    $manifest = Get-Manifest
    $requested = @($Changes)
    if ($requested.Count -lt 1 -or $requested.Count -gt 20) { throw 'Custom JiuYin changes must contain between 1 and 20 items.' }
    $ids = @($requested | ForEach-Object { [string]$_.id })
    if (@($ids | Sort-Object -Unique).Count -ne $ids.Count) { throw 'Custom JiuYin changes contain duplicate keys.' }

    $validated = foreach ($change in $requested) {
        $definition = @($manifest.editableSettings | Where-Object id -eq ([string]$change.id) | Select-Object -First 1)[0]
        if ($null -eq $definition) { throw "Unsupported JiuYin setting: $([string]$change.id)" }
        $value = [string]$change.value
        $inputType = if ([string]::IsNullOrWhiteSpace([string]$definition.inputType)) { 'select' } else { [string]$definition.inputType }
        if ($inputType -eq 'integer') {
            if ($value -notmatch '^\d+$') { throw "JiuYin setting must be an integer: $([string]$change.id)" }
            $number = [long]$value
            $minimum = [long]$definition.minimum
            $maximum = [long]$definition.maximum
            if ($number -lt $minimum -or $number -gt $maximum) { throw "JiuYin setting is outside the allowed range: $([string]$change.id)" }
            $value = $number.ToString([Globalization.CultureInfo]::InvariantCulture)
        } elseif (@($definition.values | Where-Object { [string]$_.value -ceq $value }).Count -ne 1) {
            throw "Unsupported value for JiuYin setting: $([string]$change.id)"
        }
        [ordered]@{ id = [string]$definition.id; file = [string]$definition.file; section = [string]$definition.section; key = [string]$definition.key; value = $value }
    }

    $paths = Get-ConfigPaths $root
    $before = @(Get-ProtectedSnapshot $root $manifest)
    $backup = New-ProfileBackup $root 'custom' $manifest
    $documents = @{}
    foreach ($name in $paths.Keys) { $documents[$name] = Read-TextDocument $paths[$name] }
    try {
        foreach ($change in @($validated)) { $documents[$change.file].Text = Set-IniValue $documents[$change.file].Text $change.section $change.key $change.value }
        foreach ($name in $documents.Keys) { Write-TextDocumentAtomic $documents[$name] }
        $after = @(Get-ProtectedSnapshot $root $manifest)
        foreach ($item in $before) {
            $match = $after | Where-Object { $_.file -eq $item.file -and $_.section -eq $item.section -and $_.key -eq $item.key } | Select-Object -First 1
            if ($null -eq $match -or $match.value -ne $item.value) { throw "Protected setting changed unexpectedly: $($item.key)" }
        }
    } catch {
        Copy-Item -LiteralPath (Join-Path $backup.Directory 'system_set.ini') -Destination $paths['system_set.ini'] -Force
        Copy-Item -LiteralPath (Join-Path $backup.Directory 'systeminfo.ini') -Destination $paths['systeminfo.ini'] -Force
        throw
    }
    [ordered]@{ ok = $true; backupId = $backup.Id; changedCount = @($validated).Count; catalog = Get-JiuYinConfigCatalog -GameRoot $root }
}

function Restore-JiuYinProfile([string]$GameRoot, [string]$BackupId = 'latest') {
    Assert-GameClosed
    $root = Resolve-JiuYinRoot $GameRoot
    $backups = @(Get-ChildItem -LiteralPath $stateRoot -Directory -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'backup.json') } | Sort-Object Name -Descending)
    if ($backups.Count -eq 0) { throw 'No SynapseX visual-profile backup exists.' }
    $selected = if ($BackupId -eq 'latest') { $backups[0] } else { $backups | Where-Object Name -eq $BackupId | Select-Object -First 1 }
    if ($null -eq $selected) { throw "Backup not found: $BackupId" }
    $metadata = Get-Content -LiteralPath (Join-Path $selected.FullName 'backup.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ([IO.Path]::GetFullPath([string]$metadata.gameRoot) -ne $root) { throw 'Backup belongs to another game directory.' }
    $paths = Get-ConfigPaths $root
    Copy-Item -LiteralPath (Join-Path $selected.FullName 'system_set.ini') -Destination $paths['system_set.ini'] -Force
    Copy-Item -LiteralPath (Join-Path $selected.FullName 'systeminfo.ini') -Destination $paths['systeminfo.ini'] -Force
    [pscustomobject]@{ ok = $true; backupId = $selected.Name }
}

Export-ModuleMember -Function Resolve-JiuYinRoot, Get-JiuYinProfilePreview, Get-JiuYinConfigCatalog, Set-JiuYinProfile, Set-JiuYinCustomSettings, Restore-JiuYinProfile
