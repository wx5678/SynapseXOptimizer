$ErrorActionPreference = 'Stop'
$script:SensorCache = $null
$script:CpuComputer = $null
$ExecutionContext.SessionState.Module.OnRemove = { if($script:CpuComputer){try{$script:CpuComputer.Close()}catch{}} }

function Get-BuiltinCpuTemperature {
    $result = @{temperatureC=$null;temperatureSource='';temperatureStatus='unavailable';temperatureMessage=''}
    $dll = Join-Path $PSScriptRoot '../../tools/sensors/lhm-0.9.6/LibreHardwareMonitorLib.dll'
    if(-not (Test-Path -LiteralPath $dll)){ $result.temperatureStatus='component-missing';$result.temperatureMessage='内置温度组件缺失，请重新下载完整软件。';return $result }
    # Never install/start a kernel driver or lower Windows protections here.
    $driver=Get-Service -Name PawnIO -ErrorAction SilentlyContinue
    if(-not $driver){$result.temperatureStatus='driver-missing';$result.temperatureMessage='未安装 CPU 温度读取驱动，可点击下方按钮下载安装。';return $result}
    if($driver.Status -ne 'Running'){$result.temperatureStatus='driver-stopped';$result.temperatureMessage='PawnIO 驱动未运行，请检查官方组件安装状态。';return $result}
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
    if(-not ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){$result.temperatureStatus='permission-denied';$result.temperatureMessage='读取 CPU 传感器需要管理员权限，请重新以管理员身份打开软件。';return $result}
    try {
        if(-not $script:CpuComputer){
            Add-Type -Path $dll
            $script:CpuComputer=New-Object LibreHardwareMonitor.Hardware.Computer
            $script:CpuComputer.IsCpuEnabled=$true
            # All other hardware groups remain disabled: no fan/voltage controls.
            $script:CpuComputer.Open()
        }
        $readings=@(foreach($hardware in $script:CpuComputer.Hardware){
            if([string]$hardware.HardwareType -ne 'Cpu'){continue}
            $hardware.Update()
            foreach($sensor in $hardware.Sensors){
                if([string]$sensor.SensorType -ne 'Temperature'){continue}
                $number=Convert-MonitorNumber $sensor.Value
                if($null -ne $number -and $number -gt 0 -and $number -le 125){
                    [pscustomobject]@{value=$number;preferred=([string]$sensor.Name -match '(?i)package|tctl|tdie');name=[string]$sensor.Name;cpu=[string]$hardware.Name}
                }
            }
        })
        $sensor=$readings | Sort-Object @{Expression='preferred';Descending=$true},@{Expression='value';Descending=$true} | Select-Object -First 1
        if($sensor){$result.temperatureC=[math]::Round($sensor.value,1);$result.temperatureSource="LibreHardwareMonitor 0.9.6 / $($sensor.cpu) / $($sensor.name)";$result.temperatureStatus='available'}
        else{$result.temperatureStatus='sensor-unavailable';$result.temperatureMessage='组件已加载，但未取得有效 CPU 温度。可能是驱动版本、安全策略或此硬件尚未支持；不会用主板温度代替。'}
    } catch {
        $result.temperatureStatus='read-error';$result.temperatureMessage='温度组件读取失败：'+$_.Exception.Message
        if($script:CpuComputer){try{$script:CpuComputer.Close()}catch{};$script:CpuComputer=$null}
    }
    return $result
}

function Convert-MonitorNumber($Value) {
    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) { return $null }
    $number = 0.0
    if ([double]::TryParse([string]$Value, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$number) -and -not [double]::IsNaN($number) -and -not [double]::IsInfinity($number)) { return $number }
    $null
}

function Get-MonitorCpuTemperature {
    $now = [DateTime]::UtcNow
    if ($script:SensorCache -and ($now - $script:SensorCache.time).TotalSeconds -lt 5) { return $script:SensorCache.value }
    $result = @{ temperatureC = $null; temperatureSource = ''; temperatureStatus = 'unavailable' }
    # Only CPU temperature sensors. ACPI thermal zones are not CPU cores.
    foreach ($provider in @('LibreHardwareMonitor', 'OpenHardwareMonitor')) {
        try {
            $sensors = @(Get-CimInstance -Namespace "root\$provider" -ClassName Sensor -Filter "SensorType='Temperature'" -OperationTimeoutSec 1 -ErrorAction Stop)
            $readings = @($sensors | Where-Object { [string]$_.Parent -match '^/(intelcpu|amdcpu)/\d+$' } | ForEach-Object {
                $number = Convert-MonitorNumber $_.Value
                if ($null -ne $number -and $number -gt 0 -and $number -le 125) {
                    [pscustomobject]@{value=$number; preferred=([string]$_.Name -match '(?i)package|tctl|tdie'); name=[string]$_.Name}
                }
            })
            $sensor = $readings | Sort-Object @{Expression='preferred';Descending=$true}, @{Expression='value';Descending=$true} | Select-Object -First 1
            if ($sensor) { $result = @{temperatureC=[math]::Round($sensor.value,1);temperatureSource="$provider / $($sensor.name)";temperatureStatus='available'}; break }
        } catch { # Missing/denied providers are unsupported, not 0 C.
        }
    }
    if($null -eq $result.temperatureC){$result=Get-BuiltinCpuTemperature}
    $script:SensorCache = @{time=$now;value=$result}
    $result
}
Export-ModuleMember -Function Get-MonitorCpuTemperature, Convert-MonitorNumber
