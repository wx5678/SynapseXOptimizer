$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('SynapseX-Background-Test-'+[guid]::NewGuid().ToString('N'))
$env:SYNAPSEX_STATE_ROOT=Join-Path $testRoot 'state'
New-Item -ItemType Directory -Path (Join-Path $testRoot 'startup'),(Join-Path $testRoot 'app') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixtures/background/Startup-test.txt') -Destination (Join-Path $testRoot 'startup/Startup-test.txt')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixtures/background/AppxManifest.xml') -Destination (Join-Path $testRoot 'app/AppxManifest.xml')
$module=Import-Module (Join-Path $root 'host/modules/BackgroundManager.psm1') -Force -PassThru
try{
    $counts=@{}
    foreach($kind in @('tasks','folders','packages')){
        $real=Get-BackgroundCatalog $kind
        $counts[$kind]=@($real.items).Count
        if(!$real.account -or !$real.capturedAt){throw 'Catalog metadata missing'}
    }
    & $module {
        param($FixtureRoot)
        $script:fixtureRoot=$FixtureRoot
        $script:taskEnabled=$true
        $script:taskSignature='original'
        $script:failTask=$false
        $script:taskWrites=0
        $script:packageInstalled=$true
        function script:Get-ScheduledTask {
            param($ErrorAction)
            [pscustomobject]@{TaskPath='\Vendor\';TaskName='TestTask';Description='Fixture';Settings=[pscustomobject]@{Enabled=$script:taskEnabled};Actions=@([pscustomobject]@{Execute=$script:taskSignature;Arguments='';WorkingDirectory=''});Principal=[pscustomobject]@{UserId='test'} }
        }
        function script:Export-ScheduledTask {param($TaskName,$TaskPath,$ErrorAction) '<Task>fixture</Task>'}
        function script:Disable-ScheduledTask {
            param($TaskName,$TaskPath,$ErrorAction)
            if($TaskName -ne 'TestTask' -or $TaskPath -ne '\Vendor\'){throw 'Wrong task target'}
            if(!@(Get-BackgroundRecords).Count){throw 'Missing backup before task write'}
            $script:taskWrites++;$script:taskEnabled=$false
            if($script:failTask){$script:failTask=$false;throw 'Injected partial failure'}
        }
        function script:Enable-ScheduledTask {param($TaskName,$TaskPath,$ErrorAction) $script:taskWrites++;$script:taskEnabled=$true}
        function script:Get-StartupFolders {Join-Path $script:fixtureRoot 'startup'}
        function script:Get-AppxPackage {
            param($PackageTypeFilter,$ErrorAction)
            if($script:packageInstalled){[pscustomobject]@{Name='SynapseX.TestApp';PackageFullName='SynapseX.TestApp_1.0.0.0_x64_test';PackageFamilyName='SynapseX.TestApp_test';InstallLocation=(Join-Path $script:fixtureRoot 'app');Publisher='CN=Test';NonRemovable=$false;IsFramework=$false;IsResourcePackage=$false}}
        }
        function script:Remove-AppxPackage {param($Package,$ErrorAction) if($Package -cne 'SynapseX.TestApp_1.0.0.0_x64_test'){throw 'Wrong package'}; $script:packageInstalled=$false}
        function script:Add-AppxPackage {param($Register,[switch]$DisableDevelopmentMode,$ErrorAction) if($Register -cne (Join-Path $script:fixtureRoot 'app/AppxManifest.xml')){throw 'Wrong manifest'};$script:packageInstalled=$true}
        function Assert-Blocked($Work) {$blocked=$false;try{& $Work | Out-Null}catch{$blocked=$true};if(!$blocked){throw 'Expected refusal did not happen'}}

        $task=(Get-BackgroundCatalog 'tasks').items[0]
        Assert-Blocked {Set-BackgroundItem 'tasks' $task.id 'stale-fingerprint' 'disable'}
        if($script:taskWrites){throw 'Stale operation wrote state'}
        $changed=Set-BackgroundItem 'tasks' $task.id $task.fingerprint 'disable'
        if($script:taskEnabled){throw 'Task did not disable'}
        Restore-BackgroundItem $changed.backupId | Out-Null
        if(!$script:taskEnabled){throw 'Task did not restore'}
        $script:failTask=$true
        Assert-Blocked {Set-BackgroundItem 'tasks' $task.id $task.fingerprint 'disable'}
        if(!$script:taskEnabled){throw 'Failed task write did not roll back'}
        $changed=Set-BackgroundItem 'tasks' $task.id $task.fingerprint 'disable'
        $script:taskSignature='replaced'
        Assert-Blocked {Restore-BackgroundItem $changed.backupId}
        $script:taskSignature='original';Restore-BackgroundItem $changed.backupId | Out-Null

        $file=(Get-BackgroundCatalog 'folders').items[0]
        $changed=Set-BackgroundItem 'folders' $file.id $file.fingerprint 'disable'
        if(Test-Path -LiteralPath $file.target){throw 'Startup file was not moved'}
        if(!(Test-Path -LiteralPath (Join-Path $recordsRoot ($changed.backupId+'.payload')))){throw 'Payload backup missing'}
        # Existing different file must not be overwritten on restore.
        Copy-Item -LiteralPath (Join-Path $script:fixtureRoot 'app/AppxManifest.xml') -Destination $file.target
        Assert-Blocked {Restore-BackgroundItem $changed.backupId}
        Move-Item -LiteralPath $file.target -Destination (Join-Path $script:fixtureRoot 'conflict-preserved.txt')
        Restore-BackgroundItem $changed.backupId | Out-Null
        if((Get-FileHash -LiteralPath $file.target).Hash -cne $file.fingerprint){throw 'Startup round trip changed bytes'}

        $app=(Get-BackgroundCatalog 'packages').items[0]
        $changed=Set-BackgroundItem 'packages' $app.id $app.fingerprint 'uninstall'
        if($script:packageInstalled){throw 'App removal failed'}
        Restore-BackgroundItem $changed.backupId | Out-Null
        if(!$script:packageInstalled){throw 'App re-registration failed'}
        $changed=Set-BackgroundItem 'packages' $app.id $app.fingerprint 'uninstall'
        Move-Item -LiteralPath (Join-Path $script:fixtureRoot 'app/AppxManifest.xml') -Destination (Join-Path $script:fixtureRoot 'manifest-preserved.xml')
        Assert-Blocked {Restore-BackgroundItem $changed.backupId}
        Assert-Blocked {Restore-BackgroundItem '..\other.json'}
        Assert-Blocked {Set-BackgroundItem 'folders' 'unknown' 'x' 'disable'}
        Assert-Blocked {Set-BackgroundItem 'unknown' 'unknown' 'x' 'disable'}
    } $testRoot
    @{ok=$true;readOnlyCounts=$counts;taskRoundTrip=$true;taskRollback=$true;taskReplacementGuard=$true;startupFileRoundTrip=$true;startupConflictGuard=$true;appRemovalAndReregister='mocked';missingManifestGuard=$true;realSystemWrites=0;testArtifacts=$testRoot}|ConvertTo-Json
}finally{Remove-Module BackgroundManager -ErrorAction SilentlyContinue;Remove-Item Env:SYNAPSEX_STATE_ROOT -ErrorAction SilentlyContinue}
