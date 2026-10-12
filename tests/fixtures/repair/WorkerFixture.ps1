param([string]$StateRoot,[switch]$SfcHelp)
$ErrorActionPreference='Stop'
$env:SYNAPSEX_STATE_ROOT=$StateRoot
$repo=Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$module=Import-Module (Join-Path $repo 'host/modules/RepairJobs.psm1') -Force -PassThru
& $module {
    param($SfcHelp)
    $script:sfcHelp=$SfcHelp
    function script:Get-RepairDefinitions {if($script:sfcHelp){@{id='fixture';title='Help only';file='sfc.exe';arguments='/?';restart=$false}}else{@{id='fixture';title='Fixture only';file='cmd.exe';arguments='/d /c "echo fixture-output & exit /b 7"';restart=$false}}}
    $r=@{jobId='20260909-120000-000-11111111111111111111111111111111';sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;id='fixture';title='Fixture only';createdAt=[DateTime]::UtcNow.ToString('o');status='starting';processId=0;startToken='';executable='';exitCode=$null;finishedAt=$null;restartRequired=$false;message='Fixture'}
    Save-RepairJob $r
    Invoke-RepairWorker $r.jobId
} $SfcHelp
