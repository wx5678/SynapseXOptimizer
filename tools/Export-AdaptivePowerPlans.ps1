[CmdletBinding()]
param(
    [string]$OutputDirectory = '',
    [switch]$ExportLocalPlans
)
$ErrorActionPreference='Stop'
if (-not $OutputDirectory) { $OutputDirectory=Join-Path $PSScriptRoot '../state/adaptive-power-plans-v2' }
Import-Module (Join-Path $PSScriptRoot '../host/modules/RuntimeOptimizer.psm1') -Force
$module=Get-Module RuntimeOptimizer
function Make-Topology([int]$Threads,[int[]]$Classes=@(0),[int]$Caches=1) {
    [pscustomobject]@{available=$true;classes=$Classes;cacheDomains=$Caches;logicalProcessors=$Threads}
}
$examples=@(
    @{CpuName='AMD Ryzen 7 9800X3D';Manufacturer='AMD';PhysicalCores=8;LogicalProcessors=16;Topology=(Make-Topology 16)},
    @{CpuName='Intel Core i5-12400';Manufacturer='Intel';PhysicalCores=6;LogicalProcessors=12;Topology=(Make-Topology 12)},
    @{CpuName='Intel Core i9-13900K';Manufacturer='Intel';PhysicalCores=24;LogicalProcessors=32;Topology=(Make-Topology 32 @(0,1))},
    @{CpuName='AMD Ryzen 9 9950X3D';Manufacturer='AMD';PhysicalCores=16;LogicalProcessors=32;Topology=(Make-Topology 32 @(0) 2)},
    @{CpuName='AMD Ryzen Mobile';Manufacturer='AMD';PhysicalCores=8;LogicalProcessors=16;Topology=(Make-Topology 16);Portable=$true},
    @{CpuName='Unknown CPU';Manufacturer='Other'}
)
$catalog=@($examples | ForEach-Object { Get-CpuPowerRecommendation @_ })
$out=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $out -Force | Out-Null
function Save-Json([string]$Name,$Value) {
    [IO.File]::WriteAllText((Join-Path $out $Name),($Value | ConvertTo-Json -Depth 16),(New-Object Text.UTF8Encoding($false)))
}
Save-Json 'templates.json' ([ordered]@{schema=2;note='9 parameter recipes in 6 families. Example CPUs are routing fixtures, not benchmark evidence. Do not import foreign-machine binary plans.';families=$catalog})
$local=Get-CpuPowerRecommendation
Save-Json 'local-recommendation.json' $local
if (-not $ExportLocalPlans) { Write-Output "Wrote templates and local recommendation: $out (no Windows changes)"; return }
if (-not (& $module { Test-SynapseXRuntimeElevated })) { throw 'Export requires administrator rights for temporary scheme creation; nothing is activated.' }
$beforeCatalog=Get-PowerSchemeCatalog
$active=[string]$beforeCatalog.active.guid
$base=if ($local.basePlanGuid -eq 'current') { $active } else { [string]$local.basePlanGuid }
$baseValues=& $module { param($id) Get-SynapseXPowerValues $id } $base
$exports=@()
foreach ($profile in $local.profiles) {
    $id=[guid]::NewGuid().ToString(); $created=$false
    $file=Join-Path $out ($profile.id+'.pow')
    if (Test-Path -LiteralPath $file) { throw "Refusing to overwrite: $file" }
    try {
        & $module { param($base,$id) Invoke-SynapseXPowerCfg @('/duplicatescheme',$base,$id) 'Cannot duplicate base' | Out-Null } $base $id
        $created=$true
        & $module { param($id,$name) Invoke-SynapseXPowerCfg @('/changename',$id,$name) 'Cannot name plan' | Out-Null } $id $profile.name
        foreach ($s in $profile.settings) {
            & $module { param($id,$s) Invoke-SynapseXPowerCfg @('/setacvalueindex',$id,$s.subgroup,$s.setting,[string]$s.acValue) 'Cannot write parameter' | Out-Null } $id $s
        }
        $actual=& $module { param($id) Get-SynapseXPowerValues $id } $id
        & $module { param($baseline,$actual,$settings) Assert-SynapseXPowerValues $baseline $actual $settings } $baseValues $actual $profile.settings
        & $module { param($file,$id) Invoke-SynapseXPowerCfg @('/export',$file,$id) 'Cannot export plan' | Out-Null } $file $id
        $exports += [ordered]@{id=$profile.id;file=$file;sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash;settingsVerified=$true;allUnlistedAcAndAllDcPreserved=$true}
    } finally {
        if ($created) {
            & $module { param($id) Invoke-SynapseXPowerCfg @('/delete',$id) 'Temporary scheme cleanup failed' | Out-Null } $id
        }
    }
}
$after=Get-PowerSchemeCatalog
$unchanged=([string]$after.active.guid -eq $active)
$catalogUnchanged=(@(Compare-Object @($beforeCatalog.items.guid | Sort-Object) @($after.items.guid | Sort-Object)).Count -eq 0)
Save-Json 'export-verification.json' ([ordered]@{cpu=$local.cpuName;baseGuid=$base;activeUnchanged=$unchanged;catalogUnchanged=$catalogUnchanged;exports=$exports;warning='Binary exports inherit this computer baseline. For other hardware use software topology matching, not these files.'})
if (-not $unchanged -or -not $catalogUnchanged) { throw 'Power catalog changed unexpectedly. Inspect export-verification.json.' }
Write-Output "Exported $($exports.Count) matching plans, verified all AC/DC values; active plan and catalog unchanged: $out"
