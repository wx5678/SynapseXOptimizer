$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '..\host\modules\GameDiscovery.psm1') -Force
$module = Get-Module GameDiscovery
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('synapsex-discovery-' + [guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory((Join-Path $fixture 'bin64'))
[IO.File]::WriteAllText((Join-Path $fixture 'fxlaunch.exe'), 'test only')
[IO.File]::WriteAllText((Join-Path $fixture 'bin64\fxgame.exe'), 'test only')
try {
    & $module { function script:Get-Process { @() } }
    $before = Get-JiuYinLocation
    if ($before.gameRoot -or $before.gameExecutable) { throw 'Empty discovery should not invent a path' }
    $saved = Get-JiuYinLocation -Root $fixture
    if ($saved.gameRoot -ne $fixture -or -not $saved.gameExecutable.EndsWith('bin64\fxgame.exe')) { throw 'Saved root should work without running game' }
    $missing = Get-JiuYinLocation -Root (Join-Path $fixture 'missing')
    if ($missing.gameExecutable) { throw 'Missing directory must not be accepted' }
    & $module { Remove-Item Function:Get-Process }
    $live = Get-JiuYinLocation
    if (@(Get-Process fxgame -ErrorAction SilentlyContinue).Count -gt 0) {
        if (-not $live.gameExecutable) { throw 'Live game path could not be resolved' }
        if (-not (Test-Path -LiteralPath $live.gameExecutable -PathType Leaf)) { throw 'Detected executable does not exist' }
    }
    [pscustomobject]@{ NoGame='passed'; SavedDirectory='passed'; MissingDirectory='passed'; LiveDiscoveryAfterEmptyResult=$live.gameExecutable } | ConvertTo-Json -Compress
} finally {
    # Only exact files and empty directories created by this test.
    [IO.File]::Delete((Join-Path $fixture 'bin64\fxgame.exe'))
    [IO.File]::Delete((Join-Path $fixture 'fxlaunch.exe'))
    [IO.Directory]::Delete((Join-Path $fixture 'bin64'))
    [IO.Directory]::Delete($fixture)
}
