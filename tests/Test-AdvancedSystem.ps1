$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$env:SYNAPSEX_STATE_ROOT=Join-Path ([IO.Path]::GetTempPath()) ('SynapseX-Advanced-Test-'+[guid]::NewGuid().ToString('N'))
$module=Import-Module (Join-Path $projectRoot 'host/modules/AdvancedSystemOptimizer.psm1') -Force -PassThru
try {
    # Real machine reads only: never apply or restore a real service/task/policy.
    $real=Get-AdvancedSystemCatalog
    if (@($real.items).Count -ne 13) { throw 'Unexpected catalog count' }
    & $module {
        $script:nativeSetter = (Get-Command Set-AdvancedValue -CommandType Function).ScriptBlock
        $script:fixture=@{}
        foreach($d in Get-AdvancedDefinitions) {
            $script:fixture[$d.id]=switch($d.kind) {
                'service' {@{start=2;delayed=1;running='Running';matches=$false;label='Automatic'}}
                'task' {@{enabled=$true;matches=$false;label='Enabled'}}
                'policy' {@{value=$null;exists=$false;kind=$null;matches=$false;label='Not configured'}}
            }
        }
        $script:writeCount=0
        $script:failWrite=$false
        function script:Get-AdvancedValue($Definition) { $script:fixture[$Definition.id].Clone() }
        function script:Set-AdvancedValue($Definition,$Snapshot,[bool]$Restore) {
            # Every write (including rollback) must already have a durable backup.
            if (@(Get-AdvancedRecords | Where-Object id -eq $Definition.id).Count -lt 1) { throw 'Write happened before backup' }
            $script:writeCount++
            if($Restore) {
                $copy=@{}
                $parsed=$Snapshot | ConvertTo-Json | ConvertFrom-Json
                foreach($property in $parsed.PSObject.Properties){$copy[$property.Name]=$property.Value}
                $script:fixture[$Definition.id]=$copy
            }
            else {
                $next=$script:fixture[$Definition.id].Clone()
                switch($Definition.kind) {
                    'service' {$next.start=4}
                    'task' {$next.enabled=$false}
                    'policy' {$next.value=$Definition.value;$next.exists=$true;$next.kind='DWord'}
                }
                $next.matches=$true; $script:fixture[$Definition.id]=$next
                if($script:failWrite){$script:failWrite=$false;throw 'Injected write failure'}
            }
        }
        foreach($d in Get-AdvancedDefinitions) {
            $result=Set-AdvancedSystemItem $d.id
            if(-not $result.changed){throw 'Apply did not change fixture'}
            $writes=$script:writeCount
            if((Set-AdvancedSystemItem $d.id).changed -or $script:writeCount -ne $writes){throw 'Already applied item was rewritten'}
            $row=(Get-AdvancedSystemCatalog).items | Where-Object id -eq $d.id
            if(-not $row.backupId){throw 'Restore entry missing'}
            Restore-AdvancedSystemItem $d.id $result.backupId | Out-Null
            if((Get-AdvancedValue $d).matches){throw 'Restore did not restore original'}
            if(((Get-AdvancedSystemCatalog).items | Where-Object id -eq $d.id).backupId){throw 'Restored backup still offered'}
        }
        $beforeCount=$script:writeCount
        $blocked=$false
        try{Set-AdvancedSystemItem 'service-WinDefend' | Out-Null}catch{$blocked=$true}
        if(-not $blocked -or $script:writeCount -ne $beforeCount){throw 'Unknown target was not blocked'}
        $script:failWrite=$true;$blocked=$false
        try{Set-AdvancedSystemItem 'service-sysmain' | Out-Null}catch{$blocked=$true}
        if(-not $blocked -or $script:fixture['service-sysmain'].start -ne 2){throw 'Failed write rollback failed'}
        if(@(Get-AdvancedRecords | Where-Object status -eq 'rolled-back').Count -ne 1){throw 'Rollback result was not recorded'}
        $blocked=$false
        try{Restore-AdvancedSystemItem 'service-sysmain' '..\outside' | Out-Null}catch{$blocked=$true}
        if(-not $blocked){throw 'Backup traversal was not rejected'}
        $result=Set-AdvancedSystemItem 'service-sysmain'
        $blocked=$false
        try{Restore-AdvancedSystemItem 'service-print' $result.backupId | Out-Null}catch{$blocked=$true}
        if(-not $blocked){throw 'Mismatched backup accepted'}
        Restore-AdvancedSystemItem 'service-sysmain' $result.backupId | Out-Null

        # Exercise the production native adapter with mocked Windows cmdlets.
        # No real registry/service/task writes are possible in this phase.
        $script:nativeCalls=@()
        function script:Set-Service { param($Name,$StartupType,$ErrorAction) $script:nativeCalls+=@{op='service';name=$Name;value=$StartupType} }
        function script:New-ItemProperty { param($LiteralPath,$Name,$Value,$PropertyType,[switch]$Force,$ErrorAction) $script:nativeCalls+=@{op='registry';name=$Name;path=$LiteralPath;value=$Value} }
        function script:Remove-ItemProperty { param($LiteralPath,$Name,$ErrorAction) $script:nativeCalls+=@{op='remove';name=$Name;path=$LiteralPath} }
        function script:New-Item { param($Path,[switch]$Force,$ErrorAction) }
        function script:Enable-ScheduledTask { param($TaskPath,$TaskName,$ErrorAction) $script:nativeCalls+=@{op='task-on';path=$TaskPath;name=$TaskName} }
        function script:Disable-ScheduledTask { param($TaskPath,$TaskName,$ErrorAction) $script:nativeCalls+=@{op='task-off';path=$TaskPath;name=$TaskName} }
        & $script:nativeSetter (Get-AdvancedDefinition 'service-sysmain') @{start=2;delayed=1} $false
        & $script:nativeSetter (Get-AdvancedDefinition 'service-sysmain') @{start=2;delayed=1} $true
        & $script:nativeSetter (Get-AdvancedDefinition 'task-compatibility') @{enabled=$true} $false
        & $script:nativeSetter (Get-AdvancedDefinition 'task-compatibility') @{enabled=$true} $true
        & $script:nativeSetter (Get-AdvancedDefinition 'policy-store-updates') @{exists=$true;value=4} $false
        & $script:nativeSetter (Get-AdvancedDefinition 'policy-store-updates') @{exists=$true;value=4} $true
        if (@($script:nativeCalls | Where-Object {$_.op -eq 'service' -and $_.name -eq 'SysMain' -and $_.value -eq 'Disabled'}).Count -ne 1) { throw 'Native service mapping failed' }
        if (@($script:nativeCalls | Where-Object {$_.op -eq 'service' -and $_.value -eq 'Automatic'}).Count -ne 1) { throw 'Native service restore failed' }
        if (@($script:nativeCalls | Where-Object {$_.op -eq 'task-off' -and $_.path -eq '\Microsoft\Windows\Application Experience\' -and $_.name -eq 'Microsoft Compatibility Appraiser'}).Count -ne 1) { throw 'Native task mapping failed' }
        if (@($script:nativeCalls | Where-Object {$_.op -eq 'registry' -and $_.name -eq 'AutoDownload' -and $_.value -eq 2}).Count -ne 1) { throw 'Native policy mapping failed' }
        if (@($script:nativeCalls | Where-Object {$_.op -eq 'registry' -and $_.name -eq 'AutoDownload' -and $_.value -eq 4}).Count -ne 1) { throw 'Native policy restore failed' }
    }
    [pscustomobject]@{ok=$true;catalogItems=@($real.items).Count;realReadAvailable=@($real.items | Where-Object available).Count;simulatedRoundTrips=13;idempotency=$true;rollback=$true;systemWrites=0;fixtureBackups=$env:SYNAPSEX_STATE_ROOT} | ConvertTo-Json
} finally {
    Remove-Module AdvancedSystemOptimizer -ErrorAction SilentlyContinue
    Remove-Item Env:SYNAPSEX_STATE_ROOT -ErrorAction SilentlyContinue
}
