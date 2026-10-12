$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$beforeEnv=$env:SYNAPSEX_STATE_ROOT
$env:SYNAPSEX_STATE_ROOT=Join-Path ([IO.Path]::GetTempPath()) ('SynapseX-Device-Test-'+[guid]::NewGuid().ToString('N'))
$module=Import-Module (Join-Path $repo 'host/modules/DeviceServiceManager.psm1') -Force -PassThru
try{
    $counts=@{};foreach($kind in @('services','devices','msi','service-host')){$catalog=Get-DeviceServiceCatalog $kind;$counts[$kind]=$catalog.items.Count;if(!$catalog.account){throw 'Missing identity'}}
    & $module {
        $script:testState=[ordered]@{start=2;delayed=1};$script:identity='original';$script:fail=$false;$script:writes=0
        function script:Get-DsEntries($Kind){
            $options=switch($Kind){services{@(@{value='auto';label='Auto'},@{value='manual';label='Manual'},@{value='disabled';label='Disabled'},@{value='delayed';label='Delayed'})}devices{@(@{value='enabled';label='Enabled'},@{value='disabled';label='Disabled'})}msi{@(@{value='1';label='On'},@{value='0';label='Off'})}}
            if($Kind -eq 'service-host'){$options=@(@{value='default';label='Default'},@{value='0';label='Split'},@{value='1';label='Group'})}
            @{kind=$Kind;id='fixture';target='test-target';title='fixture';identity=$script:identity;available=$true;before=$script:testState;fingerprint=(Get-DsHash ($script:identity+'|'+(Get-DsStateHash $script:testState)));options=$options}
        }
        function script:Set-DsNative($Item,$State){
            if(!@(Get-DsRecords).Count){throw 'Backup must precede mutation'}
            $script:writes++;$script:testState=$State
            if($script:fail){$script:fail=$false;throw 'Injected partial failure'}
        }
        function Assert-Blocked($Work){$blocked=$false;try{&$Work|Out-Null}catch{$blocked=$true};if(!$blocked){throw 'Expected refusal'}}
        foreach($kind in @('services','devices','msi','service-host')){
            $script:testState=switch($kind){services{[ordered]@{start=2;delayed=1}}devices{[ordered]@{disabled=$false}}msi{[ordered]@{value=1}}}
            if($kind -eq 'service-host'){$script:testState=[ordered]@{value='default'}}
            $original=$script:testState
            $choice=if($kind -eq 'msi'){'0'}else{'disabled'}
            if($kind -eq 'service-host'){$choice='1'}
            $item=Find-DsItem $kind 'fixture'
            Assert-Blocked {Set-DeviceServiceItem $kind 'fixture' 'stale' $choice}
            Assert-Blocked {Set-DeviceServiceItem $kind 'fixture' $item.fingerprint 'bogus'}
            $r=Set-DeviceServiceItem $kind 'fixture' $item.fingerprint $choice
            $again=Set-DeviceServiceItem $kind 'fixture' (Find-DsItem $kind 'fixture').fingerprint $choice
            if($again.backupId){throw 'No-op created new backup'}
            $script:identity='replaced';Assert-Blocked {Restore-DeviceServiceItem $r.backupId};$script:identity='original'
            Restore-DeviceServiceItem $r.backupId|Out-Null
            if(!(Test-DsEqual $script:testState $original)){throw 'Original state not restored'}
            $item=Find-DsItem $kind 'fixture';$script:fail=$true
            Assert-Blocked {Set-DeviceServiceItem $kind 'fixture' $item.fingerprint $choice}
            if(!(Test-DsEqual $script:testState $original)){throw 'Failure rollback did not restore'}
        }
        $script:testState=[ordered]@{start=2;delayed=1};$item=Find-DsItem services fixture
        $r=Set-DeviceServiceItem services fixture $item.fingerprint disabled
        $script:testState=[ordered]@{start=3;delayed=0}
        Assert-Blocked {Restore-DeviceServiceItem $r.backupId}
        Assert-Blocked {Restore-DeviceServiceItem '..\outside'}
    }
    [pscustomobject]@{ok=$true;realReadCounts=$counts;changes='simulated only';tests='4 kinds roundtrip/no-op/identity/partial rollback/conflict; PS5.1'}|ConvertTo-Json
}finally{$env:SYNAPSEX_STATE_ROOT=$beforeEnv;Remove-Module $module.Name}
