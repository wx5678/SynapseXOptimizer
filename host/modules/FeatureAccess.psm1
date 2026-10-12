$ErrorActionPreference = 'Stop'
# Shared with Electron. Only explicitly listed reads/diagnostics/recovery are
# free; adding an unknown route to a protected family must not unlock writes.
$script:policy = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../feature-access.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$script:free = @($script:policy.read) + @($script:policy.diagnostics) + @($script:policy.preferences) + @($script:policy.recovery)
function Get-RouteFeature([string]$Path) {
    $route = ($Path -split '\?', 2)[0].ToLowerInvariant()
    if ($script:free -contains $route) { return '' }
    foreach ($entry in $script:policy.paid.PSObject.Properties) {
        if ($route -ceq $entry.Name) { return [string]$entry.Value }
    }
    foreach ($entry in $script:policy.protectedPrefixes.PSObject.Properties) {
        if ($route.StartsWith($entry.Name, [StringComparison]::Ordinal)) { return [string]$entry.Value }
    }
    return ''
}
Export-ModuleMember -Function Get-RouteFeature
