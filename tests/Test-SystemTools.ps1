$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$module=Import-Module (Join-Path $repo 'host/modules/SystemTools.psm1') -Force -PassThru
try{
    if((Get-SystemTools).items.Count -ne 7){throw 'Missing system tools'}
    & $module {
        $script:calls=@()
        function script:Start-SystemToolNative {param($Definition,$Executable) $script:calls+=@{id=$Definition.id;file=$Definition.file;path=$Executable}}
        function Assert-Blocked($Work){$blocked=$false;try{&$Work|Out-Null}catch{$blocked=$true};if(!$blocked){throw 'Expected refusal'}}
        Assert-Blocked {Open-SystemTool 'arbitrary.exe' ''}
        Assert-Blocked {Open-SystemTool 'graphics' 'C:\Windows\anything.exe'}
        Assert-Blocked {Open-SystemTool 'game-properties' 'relative.exe'}
        Assert-Blocked {Open-SystemTool 'game-properties' 'C:\Windows\win.ini'}
        Assert-Blocked {Open-SystemTool 'game-properties' 'C:\not-installed\game.exe'}
        Open-SystemTool 'graphics' ''|Out-Null
        if($script:calls[-1].file -cne 'ms-settings:display-advancedgraphics'){throw 'Incorrect settings URI'}
        $target=Join-Path $env:SystemRoot 'System32\notepad.exe'
        Open-SystemTool 'game-properties' $target|Out-Null
        if($script:calls[-1].path -ine $target){throw 'Incorrect file properties target'}
        if($script:calls.Count -ne 2){throw 'Invalid input triggered launch'}
    }
    @{ok=$true;realWindowsOpened=0;checks='7 IDs, fixed URI, properties only, arbitrary path/command refused'}|ConvertTo-Json
}finally{Remove-Module $module.Name}
