$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
$id=[guid]::NewGuid().ToString('N')
$root=Join-Path ([IO.Path]::GetTempPath()) ('sx-registry-test-'+$id)
New-Item -ItemType Directory -Path $root|Out-Null
$beforeState=$env:SYNAPSEX_STATE_ROOT;$env:SYNAPSEX_STATE_ROOT=$root
$fixture=$null;$record=$null
$name='SXLaunchFixture'+$id+'.exe'
$key='SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options\'+$name
$probe=[Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($key)
if($probe){$probe.Dispose();throw 'Unexpected existing test key'}
try {
    Add-Type -Path (Join-Path $project 'host/modules/SessionExperiments.cs') -ReferencedAssemblies System.Xml,System.Core,System
    Import-Module (Join-Path $project 'host/modules/LabRegistryExperiments.psm1') -Force
    $module=Get-Module LabRegistryExperiments
    # Exercise binary IRQ serialization under an isolated HKCU key, never real hardware.
    & $module {
        param($testId)
        $originalHive=$script:regHive;$script:regHive=[Microsoft.Win32.Registry]::CurrentUser
        $testKey='Software\SynapseX-Lab-Test-'+$testId
        try{
            $original=Get-LrSnapshot $testKey @('DevicePolicy','AssignmentSetOverride')
            $desired=@{keyExists=$true;values=@(@{name='DevicePolicy';exists=$true;kind='DWord';value=4},@{name='AssignmentSetOverride';exists=$true;kind='Binary';value=[Convert]::ToBase64String([byte[]]@(1,0,0,0,0,0,0,128))})}
            Set-LrValues $testKey $desired
            if(!(Test-LrSame (Get-LrSnapshot $testKey @('DevicePolicy','AssignmentSetOverride')) $desired)){throw 'Binary IRQ value roundtrip failed'}
            Set-LrValues $testKey $original
            if(!(Test-LrSame (Get-LrSnapshot $testKey @('DevicePolicy','AssignmentSetOverride')) $original)){throw 'Absent key restore failed'}
            Set-LrValues $testKey @{keyExists=$true;values=@($desired.values[0])}
            Restore-LrPartialWrite $testKey $original $desired
            if(!(Test-LrSame (Get-LrSnapshot $testKey @('DevicePolicy','AssignmentSetOverride')) $original)){throw 'Partial write recovery failed'}
            Set-LrValues $testKey @{keyExists=$true;values=@(@{name='DevicePolicy';exists=$true;kind='DWord';value=9})}
            $rejected=$false
            try{Restore-LrPartialWrite $testKey $original $desired}catch{$rejected=$true}
            if(!$rejected -or (Get-LrSnapshot $testKey @('DevicePolicy')).values[0].value -ne 9){throw 'External value overwritten during rollback'}
            Set-LrValues $testKey $original
        }finally{$script:regHive.DeleteSubKey($testKey,$false);$script:regHive=$originalHive}
    } $id
    $binary=Join-Path $root $name
    & "$env:windir\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe ("/out:"+$binary) (Join-Path $PSScriptRoot 'SchedulerFixture.cs')
    if($LASTEXITCODE -ne 0){throw 'Fixture compile failed'}
    $offer=Get-LabLaunchPriority $binary
    $record=Set-LabRegistryExperiment @{offer=$offer.offer;priority=6}
    if($record.status -ne 'applied'){throw 'IFEO write failed'}
    $fixture=Start-Process -FilePath $binary -WindowStyle Hidden -PassThru
    $fixture.Refresh()
    if($fixture.PriorityClass -ne 'AboveNormal'){throw ('IFEO not effective: '+$fixture.PriorityClass)}
    $result=Restore-LabRegistryExperiment $record.id
    if($result.status -ne 'restored'){throw 'IFEO restoration failed'}
    Stop-Process -Id $fixture.Id
    $fixture=Start-Process -FilePath $binary -WindowStyle Hidden -PassThru
    if($fixture.PriorityClass -ne 'Normal'){throw 'IFEO still affecting next launch'}
    [pscustomobject]@{ok=$true;irqBinaryRoundtrip=$true;ifeoNextLaunch=$true;ifeoRestored=$true;realHardwareChanged=$false;realGameModified=$false}|ConvertTo-Json -Compress
}finally{
    if($record -and $record.status -ne 'restored'){try{Restore-LabRegistryExperiment $record.id|Out-Null}catch{Write-Warning $_}}
    if($fixture -and !$fixture.HasExited){Stop-Process -Id $fixture.Id}
    $check=[Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($key)
    if($check){$empty=$check.ValueCount -eq 0 -and $check.SubKeyCount -eq 0;$check.Dispose();if($empty){[Microsoft.Win32.Registry]::LocalMachine.DeleteSubKey($key,$false)}}
    $env:SYNAPSEX_STATE_ROOT=$beforeState
}
