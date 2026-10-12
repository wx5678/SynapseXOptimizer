$ErrorActionPreference='Stop'
function Get-SystemToolDefinitions {
    @(
        @{id='graphics';title='硬件加速 GPU 调度与图形默认设置';file='ms-settings:display-advancedgraphics';kind='uri';detail='在 Windows 图形设置中调整 HAGS。是否提供开关由 Windows、GPU 和驱动共同决定；本软件不强行写入隐藏开关。'},
        @{id='performance';title='处理器计划、虚拟内存与视觉效果';file='SystemPropertiesPerformance.exe';kind='exe';detail='打开系统性能选项，在“高级”页选择处理器计划和分页文件。不按当前电脑配置覆盖其他设备。'},
        @{id='storage';title='Windows 临时文件与存储管理';file='ms-settings:storagesense';kind='uri';detail='在系统存储页管理回收站、更新文件等 Windows 维护项目。这里只打开设置，清理需在 Windows 内确认。'},
        @{id='disk-cleanup';title='Windows 磁盘清理';file='cleanmgr.exe';kind='exe';detail='打开 Windows 磁盘清理，选择磁盘和清理类别。不会预选项目或自动执行删除。'},
        @{id='updates';title='Windows 更新';file='ms-settings:windowsupdate';kind='uri';detail='手动检查更新、查看更新历史或调整暂停选项。不会自动下载安装更新。'},
        @{id='security';title='Windows 安全中心';file='windowsdefender:';kind='uri';detail='查看系统实际防护状态和受保护的安全设置。这里只打开原生界面，不关闭防护。'},
        @{id='game-properties';title='游戏全屏优化与兼容性';file='';kind='properties';detail='选择游戏 EXE，打开文件属性，在“兼容性”中调整全屏优化。只打开属性，不启动游戏；部分文件或系统策略不提供兼容性页。'}
    )
}
function Get-SystemTools {
    @{items=@(Get-SystemToolDefinitions|ForEach-Object{@{id=$_.id;title=$_.title;detail=$_.detail;needsExecutable=($_.kind -eq 'properties');available=($_.kind -ne 'exe' -or (Test-Path -LiteralPath (Join-Path $env:SystemRoot ('System32\'+$_.file))))}})}
}
function Show-ExecutableProperties([string]$Path){
    if(-not ('SynapseX.FileProperties' -as [type])){
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace SynapseX {
  public static class FileProperties {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    private struct SHELLEXECUTEINFO {
      public int cbSize; public uint fMask; public IntPtr hwnd;
      public string lpVerb, lpFile, lpParameters, lpDirectory;
      public int nShow; public IntPtr hInstApp, lpIDList;
      public string lpClass; public IntPtr hkeyClass; public uint dwHotKey;
      public IntPtr hIcon, hProcess;
    }
    [DllImport("shell32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    [return:MarshalAs(UnmanagedType.Bool)] private static extern bool ShellExecuteEx(ref SHELLEXECUTEINFO info);
    public static void Show(string path) {
      var info=new SHELLEXECUTEINFO(); info.cbSize=Marshal.SizeOf(info);
      info.fMask=0x0000000C | 0x00000100; info.lpVerb="properties";
      info.lpFile=path; info.nShow=1;
      if(!ShellExecuteEx(ref info)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
  }
}
'@
    }
    [SynapseX.FileProperties]::Show($Path)
}
function Start-SystemToolNative($Definition,[string]$Executable){
    if($Definition.kind -eq 'properties'){Show-ExecutableProperties $Executable;return}
    $file=if($Definition.kind -eq 'uri'){$Definition.file}else{Join-Path $env:SystemRoot ('System32\'+$Definition.file)}
    # A visible window is the purpose of this explicit user action; no command parameters are accepted.
    Start-Process -FilePath $file -ErrorAction Stop|Out-Null
}
function Open-SystemTool([string]$Id,[string]$Executable){
    $d=@(Get-SystemToolDefinitions|Where-Object{$_.id -ceq $Id});if($d.Count -ne 1){throw '未知系统工具。'};$d=$d[0]
    $path=''
    if($d.kind -eq 'properties'){
        if($Executable -notmatch '^[a-zA-Z]:\\' -or $Executable -match '[\r\n"\x00]' -or [IO.Path]::GetExtension($Executable) -ine '.exe'){throw '请选择本地游戏 EXE 的完整路径。'}
        $path=[IO.Path]::GetFullPath($Executable)
        if(!(Test-Path -LiteralPath $path -PathType Leaf)){throw '游戏 EXE 不存在。'}
    }elseif($Executable){throw '此系统工具不接受外部路径或参数。'}
    Start-SystemToolNative $d $path
    @{ok=$true;message='已请求打开 Windows 原生窗口。这里没有应用任何配置；请在打开的窗口中完成设置。'}
}
Export-ModuleMember -Function Get-SystemTools,Open-SystemTool
