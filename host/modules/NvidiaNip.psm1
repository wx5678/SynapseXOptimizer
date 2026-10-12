Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$script:nipRoot=Join-Path (Split-Path -Parent $PSScriptRoot) 'nvidia-library'
$script:nipState=if([string]::IsNullOrWhiteSpace($env:SYNAPSEX_STATE_ROOT)){Join-Path $env:LOCALAPPDATA 'SynapseX\state'}else{[IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT)}
$script:nipBackups=Join-Path $script:nipState 'nvidia-nip-backups'
$script:nipPreviews=@{}
function Initialize-Nip {
 if(-not ('SynapseX.Nip.Importer' -as [type])){
  $options=@{Path=(Join-Path (Split-Path -Parent $PSScriptRoot) 'native/NvidiaNip.cs')}
  if($PSVersionTable.PSEdition -eq 'Desktop'){$options.ReferencedAssemblies=@('System.dll','System.Core.dll','System.Xml.dll')}
  Add-Type @options
 }
}
function Get-NvidiaNipLibrary {
 $data=Get-Content -LiteralPath (Join-Path $script:nipRoot 'catalog.json') -Raw -Encoding UTF8 | ConvertFrom-Json
 [ordered]@{items=@($data.items);backups=@(Get-ChildItem -LiteralPath $script:nipBackups -Filter 'nip-*.xml' -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 30 | ForEach-Object {@{id=$_.BaseName;createdAt=$_.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')}})}
}
function Resolve-NipPath([string]$Id,[string]$FilePath) {
 if($Id){
  if($Id -cnotmatch '^[a-f0-9]{64}$' -or @((Get-NvidiaNipLibrary).items | Where-Object id -CEQ $Id).Count -ne 1){throw '配置库编号无效。'}
  return Join-Path $script:nipRoot ($Id+'.nip')
 }
 if([string]::IsNullOrWhiteSpace($FilePath) -or $FilePath.StartsWith('\\') -or -not [IO.Path]::IsPathRooted($FilePath)){throw '请选择本机 NIP 文件。'}
 $full=[IO.Path]::GetFullPath($FilePath)
 if([IO.Path]::GetExtension($full) -ine '.nip' -or -not(Test-Path -LiteralPath $full -PathType Leaf)){throw '请选择存在的 .nip 文件。'}
 return $full
}
function Read-NipBytes([string]$Path) {
 if((Get-Item -LiteralPath $Path).Length -gt 2097152){throw 'NIP 文件超过 2MB。'}
 [IO.File]::ReadAllBytes($Path)
}
function New-NipSession { New-Object SynapseX.Nip.NativeSession }
function Assert-NipAdmin {
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
 if(-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw '导入或恢复需要 Windows 管理员权限。'}
}
function Get-NvidiaNipPreview([string]$Id,[string]$FilePath) {
 Initialize-Nip
 $path=Resolve-NipPath $Id $FilePath
 $bytes=Read-NipBytes $path
 $hash=[SynapseX.Nip.Importer]::Hash($bytes)
 if($Id -and $hash -cne $Id){throw '内置配置文件校验失败。'}
 $values=[SynapseX.Nip.Importer]::Parse([SynapseX.Nip.Importer]::Decode($bytes))
 $session=$null
 try{
  $session=New-NipSession
  $preview=[SynapseX.Nip.Importer]::Inspect($session,$values,[IO.Path]::GetFileName($path))
 }finally{if($session){$session.Dispose()}}
 foreach($key in @($script:nipPreviews.Keys)){if($script:nipPreviews[$key].expires -lt (Get-Date)){$script:nipPreviews.Remove($key)}}
 if($script:nipPreviews.Count -ge 16){$script:nipPreviews.Clear()}
 $token=[guid]::NewGuid().ToString('N')
 $name=if($Id){[string](@((Get-NvidiaNipLibrary).items|Where-Object id -eq $Id)[0].name)}else{[IO.Path]::GetFileName($path)}
 $script:nipPreviews[$token]=@{path=$path;hash=$hash;values=$values;preview=$preview;name=$name;expires=(Get-Date).AddMinutes(10)}
 [ordered]@{token=$token;name=$name;scope='全局 · Base Profile';hash=$hash;rows=@($preview.rows);changed=$preview.changed;skipped=$preview.skipped;total=$values.Count}
}
function Set-NvidiaNip([string]$Token,[bool]$AcceptGlobal=$false) {
 Assert-NipAdmin
 if(-not $AcceptGlobal){throw '请先确认 NVIDIA 全局影响。'}
 if(-not $script:nipPreviews.ContainsKey($Token)){throw '预览已失效，请重新读取。'}
 $entry=$script:nipPreviews[$Token];$script:nipPreviews.Remove($Token)
 if($entry.expires -lt (Get-Date)){throw '预览已过期，请重新读取。'}
 if([SynapseX.Nip.Importer]::Hash((Read-NipBytes $entry.path)) -cne $entry.hash){throw '文件在预览后发生变化，请重新读取。'}
 $backupId='nip-'+(Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N')
 $session=$null
 try{
  $session=New-NipSession
  $count=[SynapseX.Nip.Importer]::Apply($session,$entry.values,$entry.name,$entry.preview.fingerprint,(Join-Path $script:nipBackups ($backupId+'.xml')))
 }finally{if($session){$session.Dispose()}}
 [ordered]@{ok=$true;changed=$count;skipped=$entry.preview.skipped;backupId=$backupId;name=$entry.name}
}
function Restore-NvidiaNip([string]$BackupId) {
 Assert-NipAdmin;Initialize-Nip
 if($BackupId -notmatch '^nip-\d{8}-\d{6}-\d{3}-[a-f0-9]{32}$'){throw '请选择有效的 NIP 导入备份。'}
 $backup=[SynapseX.Nip.Importer]::ReadBackup((Join-Path $script:nipBackups ($BackupId+'.xml')))
 $session=$null
 try{
  $session=New-NipSession
  $safety=Join-Path $script:nipBackups ('restore-safety-'+[guid]::NewGuid().ToString('N')+'.xml')
  $count=[SynapseX.Nip.Importer]::Restore($session,$backup,$safety)
 }finally{if($session){$session.Dispose()}}
 [ordered]@{ok=$true;changed=$count;backupId=$BackupId;name=$backup.name}
}
Export-ModuleMember -Function Get-NvidiaNipLibrary,Get-NvidiaNipPreview,Set-NvidiaNip,Restore-NvidiaNip
