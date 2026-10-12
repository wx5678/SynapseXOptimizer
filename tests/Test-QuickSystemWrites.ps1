$ErrorActionPreference='Stop'
$old=$env:SYNAPSEX_STATE_ROOT
$env:SYNAPSEX_STATE_ROOT=Join-Path ([IO.Path]::GetTempPath()) ('Quick-Base-Fixture-'+[guid]::NewGuid().ToString('N'))
$module=Import-Module (Join-Path (Split-Path -Parent $PSScriptRoot) 'host/modules/SystemOptimizer.psm1') -Force -PassThru
try {
    & $module {
        $script:store=@{A=0;B=0};$script:fail='';$script:rollbackFail=$false
        function script:Get-SystemTweakDefinitions { @([pscustomobject]@{id='fixture';writes=@(@{path='fixture';name='A';type='DWord';desired=1},@{path='fixture';name='B';type='DWord';desired=1})}) }
        function script:Get-RegistrySnapshot($Write){[ordered]@{path=$Write.path;name=$Write.name;exists=$true;value=$script:store[$Write.name];kind='DWord'}}
        function script:Set-RegistryWrite($Write){
            $record=Get-ChildItem -LiteralPath $systemBackupRoot -Filter '*.json'|Sort-Object Name -Descending|Select-Object -First 1
            if(!$record -or (Get-Content $record.FullName -Raw -Encoding UTF8|ConvertFrom-Json).status -ne 'pending'){throw 'Backup missing before write'}
            $script:store[$Write.name]=1
            if($Write.name -eq 'B' -and $script:fail -eq 'partial'){throw 'partial failure'}
            if($Write.name -eq 'B' -and $script:fail -eq 'silent'){$script:store.B=0}
        }
        function script:Restore-RegistrySnapshot($Snapshot){if($script:rollbackFail){throw 'rollback refused'};$script:store[$Snapshot.name]=$Snapshot.value}
        function script:Get-SystemOptimizationCatalog {@()}
        $success=Set-SystemOptimizations @('fixture')
        if(!$success.ok -or $script:store.A -ne 1 -or $script:store.B -ne 1){throw 'Apply failed'}
        foreach($mode in @('partial','silent')){
            $script:store=@{A=0;B=0};$script:fail=$mode;$failed=$false
            try{Set-SystemOptimizations @('fixture')|Out-Null}catch{$failed=$true;if($_ -notmatch '备份：'){throw 'Missing recovery ID'}}
            if(!$failed -or $script:store.A -ne 0 -or $script:store.B -ne 0){throw 'Partial writes not rolled back'}
            $record=Get-ChildItem -LiteralPath $systemBackupRoot -Filter '*.json'|Sort-Object Name -Descending|Select-Object -First 1|Get-Content -Raw -Encoding UTF8|ConvertFrom-Json
            if($record.status -ne 'rolled-back'){throw 'Wrong rollback status'}
        }
        $script:rollbackFail=$true;$failed=$false
        try{Set-SystemOptimizations @('fixture')|Out-Null}catch{$failed=$true}
        $last=Get-ChildItem -LiteralPath $systemBackupRoot -Filter '*.json'|Sort-Object Name -Descending|Select-Object -First 1|Get-Content -Raw -Encoding UTF8|ConvertFrom-Json
        if(!$failed -or $last.status -ne 'rollback-failed'){throw 'Rollback failure concealed'}
    }
    @{ok=$true;systemWrites=0;tests='pre-backup, success readback, partial/silent failure rollback, failed rollback record'}|ConvertTo-Json
}finally{Remove-Module $module.Name -ErrorAction SilentlyContinue;$env:SYNAPSEX_STATE_ROOT=$old}
