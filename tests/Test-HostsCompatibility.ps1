$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot '../host/modules/NetworkToolkit.psm1') -Force
try {
    & (Get-Module NetworkToolkit) {
        # Exercise a real missing path first: no file or attributes are modified.
        $script:hostsPath=Join-Path $PSScriptRoot ('missing-hosts-'+[guid]::NewGuid().ToString('N'))
        $missing=Get-HostsAudit
        if ($missing.status -ne 'missing' -or $missing.available -or $missing.writable) { throw 'Missing Hosts did not degrade safely' }
        $script:case='normal';$script:elevated=$true
        function script:Test-ToolkitElevated { $script:elevated }
        function script:Get-Item {
            param($LiteralPath,[switch]$Force,$ErrorAction)
            if (-not $Force) { throw 'Hidden/system file read must use Force' }
            if ($script:case -eq 'metadata-denied') { throw [UnauthorizedAccessException]::new('denied') }
            $attributes=if ($script:case -eq 'read-only') { 1 } elseif ($script:case -eq 'hidden-system') { 6 } else { 0 }
            [pscustomobject]@{PSIsContainer=($script:case -eq 'directory');Length=33;Attributes=[IO.FileAttributes]$attributes}
        }
        function script:Read-ToolkitHostsText([string]$Path) {
            switch ($script:case) {
                'denied' { throw [UnauthorizedAccessException]::new('denied') }
                'locked' { throw [IO.IOException]::new('sharing violation') }
                'disappeared' { throw [IO.FileNotFoundException]::new('removed between metadata and read') }
                default { "# comment`r`n127.0.0.1 localhost`r`n" }
            }
        }
        foreach ($case in @('normal','hidden-system','read-only','metadata-denied','denied','locked','disappeared','directory')) {
            $script:case=$case
            $audit=Get-HostsAudit
            $expected=switch ($case) { 'read-only' {'read-only'} 'metadata-denied' {'access-denied'} 'denied' {'access-denied'} 'locked' {'read-failed'} 'disappeared' {'missing'} 'directory' {'read-failed'} default {'ready'} }
            if ($audit.status -ne $expected) { throw "Wrong status for $case : $($audit.status)" }
            if ($expected -in @('ready','read-only')) {
                if (-not $audit.available -or $audit.activeEntryCount -ne 1 -or -not $audit.content.Contains('localhost')) { throw 'Valid content lost' }
                if ($audit.writable -ne ($expected -eq 'ready')) { throw 'Wrong writable flag' }
            } else {
                if ($audit.available -or $audit.writable -or $audit.content -ne '' -or -not $audit.error) { throw 'Unsafe failure state' }
                $blocked=$false
                try { Set-SynapseXHostsContent 'must not write' | Out-Null } catch { $blocked=$true }
                if (-not $blocked) { throw 'Save accepted unreadable content' }
            }
        }
        $script:case='normal';$script:elevated=$false
        $audit=Get-HostsAudit
        if (-not $audit.available -or $audit.writable) { throw 'Non-admin should be read-only' }
        # Full toolkit remains usable when the Hosts file cannot be read.
        function script:Get-NetRoute { @() }
        function script:Get-NetAdapter { @() }
        function script:Get-NetTCPConnection { @() }
        function script:Get-AcceleratorCompatibility { @{items=@();detected=$false} }
        function script:Get-TcpGlobalState { @{raw=@('tcp-ok')} }
        function script:Get-QosPolicyAudit { @{items=@()} }
        $script:case='locked'
        $snapshot=Get-NetworkToolkitSnapshot
        if ($snapshot.hosts.status -ne 'read-failed' -or $snapshot.tcp.raw[0] -ne 'tcp-ok' -or $snapshot.dnsPresets.Count -lt 1) { throw 'Hosts failure blocked toolkit' }
    }
    '{"passed":true,"cases":11,"realHostsWrites":0,"securityChanges":0}'
} finally { Remove-Module NetworkToolkit -ErrorAction SilentlyContinue }
