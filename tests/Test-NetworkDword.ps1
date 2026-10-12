$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot '..\host\modules\NetworkToolkit.psm1') -Force
& (Get-Module NetworkToolkit) {
    foreach ($case in @(
        @{ input=-1; expected=4294967295L }, @{ input=4294967295L; expected=4294967295L },
        @{ input=10; expected=10L }, @{ input=0; expected=0L },
        @{ input=[int]::MinValue; expected=2147483648L },
        @{ input=$null; expected=$null }, @{ input='broken'; expected=$null },
        @{ input=4294967296L; expected=$null }
    )) {
        if ((ConvertTo-ToolkitDword $case.input) -ne $case.expected) { throw 'DWORD conversion regression' }
    }
    function Get-NetshTcpTokens { @{ tokens=@{}; line='' } }
    function Get-NetOffloadGlobalSetting { $null }
    function Get-RegistryValueState($Path, $Name) { @{ exists=$true; value=-1 } }
    $state = Get-TcpOptimizationState
    $throttle = @($state.items | Where-Object id -eq 'network-throttling-disabled')[0]
    if (!$throttle.matches -or $throttle.currentValue -notmatch '0xFFFFFFFF') { throw 'Signed DWORD page state failed' }
    'PASS: 8 conversion cases and full TCP state with signed DWORD; no registry writes'
}
