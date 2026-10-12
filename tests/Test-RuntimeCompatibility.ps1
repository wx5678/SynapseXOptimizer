$ErrorActionPreference = 'Stop'
$testDirectory = Join-Path ([IO.Path]::GetTempPath()) ('synapsex-runtime-test-' + [guid]::NewGuid().ToString('N'))
$previousState = $env:SYNAPSEX_STATE_ROOT
$child = $null
function Assert-True($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Expect-Failure([scriptblock]$Action, [string]$Message) {
    $caught = $false
    try { & $Action | Out-Null } catch { $caught = $true }
    Assert-True $caught $Message
}
function Make-Topology([int]$Threads, [int[]]$Classes = @(0), [int]$Caches = 1) {
    [pscustomobject]@{ available=$true; classes=$Classes; cacheDomains=$Caches; logicalProcessors=$Threads }
}
try {
    $env:SYNAPSEX_STATE_ROOT = $testDirectory
    Import-Module (Join-Path $PSScriptRoot '../host/modules/RuntimeOptimizer.psm1') -Force
    $module = Get-Module RuntimeOptimizer
    $cases = @(
        @{ name='Intel(R) Core(TM) i7-9700 CPU @ 3.00GHz'; vendor='GenuineIntel'; cores=8; threads=8; top=(Make-Topology 8); architecture='intel-homogeneous'; profiles=2 },
        @{ name='Intel Core i9-13900K'; vendor='GenuineIntel'; cores=24; threads=32; top=(Make-Topology 32 @(0,1)); architecture='intel-hybrid'; profiles=2 },
        @{ name='Intel Core Ultra 9 285K'; vendor='GenuineIntel'; cores=24; threads=24; top=(Make-Topology 24 @(0,1)); architecture='intel-hybrid'; profiles=2 },
        @{ name='Intel Core i5-12400'; vendor='GenuineIntel'; cores=6; threads=12; top=(Make-Topology 12); architecture='intel-homogeneous'; profiles=2 },
        @{ name='AMD Ryzen 7 9800X3D'; vendor='AuthenticAMD'; cores=8; threads=16; top=(Make-Topology 16); architecture='amd-homogeneous'; profiles=2 },
        @{ name='AMD Ryzen 9 9950X3D'; vendor='AuthenticAMD'; cores=16; threads=32; top=(Make-Topology 32 @(0) 2); architecture='amd-homogeneous'; profiles=1 },
        @{ name='AMD Ryzen AI 9 HX 370'; vendor='AuthenticAMD'; cores=12; threads=24; top=(Make-Topology 24 @(0,1) 2); architecture='heterogeneous'; profiles=1 },
        @{ name='Qualcomm CPU'; vendor='Qualcomm'; cores=12; threads=12; top=(Make-Topology 12 @(0,1)); architecture='heterogeneous'; profiles=1 },
        @{ name='Intel Core Ultra Unknown'; vendor='GenuineIntel'; cores=8; threads=8; top=$null; architecture='generic'; profiles=1 },
        @{ name='Virtual CPU'; vendor='Other'; cores=8; threads=16; top=(Make-Topology 8); architecture='generic'; profiles=1 }
    )
    foreach ($case in $cases) {
        $rec = Get-CpuPowerRecommendation -CpuName $case.name -Manufacturer $case.vendor -PhysicalCores $case.cores -LogicalProcessors $case.threads -Topology $case.top
        Assert-True ($rec.cpuName -ceq $case.name) 'CPU name was replaced'
        Assert-True ($rec.architecture -eq $case.architecture) ('Incorrect classification: ' + $case.name)
        Assert-True (@($rec.profiles).Count -eq $case.profiles) ('Incorrect catalog: ' + $case.name)
        Assert-True (@($rec.settings | Where-Object key -match 'scheduling-policy').Count -eq 0) 'Scheduling override leaked'
        if ($case.profiles -eq 1) { Assert-True (@($rec.settings | Where-Object key -match 'parking|autonomous|boost').Count -eq 0) 'Platform scheduling was overwritten' }
        Assert-True (@($rec.profiles | Where-Object recommended).Count -eq 1) 'Ambiguous default'
        Assert-True (@($rec.settings | Where-Object key -match 'parking|boost|threshold|performance-check').Count -eq 0) 'Default must retain platform policy'
        foreach ($profile in $rec.profiles) {
            Assert-True (@($profile.settings | Where-Object { $_.key -eq 'idle-disabled' -and $_.acValue -ne 0 }).Count -eq 0) 'Idle was disabled'
            $sched = @($profile.settings | Where-Object key -match 'scheduling-policy')
            if ($sched.Count) {
                Assert-True ($sched.Count -eq 2 -and @($sched | Where-Object acValue -ne 0).Count -eq 0) 'Wrong all-processors values'
                Assert-True ($rec.profileFamily -in @('amd-single','intel-uniform') -and -not $profile.recommended) 'Scheduling escaped homogeneous comparison preset'
                Assert-True (@($sched | Where-Object valueLabel -ne '所有处理器').Count -eq 0) 'Scheduling label incorrect'
            }
            Assert-True (@($profile.settings | Where-Object subgroup -ne '54533251-82be-4824-96c1-47b60b740d00').Count -eq 0) 'Non-CPU override leaked'
        }
    }
    $mobile = Get-CpuPowerRecommendation -CpuName 'AMD Ryzen 7 Mobile' -Manufacturer 'AMD' -PhysicalCores 8 -LogicalProcessors 16 -Topology (Make-Topology 16) -Portable $true
    Assert-True (@($mobile.profiles).Count -eq 1) 'Mobile received desktop preset'
    Assert-True ($mobile.basePlanGuid -eq 'current' -and $mobile.profileFamily -eq 'portable') 'Mobile lost OEM base'
    $intelMulti = Get-CpuPowerRecommendation -CpuName 'Intel Core CPU' -Manufacturer 'Intel' -PhysicalCores 16 -LogicalProcessors 32 -Topology (Make-Topology 32 @(0) 2)
    Assert-True ($intelMulti.profileFamily -eq 'generic' -and @($intelMulti.profiles).Count -eq 1) 'Unvalidated Intel multi-domain received all-core preset'
    $capLimited = Get-CpuPowerRecommendation -CpuName 'AMD Ryzen 7 9800X3D' -Manufacturer 'AMD' -PhysicalCores 8 -LogicalProcessors 16 -Topology (Make-Topology 16) -SupportedSettingIds @('893dee8e-2bef-41e0-89c6-b55d0929964c','bc5038f7-23e0-4960-96da-33abaf5935ec')
    Assert-True (@($capLimited.profiles).Count -eq 1) 'Incomplete optional preset advertised'
    $limited = Get-CpuPowerRecommendation -CpuName 'Intel CPU' -Manufacturer 'Intel' -SupportedSettingIds @('893dee8e-2bef-41e0-89c6-b55d0929964c','bc5038f7-23e0-4960-96da-33abaf5935ec')
    Assert-True (@($limited.settings).Count -eq 2) 'Unsupported parameter remained'
    $missing = Get-CpuPowerRecommendation -CpuName 'Unknown CPU' -SupportedSettingIds @()
    Assert-True (@($missing.profiles).Count -eq 0) 'Incomplete power scheme was offered'

    # Metadata query is read-only; no priority setter remains in the product.
    & $module { Initialize-RuntimeNative }
    $original = (Get-Process -Id $PID).PriorityClass
    $query = [SynapseX.RuntimeNative]::Priority($PID)
    Assert-True ($query.Error -eq 0 -and $query.Priority -gt 0 -and $query.StartToken) 'Native metadata query failed'
    Assert-True ((Get-Process -Id $PID).PriorityClass -eq $original) 'Read-only query changed priority'
    Assert-True ($null -eq (Get-Command Set-GameProcessAboveNormal -ErrorAction SilentlyContinue)) 'Retired setter remains exported'
    Assert-True ($null -eq (Get-Command Restore-GameProcessPriority -ErrorAction SilentlyContinue)) 'Retired restore remains exported'
    [pscustomobject]@{ passed=$true; cpuCases=15; nativePriority='read-only metadata passed'; retiredPriority='setter and restore absent'; systemOrGameWrites='none' } | ConvertTo-Json -Compress
} finally {
    if ($child -and -not $child.HasExited) { $child.Kill(); $child.WaitForExit() }
    Remove-Module RuntimeOptimizer -ErrorAction SilentlyContinue
    $env:SYNAPSEX_STATE_ROOT=$previousState
    $resolvedTest = [IO.Path]::GetFullPath($testDirectory)
    $tempPrefix = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\synapsex-runtime-test-'
    if ($resolvedTest.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTest)) { Remove-Item -LiteralPath $resolvedTest -Recurse -Force }
}
