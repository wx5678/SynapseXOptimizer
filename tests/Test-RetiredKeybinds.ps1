#Requires -Version 7.0
# The HTTP assertion harness uses PowerShell 7; the packaged service below runs Windows PowerShell 5.1.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$resources = Join-Path $taskRoot ($package.build.directories.output + '\win-unpacked\resources')
$hostPath = Join-Path $resources 'host\SynapseXHost.ps1'
if (!(Test-Path -LiteralPath $hostPath)) { throw 'Build the desktop package first.' }
if (Test-Path -LiteralPath (Join-Path $resources 'host\modules\JiuYinKeybindProfiles.psm1')) { throw 'Retired module is still distributed.' }
$bundle = (Get-ChildItem -LiteralPath (Join-Path $resources 'dist\assets') -Filter '*.js' | Get-Content -Raw -Encoding UTF8) -join ''
foreach ($retired in @('/api/jiuyin/keybinds/', 'preview-game-mode', '界面预览 · 示例数据', 'privacy-preview-', 'disconnected-preview-', 'quick-preview-fixture')) {
    if ($bundle.Contains($retired)) { throw "Unexpected production content: $retired" }
}
$portProbe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$portProbe.Start()
$testPort = $portProbe.LocalEndpoint.Port
$portProbe.Stop()
$testToken = [guid]::NewGuid().ToString('N')
$headers = @{ 'X-SynapseX-Token' = $testToken }
$testHost = $null
$ready = $false
try {
    $shellPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $testHost = Start-Process -FilePath $shellPath -WindowStyle Hidden -PassThru -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $hostPath + '"'), '-NoLaunch', '-StrictPort', '-PreferredPort', $testPort, '-SessionToken', $testToken)
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($testHost.HasExited) { throw 'Packaged host exited before readiness.' }
        try {
            $status = Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/status" -Headers $headers -TimeoutSec 2
            $ready = $true
            break
        } catch { Start-Sleep -Milliseconds 100 }
    }
    if (!$ready) { throw 'Packaged host did not become ready.' }
    if ($status.version -ne $package.version) { throw 'Host version differs from package.' }
    foreach($kind in @('services','devices','msi','service-host')){
        $catalog=Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/device-service/catalog?kind=$kind" -Headers $headers -TimeoutSec 30
        if(!$catalog.capturedAt -or !$catalog.account){throw "Device/service catalog failed: $kind"}
    }
    $expert=Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/system/expert/catalog" -Headers $headers -TimeoutSec 30
    if(@($expert.items).Count -ne 59){throw 'Expert catalog failed'}
    $repairs=Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/repair/jobs" -Headers $headers -TimeoutSec 20
    if(@($repairs.items).Count -ne 10){throw 'Repair catalog failed'}
    $systemTools=Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/system/tools" -Headers $headers -TimeoutSec 10
    if(@($systemTools.items).Count -ne 7){throw 'System tool catalog failed'}
    foreach($route in @('device-service/apply','device-service/restore','system/expert/apply','system/expert/restore','repair/start','system/tools/open')){
        $denied=Invoke-WebRequest -Uri "http://127.0.0.1:$testPort/api/$route" -Method Post -ContentType 'application/json' -Body '{}' -Headers $headers -SkipHttpErrorCheck -TimeoutSec 5
        if([int]$denied.StatusCode -ne 400){throw "Confirmation guard failed: $route"}
    }
    $desktop=Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/maintenance/desktop/catalog" -Headers $headers -TimeoutSec 20
    $disconnected=Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/maintenance/disconnected/catalog" -Headers $headers -TimeoutSec 20
    if(!$disconnected.capturedAt){throw 'Disconnected device catalog failed'}
    $denied=Invoke-WebRequest -Uri "http://127.0.0.1:$testPort/api/maintenance/disconnected/remove" -Method Post -ContentType 'application/json' -Body '{}' -Headers $headers -SkipHttpErrorCheck -TimeoutSec 5
    if([int]$denied.StatusCode -ne 400){throw 'Disconnected device confirmation guard failed'}
    if (!$desktop.account -or !$desktop.capturedAt) { throw 'Desktop catalog metadata missing.' }
    $cleanup=Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/maintenance/cleanup/preview?days=7" -Headers $headers -TimeoutSec 20
    if (!$cleanup.token -or !$cleanup.expiresAt) { throw 'Cleanup preview failed.' }
    foreach($category in @('thumbnails','setup-logs','error-reports')) {
        $preview=Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/maintenance/cleanup/preview?days=30&category=$category" -Headers $headers -TimeoutSec 20
        if(!$preview.token -or !$preview.expiresAt -or $preview.category -ne $category){throw "Packaged cleanup category failed: $category"}
    }
    foreach($route in @('cleanup/apply','desktop/uninstall')) {
        $denied=Invoke-WebRequest -Uri "http://127.0.0.1:$testPort/api/maintenance/$route" -Method Post -ContentType 'application/json' -Body '{}' -Headers $headers -SkipHttpErrorCheck -TimeoutSec 5
        if ([int]$denied.StatusCode -ne 400) { throw 'Maintenance missing-confirmation guard failed.' }
    }
    foreach ($kind in @('tasks','folders','packages')) {
        $background = Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/background/catalog?kind=$kind" -Headers $headers -TimeoutSec 30
        if (!$background.capturedAt -or !$background.account) { throw "Background catalog failed: $kind" }
    }
    foreach ($action in @('apply','restore')) {
        $denied = Invoke-WebRequest -Uri "http://127.0.0.1:$testPort/api/background/$action" -Method Post -ContentType 'application/json' -Body '{}' -Headers $headers -SkipHttpErrorCheck -TimeoutSec 5
        if ([int]$denied.StatusCode -ne 400) { throw 'Background write did not reject missing confirmation.' }
    }
    $advanced = Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/system/advanced/catalog" -Headers $headers -TimeoutSec 20
    if (@($advanced.items).Count -ne 13) { throw 'Packaged advanced catalog failed.' }
    foreach ($action in @('apply','restore')) {
        $denied = Invoke-WebRequest -Uri "http://127.0.0.1:$testPort/api/system/advanced/$action" -Method Post -ContentType 'application/json' -Body '{}' -Headers $headers -SkipHttpErrorCheck -TimeoutSec 5
        if ([int]$denied.StatusCode -ne 400) { throw 'Advanced write did not reject missing confirmation.' }
    }
    $invalid = Invoke-WebRequest -Uri "http://127.0.0.1:$testPort/api/system/advanced/apply" -Method Post -ContentType 'application/json' -Body '{"confirmation":"APPLY","id":"not-a-real-item"}' -Headers $headers -SkipHttpErrorCheck -TimeoutSec 5
    if ([int]$invalid.StatusCode -ne 400) { throw 'Advanced endpoint accepted unknown item.' }
    $network = Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/network/toolkit" -Headers $headers -TimeoutSec 30
    if (@($network.tcp.optimization.items).Count -lt 10) { throw 'Packaged network toolkit failed to load.' }
    $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/monitor/targets?refresh=1" -Headers $headers -TimeoutSec 15
    if ($null -eq $targets.candidates) { throw 'Forced monitor scan route failed.' }
    $runtime = Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/runtime/audit" -Headers $headers -TimeoutSec 20
    if ($null -ne $runtime.priorityControl -or [string]::IsNullOrWhiteSpace($runtime.power.cpuRecommendation.cpuName)) { throw 'Packaged runtime compatibility audit failed.' }
    foreach ($action in @('apply','restore')) {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$testPort/api/runtime/priority/$action" -Method Post -ContentType 'application/json' -Body '{}' -Headers $headers -SkipHttpErrorCheck -TimeoutSec 3
        if ([int]$response.StatusCode -ne 404) { throw "Retired priority $action remains reachable" }
    }
    foreach ($action in @('catalog', 'preview', 'save', 'apply', 'restore', 'delete')) {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$testPort/api/jiuyin/keybinds/$action" -Headers $headers -SkipHttpErrorCheck -TimeoutSec 3
        if ([int]$response.StatusCode -ne 404) { throw "Retired $action route remains reachable: $($response.StatusCode)" }
    }
    [pscustomobject]@{ Version = $status.version; PackagedHost = 'started'; RuntimeCompatibility = 'read-only audit passed'; RetiredRoutes = '6/6 return 404'; RetiredModule = 'excluded'; DevelopmentFixtures = 'excluded'; SystemOrGameWrites = 'none' }
} finally {
    if ($testHost -and !$testHost.HasExited) {
        if ($ready) { try { Invoke-RestMethod -Uri "http://127.0.0.1:$testPort/api/shutdown" -Headers $headers -TimeoutSec 3 | Out-Null } catch {} }
        if (!$testHost.WaitForExit(3000)) { $testHost.Kill(); $testHost.WaitForExit() }
    }
}
