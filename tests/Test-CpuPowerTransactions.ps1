$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('synapsex-power-transaction-'+[guid]::NewGuid().ToString('N'))
$previous=$env:SYNAPSEX_STATE_ROOT
try {
    $env:SYNAPSEX_STATE_ROOT=$root
    Import-Module (Join-Path $PSScriptRoot '../host/modules/RuntimeOptimizer.psm1') -Force
    $module=Get-Module RuntimeOptimizer
    & $module {
        $script:testRec=Get-CpuPowerRecommendation -CpuName 'AMD Ryzen 7 9800X3D' -Manufacturer AMD -PhysicalCores 8 -LogicalProcessors 16 -Topology ([pscustomobject]@{available=$true;classes=@(0);cacheDomains=1;logicalProcessors=16})
        $script:testActive='11111111-1111-1111-1111-111111111111'
        $script:testBaseline=@{}
        foreach ($s in $script:testRec.profiles[1].settings) { $script:testBaseline[$s.setting]=@{ac=50L;dc=27L} }
        $script:testBaseline['unlisted-device']=@{ac=19L;dc=29L}
        function script:Test-SynapseXRuntimeElevated { $true }
        function script:Get-CpuPowerRecommendation { $script:testRec }
        function script:Get-PowerSchemeCatalog { @{active=@{guid=$script:testActive};items=@()} }
        function script:Write-RuntimeOperation { param($Action,$Result,$BackupId,$Detail) }
        function script:Get-SynapseXPowerValues([string]$Guid) {
            if ($Guid -eq $script:testRec.basePlanGuid -or $Guid -eq $script:testActive) { return $script:testBaseline }
            if ($script:testFailure -eq 'dc') { $script:testWritten['unlisted-device'].dc=999L }
            if ($script:testFailure -eq 'ac') { $script:testWritten['unlisted-device'].ac=999L }
            return $script:testWritten
        }
        function script:Invoke-SynapseXPowerCfg([string[]]$Arguments,[string]$FailureMessage) {
            $script:testCalls.Add(($Arguments -join '|')) | Out-Null
            if ($Arguments[0] -eq '/setacvalueindex') {
                if ($script:testFailure -eq 'write') { throw 'simulated write failure' }
                $script:testWritten[$Arguments[3]].ac=[long]$Arguments[4]
            }
            if ($Arguments[0] -eq '/setactive' -and $Arguments[1] -ne $script:testActive -and $script:testFailure -eq 'activate') { throw 'simulated activation failure' }
        }
        foreach ($failure in @('none','write','dc','ac','activate','profile')) {
            $script:testFailure=$failure
            $script:testCalls=New-Object 'Collections.Generic.List[string]'
            $script:testWritten=@{}
            foreach ($key in $script:testBaseline.Keys) { $script:testWritten[$key]=@{ac=$script:testBaseline[$key].ac;dc=$script:testBaseline[$key].dc} }
            $caught=$false
            try { $result=New-SynapseXCpuPowerPlan -ProfileId $(if ($failure -eq 'profile') {'wrong-platform'} else {'amd-single-response-v2'}) } catch { $caught=$true }
            if ($failure -eq 'none') {
                if ($caught -or -not $result.ok -or $result.appliedSettings.Count -ne 9) { throw 'Successful transaction failed' }
                if (@($script:testCalls | Where-Object { $_ -like '/setactive|*' }).Count -ne 1) { throw 'Expected exactly one activation' }
            } elseif ($failure -eq 'profile') {
                if (-not $caught -or $script:testCalls.Count -ne 0) { throw 'Wrong-platform ID was accepted' }
            } else {
                if (-not $caught) { throw "Failure was swallowed: $failure" }
                if (-not $script:testCalls.Contains('/setactive|'+$script:testActive)) { throw 'Previous plan not restored' }
                if (@($script:testCalls | Where-Object { $_ -like '/delete|*' }).Count -ne 1) { throw 'Temporary plan not removed' }
                if ($failure -in @('dc','ac','write') -and @($script:testCalls | Where-Object { $_ -like '/setactive|*' -and $_ -ne ('/setactive|'+$script:testActive) }).Count) { throw 'Invalid plan was activated' }
            }
        }
        # Mobile/unknown must copy the current OEM plan, not a desktop balanced GUID.
        $script:testRec.basePlanGuid='current';$script:testFailure='none';$script:testCalls.Clear()
        foreach ($key in $script:testBaseline.Keys) { $script:testWritten[$key]=@{ac=$script:testBaseline[$key].ac;dc=$script:testBaseline[$key].dc} }
        New-SynapseXCpuPowerPlan | Out-Null
        if (-not $script:testCalls[0].StartsWith('/duplicatescheme|'+$script:testActive+'|')) { throw 'Current-plan base ignored' }
    }
    Write-Output '{"passed":true,"transactionCases":7,"realPowerWrites":0}'
} finally {
    Remove-Module RuntimeOptimizer -ErrorAction SilentlyContinue
    $env:SYNAPSEX_STATE_ROOT=$previous
    $resolved=[IO.Path]::GetFullPath($root)
    $prefix=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\synapsex-power-transaction-'
    if ($resolved.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolved)) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
