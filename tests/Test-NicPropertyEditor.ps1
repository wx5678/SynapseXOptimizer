$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot '../host/modules/NetworkToolkit.psm1') -Force
& (Get-Module NetworkToolkit) {
    $script:nicBackupRoot=Join-Path ([IO.Path]::GetTempPath()) ('synapsex-nic-test-'+[guid]::NewGuid().ToString('N'))
    $script:fakeValue='1';$script:writes=0
    function Test-ToolkitElevated { $true }
    function Get-NetAdapter { [pscustomobject]@{Name='Fixture';InterfaceDescription='Mock';InterfaceGuid='fixture-guid';Status='Up'} }
    function Get-NetAdapterPowerManagement { $null }
    function Get-NetAdapterAdvancedProperty { [pscustomobject]@{DisplayName='Mock property';DisplayValue=$script:fakeValue;RegistryKeyword='Mock';RegistryValue=@($script:fakeValue);ValidRegistryValues=@('0','1');ValidDisplayValues=@('Off','On');NumericParameterMinValue=$null;NumericParameterMaxValue=$null;NumericParameterStepValue=$null} }
    function Set-NetAdapterAdvancedProperty { param($Name,$RegistryKeyword,$RegistryValue,[switch]$NoRestart,$ErrorAction);if(!$NoRestart){throw 'Must not restart NIC'};$script:writes++;$script:fakeValue=[string]$RegistryValue }
    function Write-ToolkitOperation {}
    function Rejected($block) { $failed=$false;try{& $block}catch{$failed=$true};if(!$failed){throw 'Expected rejection'} }
    Rejected {Set-NicPropertyValue 'Fixture' 'Mock' '2' '1'}
    Rejected {Set-NicPropertyValue 'Fixture' 'Mock' '0' 'stale'}
    Rejected {Set-NicPropertyValue 'Fixture' '*' '0' '1'}
    if($script:writes -ne 0){throw 'Invalid input caused writes'}
    $result=Set-NicPropertyValue 'Fixture' 'Mock' '0' '1'
    if(!$result.ok -or $script:fakeValue -ne '0' -or $script:writes -ne 1){throw 'Write/readback failed'}
    $backup=Get-Content -LiteralPath (Join-Path $nicBackupRoot ($result.backupId+'.json')) -Raw|ConvertFrom-Json
    if($backup.properties[0].registryValue[0] -ne '1'){throw 'Backup did not preserve old value'}
    Restore-NicLatencyProfile $result.backupId | Out-Null
    if($script:fakeValue -ne '1'){throw 'Restore failed'}
    Write-Output 'PASS: invalid enum, stale state, wildcard rejection, NoRestart write, backup and restore (mock adapter only)'
}
