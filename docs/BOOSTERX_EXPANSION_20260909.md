# BoosterX 功能扩展 · 2026-09-09

## 核对来源与边界

只读打开用户已有的 `D:\安装包\BoosterX.exe`，通过 Windows 可访问性树读取基本设置和调整页。没有点击任何应用按钮。页面中的“已禁用”等是 BoosterX 自己的显示，不是我们独立核验的当前系统状态。任务页导航未成功切换，不能据此声称已读取其全部任务定义。

本轮替代旧的“只纳入少数低风险项目”范围，但不宣称功能已全部复刻。按 Windows 官方接口独立实现，没有复制第三方程序代码。

## 实际看到的项目

基本设置：鼠标加速、安全通知、启动时自动更新驱动、UWP 后台运行、地图更新、商店更新、透明效果、视觉效果、Game Bar、MPO、索引、SysMain、Windows 诊断、Defender/SmartScreen、防火墙、Windows 更新、UAC、Edge 预加载/后台运行。

调整页：NetworkThrottlingIndex、SystemResponsiveness、Win32PrioritySeparation、Spectre/Meltdown、服务分组、更新保留存储、最后访问更新、8.3 文件名、诊断事件。导航还包含精简系统、清理、自启动、设备、任务、隐私。

这仅为可见功能名称，不代表已经反推出这些按钮的全部实现，也不接受其“提高 FPS”描述作为测量证据。

## 0.24.0 已完成

- 6 个服务：Windows Search、SysMain、打印后台处理、错误报告、离线地图、传真。只改变启动方式，保留延迟自动启动原值；不强制停止当前进程。重启后生效。
- 4 个独立任务：Compatibility Appraiser、ProgramDataUpdater、DiskDiagnosticDataCollector、Siuf DmClient。只改变启用状态，不删除任务、不停止正在执行的实例。
- 3 个更新策略：质量更新排除驱动、下载前通知、商店自动更新关闭。检查客户端系统、构建号和版本类型，仅确认策略写入与回读，不把它描述成所有版本的行为实测。
- 独立界面：分类、搜索、当前状态、单项确认、恢复、错误原因、检测时间。与原有 18 项基础设置分开，不加入推荐或全选预设。
- 原值备份先于写入；无变化不重复写入；应用失败尝试回滚并记录结果，恢复失败保留重试入口。按编译内置 ID 限定目标，客户端不传任意注册表路径、服务名或命令。
- 如果设置已经被 BoosterX 改过，只展示已有状态，没有自己的原值备份就不猜测恢复。

## 仍待补齐，不算已实现

- 系统级自启动与启动文件夹管理、完整计划任务管理、应用精简/卸载、清理分类与预览。
- MPO、FSO、HAGS、计时器、存储细项、服务分组和调度参数的单独适用条件与恢复验证。
- 安全通知、Defender/SmartScreen、防火墙、UAC、漏洞缓解项尚未添加，不会以更新策略冒充这些能力；这些应独立评估，不混入一键游戏推荐。
- 完全停用 Windows 更新不等同于本轮“下载前通知”，此项尚未实现。
- BoosterX 的驱动/设备、隐私、完整修复库仍未逐项核对。
- 用户明确撤销的游戏优先级调整和按键方案不重新加入。

## 技术依据

- Microsoft Windows Update 策略： https://learn.microsoft.com/en-us/windows/deployment/update/waas-wu-settings
- Microsoft Store 策略与适用版本： https://learn.microsoft.com/en-us/windows/client-management/mdm/policy-csp-applicationmanagement#allowappstoreautoupdate
- 本机 `C:\Windows\PolicyDefinitions\WindowsStore.admx` 的 DisableAutoInstall：启用值为 AutoDownload DWORD 2。CSP 的取值不直接当作 ADMX 注册表取值。
- 服务采用 Set-Service StartupType；计划任务采用 Enable/Disable-ScheduledTask。

## 验证

测试仅使用真实系统的只读查询，以及模拟服务、任务、策略写入。测试不修改真实服务、计划任务和策略。13 项模拟应用/恢复、幂等、备份先写、异常回滚、非法 ID、备份路径/项目不匹配均有测试。真实系统的权限拒绝、系统管理策略覆盖仍可能导致操作失败，界面必须展示失败，不能声称所有电脑已验证。

本轮结果：Windows PowerShell 5.1 与 PowerShell 7 测试通过；本机 13 个目录项中 10 个可读取。原生写入适配层用模拟 Windows 命令验证服务名称/启动类型、任务路径、策略值及恢复值。7 个 Node 回归测试通过。便携包构建成功，打包后的目录读取、缺失确认拒绝、非法 ID 拒绝通过；网络读取、监控扫描、已移除接口回归通过。

浏览器开发预览验证了浅色布局、服务分类筛选、影响说明确认框与取消。预览只含 3 个示例项，不代表真实机器状态；没有在预览或桌面程序中确认任何系统修改。深色和其他硬件未在本轮逐台验证。
