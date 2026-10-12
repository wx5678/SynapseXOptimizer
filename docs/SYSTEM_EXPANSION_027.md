# 0.27.0 系统工具扩展

## 实现范围

服务与设备分为服务启动方式、可选设备启停、已有 MSI 参数、逐服务 SvcHostSplitDisable 四个目录。项目和身份来自本机；恢复前比对设备驱动或服务身份，拒绝覆盖外部新值。核心系统服务、基础显示/输入/存储设备不批量停用。MSI 参数存在不等于所有驱动都适合修改。

高级参数共 24 项：MPO、MMCSS SystemResponsiveness、NTFS 8.3 名称/最后访问时间/内存使用、保留存储、活动记录三项、剪贴板两项、诊断数据、自动更新、SmartScreen、安全通知、UAC、Defender 实时保护、Domain/Private/Public 防火墙、四项 BCD 计时器。计时器是调试参数，不承诺提高游戏帧率；系统盘加密状态不能确认或未完全解密时禁用对应操作。不自动解除防篡改保护。

修复中心包含 SFC 检查/修复、DISM 健康查询/扫描/修复/组件清理、系统盘在线检查、DNS 缓存清除、Winsock 重置、TCP/IP 重置。只允许编译在服务端的命令，不能提交任意命令行。任务在独立隐藏后台进程执行，双流日志、原生退出码和最终状态落盘；主软件退出不强杀修复工具。退出码为 0 不代表所有系统问题已修复，须阅读工具输出。

清理分临时文件、浏览器缓存、崩溃转储、系统旧日志四类。保留 7/30 天门槛、限定目录、逐文件选择和变化/占用检查；浏览器运行时不清理其缓存。不清 Cookies、密码、书签、历史或着色器缓存。删除不可恢复，操作记录不是文件备份。

Windows 工具的 7 个入口分别用于图形设置、性能选项、存储、磁盘清理、Windows 更新、Windows 安全中心、游戏 EXE 属性。界面明确表示打开原生设置，不能把这些入口计为自研设置开关。

## 验证方式

- Windows PowerShell 5.1 执行真实只读目录查询，以及隔离状态目录中的模拟写入、回读、恢复、冲突、身份变化、失败回滚测试。
- 设备、服务、高级参数的原生适配器通过替换底层 Windows 命令的测试验证目标、参数和原值保留；没有在开发电脑真实关闭服务、设备、防火墙或防护功能。
- 修复工作进程实际执行无系统修改的 `cmd echo / exit 7` 测试及 `sfc /?` 帮助命令，验证退出码和中文 UTF-16 输出转 UTF-8 日志。没有为测试运行系统修复或网络重置。
- 清理测试只删除复制生成的一份一次性临时夹具，其余范围以只读扫描和模拟写入测试验证。没有删除个人文件或卸载软件。
- 页面预览检查浅色主题、下拉选择、分类、搜索、分页和应用确认取消；生产版排除预览假数据。
- 最终发行 API 检查通过：实际启动发布目录内的 Windows PowerShell 5.1 服务，验证全部新增目录、无确认写入拦截、网络工具箱、监控重新扫描、运行状态，以及已取消接口返回 404、预览数据未进入发布包。
- 21 项 Node 测试通过；12 组 PowerShell 5.1 脚本通过（背景项目、启动项、常用调整、清理、设备目录与适配器、高级参数与适配器、清理分类、原生入口、修复任务与真实工作进程）；另在 PowerShell 7 复测清理、高级参数与适配器、设备目录、原生入口，共 5 组通过。深色修复页、任务日志展开和网络重置确认取消也已检查。
- 软件包仍为 Windows 10/11 x64，未作所有 CPU/OEM/Windows 版本实机验证。构建有约 520 kB JS chunk 提示，不影响构建通过；安装包未代码签名。

## 发布包

`release/0.27.0/SynapseX-Game-Optimizer-0.27.0.exe`，104307167 字节。

SHA-256：`2540BD75C8BF77F9A1AE69B1711ABB80F74FCD7679684EA63FCEEAAEF9165755`。

## 已知未完成范围

BoosterX 窗口输入返回 GetCursorPos 拒绝访问，恢复一次仍失败；未读取完整的清理、隐私、修复页。只读检查其 PE 元数据发现资源为混淆/封装形式，没有可直接读取的完整功能清单。不能声称已全部搬完。

漏洞缓解开关尚未实现。HAGS、FSO、Win32PrioritySeparation 目前使用 Windows 原生入口，不是应用内直接写入。普通桌面软件的卸载入口成功启动也不等于卸载完成；需原程序结束后重新扫描。用户取消的按键方案库和游戏进程优先级写入继续保持移除。

## 参数依据

- [NVIDIA MPO 故障排查](https://nvidia.custhelp.com/app/answers/detail/a_id/5157)：仅作为显示兼容性排查手段。
- [Microsoft MSI 注册设置](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/enabling-message-signaled-interrupts-in-the-registry)
- [Microsoft fsutil behavior](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/fsutil-behavior)
- [Microsoft 保留存储](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/dism-storage-reserve?view=windows-11)
- [Microsoft 服务宿主拆分](https://learn.microsoft.com/en-us/windows/application-management/svchost-service-refactoring)
- [Microsoft MMCSS](https://learn.microsoft.com/en-us/windows/win32/procthread/multimedia-class-scheduler-service)
- [Microsoft BCD 参数](https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/bcdedit--set)
- [Microsoft Defender 参数](https://learn.microsoft.com/en-us/powershell/module/defender/set-mppreference?view=windowsserver2025-ps)
- [Microsoft 防火墙参数](https://learn.microsoft.com/en-us/powershell/module/netsecurity/set-netfirewallprofile?view=windowsserver2025-ps)
- [Windows 原生设置入口](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-settings)
