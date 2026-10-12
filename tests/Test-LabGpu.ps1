$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
$id=[guid]::NewGuid().ToString('N');$root=Join-Path ([IO.Path]::GetTempPath()) ('sx-gpu-lab-test-'+$id)
New-Item -ItemType Directory -Path $root|Out-Null
$oldState=$env:SYNAPSEX_STATE_ROOT;$env:SYNAPSEX_STATE_ROOT=$root
$created=$false;$record=$null
$binary=Join-Path $root ('SXGpuFixture'+$id+'.exe')
try {
    Add-Type -Path (Join-Path $project 'host/native/GpuDriverBridge.cs')
    & "$env:windir\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe ("/out:"+$binary) (Join-Path $PSScriptRoot 'SchedulerFixture.cs')
    if($LASTEXITCODE -ne 0){throw 'Fixture compile failed'}
    $query=[SynapseX.Native.NvidiaDrsBridge]::Query($binary,[string[]]@('ansel'),[uint32[]]@(0x1075D972))
    if(!$query.Available){throw ('NVIDIA test unavailable: '+$query.Error)}
    if($query.ApplicationFound){throw 'Test profile unexpectedly exists'}
    $setup=[SynapseX.Native.NvidiaDrsBridge]::Apply($binary,[string[]]@('ansel'),[uint32[]]@(0x1075D972),[uint32[]]@(1))
    if(!$setup.Available -or !$setup.CreatedProfile){throw ('Could not create isolated fixture profile: '+$setup.Error)};$created=$true
    Import-Module (Join-Path $project 'host/modules/LabGpuExperiments.psm1') -Force
    $catalog=Get-LabGpuCatalog $binary
    $item=@($catalog.items|Where-Object key -eq 'ansel')[0]
    $record=Set-LabGpuItem @{path=$binary;key='ansel';value=0;expected=$item.value;expectedLocal=$item.local}
    if($record.status -ne 'applied'){throw 'GPU apply not verified'}
    $restored=Restore-LabGpuItem $record.id
    if($restored.status -ne 'restored'){throw 'GPU restore not verified'}
    $readback=[SynapseX.Native.NvidiaDrsBridge]::Query($binary,[string[]]@('ansel'),[uint32[]]@(0x1075D972))
    if($readback.Settings[0].Value -ne 1){throw 'Original NVIDIA value not restored'}
    $denied=[SynapseX.Native.NvidiaDrsBridge]::ApplyExistingChecked($binary,[string[]]@('ansel'),[uint32[]]@(0x1075D972),[uint32[]]@(0),[bool[]]@($false),[uint32[]]@(42),[bool[]]@($true))
    if($denied.Available){throw 'Stale expected value allowed'}
    [pscustomobject]@{ok=$true;isolatedNvidiaProfile=$true;applyReadback=$true;restoreReadback=$true;staleGuard=$true;realGameProfileModified=$false}|ConvertTo-Json -Compress
}finally{
    if($created){$cleanup=[SynapseX.Native.NvidiaDrsBridge]::Restore($binary,[string[]]@(),[uint32[]]@(),[uint32[]]@(),[bool[]]@(),$true);if(!$cleanup.Available){Write-Warning ('Fixture profile cleanup failed: '+$cleanup.Error)}}
    $env:SYNAPSEX_STATE_ROOT=$oldState
}
