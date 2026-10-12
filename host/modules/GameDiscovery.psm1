$ErrorActionPreference = 'Stop'
function Get-JiuYinLocation([string]$Root = '') {
    $roots = New-Object 'System.Collections.Generic.List[string]'
    if ($Root) { $roots.Add($Root) }
    foreach ($game in @(Get-Process -Name fxgame -ErrorAction SilentlyContinue)) {
        try {
            # QueryLimitedInformation does not require reading protected process memory.
            if (-not ('SynapseX.GameImagePath' -as [type])) {
                Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
namespace SynapseX {
 public static class GameImagePath {
  [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, int id);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr handle, uint flags, StringBuilder name, ref uint size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  public static string Read(int id) {
   var h = OpenProcess(0x1000, false, id); if (h == IntPtr.Zero) return "";
   try { uint size=32768; var name=new StringBuilder((int)size); return QueryFullProcessImageName(h,0,name,ref size) ? name.ToString() : ""; }
   finally { CloseHandle(h); }
  }
 }
}
'@
            }
            $exe = [SynapseX.GameImagePath]::Read($game.Id)
            if (-not $exe) { continue }
            $parent = Split-Path $exe -Parent
            $roots.Add($parent)
            $roots.Add((Split-Path $parent -Parent))
        } catch { }
    }
    foreach ($candidateRoot in $roots) {
        if (-not (Test-Path -LiteralPath (Join-Path $candidateRoot 'fxlaunch.exe') -PathType Leaf)) { continue }
        foreach ($relative in @('bin64\fxgame.exe', 'bin\fxgame.exe', 'fxgame.exe')) {
            $candidate = Join-Path $candidateRoot $relative
            if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                return [pscustomobject]@{ gameRoot = $candidateRoot; gameExecutable = $candidate }
            }
        }
    }
    [pscustomobject]@{ gameRoot = ''; gameExecutable = '' }
}
Export-ModuleMember -Function Get-JiuYinLocation
