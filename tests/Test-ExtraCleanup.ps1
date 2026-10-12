$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$root=Join-Path ([IO.Path]::GetTempPath()) ('Extra-Cleanup-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root|Out-Null
$names=@('thumbcache_256.db','iconcache_256.db','setupact.log','setupapi.old','setuplog.txt','winnt32.log','personal.log','report.wer','dump.mdmp','keep.docx')
foreach($name in $names){Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'fixtures/maintenance/sample.tmp') -Destination (Join-Path $root $name);[IO.File]::SetLastWriteTimeUtc((Join-Path $root $name),[DateTime]::UtcNow.AddDays(-40))}
New-Item -ItemType Directory -Path (Join-Path $root 'nested')|Out-Null
foreach($name in @('setupchild.log','thumbcache_32.db')){Copy-Item -LiteralPath (Join-Path $root $names[0]) -Destination (Join-Path $root ('nested/'+$name));[IO.File]::SetLastWriteTimeUtc((Join-Path $root ('nested/'+$name)),[DateTime]::UtcNow.AddDays(-40))}
$m=Import-Module (Join-Path $repo 'host/modules/MaintenanceManager.psm1') -Force -PassThru
try{& $m {
    param($Root)
    $script:fixtureRoot=$Root
    function script:Get-CleanupRoots {param($Category) $script:fixtureRoot}
    $thumb=Get-CleanupPreview -Category thumbnails
    if($thumb.items.Count -ne 1 -or [IO.Path]::GetFileName($thumb.items[0].path) -ne 'thumbcache_256.db'){throw 'Thumbnail handler escaped scope'}
    $setup=Get-CleanupPreview -Category setup-logs
    if($setup.items.Count -ne 4 -or @($setup.items|Where-Object{$_.path -match 'nested'}).Count){throw 'Setup handler entered subtree or wrong file set'}
    $wer=Get-CleanupPreview -Category error-reports
    if(@($wer.items|Where-Object{$_.path -match '\.(db|docx|txt|old)$'}).Count -or !@($wer.items|Where-Object{$_.path -match 'report.wer'}).Count){throw 'WER handler extension mismatch'}
} $root
@{ok=$true;categories=3;systemWrites=0;deletions=0;checks='thumbnail exact names; setup immediate children only; WER report extensions';fixture=$root}|ConvertTo-Json
}finally{Remove-Module $m.Name}
