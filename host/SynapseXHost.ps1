[CmdletBinding()]
param(
    [int]$PreferredPort = 47137,
    [string]$GameRoot,
    [string]$SessionToken,
    [string]$VipToken,
    [switch]$NoLaunch,
    [switch]$StrictPort
)

$ErrorActionPreference = 'Stop'
$hostRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $hostRoot
$webRoot = Join-Path $projectRoot 'dist'
$modulePath = Join-Path $hostRoot 'modules\JiuYinProfile.psm1'
$networkModulePath = Join-Path $hostRoot 'modules\NetworkRecovery.psm1'
$systemModulePath = Join-Path $hostRoot 'modules\SystemOptimizer.psm1'
$networkToolkitModulePath = Join-Path $hostRoot 'modules\NetworkToolkit.psm1'
$runtimeModulePath = Join-Path $hostRoot 'modules\RuntimeOptimizer.psm1'
$diagnosticsModulePath = Join-Path $hostRoot 'modules\Diagnostics.psm1'
$realtimeMonitorModulePath = Join-Path $hostRoot 'modules\RealtimeMonitor.psm1'
$stabilityDiagnosticsModulePath = Join-Path $hostRoot 'modules\StabilityDiagnostics.psm1'
$gpuDriverOptimizerModulePath = Join-Path $hostRoot 'modules\GpuDriverOptimizer.psm1'
$displayAdapterOptimizerModulePath = Join-Path $hostRoot 'modules\DisplayAdapterOptimizer.psm1'
$operationLogModulePath = Join-Path $hostRoot 'modules\OperationLog.psm1'
$performanceReportsModulePath = Join-Path $hostRoot 'modules\PerformanceReports.psm1'
$version = '0.39.18'

if (-not (Test-Path -LiteralPath (Join-Path $webRoot 'index.html') -PathType Leaf)) { throw 'Built UI is missing. Run Build-SynapseX.ps1 first.' }
Import-Module $modulePath -Force
Import-Module (Join-Path $hostRoot 'modules\FeatureAccess.psm1') -Force
Import-Module $networkModulePath -Force
Import-Module $systemModulePath -Force
Import-Module (Join-Path $hostRoot 'modules\AdvancedSystemOptimizer.psm1') -Force
Import-Module (Join-Path $hostRoot 'modules\BackgroundManager.psm1') -Force
Import-Module (Join-Path $hostRoot 'modules\MaintenanceManager.psm1') -Force
Import-Module (Join-Path $hostRoot 'modules\DeviceServiceManager.psm1') -Force
Import-Module (Join-Path $hostRoot 'modules\RepairJobs.psm1') -Force
Import-Module (Join-Path $hostRoot 'modules\ExpertSettings.psm1') -Force
Import-Module (Join-Path $hostRoot 'modules\SystemTools.psm1') -Force
Import-Module (Join-Path $hostRoot 'modules\DisconnectedDevices.psm1') -Force
Import-Module $networkToolkitModulePath -Force
Import-Module $runtimeModulePath -Force
Import-Module $diagnosticsModulePath -Force
Import-Module $realtimeMonitorModulePath -Force
Import-Module $stabilityDiagnosticsModulePath -Force
Import-Module $gpuDriverOptimizerModulePath -Force
Import-Module (Join-Path $hostRoot 'modules\NvidiaNip.psm1') -Force
Import-Module $displayAdapterOptimizerModulePath -Force
Import-Module $operationLogModulePath -Force
Import-Module $performanceReportsModulePath -Force
Import-Module (Join-Path $hostRoot 'modules\GameDiscovery.psm1') -Force
Import-Module (Join-Path $hostRoot 'modules\SchedulerLab.psm1') -Force
Import-Module (Join-Path $hostRoot 'modules\SessionLab.psm1') -Force
Import-Module (Join-Path $hostRoot 'modules\LabGameLibrary.psm1') -Force
Import-Module (Join-Path $hostRoot 'modules\LabDiagnostics.psm1') -Force
Import-Module (Join-Path $hostRoot 'modules\LatencyLab.psm1') -Force
Import-Module (Join-Path $hostRoot 'modules\LabRegistryExperiments.psm1') -Force
Import-Module (Join-Path $hostRoot 'modules\LabGpuExperiments.psm1') -Force

if ([string]::IsNullOrWhiteSpace($GameRoot)) {
    $GameRoot = ''
    foreach ($runningGame in @(Get-Process -Name fxgame -ErrorAction SilentlyContinue)) {
        try {
            if (-not $runningGame.Path) { continue }
            $candidateRoot = Split-Path (Split-Path $runningGame.Path -Parent) -Parent
            if (Test-Path -LiteralPath (Join-Path $candidateRoot 'fxlaunch.exe') -PathType Leaf) { $GameRoot = $candidateRoot; break }
        } catch { }
    }
}
$gameExecutable = ''
if ($GameRoot) {
    foreach ($relativeExe in @('bin64\fxgame.exe','bin\fxgame.exe','fxgame.exe')) {
        $candidateExe = Join-Path $GameRoot $relativeExe
        if (Test-Path -LiteralPath $candidateExe -PathType Leaf) { $gameExecutable = $candidateExe; break }
    }
}

