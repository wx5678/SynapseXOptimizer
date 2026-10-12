# 0.34.0 实验室扩展

本版本在 0.33.0 线程实验基础上补充此前缺失的独立功能，不重复已有系统、电源、网络、AMD 驱动及帧率监控入口。实现没有复制或打包 Pavise 源码、界面、图标及二进制；并非全部功能的逐项移植。

## 新增入口与实际行为

- **会话与游戏库**：手选游戏及最多 32 个后台进程实例，每 2 秒检查一次 CPU 阈值；可选 CPU 让步、IO、内存页面、GPU 调度及兼容时的 EcoQoS。前台进程、游戏和白名单不处理；后台目标降到阈值以下不会马上反复切换，已应用策略保留到恢复或会话结束。
- **核心与调度**：读取真实 CPU Set、处理器组、物理核、缓存域和效率等级，手动选择核心或每物理核一个逻辑处理器；原 CPU Set 列表完整恢复。支持指定进程单项内存/GPU/IO 调度实验。
- **内存回收**：仅回收用户所选进程的工作集，回报前后驻留量；不清空全机待机列表。这会引发后续页面重载，不能恢复成原先完全相同的驻留页，也不保证提高 FPS。
- **游戏库与白名单**：持久保存 EXE 路径，扫描 Steam/Epic/GOG 及部分厂商安装记录，用户确认实际 EXE 后导入。只读取安装信息，不执行发现的程序。
- **输入与驱动诊断**：10 秒 Raw Input 鼠标运动事件采样；15 秒独立 ETW DPC/ISR 捕获及 xperf 驱动汇总。鼠标数据是消息到达间隔，不等于 USB 硬件轮询率；DPC 需要已安装并通过签名检查的 Windows Performance Toolkit。
- **启动与中断**：IFEO PerfOptions 正常/高于正常/高三个启动级别，按 EXE 文件名影响下次启动；与直接修改正在运行的游戏进程不同，不保证目标游戏保留该值。IRQ 设置仅支持组 0、最多 64 个逻辑处理器的单组系统，写入选定 PCI 设备的亲和策略，需重启由驱动处理；回读注册表不是验证真实中断迁移。
- **显卡驱动扩展**：现有 NVIDIA 应用 Profile 的 Ansel、BatteryBoost FPS 覆盖、DLSS SR 覆盖及模型预设。读取支持状态后才显示可执行；没有现成 Profile 时需先在 NVIDIA 控制面板添加。BatteryBoost 值 0 表示不覆盖，不代表关闭；DLSS 要求游戏及驱动支持，不会给九阴添加 DLSS。

## 生效、恢复与开销

实验默认不运行，不进入一键优化，不随开机签到启动。页面切换不会中断活动会话。会话最长 4 小时，游戏退出、计时结束、手动停止、软件正常关闭均尝试恢复；崩溃后保留写前日志，由服务下次启动恢复。恢复核对进程创建时间及当前设置，不覆盖后来被其他程序改变的值。多实例通过互斥锁与日志所有者隔离。

IFEO、IRQ、NVIDIA Profile 属于持久设置，需在各自记录中手动恢复，不随游戏退出自动撤销。恢复前检查原值/应用值，失败保留记录，不把失败标记为成功。IRQ 不会自动重启电脑或设备。

后台会话计时器按需运行；DPC 与鼠标采样都有固定时间上限，默认关闭。工作集回收不可承诺提帧。没有对实际九阴进行设置写入或 FPS 改善对照测试。

## 本次验证

Windows x64 便携版已完成打包：`release/0.34.0-expanded-lab/SynapseX-Game-Optimizer-0.34.0.exe`（105719623 字节）。已核对 ASAR 内版本号为 0.34.0，以及八个新增原生/PowerShell 模块与源文件散列一致。安装包 SHA256：`0CFE0EA7FFBBB11F6E19F48FD84E4DBE1296233633D0AD75014BE94BD65E7A37`。未在本轮启动便携版替换用户当前正在运行的实例。

- 97 项 Node 回归通过；TypeScript、Vite 构建通过（现有单 JS chunk 大于 500 KB 的体积提示仍在）。
- `Test-SessionLab.ps1`：独立测试程序 CPU Sets、内存、GPU、IO、后台 CPU 阈值调度、白名单、游戏退出、定时恢复、身份保护、外部值冲突、崩溃恢复及多实例所有者隔离通过。
- 本机 EcoQoS 原值读取被系统拒绝（Win32 查询不支持，Native 查询返回 C0000002），该功能报告不可用且不写入；不是测试通过或已生效。
- `Test-SessionLabHost.ps1`：真实 HTTP 进程选择、拓扑、支持检测、本地库保存、内存实验应用回读、关闭响应前恢复及服务退出通过。旧线程实验 HTTP 测试也通过。
- `Test-LabRegistry.ps1`：独立测试 EXE 的 IFEO 下次启动 AboveNormal、恢复后 Normal；隔离 HKCU 测试键的 IRQ 二进制往返、部分写入恢复及外部值冲突保护通过。没有修改真实硬件 IRQ。
- `Test-LabGpu.ps1`：独立测试 NVIDIA Profile 的 Ansel 写入、恢复和过期原值拒绝通过，测试 Profile 已清理；没有改动用户游戏 Profile。
- `Test-LabDiagnostics.ps1`：本机真实 ETW 捕获及 xperf DPC/ISR 驱动报告通过；鼠标间隔算法测试通过，尚未实测物理鼠标回报率。
- 新导航、分类页和银白主题验收完成；固定导航在滚动后保留。截图 `design-evidence/expanded-lab-0340.png` 为预览页面的 UI 证据，不用于冒充原生执行结果。

## 尚未涵盖

全平台启动器学习/Xbox 包扫描、自动纳入新后台进程、全局待机列表及阈值自动内存清理、强制 ReBAR、把运行中的应用迁移到核显，以及旧网络/电源设置全部按游戏会话自动恢复，仍未实现。现有 AMD 配置保留，本次新增驱动扩展仅适用于 NVIDIA。未完成所有 Windows 版本、CPU 拓扑及显卡组合的实机测试。旧 GPU 优化模块的备份时序审计问题并未由新模块自动修复。

## 实现依据

- [Windows CPU Sets](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-setprocessdefaultcpusets)
- [进程信息](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-setprocessinformation)
- [GPU 调度类](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/d3dkmthk/nf-d3dkmthk-d3dkmtsetprocessschedulingpriorityclass)
- [工作集回收](https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-emptyworkingset)
- [中断亲和性](https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/interrupt-affinity-and-priority)
- [Raw Input](https://learn.microsoft.com/en-us/windows/win32/inputdev/using-raw-input)
- [DPC/ISR 分析](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/xperf/the-dpc-isr-action)
- [NVIDIA 官方设置标识](https://github.com/NVIDIA/nvapi/blob/main/NvApiDriverSettings.h)
