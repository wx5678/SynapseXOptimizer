$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$module=Import-Module (Join-Path $repo 'host/modules/ExpertSettings.psm1') -Force -PassThru
try{
    & $module {
        $script:reader=${function:Get-ExpertValue};$script:setter=${function:Set-ExpertNative};$script:ops=@()
        $script:raw=-2147483647;$script:kind='DWord';$script:exists=$true;$script:tamper=$false
        function Assert-Blocked($Work){$blocked=$false;try{&$Work|Out-Null}catch{$blocked=$true};if(!$blocked){throw 'Expected refusal'}}
        function script:Test-Path {param($LiteralPath) $script:exists}
        function script:Get-Item {
            param($LiteralPath)
            $key=[pscustomobject]@{}
            $key|Add-Member ScriptMethod GetValue {param($name,$fallback) $script:raw}
            $key|Add-Member ScriptMethod GetValueKind {param($name) $script:kind}
            $key
        }
        function script:New-Item {param($Path,[switch]$Force) $script:ops+=@{op='key';path=$Path}}
        function script:New-ItemProperty {param($LiteralPath,$Name,$PropertyType,$Value,[switch]$Force,$ErrorAction) $script:ops+=@{op='registry';path=$LiteralPath;name=$Name;type=$PropertyType;value=$Value}}
        function script:Remove-ItemProperty {param($LiteralPath,$Name,$ErrorAction) $script:ops+=@{op='delete-value';path=$LiteralPath;name=$Name}}
        function script:Invoke-ExpertFsutil {param([string[]]$Arguments) $script:ops+=@{op='fsutil';arguments=$Arguments};$script:fsOutput}
        function script:Invoke-ExpertBcd {param([string[]]$Arguments) $script:ops+=@{op='bcd';arguments=$Arguments};$script:bcdOutput}
        function script:Get-WindowsReservedStorageState {param($ErrorAction) [pscustomobject]@{State='Enabled'}}
        function script:Set-WindowsReservedStorageState {param($State,$ErrorAction) $script:ops+=@{op='reserved';value=$State}}
        function script:Get-NetFirewallProfile {param($PolicyStore,$Name,$ErrorAction) [pscustomobject]@{Enabled='True'}}
        function script:Set-NetFirewallProfile {param($PolicyStore,$Name,$Enabled,$ErrorAction) $script:ops+=@{op='firewall';store=$PolicyStore;name=$Name;value=$Enabled}}
        function script:Get-MpComputerStatus {param($ErrorAction) [pscustomobject]@{AMServiceEnabled=$true;AMRunningMode='Normal';IsTamperProtected=$script:tamper}}
        function script:Get-MpPreference {param($ErrorAction) [pscustomobject]@{DisableRealtimeMonitoring=$false}}
        function script:Set-MpPreference {param($DisableRealtimeMonitoring,$ErrorAction) $script:ops+=@{op='defender';value=$DisableRealtimeMonitoring}}
        $environment=@{client=$true;build=26100;edition='Professional';bootReason=''}
        $d=Get-ExpertDefinition mpo $environment
        if((& $script:reader $d).value -cne '2147483649'){throw 'Signed DWORD lost bits'}
        & $script:setter $d @{value='2147483649'}
        if($script:ops[-1].value -ne -2147483647 -or $script:ops[-1].name -cne 'OverlayTestMode'){throw 'DWORD restore type or target mismatch'}
        & $script:setter $d @{value='default'}
        if($script:ops[-1].op -cne 'delete-value'){throw 'Original absence not removed'}
        $script:kind='String';Assert-Blocked {&$script:reader $d};$script:kind='DWord';$script:exists=$false
        if((&$script:reader $d).value -cne 'default'){throw 'Missing key interpreted as zero'}
        $script:exists=$true
        foreach($output in @('DisableLastAccess = 1 (User Managed)','注册状态为: 2 (按卷设置)','MemoryUsage = 1')){
            $script:fsOutput=$output;$result=&$script:reader (Get-ExpertDefinition ntfs-access $environment)
            if($result.value -notin @('1','2')){throw 'Localized fsutil parse failed'}
        }
        $script:fsOutput='Error 5: Access denied';Assert-Blocked {&$script:reader (Get-ExpertDefinition ntfs-access $environment)}
        & $script:setter (Get-ExpertDefinition ntfs-8dot3 $environment) @{value='2'}
        if(($script:ops[-1].arguments -join '|') -cne 'behavior|set|disable8dot3|2'){throw 'fsutil command mismatch'}
        Assert-Blocked {&$script:setter (Get-ExpertDefinition ntfs-access $environment) @{value='1 & command'}}
        & $script:setter (Get-ExpertDefinition reserved-storage $environment) @{value='Disabled'}
        if($script:ops[-1].value -cne 'Disabled'){throw 'Reserved state mismatch'}
        & $script:setter (Get-ExpertDefinition firewall-public $environment) @{value='False'}
        if($script:ops[-1].name -cne 'Public' -or $script:ops[-1].store -cne 'PersistentStore'){throw 'Firewall scope mismatch'}
        & $script:setter (Get-ExpertDefinition defender-realtime $environment) @{value='disabled'}
        if($script:ops[-1].value -isnot [bool] -or !$script:ops[-1].value){throw 'Defender bool mismatch'}
        $script:tamper=$true;$count=$script:ops.Count;Assert-Blocked {&$script:setter (Get-ExpertDefinition defender-realtime $environment) @{value='disabled'}}
        if($script:ops.Count -ne $count){throw 'Tamper protection guard wrote before refusal'}
        $script:bcdOutput="Windows Boot Loader`nidentifier              {11111111-1111-1111-1111-111111111111}`ndisabledynamictick       Yes`n"
        $d=Get-ExpertDefinition boot-dynamic-tick $environment;$state=&$script:reader $d
        if($state.value -cne 'yes'){throw 'BCD value mismatch'}
        & $script:setter $d @{value='default';bootId=$state.bootId}
        if(($script:ops[-1].arguments -join '|') -cne '/deletevalue|{11111111-1111-1111-1111-111111111111}|disabledynamictick'){throw 'BCD removal target mismatch'}
        Assert-Blocked {&$script:setter $d @{value='no';bootId='{22222222-2222-2222-2222-222222222222}'}}
    }
    @{ok=$true;systemWrites=0;adapters='registry DWORD/absence/type, localized fsutil, reserved storage, per-profile firewall, Defender tamper guard, exact BCD loader'}|ConvertTo-Json
}finally{Remove-Module $module.Name}
