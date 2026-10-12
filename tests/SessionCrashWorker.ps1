param([string]$Root,[int]$TargetId)
$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path (Split-Path $PSScriptRoot -Parent) 'host/modules/SessionExperiments.cs') -ReferencedAssemblies System.Xml,System.Core,System
$engine=New-Object SynapseX.SessionLab.Engine($Root)
$target=[SynapseX.SessionLab.Native]::Inspect($TargetId)
$null=$engine.StartSingle($target,'memory',$null,30)
[IO.File]::WriteAllText((Join-Path $Root 'ready'),'ready')
Start-Sleep -Seconds 60
