[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$InstallerPath, [switch]$VerifyOnly)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
# Electron may inherit PSModulePath from PowerShell 7. Resolve the Windows
# PowerShell modules belonging to this exact executable, not its caller.
$env:PSModulePath = (Join-Path $PSHOME 'Modules') + ';' + $env:PSModulePath
try {
    $file = Get-Item -LiteralPath $InstallerPath -ErrorAction Stop
    if ($file.PSIsContainer -or $file.Length -ne 3410960) { throw '驱动安装包大小校验失败，未安装。' }
    $hash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
    if ($hash -cne '1F519A22E47187F70A1379A48CA604981C4FCF694F4E65B734AAA74A9FBA3032') { throw '驱动安装包 SHA-256 校验失败，未安装。' }
    $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -cne 'F380DCC9F706E2756A5047B832FFE719E1BC35F5') { throw '驱动数字签名不受信任，未安装。' }
    if ($VerifyOnly) { @{verified=$true;version='2.2.0';signer='namazso.eu'} | ConvertTo-Json -Compress; exit 0 }
    # Deliberately visible: the user must be able to read and accept/decline the
    # official installer, its license and UAC. Never auto-accept legal terms.
    $installer = Start-Process -FilePath $file.FullName -Verb RunAs -PassThru -Wait
    $exitCode = $installer.ExitCode
    $service = Get-Service -Name PawnIO -ErrorAction SilentlyContinue
    if ($exitCode -in @(1223,1602)) { $result=@{status='cancelled';message='安装已取消，未更改安全保护。'} }
    elseif ($exitCode -notin @(0,3010)) { throw ('驱动安装程序退出代码：' + $exitCode + '。请查看官方安装提示。') }
    elseif ($exitCode -eq 3010) { $result=@{status='reboot-required';message='驱动安装程序要求重启。请保存工作后自行重启电脑，再检查 CPU 温度。'} }
    elseif (-not $service) { $result=@{status='not-installed';message='安装窗口已关闭，但未检测到 PawnIO 驱动。可能未完成安装，请重试。'} }
    elseif ($service.Status -ne 'Running') { $result=@{status='reboot-required';message='已检测到 PawnIO 驱动，但尚未运行。请按官方安装提示重启电脑后检查。'} }
    else { $result=@{status='installed';message='PawnIO 驱动已安装并运行，温度采样会自动重试；如仍不可用，请重新打开软件。'} }
    $result | ConvertTo-Json -Compress
} catch {
    if ($_.Exception.NativeErrorCode -eq 1223 -or $_.Exception.InnerException.NativeErrorCode -eq 1223) {
        @{status='cancelled';message='已取消系统安装授权，未安装驱动。'} | ConvertTo-Json -Compress
        exit 0
    }
    Write-Error $_.Exception.Message
    exit 1
}
