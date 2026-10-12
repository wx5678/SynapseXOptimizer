$ErrorActionPreference='Stop'
$fpsMonitorModule=Import-Module (Join-Path $PSScriptRoot '../host/modules/RealtimeMonitor.psm1') -Force -PassThru
& $fpsMonitorModule {
  function script:Get-ForegroundProcessId { 20 }
  function script:Get-CimInstance { param($ClassName,$ErrorAction)
    if($ClassName -like '*GPUEngine'){return @([pscustomobject]@{Name='pid_4_eng_0';UtilizationPercentage=999},[pscustomobject]@{Name='pid_20_eng_0';UtilizationPercentage=99})}
    return @()
  }
  function script:Get-Process {param($Id,$Name,$ErrorAction)
    if($Id){return $script:FixtureProcesses | Where-Object Id -eq $Id}
    if($Name){return $script:FixtureProcesses | Where-Object ProcessName -eq $Name}
    return $script:FixtureProcesses
  }
  function FixtureProcess($id,$name,$window=1){[pscustomobject]@{Id=$id;ProcessName=$name;MainWindowHandle=$window;MainWindowTitle=if($window){$name}else{''};Path="D:\Games\$name\$name.exe";WorkingSet64=1GB}}
  $script:FixtureProcesses=@((FixtureProcess 4 'System'),(FixtureProcess 10 'Arena'))
  if((Get-RealtimeMonitorTargets -Force).detected.processId -ne 10){throw 'Initial game missing'}
  $script:FixtureProcesses+=FixtureProcess 20 'OtherGame'
  if((Get-RealtimeMonitorTargets -Force).detected.processId -ne 10){throw 'Focus/GPU change stole current target'}
  $script:FixtureProcesses+=FixtureProcess 30 'fxgame' 0
  $result=Get-RealtimeMonitorTargets -Force
  if($result.detected.processId -ne 30){throw 'Minimized JiuYin not retained'}
  if(@($result.candidates|Where-Object processId -eq 4).Count){throw 'System was exposed as a game'}
  if((Resolve-MonitorGame -TargetProcessName 'fxgame.exe' -TargetProcessId 999)){throw 'Missing PID fell back to another instance'}
  $script:FixtureProcesses=@($script:FixtureProcesses|Where-Object Id -ne 30)
  $afterExit=Get-RealtimeMonitorTargets -Force
  if($afterExit.detected.processId -ne 20){throw ('Exit reselection: '+($afterExit|ConvertTo-Json -Depth 5 -Compress))}
  $script:FixtureProcesses=@((FixtureProcess 20 'WeChatAppEx'),(FixtureProcess 21 'WeChat'),(FixtureProcess 22 'Weixin'),(FixtureProcess 23 'chrome'),(FixtureProcess 24 'EpicGamesLauncher'))
  if((Get-RealtimeMonitorTargets -Force).detected){throw 'Ordinary apps must not qualify even from Games directory and high GPU'}
  $generic=FixtureProcess 20 'client';$generic.Path='C:\Tencent\client.exe';$script:FixtureProcesses=@($generic)
  if((Get-RealtimeMonitorTargets -Force).detected){throw 'Generic client, Tencent path, window and GPU are not game evidence'}
  $cs=FixtureProcess 40 'cs2' 0;$cs.Path='D:\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe'
  $script:FixtureProcesses+= $cs
  if((Get-RealtimeMonitorTargets -Force).detected.processId -ne 40){throw 'Non-JiuYin minimized game not recognized'}
  $script:FixtureProcesses=@($generic)
  if((Get-RealtimeMonitorTargets -Force).detected){throw 'Game exit switched to ordinary app'}
  $unreal=FixtureProcess 50 'Example-Win64-Shipping' 0;$unreal.Path='D:\Custom\Example-Win64-Shipping.exe';$script:FixtureProcesses=@($unreal)
  if((Get-RealtimeMonitorTargets -Force).detected.processId -ne 50){throw 'Unreal game outside known libraries not recognized'}
  Write-Output 'PASS: WeChat variants, browser/launcher excluded, generic client excluded, CS2/Unreal recognized, minimized game retained, exit cleared'
  Write-Output 'PASS: System excluded, stable target, minimized JiuYin, strict PID, exit reselection'
}
Remove-Module $fpsMonitorModule
