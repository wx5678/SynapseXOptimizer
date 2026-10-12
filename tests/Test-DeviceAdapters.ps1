$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$module=Import-Module (Join-Path $repo 'host/modules/DeviceServiceManager.psm1') -Force -PassThru
try{
    & $module {
        $script:setter=${function:Set-DsNative};$script:ops=@()
        function script:Set-Service {param($Name,$StartupType,$ErrorAction) $script:ops+=@{op='service';name=$Name;value=$StartupType}}
        function script:New-ItemProperty {param($LiteralPath,$Name,$PropertyType,$Value,[switch]$Force,$ErrorAction) $script:ops+=@{op='registry';path=$LiteralPath;name=$Name;type=$PropertyType;value=$Value}}
        function script:Remove-ItemProperty {param($LiteralPath,$Name,$ErrorAction) $script:ops+=@{op='remove-value';path=$LiteralPath;name=$Name}}
        function script:Enable-PnpDevice {param($InstanceId,[switch]$Confirm,$ErrorAction) $script:ops+=@{op='enable';id=$InstanceId}}
        function script:Disable-PnpDevice {param($InstanceId,[switch]$Confirm,$ErrorAction) $script:ops+=@{op='disable';id=$InstanceId}}
        & $script:setter @{kind='services';target='FixtureService'} @{start=2;delayed=1}
        if($script:ops[0].name -cne 'FixtureService' -or $script:ops[0].value -cne 'Automatic' -or $script:ops[1].name -cne 'DelayedAutoStart' -or $script:ops[1].value -ne 1){throw 'Service adapter mismatch'}
        & $script:setter @{kind='services';target='FixtureService'} @{start=3;delayed=$null}
        if($script:ops[-1].op -cne 'remove-value'){throw 'Absent delayed start value not preserved'}
        & $script:setter @{kind='devices';target='FIXTURE\DEVICE'} @{disabled=$true}
        & $script:setter @{kind='devices';target='FIXTURE\DEVICE'} @{disabled=$false}
        if($script:ops[-2].op -cne 'disable' -or $script:ops[-1].op -cne 'enable' -or $script:ops[-1].id -cne 'FIXTURE\DEVICE'){throw 'Device adapter mismatch'}
        & $script:setter @{kind='msi';native=@{path='HKLM:\Fixture'}} @{value=1}
        if($script:ops[-1].path -cne 'HKLM:\Fixture' -or $script:ops[-1].name -cne 'MSISupported' -or $script:ops[-1].type -cne 'DWord'){throw 'MSI adapter mismatch'}
        & $script:setter @{kind='service-host';target='FixtureService'} @{value='1'}
        & $script:setter @{kind='service-host';target='FixtureService'} @{value='default'}
        if($script:ops[-2].name -cne 'SvcHostSplitDisable' -or $script:ops[-1].op -cne 'remove-value'){throw 'Service-host restore mismatch'}
        $count=$script:ops.Count;$blocked=$false;try{&$script:setter @{kind='devices';target='FIXTURE'} @{disabled='false'}}catch{$blocked=$true}
        if(!$blocked -or $script:ops.Count -ne $count){throw 'Invalid boolean reached device setter'}
    }
    @{ok=$true;systemWrites=0;kinds=4;adapters='exact service/PnP/MSI/host-group targets and restoration types'}|ConvertTo-Json
}finally{Remove-Module $module.Name}
