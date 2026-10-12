$ErrorActionPreference='Stop'
$script:previews=@{}
$script:launches=@{}
$maintenanceBase=if($env:SYNAPSEX_STATE_ROOT){[IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT)}else{Join-Path $env:LOCALAPPDATA 'SynapseX\state'}
$script:maintenanceRecords=Join-Path $maintenanceBase 'maintenance-records'

function Get-MaintenanceHash([string]$Text) {
    $hash=[Security.Cryptography.SHA256]::Create()
    try {-join ($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text))|ForEach-Object {$_.ToString('x2')})}finally{$hash.Dispose()}
}
function Save-MaintenanceRecord($Record) {
    New-Item -ItemType Directory -Path $script:maintenanceRecords -Force | Out-Null
    $path=Join-Path $script:maintenanceRecords ($Record.id+'.json')
    [IO.File]::WriteAllText($path+'.pending',($Record|ConvertTo-Json -Depth 12),(New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath ($path+'.pending') -Destination $path -Force
}
function Get-MaintenanceHistory {
    $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    @(Get-ChildItem -LiteralPath $script:maintenanceRecords -Filter '*.json' -File -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 50 | ForEach-Object {
        try {$record=Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8|ConvertFrom-Json;if($record.sid -eq $sid){$record}}catch{}
    })
}
function New-MaintenanceRecord([string]$Kind) {
    @{id=((Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N'));kind=$Kind;createdAt=[DateTime]::UtcNow.ToString('o');sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;status='pending';results=@()}
}
function Get-CleanupRoots([ValidateSet('temp','browser-cache','crash-dumps','system-logs','thumbnails','setup-logs','error-reports')][string]$Category='temp') {
    $local=[Environment]::GetFolderPath('LocalApplicationData')
    if($Category -eq 'browser-cache'){
        foreach($vendor in @('Google\Chrome\User Data','Microsoft\Edge\User Data')){
            $browserRoot=Join-Path $local $vendor
            foreach($profile in @(Get-ChildItem -LiteralPath $browserRoot -Directory -ErrorAction SilentlyContinue|Where-Object{$_.Name -eq 'Default' -or $_.Name -match '^Profile \d+$'})){
                foreach($relative in @('Cache\Cache_Data','Code Cache\js','Code Cache\wasm')){$cache=Join-Path $profile.FullName $relative;if(Test-Path -LiteralPath $cache -PathType Container){$cache}}
            }
        }
        foreach($profile in @(Get-ChildItem -LiteralPath (Join-Path $local 'Mozilla\Firefox\Profiles') -Directory -ErrorAction SilentlyContinue)){$cache=Join-Path $profile.FullName 'cache2\entries';if(Test-Path -LiteralPath $cache -PathType Container){$cache}}
        return
    }
    if($Category -eq 'crash-dumps'){@((Join-Path $local 'CrashDumps'),(Join-Path $env:SystemRoot 'Minidump'))|Where-Object{Test-Path -LiteralPath $_ -PathType Container};return}
    if($Category -eq 'system-logs'){@((Join-Path $env:SystemRoot 'Logs\CBS'),(Join-Path $env:SystemRoot 'Logs\DISM'))|Where-Object{Test-Path -LiteralPath $_ -PathType Container};return}
    if($Category -eq 'thumbnails'){@((Join-Path $local 'Microsoft\Windows\Explorer'))|Where-Object{Test-Path -LiteralPath $_ -PathType Container};return}
    if($Category -eq 'setup-logs'){$env:SystemRoot;return}
    if($Category -eq 'error-reports'){
        foreach($base in @($local,[Environment]::GetFolderPath('CommonApplicationData'))){foreach($relative in @('Microsoft\Windows\WER\ReportArchive','Microsoft\Windows\WER\ReportQueue')){$path=Join-Path $base $relative;if(Test-Path -LiteralPath $path -PathType Container){$path}}}
        return
    }
    # No caller-controlled paths; intentionally excludes downloads, shader caches and game data.
    @((Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Temp'),(Join-Path $env:SystemRoot 'Temp')) | Select-Object -Unique
}
function Test-CleanupPath([string]$Path,[string]$Root) {
    $rootFull=[IO.Path]::GetFullPath($Root).TrimEnd('\')
    $full=[IO.Path]::GetFullPath($Path)
    if(!$full.StartsWith($rootFull+'\',[StringComparison]::OrdinalIgnoreCase)){return $false}
    # Check every ancestor, including ancestors above the allowed root.
    $cursor=$full
    while($cursor){
        if(!(Test-Path -LiteralPath $cursor)){return $false}
        if((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){return $false}
        $cursor=Split-Path -Parent $cursor
    }
    return $true
}
function Assert-CleanupCategory([string]$Category){
    if($Category -eq 'browser-cache' -and @(Get-Process -Name chrome,msedge,firefox -ErrorAction SilentlyContinue).Count){throw '请先正常关闭 Chrome、Edge 和 Firefox（包括后台进程），再扫描或清理缓存。不会自动结束浏览器。'}
}
function Test-CleanupCandidate($File,[int]$Days,[string]$Category='temp') {
    $extension=switch($Category){
        'browser-cache' {$true}
        'crash-dumps' {$File.Extension -ieq '.dmp'}
        'system-logs' {$File.Extension -match '^(?i)\.(log|cab|bak)$'}
        'thumbnails' {$File.Name -match '^(?i)thumbcache_[a-z0-9_]+\.db$'}
        'setup-logs' {$File.Name -match '^(?i)(setup[^\\]*\.(log|old)|setuplog\.txt|winnt32\.log)$'}
        'error-reports' {$File.Extension -match '^(?i)\.(wer|dmp|mdmp|hdmp|cab|log|tmp|xml)$'}
        default {$File.Extension -match '^(?i)\.(tmp|temp|log)$'}
    }
    !$File.PSIsContainer -and $extension -and
    $File.FullName -notmatch '(?i)(synapsex|codex|xwechat|wechat)' -and
    $File.LastWriteTimeUtc -lt [DateTime]::UtcNow.AddDays(-$Days) -and
    !($File.Attributes -band ([IO.FileAttributes]::ReparsePoint -bor [IO.FileAttributes]::ReadOnly))
}
function Get-CleanupPreview([ValidateSet(7,30)][int]$Days=7,[ValidateSet('temp','browser-cache','crash-dumps','system-logs','thumbnails','setup-logs','error-reports')][string]$Category='temp') {
    Assert-CleanupCategory $Category
    foreach($key in @($script:previews.Keys)){if($script:previews[$key].expires -lt [DateTime]::UtcNow){$script:previews.Remove($key)}}
    if($script:previews.Count -ge 10){$oldest=$script:previews.Keys|Sort-Object {$script:previews[$_].expires}|Select-Object -First 1;$script:previews.Remove($oldest)}
    $files=New-Object 'System.Collections.Generic.List[object]'
    $warnings=New-Object 'System.Collections.Generic.List[string]'
    $roots=@(Get-CleanupRoots $Category)
    $watch=[Diagnostics.Stopwatch]::StartNew();$visited=0;$truncated=$false
    foreach($root in $roots){
        $queue=New-Object 'System.Collections.Generic.Queue[string]';$queue.Enqueue($root)
        while($queue.Count){
            if($watch.ElapsedMilliseconds -gt 3500 -or $visited -ge 1000 -or $files.Count -ge 500){$truncated=$true;break}
            $directory=$queue.Dequeue();$visited++
            try{
                $dir=Get-Item -LiteralPath $directory -Force
                if($dir.Attributes -band [IO.FileAttributes]::ReparsePoint){continue}
                foreach($file in Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop){
                    if($watch.ElapsedMilliseconds -gt 3500 -or $files.Count -ge 500){$truncated=$true;break}
                    if($file.Attributes -band [IO.FileAttributes]::ReparsePoint -or $file.FullName -match '(?i)(synapsex|codex|xwechat|wechat)'){continue}
                    if($file.PSIsContainer){
                        # These handlers only own matching immediate children, never Windows subtrees.
                        if($Category -in @('setup-logs','thumbnails')){continue}
                        if($queue.Count -lt 1000){$queue.Enqueue($file.FullName)}else{$truncated=$true};continue
                    }
                    if((Test-CleanupCandidate $file $Days $Category) -and (Test-CleanupPath $file.FullName $root)){
                        $files.Add(@{id=[guid]::NewGuid().ToString('N');path=$file.FullName;bytes=[long]$file.Length;modifiedAt=$file.LastWriteTimeUtc.ToString('o');root=$root})
                    }
                }
            }catch{if($warnings.Count -lt 10){$warnings.Add($directory+': '+$_.Exception.Message)}}
        }
    }
    $token=[guid]::NewGuid().ToString('N');$expires=[DateTime]::UtcNow.AddMinutes(10)
    $script:previews[$token]=@{expires=$expires;files=@($files.ToArray());days=$Days;category=$Category}
    @{token=$token;expiresAt=$expires.ToString('o');days=$Days;category=$Category;roots=$roots;items=@($files.ToArray());warnings=@($warnings.ToArray());truncated=$truncated;capturedAt=[DateTime]::UtcNow.ToString('o');account=[Security.Principal.WindowsIdentity]::GetCurrent().Name}
}
function Remove-CleanupSelection([string]$Token,[string[]]$Ids) {
    if(!$script:previews.ContainsKey($Token)){throw '清理预览不存在，请重新扫描。'}
    $preview=$script:previews[$Token]
    Assert-CleanupCategory $preview.category
    if($preview.expires -lt [DateTime]::UtcNow){$script:previews.Remove($Token);throw '清理预览已过期，请重新扫描。'}
    $unique=@($Ids|Select-Object -Unique)
    if(!$unique.Count -or $unique.Count -gt 500){throw '请选择 1 至 500 个预览中的文件。'}
    $selected=@($preview.files|Where-Object {$unique -contains $_.id})
    if($selected.Count -ne $unique.Count){throw '选择包含不属于此预览的文件，未执行清理。'}
    $record=New-MaintenanceRecord 'cleanup';$record.category=$preview.category
    $titles=@{temp='临时文件';'browser-cache'='浏览器缓存';'crash-dumps'='崩溃转储';'system-logs'='系统维护日志';thumbnails='缩略图缓存';'setup-logs'='Windows 安装日志';'error-reports'='Windows 错误报告'}
    $record.title=$titles[$preview.category]+'清理';$record.requested=$selected;$record.results=@();Save-MaintenanceRecord $record
    $script:previews.Remove($Token) # One-shot: network retries cannot repeat a destructive action.
    foreach($entry in $selected){
        $result=@{path=$entry.path;bytes=$entry.bytes;status='skipped';reason=''};$stream=$null
        try{
            Assert-CleanupCategory $preview.category
            if(@(Get-CleanupRoots $preview.category) -notcontains $entry.root -or !(Test-CleanupPath $entry.path $entry.root)){throw '路径不存在或已重定向。'}
            $file=Get-Item -LiteralPath $entry.path -Force
            if(!(Test-CleanupCandidate $file $preview.days $preview.category) -or $file.Length -ne $entry.bytes -or $file.LastWriteTimeUtc.ToString('o') -ne $entry.modifiedAt){throw '文件已变化或不再满足清理条件。'}
            $stream=[IO.File]::Open($entry.path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
            $stream.Dispose();$stream=$null
            if(!(Test-CleanupPath $entry.path $entry.root)){throw '删除前路径校验失败。'}
            $file=Get-Item -LiteralPath $entry.path -Force
            if($file.Length -ne $entry.bytes -or $file.LastWriteTimeUtc.ToString('o') -ne $entry.modifiedAt){throw '文件刚被更新，已跳过。'}
            Remove-Item -LiteralPath $entry.path -ErrorAction Stop
            if(Test-Path -LiteralPath $entry.path){throw '文件仍存在，请重新扫描。'}
            $result.status='deleted'
        }catch{$result.reason=$_.Exception.Message}finally{if($stream){$stream.Dispose()}}
        $record.results+=@($result)
        Save-MaintenanceRecord $record
    }
    $removed=@($record.results|Where-Object {$_.status -eq 'deleted'})
    $record.status=if($removed.Count -eq $selected.Count){'completed'}else{'partial'};Save-MaintenanceRecord $record
    @{ok=$true;recordId=$record.id;results=$record.results;message="已删除 $($removed.Count) 个文件，跳过 $($selected.Count-$removed.Count) 个。删除为永久操作；记录不包含文件内容，不能恢复。"}
}

function Resolve-Uninstaller([string]$Command) {
    $command=[Environment]::ExpandEnvironmentVariables($Command).Trim()
    $exe='';$arguments=''
    if($command -match '^"([^"\r\n]+\.exe)"\s*(.*)$'){$exe=$Matches[1];$arguments=$Matches[2]}
    elseif($command -match '^([^"\r\n]+?\.exe)(?:\s+(.*))?$'){$exe=$Matches[1];$arguments=$Matches[2]}
    else{return @{available=$false;reason='没有可直接调用的 EXE 卸载入口，请到 Windows 已安装的应用中管理。'}}
    if([IO.Path]::GetFileName($exe) -ieq 'msiexec.exe'){
        if($arguments -notmatch '(?i)^\s*/[ix]\s*(\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\})\s*$'){return @{available=$false;reason='此 MSI 入口包含自定义参数，需要通过系统应用管理卸载。'}}
        $arguments='/x '+$Matches[1]+' /promptrestart';$exe=Join-Path $env:SystemRoot 'System32\msiexec.exe'
    }
    elseif($exe -notmatch '^[A-Za-z]:\\' -or [IO.Path]::GetFileName($exe) -match '(?i)^(cmd|powershell|pwsh|wscript|cscript|mshta|rundll32|regsvr32)\.exe$'){
        return @{available=$false;reason='此卸载入口依赖脚本或间接调用，需要通过系统应用管理卸载。'}
    }
    if(!(Test-Path -LiteralPath $exe -PathType Leaf)){return @{available=$false;reason='原卸载程序不存在，需修复安装或使用系统应用管理。'}}
    if($arguments -match '(?i)(^|\s)[/-](s|silent|verysilent|quiet|passive|qn|qb|forcerestart)(\s|$)'){
        return @{available=$false;reason='注册的卸载入口使用静默参数，此处不直接运行；请通过系统应用管理卸载。'}
    }
    @{available=$true;reason='';exe=$exe;arguments=$arguments}
}
function Get-DesktopEntries {
    foreach($root in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall','HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')){
        foreach($key in @(Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue)){
            try{
                $app=Get-ItemProperty -LiteralPath $key.PSPath -ErrorAction Stop
                if(!$app.DisplayName -or $app.SystemComponent -eq 1 -or $app.ParentKeyName -or $app.ReleaseType -match '(?i)update|hotfix'){continue}
                $resolved=Resolve-Uninstaller ([string]$app.UninstallString)
                if($app.NoRemove -eq 1){$resolved=@{available=$false;reason='安装程序将此项目标记为不可单独卸载。'}}
                $id=Get-MaintenanceHash $key.Name
                $fingerprint=Get-MaintenanceHash ($key.Name+'|'+$app.DisplayName+'|'+$app.DisplayVersion+'|'+$app.UninstallString)
                @{id=$id;title=[string]$app.DisplayName;version=[string]$app.DisplayVersion;publisher=[string]$app.Publisher;scope=$(if($root -like 'HKCU:*'){'当前执行账户'}else{'整台电脑'});command=[string]$app.UninstallString;fingerprint=$fingerprint;available=$resolved.available;reason=$resolved.reason;native=$resolved}
            }catch{continue}
        }
    }
}
function Get-DesktopCatalog {
    @{items=@(Get-DesktopEntries|Sort-Object title|ForEach-Object {$row=@{};foreach($key in $_.Keys){if($key -ne 'native'){$row[$key]=$_[$key]}};$row});capturedAt=[DateTime]::UtcNow.ToString('o');account=[Security.Principal.WindowsIdentity]::GetCurrent().Name}
}
function Start-DesktopUninstallerProcess($Native) {
    # Deliberately interactive: do not invoke a shell, wait on it, or request quiet removal.
    $info=New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$Native.exe;$info.Arguments=$Native.arguments;$info.WorkingDirectory=Split-Path -Parent $Native.exe
    $info.UseShellExecute=$false;$info.CreateNoWindow=$false
    $process=[Diagnostics.Process]::Start($info)
    if(!$process){throw '卸载程序未启动。'}
    try{$process.Id}finally{$process.Dispose()}
}
function Start-DesktopUninstall([string]$Id,[string]$Fingerprint) {
    $found=@(Get-DesktopEntries|Where-Object {$_.id -eq $Id})
    if($found.Count -ne 1){throw '应用已变化或不存在，请重新扫描。'}
    $item=$found[0]
    if(!$item.available){throw $item.reason}
    if($item.fingerprint -ne $Fingerprint){throw '应用的卸载信息已变化，请重新扫描并确认。'}
    if($script:launches.ContainsKey($Id) -and $script:launches[$Id] -gt [DateTime]::UtcNow.AddSeconds(-30)){throw '刚刚已启动此卸载程序，请先完成或取消原窗口。'}
    $record=New-MaintenanceRecord 'uninstall';$record.title=$item.title;$record.command=$item.command;Save-MaintenanceRecord $record
    try{
        $processId=Start-DesktopUninstallerProcess $item.native
        $script:launches[$Id]=[DateTime]::UtcNow;$record.status='launched';$record.processId=$processId;Save-MaintenanceRecord $record
    }catch{$record.status='failed';$record.error=$_.Exception.Message;Save-MaintenanceRecord $record;throw}
    @{ok=$true;recordId=$record.id;message='已启动原软件卸载程序，尚未确认卸载完成。请在其窗口完成或取消操作，然后重新扫描；操作记录不是应用或数据备份。'}
}
Export-ModuleMember -Function Get-CleanupPreview,Remove-CleanupSelection,Get-DesktopCatalog,Start-DesktopUninstall,Get-MaintenanceHistory
