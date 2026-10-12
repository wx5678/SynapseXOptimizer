$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
. (Join-Path $repo 'host/modules/PrivacyDefinitions.ps1')
$definitions=@(Get-PrivacyDefinitions)
if($definitions.Count -ne 35){throw 'Privacy definition count differs'}
if(@($definitions.id|Select-Object -Unique).Count -ne $definitions.Count){throw 'Duplicate IDs'}
$admx=[xml](Get-Content (Join-Path $env:SystemRoot 'PolicyDefinitions/AppPrivacy.admx') -Raw)
foreach($d in $definitions){
    if(!$d.policy -or $d.kind -ne 'registry' -or $d.path -notlike 'HKLM:\*'){throw 'Unexpected privacy scope'}
    if($d.category -eq '应用权限'){
        $p=@($admx.policyDefinitions.policies.policy|Where-Object{$_.name -ceq $d.name})
        if($p.Count -ne 1 -or ('HKLM:\'+$p[0].key) -ine $d.path){throw "Mapping mismatch: $($d.id)"}
        $values=@($p[0].elements.enum.item|ForEach-Object{[string]$_.value.decimal.value})
        if(($values -join ',') -ne '0,1,2' -or ($d.options.value -join ',') -ne 'default,0,1,2'){throw 'Access enum mismatch'}
    }elseif($d.admx){
        $xml=[xml](Get-Content (Join-Path $env:SystemRoot ('PolicyDefinitions/'+$d.admx+'.admx')) -Raw)
        $p=@($xml.policyDefinitions.policies.policy|Where-Object{$_.name -ceq $d.policyName})
        if($p.Count -ne 1 -or ('HKLM:\'+$p[0].key) -ine $d.path -or $p[0].valueName -cne $d.name){throw "Scalar mapping mismatch: $($d.id)"}
        if($d.id -eq 'privacy-cloud-search'){
            if(($p[0].elements.enum.item.value.decimal.value -join ',') -ne '0,1,2'){throw 'Search enumeration differs'}
        }elseif($d.id -eq 'privacy-inventory'){
            if(($d.options.value -join ',') -ne 'default,1'){throw 'Inventory must preserve unconfigured state'}
        }else{
            $expected=if($d.id -eq 'privacy-setting-sync'){'0,2'}else{'0,1'}
            if((@($p[0].enabledValue.decimal.value,$p[0].disabledValue.decimal.value | Sort-Object) -join ',') -ne $expected){throw 'Scalar values differ'}
        }
    }else{
        $xml=[xml](Get-Content (Join-Path $env:SystemRoot 'PolicyDefinitions/Globalization.admx') -Raw)
        $p=$xml.policyDefinitions.policies.policy|Where-Object{$_.name -eq 'ImplicitDataCollectionOff_2'}
        $entry=@($p.enabledList.item|Where-Object{$_.valueName -ceq $d.name})
        if($entry.Count -ne 1 -or ('HKLM:\'+$entry[0].key) -ine $d.path -or $entry[0].value.decimal.value -ne '1'){throw 'Input learning mapping mismatch'}
    }
}
@{ok=$true;verifiedMappings=$definitions.Count;source='Local Windows ADMX';systemWrites=0}|ConvertTo-Json
