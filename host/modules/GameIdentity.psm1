$ErrorActionPreference = 'Stop'

function Get-MonitorGameEvidence([string]$Name, [string]$Path) {
    $base = $Name -replace '(?i)\.exe$', ''
    # GPU acceleration and a foreground window are not evidence of a game.
    if ($base -match '(?i)^(system|idle|registry|memory compression|secure system|svchost|csrss|lsass|services|smss|wininit|winlogon|awesun|sunloginclient|rustdesk|mstsc|applicationframehost|boosterx|chatgpt|chrome|clash-verge|codex|cursor|dwm|electron|explorer|firefox|gamebar.*|msedge.*|obs.*|qq.*|wechat.*|weixin.*|rtss.*|searchhost|shellexperiencehost|nvidia.*|powershell|pwsh|startmenuexperiencehost|steam.*|synapsex.*|taskmgr|textinputhost|widgets|windowsterminal|epicgameslauncher|epicwebhelper|wegame.*|battle\.net|ubisoftconnect|upc|eadesktop|ealauncher)$') { return '' }
    if ($base -match '(?i)(launcher|crash|updater|reporter|helper|uninstall|setup|anticheat|cefsubprocess|webview|overlay)') { return '' }
    if ($base -match '(?i)^(fxgame|cs2|csgo|dota2|hl2|tf_win64|valorant-win64-shipping|league of legends|tft|genshinimpact|yuanshen|starrail|zenlesszonezero|overwatch|r5apex|tslgame|fortniteclient-win64-shipping|eldenring|darksoulsiii|sekiro|blackmythwukong|b1-win64-shipping|cyberpunk2077|witcher3|gta5|gta5_enhanced|rdr2|monsterhunterworld|monsterhunterrise|ffxiv_dx11|wow|wowclassic|palworld-win64-shipping|minecraft\.windows|forzahorizon5|warframe\.x64|rainbowsix|destiny2)$') { return 'known-game' }
    if ($base -match '(?i)-win(32|64)-shipping$') { return 'unreal-game' }
    if ($Path -match '(?i)[\\/](steamapps[\\/]common|epic games|gog games|xboxgames|games)[\\/]' -and $Path -notmatch '(?i)[\\/](steamworks shared|_commonredist|redist|binaries[\\/]thirdparty)[\\/]') { return 'game-directory' }
    # Unity standalone players also work outside a standard library directory.
    if ($Path) {
        $folder = Split-Path -Parent $Path
        if ($folder -and (Test-Path -LiteralPath (Join-Path $folder ($base + '_Data')) -PathType Container) -and (Test-Path -LiteralPath (Join-Path $folder 'UnityPlayer.dll') -PathType Leaf)) { return 'unity-game' }
    }
    return ''
}
Export-ModuleMember -Function Get-MonitorGameEvidence