function Test-IsElevated {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Send-Bytes($Context, [byte[]]$Bytes, [string]$ContentType, [int]$StatusCode = 200) {
    # A browser may cancel an image or API response at any time. A failed write
    # belongs to this connection, never to the lifetime of the local service.
    try {
    $Context.Response.StatusCode = $StatusCode
    $Context.Response.ContentType = $ContentType
    $Context.Response.ContentLength64 = $Bytes.Length
    $Context.Response.Headers['X-Content-Type-Options'] = 'nosniff'
    $Context.Response.Headers['Referrer-Policy'] = 'no-referrer'
    $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    $Context.Response.OutputStream.Close()
    } catch {
        try { $Context.Response.Abort() } catch { }
    }
}

function Send-Json($Context, $Payload, [int]$StatusCode = 200) {
    $json = ConvertTo-Json -InputObject $Payload -Depth 12 -Compress
    if ($null -eq $json) { $json = 'null' }
    $Context.Response.Headers['Cache-Control'] = 'no-store'
    Send-Bytes $Context ([Text.Encoding]::UTF8.GetBytes($json)) 'application/json; charset=utf-8' $StatusCode
}

function Read-JsonBody($Request) {
    # JSON exchanged with the desktop UI is always UTF-8. Do not rely on the
    # legacy HttpListener charset default because it can corrupt non-ASCII paths.
    $reader = New-Object IO.StreamReader($Request.InputStream, ([Text.Encoding]::UTF8), $true)
    try { $raw = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ([string]::IsNullOrWhiteSpace($raw)) { return [pscustomobject]@{} }
    $raw | ConvertFrom-Json
}

function Get-MimeType([string]$Path) {
    switch ([IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        '.html' { 'text/html; charset=utf-8' }
        '.js' { 'text/javascript; charset=utf-8' }
        '.css' { 'text/css; charset=utf-8' }
        '.json' { 'application/json; charset=utf-8' }
        '.svg' { 'image/svg+xml' }
        '.png' { 'image/png' }
        '.jpg' { 'image/jpeg' }
        '.jpeg' { 'image/jpeg' }
        '.ico' { 'image/x-icon' }
        default { 'application/octet-stream' }
    }
}

function Get-SystemAudit {
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    $os = Get-CimInstance Win32_OperatingSystem
    $gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM)
    $systemDrive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$($env:SystemDrive)'"
    $power = (& powercfg /getactivescheme 2>$null) -join ' '
    $game = Get-Process -Name fxgame -ErrorAction SilentlyContinue | Select-Object -First 1
    [ordered]@{
        cpu = $cpu.Name.Trim()
        physicalCores = $cpu.NumberOfCores
        logicalProcessors = $cpu.NumberOfLogicalProcessors
        memoryGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
        windows = $os.Caption
        windowsBuild = $os.BuildNumber
        uptimeHours = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)
        systemDriveFreeGB = if ($systemDrive) { [math]::Round($systemDrive.FreeSpace / 1GB, 1) } else { $null }
        gpu = $gpu
        powerScheme = $power.Trim()
        gameRunning = ($null -ne $game)
        gameProcessId = if ($game) { $game.Id } else { $null }
        gamePriority = if ($game) { [string]$game.PriorityClass } else { $null }
        note = 'system_read_only_no_changes'
    }
}

function Get-NetworkAudit {
    $internetSettings = Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' -ErrorAction SilentlyContinue
    $adapters = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object Status -eq 'Up' | Select-Object Name, InterfaceDescription, LinkSpeed)
    $dns = @(Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.ServerAddresses.Count -gt 0 } | Select-Object InterfaceAlias, ServerAddresses)
    $routes = @(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 4 InterfaceAlias, NextHop, RouteMetric)
    $recovery = Get-NetworkRecoveryState
    [ordered]@{
        clashRunning = $recovery.clashRunning
        proxyEnabled = ([int]$internetSettings.ProxyEnable -eq 1)
        proxyServer = [string]$internetSettings.ProxyServer
        autoConfigUrl = [string]$internetSettings.AutoConfigURL
        staleLoopbackCandidate = $recovery.staleLoopbackCandidate
        activeAdapters = $adapters
        dnsServers = $dns
        defaultRoutes = $routes
        note = 'network_read_only_no_packet_duplication'
    }
}

function Test-PingTarget([string]$Target, [int]$Count = 4) {
    $client = New-Object Net.NetworkInformation.Ping
    $times = @()
    try {
        for ($index = 0; $index -lt $Count; $index++) {
            try {
                $reply = $client.Send($Target, 1200)
                if ($reply.Status -eq [Net.NetworkInformation.IPStatus]::Success) { $times += [double]$reply.RoundtripTime }
            } catch { }
        }
    } finally { $client.Dispose() }
    [ordered]@{
        target = $Target; sent = $Count; received = $times.Count
        lossPercent = [math]::Round((($Count - $times.Count) / [double]$Count) * 100, 1)
        minimumMs = if ($times.Count) { [math]::Round(($times | Measure-Object -Minimum).Minimum, 1) } else { $null }
        averageMs = if ($times.Count) { [math]::Round(($times | Measure-Object -Average).Average, 1) } else { $null }
        maximumMs = if ($times.Count) { [math]::Round(($times | Measure-Object -Maximum).Maximum, 1) } else { $null }
    }
}

function Get-NetworkQualityTest {
    $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
    $gateway = if ($route) { [string]$route.NextHop } else { '' }
    [ordered]@{
        testedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        gateway = if ([string]::IsNullOrWhiteSpace($gateway)) { $null } else { Test-PingTarget $gateway }
        public = Test-PingTarget '223.5.5.5'
        note = '四次 ICMP 样本仅用于快速判断本地链路与公网波动，不代表游戏服务器延迟。'
    }
}

