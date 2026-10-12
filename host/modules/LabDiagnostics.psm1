$ErrorActionPreference='Stop'
$script:probeRoot=Join-Path $(if($env:SYNAPSEX_STATE_ROOT){$env:SYNAPSEX_STATE_ROOT}else{Join-Path $env:LOCALAPPDATA 'SynapseX\state'}) 'lab-diagnostics'
function Initialize-LabMouse {
    if(!('SynapseX.InputLab.RawMouseProbe' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'RawMouseProbe.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing,System.Core,System}
}
function Initialize-LabDpc {
    if(!('SynapseX.DpcLab.DpcProbe' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'DpcProbe.cs')}
}
function Get-LabDiagnosticState {
    $xperf=Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\Windows Performance Toolkit\xperf.exe'
    @{mouse=$(if('SynapseX.InputLab.RawMouseProbe' -as [type]){[SynapseX.InputLab.RawMouseProbe]::State()}else{@{Status='idle';Message='尚未测试';Devices=@()}});dpc=$(if('SynapseX.DpcLab.DpcProbe' -as [type]){[SynapseX.DpcLab.DpcProbe]::State()}else{@{Status='idle';Message='尚未采样'}});xperfAvailable=(Test-Path -LiteralPath $xperf -PathType Leaf)}
}
function Start-LabDiagnostic([ValidateSet('mouse','dpc')][string]$Kind) {
    if($Kind -eq 'mouse'){Initialize-LabMouse;[SynapseX.InputLab.RawMouseProbe]::Start()|Out-Null}
    else {
        Initialize-LabDpc
        $xperf=Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\Windows Performance Toolkit\xperf.exe'
        if(!(Test-Path -LiteralPath $xperf -PathType Leaf)){throw '未安装 Windows Performance Toolkit 的 Xperf，无法生成驱动级统计。'}
        $signature=Get-AuthenticodeSignature -LiteralPath $xperf
        if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft'){throw 'Xperf 签名验证失败。'}
        [SynapseX.DpcLab.DpcProbe]::Recover($script:probeRoot)
        [SynapseX.DpcLab.DpcProbe]::Start($script:probeRoot,$xperf)|Out-Null
    }
    Get-LabDiagnosticState
}
function Stop-LabDiagnostics {
    if('SynapseX.InputLab.RawMouseProbe' -as [type]){[SynapseX.InputLab.RawMouseProbe]::Stop()}
    if('SynapseX.DpcLab.DpcProbe' -as [type]){[SynapseX.DpcLab.DpcProbe]::Stop()}
    Get-LabDiagnosticState
}
Export-ModuleMember -Function Get-LabDiagnosticState,Start-LabDiagnostic,Stop-LabDiagnostics
if(Test-Path -LiteralPath (Join-Path $script:probeRoot 'active-dpc.txt')){try{Initialize-LabDpc;[SynapseX.DpcLab.DpcProbe]::Recover($script:probeRoot)}catch{Write-Warning ('DPC 会话恢复待处理：'+$_.Exception.Message)}}
