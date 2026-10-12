$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('Maintenance-Fixture-'+[guid]::NewGuid().ToString('N'))
$previousState=$env:SYNAPSEX_STATE_ROOT
$env:SYNAPSEX_STATE_ROOT=Join-Path $fixtureRoot 'state'
New-Item -ItemType Directory -Path (Join-Path $fixtureRoot 'files'),(Join-Path $fixtureRoot 'outside') -Force|Out-Null
foreach($name in @('delete.tmp','locked.log','changed.tmp','recent.tmp','keep.txt','readonly.tmp','codex-keep.tmp')){
    $target=Join-Path $fixtureRoot ('files\'+$name)
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixtures/maintenance/sample.tmp') -Destination $target
    if($name -ne 'recent.tmp'){[IO.File]::SetLastWriteTimeUtc($target,[DateTime]::UtcNow.AddDays(-40))}
}
(Get-Item -LiteralPath (Join-Path $fixtureRoot 'files\readonly.tmp')).IsReadOnly=$true
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixtures/maintenance/sample.tmp') -Destination (Join-Path $fixtureRoot 'outside\outside.tmp')
[IO.File]::SetLastWriteTimeUtc((Join-Path $fixtureRoot 'outside\outside.tmp'),[DateTime]::UtcNow.AddDays(-40))
New-Item -ItemType Junction -Path (Join-Path $fixtureRoot 'files\junction') -Target (Join-Path $fixtureRoot 'outside') | Out-Null
$module=Import-Module (Join-Path $repo 'host/modules/MaintenanceManager.psm1') -Force -PassThru
try{
    # Real registry enumeration only. All launches below are mocked.
    $native=Get-DesktopCatalog
    if(!$native.account -or !$native.capturedAt){throw 'Missing desktop metadata'}
    & $module {
        param($FixtureRoot)
        $script:fixture=$FixtureRoot
        function script:Get-CleanupRoots {Join-Path $script:fixture 'files'}
        function Assert-Blocked($Work){$blocked=$false;try{& $Work|Out-Null}catch{$blocked=$true};if(!$blocked){throw 'Expected refusal did not happen'}}
        $scan=Get-CleanupPreview 7
        if($scan.items.Count -ne 3){throw "Expected three candidates, got $($scan.items.Count)"}
        if(!(Test-Path -LiteralPath (Join-Path $FixtureRoot 'files\delete.tmp'))){throw 'Scan deleted a file'}
        if(Test-CleanupPath (Join-Path $FixtureRoot 'outside\outside.tmp') (Join-Path $FixtureRoot 'files')){throw 'Outside root allowed'}
        if(Test-CleanupPath (Join-Path $FixtureRoot 'files\junction\outside.tmp') (Join-Path $FixtureRoot 'files')){throw 'Junction allowed'}
        Assert-Blocked {Remove-CleanupSelection $scan.token @('unknown')}
        Assert-Blocked {Remove-CleanupSelection $scan.token @()}
        Assert-Blocked {Get-CleanupPreview 0}
        $script:previews[$scan.token].expires=[DateTime]::UtcNow.AddSeconds(-1)
        Assert-Blocked {Remove-CleanupSelection $scan.token @($scan.items[0].id)}
        $scan=Get-CleanupPreview 7
        $lockedPath=Join-Path $FixtureRoot 'files\locked.log'
        $handle=[IO.File]::Open($lockedPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
        [IO.File]::SetLastWriteTimeUtc((Join-Path $FixtureRoot 'files\changed.tmp'),[DateTime]::UtcNow)
        try{$result=Remove-CleanupSelection $scan.token @($scan.items|ForEach-Object {$_.id})}finally{$handle.Dispose()}
        if(@($result.results|Where-Object {$_.status -eq 'deleted'}).Count -ne 1){throw 'Incorrect deletion count'}
        foreach($name in @('locked.log','changed.tmp','recent.tmp','keep.txt','readonly.tmp','codex-keep.tmp')){if(!(Test-Path -LiteralPath (Join-Path $FixtureRoot ('files\'+$name)))){throw "Deleted excluded file $name"}}
        if(Test-Path -LiteralPath (Join-Path $FixtureRoot 'files\delete.tmp')){throw 'Selected fixture was not deleted'}
        if(!(Test-Path -LiteralPath (Join-Path $FixtureRoot 'outside\outside.tmp'))){throw 'Followed junction'}
        Assert-Blocked {Remove-CleanupSelection $scan.token @($scan.items[0].id)}
        $history=@(Get-MaintenanceHistory)
        if($history.Count -ne 1 -or $history[0].status -ne 'partial' -or $history[0].results.Count -ne 3){throw 'Incorrect durable cleanup record'}
        1..12|ForEach-Object {Get-CleanupPreview 30|Out-Null}
        if($script:previews.Count -gt 10){throw 'Unbounded preview store'}

        $msi=Resolve-Uninstaller 'MsiExec.exe /I{12345678-1234-1234-1234-1234567890AB}'
        if(!$msi.available -or $msi.arguments -notmatch '^/x \{.+\} /promptrestart$'){throw 'Incorrect interactive MSI conversion'}
        foreach($invalid in @('cmd.exe /c test','powershell.exe -File example.ps1','MsiExec.exe /x {BAD}','MsiExec.exe /x {12345678-1234-1234-1234-1234567890AB} /quiet','C:\missing\uninstall.exe','relative\remove.exe')){if((Resolve-Uninstaller $invalid).available){throw "Accepted invalid uninstaller: $invalid"}}
        $validExe=Join-Path $env:SystemRoot 'System32\notepad.exe'
        if(!(Resolve-Uninstaller ('"'+$validExe+'" /uninstall')).available){throw 'Quoted EXE rejected'}
        if(!(Resolve-Uninstaller ($validExe+' /uninstall')).available){throw 'Unquoted EXE rejected'}
        if((Resolve-Uninstaller ('"'+$validExe+'" /S')).available){throw 'Silent uninstaller accepted'}
        $script:launchCount=0;$script:failLaunch=$false
        function script:Get-DesktopEntries {
            @{id='fixture-app';title='Test desktop app';version='1';scope='Current user';command='fixture';fingerprint='current';available=$true;native=@{exe='DO-NOT-LAUNCH';arguments=''}}
        }
        function script:Start-DesktopUninstallerProcess {
            param($Native)
            if($Native.exe -ne 'DO-NOT-LAUNCH'){throw 'Wrong launcher data'}
            if(!@(Get-MaintenanceHistory|Where-Object {$_.kind -eq 'uninstall'}).Count){throw 'No record before launch'}
            if($script:failLaunch){throw 'Injected launch failure'}
            $script:launchCount++;9876
        }
        Assert-Blocked {Start-DesktopUninstall 'unknown' 'current'}
        Assert-Blocked {Start-DesktopUninstall 'fixture-app' 'stale'}
        $launched=Start-DesktopUninstall 'fixture-app' 'current'
        if($script:launchCount -ne 1 -or $launched.message -notmatch '尚未确认卸载完成'){throw 'Uninstall launch contract failed'}
        Assert-Blocked {Start-DesktopUninstall 'fixture-app' 'current'}
        $script:launches.Clear();$script:failLaunch=$true
        Assert-Blocked {Start-DesktopUninstall 'fixture-app' 'current'}
        if(!@(Get-MaintenanceHistory|Where-Object {$_.status -eq 'failed'}).Count){throw 'Missing launch failure record'}
    } $fixtureRoot
    [pscustomobject]@{PowerShell=$PSVersionTable.PSVersion.ToString();DesktopReadOnly=@($native.items).Count;DirectUninstallAvailable=@($native.items|Where-Object {$_.available}).Count;Cleanup='one disposable fixture deleted; exclusions/locks/staleness/junctions/tokens passed';Uninstall='mocked only; stale/duplicate/failed launch tested';FixtureRoot=$fixtureRoot}
}finally{$env:SYNAPSEX_STATE_ROOT=$previousState;Remove-Module $module.Name -ErrorAction SilentlyContinue}
