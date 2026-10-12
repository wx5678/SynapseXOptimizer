$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$previous=$env:SYNAPSEX_STATE_ROOT
$env:SYNAPSEX_STATE_ROOT=Join-Path ([IO.Path]::GetTempPath()) ('SynapseX-Expert-Test-'+[guid]::NewGuid().ToString('N'))
$module=Import-Module (Join-Path $repo 'host/modules/ExpertSettings.psm1') -Force -PassThru
try{
    $real=Get-ExpertCatalog
    if($real.items.Count -ne 59){throw 'Missing expert definitions'}
    & $module {
        $script:edition='Professional';$script:machine='fixture';$script:state=[ordered]@{value='default'};$script:fail=$false;$script:writes=0
        function script:Get-ExpertEnvironment {@{build=26100;client=$true;edition=$script:edition;identity=$script:machine;bootReason=''}}
        function script:Get-ExpertValue($Definition){$script:state}
        function script:Set-ExpertNative($Definition,$State){
            if(!@(Get-ExpertRecords).Count){throw 'No pre-write backup'}
            $script:writes++;$script:state=$State
            if($script:fail){$script:fail=$false;throw 'Injected partial failure'}
        }
        function Assert-Blocked($Work){$blocked=$false;try{&$Work|Out-Null}catch{$blocked=$true};if(!$blocked){throw 'Expected refusal'}}
        foreach($d in Get-ExpertDefinitions){
            $script:state=[ordered]@{value=[string]$d.options[0].value};if($d.kind -eq 'bcd'){$script:state.bootId='{11111111-1111-1111-1111-111111111111}'};$original=$script:state.value
            $item=(Get-ExpertCatalog).items|Where-Object{$_.id -eq $d.id};$choice=$d.options[-1].value
            Assert-Blocked {Set-ExpertSetting $d.id 'stale' $choice}
            Assert-Blocked {Set-ExpertSetting $d.id $item.fingerprint 'invalid'}
            $result=Set-ExpertSetting $d.id $item.fingerprint $choice
            $same=(Get-ExpertCatalog).items|Where-Object{$_.id -eq $d.id}
            if((Set-ExpertSetting $d.id $same.fingerprint $choice).backupId){throw 'No-op created backup'}
            $script:machine='other';Assert-Blocked {Restore-ExpertSetting $result.backupId};$script:machine='fixture'
            $script:state=[ordered]@{value='external'};Assert-Blocked {Restore-ExpertSetting $result.backupId}
            $script:state=[ordered]@{value=$choice};if($d.kind -eq 'bcd'){$script:state.bootId='{11111111-1111-1111-1111-111111111111}'};Restore-ExpertSetting $result.backupId|Out-Null
            if($script:state.value -cne $original){throw 'Original value not restored'}
            $item=(Get-ExpertCatalog).items|Where-Object{$_.id -eq $d.id};$script:fail=$true
            Assert-Blocked {Set-ExpertSetting $d.id $item.fingerprint $choice}
            if($script:state.value -cne $original){throw 'Partial failure not rolled back'}
        }
        $script:edition='Core';Assert-Blocked {Get-ExpertDefinition telemetry (Get-ExpertEnvironment)}
        $script:edition='Professional';$pro=Get-ExpertDefinition telemetry (Get-ExpertEnvironment)
        if('0' -in @($pro.options|ForEach-Object{$_.value})){throw 'Pro cannot disable telemetry'}
        $script:edition='Enterprise';$enterprise=Get-ExpertDefinition telemetry (Get-ExpertEnvironment)
        if('0' -notin @($enterprise.options|ForEach-Object{$_.value})){throw 'Enterprise option missing'}
        Assert-Blocked {Get-ExpertDefinition 'boot-tsc' @{client=$true;build=26100;bootReason='Encrypted'}}
        Assert-Blocked {Restore-ExpertSetting '..\outside'}
    }
    @{ok=$true;definitions=$real.items.Count;readable=@($real.items|Where-Object{$_.available}).Count;systemWrites=0;tests='59 roundtrips, original absence, stale state, external conflict, machine identity, partial rollback, edition/encryption gates'}|ConvertTo-Json
}finally{$env:SYNAPSEX_STATE_ROOT=$previous;Remove-Module $module.Name}