$listener = $null
$port = $PreferredPort
$started = $false
$attemptLimit = if ($StrictPort) { 1 } else { 20 }
for ($attempt = 0; $attempt -lt $attemptLimit; $attempt++) {
    $prefix = "http://127.0.0.1:$port/"
    $candidateListener = New-Object Net.HttpListener
    $candidateListener.Prefixes.Add($prefix)
    try { $candidateListener.Start(); $listener = $candidateListener; $started = $true; break } catch { $candidateListener.Close(); $port++ }
}
if (-not $started) { throw 'Could not bind a loopback port for SynapseX.' }

$token = if ([string]::IsNullOrWhiteSpace($SessionToken)) { [guid]::NewGuid().ToString('N') } else { $SessionToken }
$launchUrl = "http://127.0.0.1:$port/?token=$token"
if (-not $NoLaunch) { Start-Process $launchUrl }

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        try {
            $path = $context.Request.Url.AbsolutePath
            if ($path.StartsWith('/api/')) {
                if ($context.Request.Headers['X-SynapseX-Token'] -cne $token) { Send-Json $context @{ error = 'Invalid local session token.' } 403; continue }
                $vipFeature = Get-RouteFeature $path
                if ($vipFeature -and ([string]::IsNullOrWhiteSpace($VipToken) -or $context.Request.Headers['X-SynapseX-Vip'] -cne $VipToken)) { Send-Json $context @{ error = '此进阶应用操作需要 VIP；检测、读取与恢复免费。请通过桌面软件登录并同步授权。' } 403; continue }
                if ($path -eq '/api/shutdown') {
                    $labRestore=Restore-SchedulerLab
                    $sessionRestore=Stop-SessionLab
                    Stop-LatencyLab | Out-Null
                    Stop-LabDiagnostics | Out-Null
                    Send-Json $context @{ ok = $true; labRestore = $labRestore; sessionRestore=$sessionRestore }
                    break
                }
                switch ($path) {
                    '/api/lab/session/gpu-catalog' {
                        $body=Read-JsonBody $context.Request
                        Send-Json $context (Get-LabGpuCatalog ([string]$body.path))
                    }
                    '/api/lab/session/gpu-records' { Send-Json $context (Get-LabGpuRecords) }
                    '/api/lab/session/gpu-apply' {
                        $body=Read-JsonBody $context.Request
                        if($context.Request.HttpMethod -ne 'POST' -or $body.confirmation -cne 'APPLY'){throw 'Explicit APPLY required.'}
                        Send-Json $context (Set-LabGpuItem $body)
                    }
                    '/api/lab/session/gpu-restore' {
                        $body=Read-JsonBody $context.Request
                        if($context.Request.HttpMethod -ne 'POST' -or $body.confirmation -cne 'RESTORE'){throw 'Explicit RESTORE required.'}
                        Send-Json $context (Restore-LabGpuItem ([string]$body.id))
                    }
                    '/api/lab/session/registry' { Send-Json $context (Get-LabRegistryRecords) }
                    '/api/lab/session/irq' { Send-Json $context (Get-LabIrqDevices) }
                    '/api/lab/session/launch-preview' {
                        $body=Read-JsonBody $context.Request
                        Send-Json $context (Get-LabLaunchPriority ([string]$body.path))
                    }
                    '/api/lab/session/registry-apply' {
                        $body=Read-JsonBody $context.Request
                        if($context.Request.HttpMethod -ne 'POST' -or $body.confirmation -cne 'APPLY'){throw 'Explicit APPLY required.'}
                        Send-Json $context (Set-LabRegistryExperiment $body)
                    }
                    '/api/lab/session/registry-restore' {
                        $body=Read-JsonBody $context.Request
                        if($context.Request.HttpMethod -ne 'POST' -or $body.confirmation -cne 'RESTORE'){throw 'Explicit RESTORE required.'}
                        Send-Json $context (Restore-LabRegistryExperiment ([string]$body.id))
                    }
                    '/api/lab/session/library-scan' { Send-Json $context (Get-LabInstalledGames) }
                    '/api/lab/session/latency' { Send-Json $context (Get-LatencyLabState) }
                    '/api/lab/session/latency-history' { Send-Json $context (Get-LatencyLabHistory) }
                    '/api/lab/session/latency-start' {
                        if($context.Request.HttpMethod -ne 'POST'){throw 'POST required.'}
                        Send-Json $context (Start-LatencyLab (Read-JsonBody $context.Request))
                    }
                    '/api/lab/session/latency-stop' {
                        $body=Read-JsonBody $context.Request
                        if($context.Request.HttpMethod -ne 'POST' -or $body.confirmation -cne 'STOP'){throw 'Explicit STOP required.'}
                        Send-Json $context (Stop-LatencyLab)
                    }
                    '/api/lab/session/notice' {
                        if($context.Request.HttpMethod -eq 'POST'){Send-Json $context (Set-LabNoticePreference (Read-JsonBody $context.Request))}
                        else{Send-Json $context (Get-LabNoticePreference)}
                    }
                    '/api/lab/session/diagnostics' { Send-Json $context (Get-LabDiagnosticState) }
                    '/api/lab/session/diagnostic-start' {
                        $body=Read-JsonBody $context.Request
                        if($context.Request.HttpMethod -ne 'POST' -or $body.confirmation -cne 'MEASURE'){throw 'Explicit MEASURE required.'}
                        if((Get-LatencyLabState).Status -eq 'running'){throw '请先停止系统延迟测试。'}
                        Send-Json $context (Start-LabDiagnostic ([string]$body.kind))
                    }
                    '/api/lab/session/diagnostic-stop' {
                        $body=Read-JsonBody $context.Request
                        if($context.Request.HttpMethod -ne 'POST' -or $body.confirmation -cne 'STOP'){throw 'Explicit STOP required.'}
                        Send-Json $context (Stop-LabDiagnostics)
                    }
                    '/api/lab/session/state' { Send-Json $context (Get-SessionLabState) }
                    '/api/lab/session/targets' { Send-Json $context (Get-SessionLabTargets) }
                    '/api/lab/session/topology' { Send-Json $context (Get-SessionLabTopology) }
                    '/api/lab/session/support' {
                        $body=Read-JsonBody $context.Request
                        Send-Json $context (Get-SessionLabSupport ([string]$body.offer))
                    }
                    '/api/lab/session/preferences' {
                        if($context.Request.HttpMethod -eq 'POST'){
                            $body=Read-JsonBody $context.Request
                            if($body.confirmation -cne 'SAVE'){throw 'Explicit SAVE required.'}
                            Send-Json $context (Set-LabPreferences $body)
                        }else{Send-Json $context (Get-LabPreferences)}
                    }
                    '/api/lab/session/start' {
                        $body=Read-JsonBody $context.Request
                        if($context.Request.HttpMethod -ne 'POST' -or $body.confirmation -cne 'APPLY'){throw 'Explicit APPLY required.'}
                        Send-Json $context (Start-SessionLab $body)
                    }
                    '/api/lab/session/stop' {
                        $body=Read-JsonBody $context.Request
                        if($context.Request.HttpMethod -ne 'POST' -or $body.confirmation -cne 'RESTORE'){throw 'Explicit RESTORE required.'}
                        Send-Json $context (Stop-SessionLab)
                    }
                    '/api/lab/session/trim' {
                        $body=Read-JsonBody $context.Request
                        if($context.Request.HttpMethod -ne 'POST' -or $body.confirmation -cne 'TRIM'){throw 'Explicit TRIM required.'}
                        Send-Json $context (Invoke-LabWorkingSet ([string]$body.offer))
                    }
                    '/api/lab/state' { Send-Json $context (Get-SchedulerLabState) }
                    '/api/lab/sample' {
                        $body=Read-JsonBody $context.Request
                        Send-Json $context (Measure-SchedulerLab -ProcessId ([int]$body.processId))
                    }
                    '/api/lab/start' {
                        $body=Read-JsonBody $context.Request
                        if([string]$body.confirmation -cne 'APPLY'){throw 'Explicit APPLY confirmation is required.'}
                        if((Get-SessionLabState).Session.Status -in @('active','restore-failed')){throw '请先恢复游戏会话实验。'}
                        Send-Json $context (Start-SchedulerLab -Offer ([string]$body.offer) -Kind ([string]$body.kind) -ThreadId ([int]$body.threadId) -Seconds ([int]$body.seconds))
                    }
                    '/api/lab/restore' {
                        $body=Read-JsonBody $context.Request
                        if([string]$body.confirmation -cne 'RESTORE'){throw 'Explicit RESTORE confirmation is required.'}
                        Send-Json $context (Restore-SchedulerLab)
                    }
                    '/api/status' {
                        $location = Get-JiuYinLocation -Root $GameRoot
                        $GameRoot = $location.gameRoot
                        $gameExecutable = $location.gameExecutable
                        Send-Json $context ([ordered]@{ connected = $true; version = $version; gameRoot = $GameRoot; gameExecutable = $gameExecutable; gameRunning = (@(Get-Process -Name fxgame -ErrorAction SilentlyContinue).Count -gt 0); elevated = (Test-IsElevated) })
                    }
                    '/api/system/audit' { Send-Json $context (Get-SystemAudit) }
                    '/api/system/readiness' { Send-Json $context (Get-SystemGameReadiness) }
                    '/api/system/contention' {
                        $body = Read-JsonBody $context.Request
                        Send-Json $context (Measure-SystemContention -Seconds ([int]$body.seconds))
                    }
                    '/api/system/gpu-preference' {
                        $body = Read-JsonBody $context.Request
                        Send-Json $context (Get-GameGpuPreference -ExecutablePath ([string]$body.executablePath))
                    }
                    '/api/system/gpu-preference/apply' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        $result = Set-GameHighPerformanceGpu -ExecutablePath ([string]$body.executablePath)
                        [void](Write-SynapseXOperation -Category 'system' -Action 'gpu-preference-apply' -BackupId ([string]$result.backupId) -Detail @{ executablePath = [string]$result.state.executablePath })
                        Send-Json $context $result
                    }
                    '/api/system/gpu-preference/restore' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        $result = Restore-GameGpuPreference -BackupId ([string]$body.backupId)
                        [void](Write-SynapseXOperation -Category 'system' -Action 'gpu-preference-restore' -BackupId ([string]$result.backupId) -Detail @{ executablePath = [string]$result.state.executablePath })
                        Send-Json $context $result
                    }
                    '/api/system/gpu-driver' {
                        $body = Read-JsonBody $context.Request
                        Send-Json $context (Get-GpuDriverOptimizationCatalog -ExecutablePath ([string]$body.executablePath))
                    }
                    '/api/system/nvidia-nip/library' { Send-Json $context (Get-NvidiaNipLibrary) }
                    '/api/system/nvidia-nip/preview' {
                        $body=Read-JsonBody $context.Request
                        Send-Json $context (Get-NvidiaNipPreview -Id ([string]$body.id) -FilePath ([string]$body.filePath))
                    }
                    '/api/system/nvidia-nip/apply' {
                        $body=Read-JsonBody $context.Request
                        if([string]$body.confirmation -cne 'APPLY' -or $body.acceptGlobal -isnot [bool]){throw '请明确确认导入。'}
                        $result=Set-NvidiaNip -Token ([string]$body.token) -AcceptGlobal $body.acceptGlobal
                        [void](Write-SynapseXOperation -Category 'system' -Action 'nvidia-nip-apply' -BackupId ([string]$result.backupId) -Detail @{name=$result.name;changed=$result.changed;skipped=$result.skipped})
                        Send-Json $context $result
                    }
                    '/api/system/nvidia-nip/restore' {
                        $body=Read-JsonBody $context.Request
                        if([string]$body.confirmation -cne 'RESTORE'){throw '请明确确认恢复。'}
                        $result=Restore-NvidiaNip -BackupId ([string]$body.backupId)
                        [void](Write-SynapseXOperation -Category 'system' -Action 'nvidia-nip-restore' -BackupId ([string]$result.backupId) -Detail @{name=$result.name})
                        Send-Json $context $result
                    }
                    '/api/system/gpu-driver/apply' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        $result = Set-GpuDriverOptimizationProfile -ExecutablePath ([string]$body.executablePath) -Provider ([string]$body.provider) -ProfileId ([string]$body.profileId)
                        [void](Write-SynapseXOperation -Category 'system' -Action 'gpu-driver-profile-apply' -BackupId ([string]$result.backupId) -Detail @{ executablePath = [string]$body.executablePath; provider = [string]$body.provider; profileId = [string]$body.profileId })
                        Send-Json $context $result
                    }
                    '/api/system/gpu-driver/restore' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        $result = Restore-GpuDriverOptimizationProfile -BackupId ([string]$body.backupId)
                        [void](Write-SynapseXOperation -Category 'system' -Action 'gpu-driver-profile-restore' -BackupId ([string]$result.backupId) -Detail @{ provider = [string]$result.provider })
                        Send-Json $context $result
                    }
                    '/api/system/display-adapters' { Send-Json $context (Get-DisplayAdapterCatalog) }
                    '/api/system/display-adapters/disable-integrated' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'DISABLE') { throw 'Explicit DISABLE confirmation is required.' }
                        $result = Disable-EligibleIntegratedGpu
                        [void](Write-SynapseXOperation -Category 'system' -Action 'integrated-gpu-disable' -BackupId ([string]$result.backupId) -Detail @{ changedCount = [int]$result.changedCount })
                        Send-Json $context $result
                    }
                    '/api/system/display-adapters/restore-integrated' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        $result = Restore-IntegratedGpu -BackupId ([string]$body.backupId)
                        [void](Write-SynapseXOperation -Category 'system' -Action 'integrated-gpu-restore' -BackupId ([string]$result.backupId) -Detail @{ changedCount = [int]$result.changedCount })
                        Send-Json $context $result
                    }
                    '/api/system/catalog' { Send-Json $context @(Get-SystemOptimizationCatalog) }
                    '/api/system/advanced/catalog' { Send-Json $context (Get-AdvancedSystemCatalog) }
                    '/api/system/advanced/apply' {
                        if ($context.Request.HttpMethod -cne 'POST') { throw 'POST is required.' }
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        $result = Set-AdvancedSystemItem -Id ([string]$body.id)
                        [void](Write-SynapseXOperation -Category 'system' -Action 'advanced-apply' -BackupId ([string]$result.backupId) -Detail @{ id=[string]$body.id })
                        Send-Json $context $result
                    }
                    '/api/system/advanced/restore' {
                        if ($context.Request.HttpMethod -cne 'POST') { throw 'POST is required.' }
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        $result = Restore-AdvancedSystemItem -Id ([string]$body.id) -BackupId ([string]$body.backupId)
                        [void](Write-SynapseXOperation -Category 'system' -Action 'advanced-restore' -BackupId ([string]$result.backupId) -Detail @{ id=[string]$body.id })
                        Send-Json $context $result
                    }
                    '/api/system/preview' {
                        $body = Read-JsonBody $context.Request
                        Send-Json $context (Get-SystemOptimizationPreview -Ids @($body.ids))
                    }
                    '/api/system/apply' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        $result = Set-SystemOptimizations -Ids @($body.ids)
                        [void](Write-SynapseXOperation -Category 'system' -Action 'optimizations-apply' -BackupId ([string]$result.backupId) -Detail @{ ids = @($body.ids) })
                        Send-Json $context $result
                    }
                    '/api/system/restore' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        $result = Restore-SystemOptimizations -BackupId ([string]$body.backupId)
                        [void](Write-SynapseXOperation -Category 'system' -Action 'optimizations-restore' -BackupId ([string]$result.backupId))
                        Send-Json $context $result
                    }
                    '/api/startup/audit' { Send-Json $context (Get-StartupAudit) }
                    '/api/system/expert/catalog' { Send-Json $context (Get-ExpertCatalog) }
                    '/api/system/tools' { Send-Json $context (Get-SystemTools) }
                    '/api/system/tools/open' {
                        if ($context.Request.HttpMethod -cne 'POST') { throw 'POST is required.' }
                        $body=Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'OPEN') { throw 'Explicit OPEN confirmation is required.' }
                        Send-Json $context (Open-SystemTool -Id ([string]$body.id) -Executable ([string]$body.executable))
                    }
                    '/api/system/expert/apply' {
                        if ($context.Request.HttpMethod -cne 'POST') { throw 'POST is required.' }
                        $body = Read-JsonBody $context.Request
                        if ($body.confirmation -cne 'APPLY') { throw '请确认应用设置。' }
                        Send-Json $context (Set-ExpertSetting -Id ([string]$body.id) -Fingerprint ([string]$body.fingerprint) -Choice ([string]$body.choice))
                    }
                    '/api/system/expert/restore' {
                        if ($context.Request.HttpMethod -cne 'POST') { throw 'POST is required.' }
                        $body = Read-JsonBody $context.Request
                        if ($body.confirmation -cne 'RESTORE') { throw '请确认恢复设置。' }
                        Send-Json $context (Restore-ExpertSetting -BackupId ([string]$body.backupId))
                    }
                    '/api/repair/jobs' { Send-Json $context (Get-RepairJobs) }
                    '/api/repair/start' {
                        if ($context.Request.HttpMethod -cne 'POST') { throw 'POST is required.' }
                        $body=Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RUN') { throw 'Explicit RUN confirmation is required.' }
                        Send-Json $context (Start-RepairJob -Id ([string]$body.id))
                    }
                    '/api/device-service/catalog' { Send-Json $context (Get-DeviceServiceCatalog -Kind ([string]$context.Request.QueryString['kind'])) }
                    '/api/device-service/apply' {
                        if ($context.Request.HttpMethod -cne 'POST') { throw 'POST is required.' }
                        $body=Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        Send-Json $context (Set-DeviceServiceItem -Kind ([string]$body.kind) -Id ([string]$body.id) -Fingerprint ([string]$body.fingerprint) -Choice ([string]$body.choice))
                    }
                    '/api/device-service/restore' {
                        if ($context.Request.HttpMethod -cne 'POST') { throw 'POST is required.' }
                        $body=Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        Send-Json $context (Restore-DeviceServiceItem -BackupId ([string]$body.backupId))
                    }
                    '/api/maintenance/cleanup/preview' {
                        $category=[string]$context.Request.QueryString['category'];if(!$category){$category='temp'}
                        Send-Json $context (Get-CleanupPreview -Days ([int]$context.Request.QueryString['days']) -Category $category)
                    }
                    '/api/maintenance/cleanup/apply' {
                        if ($context.Request.HttpMethod -cne 'POST') { throw 'POST is required.' }
                        $body=Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'DELETE') { throw 'Explicit DELETE confirmation is required.' }
                        Send-Json $context (Remove-CleanupSelection -Token ([string]$body.token) -Ids @($body.ids))
                    }
                    '/api/maintenance/desktop/catalog' { Send-Json $context (Get-DesktopCatalog) }
                    '/api/maintenance/desktop/uninstall' {
                        if ($context.Request.HttpMethod -cne 'POST') { throw 'POST is required.' }
                        $body=Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'UNINSTALL') { throw 'Explicit UNINSTALL confirmation is required.' }
                        Send-Json $context (Start-DesktopUninstall -Id ([string]$body.id) -Fingerprint ([string]$body.fingerprint))
                    }
                    '/api/maintenance/disconnected/catalog' { Send-Json $context (Get-DisconnectedCatalog) }
                    '/api/maintenance/disconnected/remove' {
                        if ($context.Request.HttpMethod -cne 'POST') { throw 'POST is required.' }
                        $body=Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'REMOVE') { throw 'Explicit REMOVE confirmation is required.' }
                        Send-Json $context (Remove-DisconnectedDevice -Id ([string]$body.id) -Fingerprint ([string]$body.fingerprint))
                    }
                    '/api/maintenance/history' { Send-Json $context @(Get-MaintenanceHistory) }
                    '/api/background/catalog' { Send-Json $context (Get-BackgroundCatalog -Kind ([string]$context.Request.QueryString['kind'])) }
                    '/api/background/apply' {
                        if ($context.Request.HttpMethod -cne 'POST') { throw 'POST is required.' }
                        $body=Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        $result=Set-BackgroundItem -Kind ([string]$body.kind) -Id ([string]$body.id) -Fingerprint ([string]$body.fingerprint) -Action ([string]$body.action)
                        [void](Write-SynapseXOperation -Category 'system' -Action 'background-apply' -BackupId ([string]$result.backupId) -Detail @{kind=$body.kind;id=$body.id;action=$body.action})
                        Send-Json $context $result
                    }
                    '/api/background/restore' {
                        if ($context.Request.HttpMethod -cne 'POST') { throw 'POST is required.' }
                        $body=Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        $result=Restore-BackgroundItem -BackupId ([string]$body.backupId)
                        [void](Write-SynapseXOperation -Category 'system' -Action 'background-restore' -BackupId ([string]$result.backupId))
                        Send-Json $context $result
                    }
                    '/api/apps/audit' { Send-Json $context (Get-InstalledApplicationAudit) }
                    '/api/services/audit' { Send-Json $context (Get-ServiceAudit) }
                    '/api/startup/disable' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'DISABLE') { throw 'Explicit DISABLE confirmation is required.' }
                        $result = Disable-StartupEntries -Items @($body.items)
                        [void](Write-SynapseXOperation -Category 'startup' -Action 'entries-disable' -BackupId ([string]$result.backupId) -Detail @{ count = @($body.items).Count })
                        Send-Json $context $result
                    }
                    '/api/startup/restore' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        $result = Restore-StartupEntries -BackupId ([string]$body.backupId)
                        [void](Write-SynapseXOperation -Category 'startup' -Action 'entries-restore' -BackupId ([string]$result.backupId))
                        Send-Json $context $result
                    }
                    '/api/backups' { Send-Json $context @(Get-SynapseXBackups) }
                    '/api/network/audit' { Send-Json $context (Get-NetworkAudit) }
                    '/api/network/test' { Send-Json $context (Get-NetworkQualityTest) }
                    '/api/network/adapter-health' { Send-Json $context (Get-NetworkAdapterHealth) }
                    '/api/network/targets' { Send-Json $context (Get-NetworkProbeTargets) }
                    '/api/network/stability' {
                        $body = Read-JsonBody $context.Request
                        Send-Json $context (Measure-NetworkStability -Target ([string]$body.target) -Count ([int]$body.count))
                    }
                    '/api/network/trace' {
                        $body = Read-JsonBody $context.Request
                        Send-Json $context (Trace-NetworkPath -Target ([string]$body.target))
                    }
                    '/api/network/toolkit' { Send-Json $context (Get-NetworkToolkitSnapshot) }
                    '/api/network/tcp/apply' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        Send-Json $context (Set-TcpOptimizationProfile -InterfaceAlias ([string]$body.interfaceAlias) -ProfileId ([string]$body.profileId) -ItemIds @($body.itemIds))
                    }
                    '/api/network/tcp/restore' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        Send-Json $context (Restore-TcpOptimizationProfile -BackupId ([string]$body.backupId))
                    }
                    '/api/network/qos/apply' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        Send-Json $context (Set-SynapseXGameQos -ExecutablePath ([string]$body.executablePath) -Dscp ([int]$body.dscp))
                    }
                    '/api/network/qos/remove' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'REMOVE') { throw 'Explicit REMOVE confirmation is required.' }
                        Send-Json $context (Remove-SynapseXGameQos)
                    }
                    '/api/network/throughput' {
                        $body = Read-JsonBody $context.Request
                        Send-Json $context (Measure-NetworkThroughput -Milliseconds ([int]$body.milliseconds))
                    }
                    '/api/network/dns/test' { Send-Json $context (Test-DnsResolvers) }
                    '/api/network/dns/flush' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'FLUSH') { throw 'Explicit FLUSH confirmation is required.' }
                        Send-Json $context (Invoke-SynapseXDnsFlush)
                    }
                    '/api/network/dns/apply' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        Send-Json $context (Set-NetworkDnsPreset -InterfaceAlias ([string]$body.interfaceAlias) -PresetId ([string]$body.presetId))
                    }
                    '/api/network/dns/restore' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        Send-Json $context (Restore-NetworkDns -BackupId ([string]$body.backupId))
                    }
                    '/api/network/mtu/test' {
                        $body = Read-JsonBody $context.Request
                        Send-Json $context (Test-PathMtu -Target ([string]$body.target))
                    }
                    '/api/network/mtu/apply' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        Send-Json $context (Set-SynapseXInterfaceMtu -InterfaceAlias ([string]$body.interfaceAlias) -Mtu ([int]$body.mtu))
                    }
                    '/api/network/mtu/restore' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        Send-Json $context (Restore-SynapseXInterfaceMtu -BackupId ([string]$body.backupId))
                    }
                    '/api/network/nic/audit' {
                        $body = Read-JsonBody $context.Request
                        Send-Json $context (Get-NicAdvancedAudit -InterfaceAlias ([string]$body.interfaceAlias))
                    }
                    '/api/network/nic/apply' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        Send-Json $context (Set-NicLatencyProfile -InterfaceAlias ([string]$body.interfaceAlias))
                    }
                    '/api/network/nic/property' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        Send-Json $context (Set-NicPropertyValue -InterfaceAlias ([string]$body.interfaceAlias) -Keyword ([string]$body.keyword) -Value ([string]$body.value) -Expected ([string]$body.expected))
                    }
                    '/api/network/nic/restore' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        Send-Json $context (Restore-NicLatencyProfile -BackupId ([string]$body.backupId))
                    }
                    '/api/network/hosts/save' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'SAVE') { throw 'Explicit SAVE confirmation is required.' }
                        Send-Json $context (Set-SynapseXHostsContent -Content ([string]$body.content))
                    }
                    '/api/network/hosts/restore' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        Send-Json $context (Restore-SynapseXHosts -BackupId ([string]$body.backupId))
                    }
                    '/api/network/repair' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'REPAIR') { throw 'Explicit REPAIR confirmation is required.' }
                        $result = Repair-StaleLoopbackProxy
                        [void](Write-SynapseXOperation -Category 'network' -Action 'stale-proxy-repair' -BackupId ([string]$result.backupId))
                        Send-Json $context $result
                    }
                    '/api/network/restore' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        $result = Restore-NetworkProxy -BackupId ([string]$body.backupId)
                        [void](Write-SynapseXOperation -Category 'network' -Action 'proxy-restore' -BackupId ([string]$result.backupId))
                        Send-Json $context $result
                    }
                    '/api/jiuyin/preview' {
                        $body = Read-JsonBody $context.Request
                        Send-Json $context (Get-JiuYinProfilePreview -GameRoot ([string]$body.gameRoot) -ProfileId ([string]$body.profile))
                    }
                    '/api/jiuyin/catalog' {
                        $body = Read-JsonBody $context.Request
                        Send-Json $context (Get-JiuYinConfigCatalog -GameRoot ([string]$body.gameRoot))
                    }
                    '/api/jiuyin/apply' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        $result = Set-JiuYinProfile -GameRoot ([string]$body.gameRoot) -ProfileId ([string]$body.profile)
                        [void](Write-SynapseXOperation -Category 'jiuyin' -Action 'profile-apply' -BackupId ([string]$result.backupId) -Detail @{ profile = [string]$body.profile })
                        Send-Json $context $result
                    }
                    '/api/jiuyin/restore' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        $result = Restore-JiuYinProfile -GameRoot ([string]$body.gameRoot) -BackupId ([string]$body.backupId)
                        [void](Write-SynapseXOperation -Category 'jiuyin' -Action 'profile-restore' -BackupId ([string]$result.backupId))
                        Send-Json $context $result
                    }
                    '/api/jiuyin/custom/apply' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        $result = Set-JiuYinCustomSettings -GameRoot ([string]$body.gameRoot) -Changes @($body.changes)
                        [void](Write-SynapseXOperation -Category 'jiuyin' -Action 'custom-settings-apply' -BackupId ([string]$result.backupId) -Detail @{ count = [int]$result.changedCount })
                        Send-Json $context $result
                    }
                    '/api/runtime/audit' { Send-Json $context (Get-GameRuntimeSnapshot) }
                    '/api/diagnostics/audit' { Send-Json $context (Get-SynapseXDiagnosticSnapshot -GameRoot $GameRoot) }
                    '/api/monitor/targets' { Send-Json $context (Get-RealtimeMonitorTargets -Force:($context.Request.QueryString['refresh'] -eq '1')) }
                    '/api/monitor/sample' {
                        $body = Read-JsonBody $context.Request
                        Send-Json $context (Get-RealtimeTelemetry -TargetProcessName ([string]$body.processName) -TargetProcessId ([int]$body.processId))
                    }
                    '/api/reports' {
                        $reports = @(Get-SynapseXPerformanceReports)
                        Send-Json -Context $context -Payload $reports
                    }
                    '/api/reports/list' {
                        $reports = @(Get-SynapseXPerformanceReports)
                        Send-Json -Context $context -Payload $reports
                    }
                    '/api/reports/save' {
                        $body = Read-JsonBody $context.Request
                        $result = Save-SynapseXPerformanceReport -Report $body.report
                        if ($result.status -ne 'recording') { [void](Write-SynapseXOperation -Category 'performance' -Action 'report-created' -Detail @{ reportId = [string]$result.id; processName = [string]$result.game.processName; durationSeconds = [double]$result.game.durationSeconds }) }
                        Send-Json $context $result
                    }
                    '/api/reports/delete' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'DELETE') { throw 'Explicit DELETE confirmation is required.' }
                        $result = Remove-SynapseXPerformanceReport -Id ([string]$body.id)
                        [void](Write-SynapseXOperation -Category 'performance' -Action 'report-deleted' -Detail @{ reportId = [string]$body.id })
                        Send-Json $context $result
                    }
                    '/api/diagnostics/thread-pressure' {
                        $body = Read-JsonBody $context.Request
                        Send-Json $context (Measure-GameThreadPressure -Seconds ([int]$body.seconds))
                    }
                    '/api/runtime/power/apply' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        Send-Json $context (Set-SynapseXPowerScheme -Guid ([string]$body.guid))
                    }
                    '/api/runtime/power/library/apply' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY' -or $body.acceptFullPlan -isnot [bool] -or $body.acceptHighRisk -isnot [bool]) { throw 'Explicit power library confirmation is required.' }
                        Send-Json $context (Import-SynapseXPowerLibraryPlan -Id ([string]$body.id) -AcceptFullPlan $body.acceptFullPlan -AcceptHighRisk $body.acceptHighRisk)
                    }
                    '/api/runtime/power/restore' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        Send-Json $context (Restore-SynapseXPowerScheme -BackupId ([string]$body.backupId))
                    }
                    '/api/runtime/power/cpu/recommendation' { Send-Json $context (Get-CpuPowerRecommendation) }
                    '/api/runtime/power/cpu/apply' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'APPLY') { throw 'Explicit APPLY confirmation is required.' }
                        Send-Json $context (New-SynapseXCpuPowerPlan -ProfileId ([string]$body.profileId))
                    }
                    '/api/runtime/power/cpu/restore' {
                        $body = Read-JsonBody $context.Request
                        if ([string]$body.confirmation -cne 'RESTORE') { throw 'Explicit RESTORE confirmation is required.' }
                        Send-Json $context (Restore-SynapseXCpuPowerPlan -BackupId ([string]$body.backupId))
                    }
                    '/api/operations' { Send-Json $context @(Get-SynapseXOperationLog) }
                    default { Send-Json $context @{ error = 'API endpoint not found.' } 404 }
                }
                continue
            }

            $relative = if ($path -eq '/') { 'index.html' } else { [Uri]::UnescapeDataString($path.TrimStart('/')).Replace('/', [IO.Path]::DirectorySeparatorChar) }
            $candidate = [IO.Path]::GetFullPath((Join-Path $webRoot $relative))
            $rootPrefix = [IO.Path]::GetFullPath($webRoot).TrimEnd('\') + '\'
            if (-not $candidate.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)) { $candidate = Join-Path $webRoot 'index.html' }
            Send-Bytes $context ([IO.File]::ReadAllBytes($candidate)) (Get-MimeType $candidate)
        } catch {
            $requestError = $_.Exception.Message
            # Headers may already be committed, and even CanWrite can throw.
            # Never let failure to send an error terminate the listener loop.
            try { Send-Json $context @{ error = $requestError } 400 } catch { }
            try { $context.Response.Abort() } catch { }
        }
    }
} finally {
    try { Restore-SchedulerLab | Out-Null } catch { Write-Warning ('实验恢复未完成：'+$_.Exception.Message) }
    try { Stop-SessionLab | Out-Null } catch { Write-Warning ('会话恢复未完成：'+$_.Exception.Message) }
    try { Stop-LatencyLab | Out-Null } catch { Write-Warning ('延迟测试关闭未完成：'+$_.Exception.Message) }
    try { Stop-LabDiagnostics | Out-Null } catch { Write-Warning ('诊断关闭未完成：'+$_.Exception.Message) }
    $listener.Stop(); $listener.Close()
}
