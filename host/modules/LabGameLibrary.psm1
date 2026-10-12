$ErrorActionPreference='Stop'
function Find-LabGameExecutables([string]$Root) {
    if(!$Root -or !(Test-Path -LiteralPath $Root -PathType Container)){return @()}
    $queue=New-Object 'Collections.Generic.Queue[object]'
    $queue.Enqueue(@{path=$Root;depth=0});$visited=0;$found=0
    while($queue.Count -gt 0 -and $visited -lt 400 -and $found -lt 30) {
        $item=$queue.Dequeue();$visited++
        foreach($file in @(Get-ChildItem -LiteralPath $item.path -File -Filter '*.exe' -ErrorAction SilentlyContinue)){
            if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){continue}
            if($file.BaseName -match '(?i)unins|setup|install|redist|crash|report|anticheat|battleye|vcredist|dxsetup|helper|CEF|webview'){continue}
            $found++;$file.FullName
            if($found -ge 30){break}
        }
        if($item.depth -lt 3){foreach($dir in @(Get-ChildItem -LiteralPath $item.path -Directory -ErrorAction SilentlyContinue)){
            if($dir.Attributes -band [IO.FileAttributes]::ReparsePoint -or $dir.Name -match '(?i)^(__installer|_commonredist|redist|cache|logs|windows)$'){continue}
            if($queue.Count -lt 400){$queue.Enqueue(@{path=$dir.FullName;depth=$item.depth+1})}
        }}
    }
}
function Get-LabInstalledGames {
    $installations=New-Object Collections.ArrayList
    $warnings=New-Object Collections.ArrayList
    $steam=(Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath
    if($steam){
        $libraries=@($steam)
        $vdf=Join-Path $steam 'steamapps\libraryfolders.vdf'
        if(Test-Path -LiteralPath $vdf){
            $text=Get-Content -LiteralPath $vdf -Raw -Encoding UTF8
            $libraries+=@([regex]::Matches($text,'"path"\s+"([^"\r\n]+)"')|ForEach-Object {$_.Groups[1].Value.Replace('\\','\')})
        }
        foreach($library in @($libraries|Select-Object -Unique)){
            foreach($manifest in @(Get-ChildItem -LiteralPath (Join-Path $library 'steamapps') -Filter 'appmanifest_*.acf' -File -ErrorAction SilentlyContinue|Select-Object -First 200)){
                try{
                    $text=Get-Content -LiteralPath $manifest.FullName -Raw -Encoding UTF8
                    $name=[regex]::Match($text,'"name"\s+"([^"\r\n]+)"').Groups[1].Value
                    $dir=[regex]::Match($text,'"installdir"\s+"([^"\r\n]+)"').Groups[1].Value
                    if($name -and $dir -and $dir -notmatch '[\\/:]' -and $dir -notin @('.','..')){[void]$installations.Add(@{name=$name;platform='Steam';root=(Join-Path $library ('steamapps\common\'+$dir))})}
                }catch{[void]$warnings.Add('部分 Steam 安装清单读取失败。')}
            }
        }
    }
    $epic=Join-Path $env:ProgramData 'Epic\EpicGamesLauncher\Data\Manifests'
    foreach($manifest in @(Get-ChildItem -LiteralPath $epic -Filter '*.item' -File -ErrorAction SilentlyContinue|Select-Object -First 200)){
        try{$data=Get-Content -LiteralPath $manifest.FullName -Raw -Encoding UTF8|ConvertFrom-Json
            if($data.InstallLocation -and $data.DisplayName){[void]$installations.Add(@{name=[string]$data.DisplayName;platform='Epic';root=[string]$data.InstallLocation})}
        }catch{[void]$warnings.Add('部分 Epic 安装清单读取失败。')}
    }
    foreach($entry in @(Get-ChildItem 'HKLM:\SOFTWARE\WOW6432Node\GOG.com\Games','HKLM:\SOFTWARE\GOG.com\Games' -ErrorAction SilentlyContinue)){
        $data=Get-ItemProperty -LiteralPath $entry.PSPath -ErrorAction SilentlyContinue
        if($data.path -and $data.gameName){[void]$installations.Add(@{name=[string]$data.gameName;platform='GOG';root=[string]$data.path})}
    }
    foreach($key in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall')){
        foreach($entry in @(Get-ChildItem -LiteralPath $key -ErrorAction SilentlyContinue)){
            $data=Get-ItemProperty -LiteralPath $entry.PSPath -ErrorAction SilentlyContinue
            if($data.InstallLocation -and $data.DisplayName -and ($data.Publisher -match '(?i)Ubisoft|Riot|Blizzard|Tencent|蜗牛|Snail|完美|网易')){
                [void]$installations.Add(@{name=[string]$data.DisplayName;platform=[string]$data.Publisher;root=[string]$data.InstallLocation})
            }
        }
    }
    $rows=@(foreach($game in @($installations|Sort-Object root -Unique|Select-Object -First 200)){
        if(!(Test-Path -LiteralPath $game.root -PathType Container)){continue}
        @{name=$game.name;platform=$game.platform;root=$game.root;executables=@(Find-LabGameExecutables $game.root)}
    })
    @{games=$rows;warnings=@($warnings|Select-Object -Unique);note='读取 Steam、Epic、GOG 和其他启动器写入的安装记录；每项限扫 3 层/400 个目录。不执行扫描到的程序。未登记的游戏请手动添加。'}
}
Export-ModuleMember -Function Get-LabInstalledGames
