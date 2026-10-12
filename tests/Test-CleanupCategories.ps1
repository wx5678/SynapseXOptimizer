$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('Cleanup-Categories-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot|Out-Null
foreach($name in @('cache-entry','report.dmp','archive.cab','output.log','keep.txt')){Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixtures/maintenance/sample.tmp') -Destination (Join-Path $fixtureRoot $name);[IO.File]::SetLastWriteTimeUtc((Join-Path $fixtureRoot $name),[DateTime]::UtcNow.AddDays(-40))}
$module=Import-Module (Join-Path $repo 'host/modules/MaintenanceManager.psm1') -Force -PassThru
try{
    & $module {
        param($FixtureRoot)
        $script:fixture=$FixtureRoot;$script:browserRunning=$false
        function script:Get-CleanupRoots {param($Category) $script:fixture}
        function script:Get-Process {param($Name,$ErrorAction) if($script:browserRunning){[pscustomobject]@{Name='chrome'}}}
        function Assert-Blocked($Work){$blocked=$false;try{&$Work|Out-Null}catch{$blocked=$true};if(!$blocked){throw 'Expected refusal'}}
        foreach($pair in @(@{category='temp';count=1},@{category='browser-cache';count=5},@{category='crash-dumps';count=1},@{category='system-logs';count=2})){
            $preview=Get-CleanupPreview -Days 7 -Category $pair.category
            if($preview.items.Count -ne $pair.count){throw ('Wrong category candidates: '+$pair.category)}
        }
        Assert-Blocked {Get-CleanupPreview -Category 'user-path'}
        $preview=Get-CleanupPreview -Category browser-cache
        $script:browserRunning=$true
        Assert-Blocked {Get-CleanupPreview -Category browser-cache}
        Assert-Blocked {Remove-CleanupSelection $preview.token @($preview.items[0].id)}
        if(@(Get-ChildItem -LiteralPath $FixtureRoot -File).Count -ne 5){throw 'Live browser guard changed files'}
    } $fixtureRoot
    @{ok=$true;deletedFiles=0;categories=4;browserGuard='scan and apply';fixture=$fixtureRoot}|ConvertTo-Json
}finally{Remove-Module $module.Name}
