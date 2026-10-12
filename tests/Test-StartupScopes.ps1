$ErrorActionPreference='Stop'
$env:SYNAPSEX_STATE_ROOT=Join-Path ([IO.Path]::GetTempPath()) ('SynapseX-Startup-Scopes-'+[guid]::NewGuid().ToString('N'))
$module=Import-Module (Join-Path (Split-Path -Parent $PSScriptRoot) 'host/modules/SystemOptimizer.psm1') -Force -PassThru
try{
    & $module {
        $script:values=@{}
        $script:failName=''
        $paths=@('HKCU:\Software\Microsoft\Windows\CurrentVersion\Run','HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce','HKLM:\Software\Microsoft\Windows\CurrentVersion\Run','HKLM:\Software\Microsoft\Windows\CurrentVersion\RunOnce','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\RunOnce')
        foreach($path in $paths){$script:values[$path]=@{Test='C:\测试应用\app.exe'}}
        function script:Get-StartupAudit {@{items=@();totalCount=0;manageableCount=0;note='fixture'}}
        function script:Test-Path {param($LiteralPath) if($script:values.ContainsKey($LiteralPath)){return $true}; Microsoft.PowerShell.Management\Test-Path -LiteralPath $LiteralPath}
        function script:Get-Item {
            param($LiteralPath)
            if(!$script:values.ContainsKey($LiteralPath)){throw 'Unexpected registry target'}
            $key=[pscustomobject]@{FixtureValues=$script:values[$LiteralPath]}
            $key | Add-Member ScriptMethod GetValue {param($Name,$Default,$Options) if($this.FixtureValues.ContainsKey($Name)){$this.FixtureValues[$Name]}else{$Default}}
            $key | Add-Member ScriptMethod GetValueKind {param($Name) 'ExpandString'}
            $key
        }
        function script:Remove-ItemProperty {
            param($LiteralPath,$Name,$ErrorAction)
            if(!$script:values.ContainsKey($LiteralPath)){throw 'Unexpected registry delete'}
            if($Name -eq $script:failName){$script:failName='';throw 'Injected remove error'}
            $script:values[$LiteralPath].Remove($Name)
        }
        function script:New-ItemProperty {
            param($LiteralPath,$Name,$PropertyType,$Value,[switch]$Force)
            if(!$script:values.ContainsKey($LiteralPath)){throw 'Unexpected registry write'}
            if($PropertyType -ne 'ExpandString'){throw 'Original registry kind not preserved'}
            $script:values[$LiteralPath][$Name]=$Value
        }
        foreach($path in $paths){
            $result=Disable-StartupEntries @([pscustomobject]@{manageable=$true;path=$path;name='Test'})
            if($script:values[$path].ContainsKey('Test')){throw 'Disable failed'}
            Restore-StartupEntries $result.backupId | Out-Null
            if($script:values[$path]['Test'] -cne 'C:\测试应用\app.exe'){throw 'Restore failed'}
        }
        $script:values[$paths[0]]['Failure']='value';$script:failName='Failure'
        $blocked=$false
        try{Disable-StartupEntries @([pscustomobject]@{manageable=$true;path=$paths[0];name='Test'},[pscustomobject]@{manageable=$true;path=$paths[0];name='Failure'}) | Out-Null}catch{$blocked=$true}
        if(!$blocked -or !$script:values[$paths[0]].ContainsKey('Test')){throw 'Batch rollback failed'}
        $result=Disable-StartupEntries @([pscustomobject]@{manageable=$true;path=$paths[0];name='Test'})
        $script:values[$paths[0]]['Test']='user-new-value'
        $blocked=$false;try{Restore-StartupEntries $result.backupId | Out-Null}catch{$blocked=$true}
        if(!$blocked -or $script:values[$paths[0]]['Test'] -cne 'user-new-value'){throw 'Restore overwrote external change'}
    }
    @{ok=$true;scopes=6;roundTrips='mocked registry';batchRollback=$true;conflictGuard=$true;realRegistryWrites=0}|ConvertTo-Json
}finally{Remove-Module SystemOptimizer;Remove-Item Env:SYNAPSEX_STATE_ROOT -ErrorAction SilentlyContinue}
