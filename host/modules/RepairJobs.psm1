$ErrorActionPreference='Stop'
$repairBase=if($env:SYNAPSEX_STATE_ROOT){[IO.Path]::GetFullPath($env:SYNAPSEX_STATE_ROOT)}else{Join-Path $env:LOCALAPPDATA 'SynapseX\state'}
$script:repairRoot=Join-Path $repairBase 'repair-jobs'
$script:repairProcesses=@{}
function Get-RepairDefinitions {
    @(
        @{id='sfc-verify';title='检查系统文件';file='sfc.exe';arguments='/verifyonly';category='系统文件';impact='扫描受保护系统文件，不请求修复。';changes=$false;restart=$false},
        @{id='sfc-repair';title='修复系统文件';file='sfc.exe';arguments='/scannow';category='系统文件';impact='检查并修复受保护的系统文件。可能需要安装介质或先修复组件存储；不能通过本软件撤销修复。';changes=$true;restart=$false},
        @{id='dism-check';title='查询组件存储健康状态';file='dism.exe';arguments='/Online /Cleanup-Image /CheckHealth /English';category='组件存储';impact='快速查询已记录的损坏状态，不进行完整扫描或修复。';changes=$false;restart=$false},
        @{id='dism-scan';title='扫描组件存储';file='dism.exe';arguments='/Online /Cleanup-Image /ScanHealth /English';category='组件存储';impact='扫描 Windows 组件存储并记录健康状态，不请求修复。';changes=$false;restart=$false},
        @{id='dism-repair';title='修复组件存储';file='dism.exe';arguments='/Online /Cleanup-Image /RestoreHealth /English';category='组件存储';impact='使用 Windows 支持的修复来源修复组件存储，可能下载文件并消耗网络流量。离线或被更新策略限制时可能失败。';changes=$true;restart=$false},
        @{id='component-cleanup';title='清理旧系统组件';file='dism.exe';arguments='/Online /Cleanup-Image /StartComponentCleanup /English';category='空间清理';impact='由 Windows 删除已被取代的组件文件，不使用 ResetBase。清理不提供文件备份或撤销，不清空更新下载目录。';changes=$true;restart=$false},
        @{id='disk-scan';title='在线检查系统盘';file='chkdsk.exe';arguments=($env:SystemDrive+' /scan');category='磁盘';impact='使用 NTFS 在线扫描；可能由文件系统执行在线自愈。不会强制卸载磁盘或预约开机 /f、/r 检查。';changes=$true;restart=$false},
        @{id='dns-flush';title='清除 DNS 缓存';file='ipconfig.exe';arguments='/flushdns';category='网络';impact='清除本机 DNS 解析缓存，下次访问重新查询。不会更换 DNS 服务器。';changes=$true;restart=$false},
        @{id='winsock-reset';title='重置 Winsock';file='netsh.exe';arguments='winsock reset';category='网络';impact='重置 Winsock 目录，可能影响 VPN、代理和安全软件的网络组件，需要重新配置或重装相关软件。不能用本软件还原原目录。';changes=$true;restart=$true},
        @{id='ip-reset';title='重置 TCP/IP';file='netsh.exe';arguments='int ip reset';category='网络';impact='重置 TCP/IP 配置，静态地址、路由和部分网络设置可能需要重新配置。先记录网络设置并准备恢复联网；此操作不是可回滚优化。';changes=$true;restart=$true}
    )
}
function Save-RepairJob($Record){
    New-Item -ItemType Directory -Path $script:repairRoot -Force|Out-Null
    $path=Join-Path $script:repairRoot ($Record.jobId+'.json')
    [IO.File]::WriteAllText($path+'.pending',($Record|ConvertTo-Json -Depth 10),(New-Object Text.UTF8Encoding($false)))
    if([IO.File]::Exists($path)){[IO.File]::Replace($path+'.pending',$path,[NullString]::Value)}else{[IO.File]::Move($path+'.pending',$path)}
}
function Get-RepairJobRecords {
    @(Get-ChildItem -LiteralPath $script:repairRoot -Filter '*.json' -File -ErrorAction SilentlyContinue|Sort-Object Name -Descending|Select-Object -First 40|ForEach-Object{try{$r=Get-Content -LiteralPath $_.FullName -Raw -Encoding UTF8|ConvertFrom-Json;if($r.sid -eq [Security.Principal.WindowsIdentity]::GetCurrent().User.Value){$r}}catch{}})
}
function Update-RepairJob($Record){
    if($Record.status -eq 'starting' -and [DateTime]::UtcNow.Subtract([DateTime]::Parse($Record.createdAt).ToUniversalTime()).TotalSeconds -gt 30){$Record.status='unknown';$Record.message='上次启动结果未知；检查系统修复日志后再重试。';Save-RepairJob $Record}
    if($Record.status -ne 'running'){
        if($Record.status -ne 'starting' -and $script:repairProcesses.ContainsKey($Record.jobId)){$script:repairProcesses[$Record.jobId].Dispose();$script:repairProcesses.Remove($Record.jobId)}
        return $Record
    }
    if($script:repairProcesses.ContainsKey($Record.jobId)){
        $process=$script:repairProcesses[$Record.jobId]
        if($process.HasExited){
            $saved=Get-Content -LiteralPath (Join-Path $script:repairRoot ($Record.jobId+'.json')) -Raw -Encoding UTF8|ConvertFrom-Json
            if($saved.status -in @('completed','failed')){$Record=$saved}else{$Record.status='unknown';$Record.message='后台任务退出但未提交最终结果，请检查日志。';Save-RepairJob $Record}
            $process.Dispose();$script:repairProcesses.Remove($Record.jobId)
        }
    }else{
        # After host restart, only adopt an exact PID/start-time/executable match; never infer success from absence.
        $same=$false
        try{$process=Get-Process -Id $Record.processId -ErrorAction Stop;$same=($process.StartTime.ToUniversalTime().Ticks.ToString() -ceq $Record.startToken -and $process.Path -ieq $Record.executable)}catch{}
        if($same){$script:repairProcesses[$Record.jobId]=$process}else{
            # The worker may finish between the inventory read and PID lookup.
            $saved=Get-Content -LiteralPath (Join-Path $script:repairRoot ($Record.jobId+'.json')) -Raw -Encoding UTF8|ConvertFrom-Json
            if($saved.status -in @('completed','failed')){$Record=$saved}else{$Record.status='unknown';$Record.message='上次修复进程已结束或无法核对，无法取得退出码。请检查下方输出及 Windows 日志。';Save-RepairJob $Record}
        }
    }
    $Record
}
function Get-RepairJobs {
    $jobs=@(Get-RepairJobRecords|ForEach-Object{
        $r=Update-RepairJob $_
        $output=@();foreach($suffix in @('.out.log','.err.log')){
            $path=Join-Path $script:repairRoot ($r.jobId+$suffix)
            if(Test-Path -LiteralPath $path){$output+=@(Get-Content -LiteralPath $path -Tail 60 -ErrorAction SilentlyContinue)}
        }
        @{jobId=$r.jobId;title=$r.title;status=$r.status;message=$r.message;createdAt=$r.createdAt;finishedAt=$r.finishedAt;exitCode=$r.exitCode;restartRequired=$r.restartRequired;output=($output -join "`n");logDirectory=$script:repairRoot}
    })
    $system32=Join-Path $env:SystemRoot 'System32'
    @{items=@(Get-RepairDefinitions|ForEach-Object{@{id=$_.id;title=$_.title;category=$_.category;impact=$_.impact;changes=$_.changes;restart=$_.restart;available=(Test-Path -LiteralPath (Join-Path $system32 $_.file));command=($_.file+' '+$_.arguments)}});jobs=$jobs;capturedAt=[DateTime]::UtcNow.ToString('o')}
}
function Start-RepairNative($Definition,[string]$JobId){
    $worker=Join-Path (Split-Path -Parent $PSScriptRoot) 'RepairWorker.ps1'
    Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$worker+'"'),'-JobId',$JobId) -WindowStyle Hidden -PassThru -ErrorAction Stop
}
function Start-RepairJob([string]$Id){
    $mutex=New-Object Threading.Mutex($false,('Local\SynapseX-Repair-'+[Security.Principal.WindowsIdentity]::GetCurrent().User.Value))
    $acquired=$false
    try{
    try{$acquired=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$acquired=$true}
    if(!$acquired){throw '其他窗口正在启动修复任务，请稍后刷新。'}
    $definition=@(Get-RepairDefinitions|Where-Object{$_.id -ceq $Id});if($definition.Count -ne 1){throw '未知修复任务。'};$definition=$definition[0]
    $running=@((Get-RepairJobs).jobs|Where-Object{$_.status -in @('running','starting')})
    if($running.Count){throw '已有检查或修复正在运行，请等待完成。不会并行启动系统修复。'}
    $r=@{jobId=((Get-Date -Format 'yyyyMMdd-HHmmss-fff')+'-'+[guid]::NewGuid().ToString('N'));sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;id=$Id;title=$definition.title;createdAt=[DateTime]::UtcNow.ToString('o');status='starting';processId=0;startToken='';executable=(Join-Path $env:SystemRoot ('System32\'+$definition.file));exitCode=$null;finishedAt=$null;restartRequired=[bool]$definition.restart;message='正在启动系统工具。'}
    Save-RepairJob $r
    try{
        $process=Start-RepairNative $definition $r.jobId
        $script:repairProcesses[$r.jobId]=$process
        # Worker alone updates the record after spawn, avoiding competing result writes.
    }catch{$r.status='failed';$r.message=$_.Exception.Message;Save-RepairJob $r;throw}
    @{ok=$true;jobId=$r.jobId;message='任务已启动；请在任务记录中查看进度和最终输出。不要关机或强制结束系统修复进程。'}
    }finally{if($acquired){$mutex.ReleaseMutex()};$mutex.Dispose()}
}
function Invoke-RepairWorker([string]$JobId){
    if($JobId -notmatch '^\d{8}-\d{6}-\d{3}-[a-f0-9]{32}$'){throw 'Invalid repair job ID.'}
    $r=Get-Content -LiteralPath (Join-Path $script:repairRoot ($JobId+'.json')) -Raw -Encoding UTF8|ConvertFrom-Json
    if($r.status -cne 'starting' -or $r.sid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value){throw 'Repair job cannot be started.'}
    $definition=@(Get-RepairDefinitions|Where-Object{$_.id -ceq $r.id});if($definition.Count -ne 1){throw 'Unknown repair definition.'};$definition=$definition[0]
    $me=Get-Process -Id $PID
    $r.processId=$PID;$r.startToken=$me.StartTime.ToUniversalTime().Ticks.ToString();$r.executable=$me.Path;$r.status='running';$r.message='运行中；关闭主软件不会终止此后台任务。';Save-RepairJob $r
    try{
        $code=Invoke-RepairNative $definition $JobId
        if($null -eq $code){throw '系统工具退出，但未取得退出码；请核对日志。'}
        $r.exitCode=$code;$r.status=if($code -in @(0,3010)){'completed'}else{'failed'}
        $r.message='命令已结束，请阅读工具输出确认结果。退出码不等于所有问题已修复；失败时请查看 Windows 修复日志。'
        if($code -eq 3010){$r.restartRequired=$true}
    }catch{$r.status='failed';$r.message=$_.Exception.Message}finally{$r.finishedAt=[DateTime]::UtcNow.ToString('o');Save-RepairJob $r}
}
function Invoke-RepairNative($Definition,[string]$JobId){
    if(-not ('SynapseX.RepairRunner' -as [type])){Add-Type -Path (Join-Path (Split-Path -Parent $PSScriptRoot) 'RepairRunner.cs')}
    # SFC emits UTF-16 even when redirected; other built-in console tools use the OEM code page.
    [SynapseX.RepairRunner]::Run((Join-Path $env:SystemRoot ('System32\'+$Definition.file)),[string]$Definition.arguments,(Join-Path $script:repairRoot ($JobId+'.out.log')),(Join-Path $script:repairRoot ($JobId+'.err.log')),($Definition.file -ieq 'sfc.exe'))
}
Export-ModuleMember -Function Get-RepairJobs,Start-RepairJob,Invoke-RepairWorker
