# 0.33.0 调度实验室与功能去重

本轮为独立编写的 Windows 调度实验，没有复制、改名或打包第三方项目的源代码、图标、界面和二进制。没有把去掉署名当成独立实现。上游仅用于研究功能和方法差异；接口实现依据 Microsoft 的公开 API 合约。

## 已实现

- 单线程相对优先级 +1：可选择采样列表中的线程，不更改整个游戏的进程优先级。仅正常/高于正常进程内、相对优先级为 0 或 1 的活跃线程可测试。不使用 Time Critical 或实时进程类。
- 指定后台应用 CPU 让步：把用户选择的正常/高于正常应用临时设置为 Below Normal。这不是 IO、GPU 或网络限速，不自动扫描并压制所有后台。
- 30 秒、60 秒、5 分钟实验，手动停止、到时恢复、软件正常退出恢复；异常退出保留记录供本地服务下次启动恢复。
- 写入前落盘，应用及恢复均回读；进程创建时间、线程所属进程及线程创建时间共同核验，防止 PID/TID 复用。恢复时不覆盖其他程序后来写入的不同优先级。
- 原生计时器独立于页面：切换菜单、网页卡顿不会取消计时器。跨进程互斥保护日志；旧计时器以代次校验，不能停止新实验。
- 实验室默认关闭，不加入一键优化，不跟随开机签到启动。正式软件不提供虚构的示例成功结果。

## 优先级方法区别

旧功能请求更改整个进程的 PriorityClass，之前游戏返回拒绝访问；该入口仍保持移除。

调研发现另一种方法是对单个候选线程调用 SetThreadPriority。这是不同的访问对象和权限，并不代表一定能通过游戏保护。本实现只请求文档要求的线程权限，拒绝访问即失败，不提升调试权限、不注入、不绕过保护。CPU 时间增量只能排序负载，不能证明该线程负责渲染，也不能据此保证提升 FPS。

另一个方案是 IFEO PerfOptions，在进程下次创建时设置优先级。它不同于即时线程调整，而且按可执行文件名影响后续实例。本轮未加入：没有把上游描述当作九阴实测结论，也没有在没有完成独立接口/兼容性验证的情况下写入这组注册表值。

## 去重清单（源代码核验，不等于全部硬件实测）

| 功能 | 当前证据 | 本轮处理 |
| --- | --- | --- |
| 游戏模式、DVR、后台策略、MMCSS | `host/modules/SystemOptimizer.psm1` 的 `Get-SystemTweakDefinitions` | 已有，不重复。MMCSS 注册表不是任意游戏线程提优 |
| NVIDIA / AMD 配置 | `GpuDriverOptimizer.psm1` 的 provider/apply 方法，`host/native/GpuDriverBridge.cs` | 已有，不重建；不声称包含 DLSS 模型覆盖、ReBAR、Ansel 等全部选项 |
| 游戏 GPU 首选项、核显设备控制 | `StabilityDiagnostics.psm1`、`DisplayAdapterOptimizer.psm1` | 已有，不重复；不等价于把后台运行中的应用迁到核显 |
| 电源方案、CPU 型号/拓扑适配 | `RuntimeOptimizer.psm1`、`RuntimeNative.cs` | 已有，不重复；拓扑读取不等价于主动绑核 |
| TCP、DNS、QoS、MTU、网卡配置及恢复 | `NetworkToolkit.psm1` | 已有，不重复；未实现按游戏会话自动撤销全部设置 |
| MSI 开关、服务管理 | `DeviceServiceManager.psm1` | 已有，不重复；MSI 注册表开关不等价于中断亲和性分配 |
| 鼠标加速 | `SystemOptimizer.psm1` 的 `disable-mouse-acceleration` | 已有，不重复 |
| 计划任务、AppX、启动文件管理 | `BackgroundManager.psm1` | 已有，但不等价于运行中的后台 CPU/IO/GPU 压制 |
| CPU、线程、DPC 占用诊断 | `Diagnostics.psm1`、`StabilityDiagnostics.psm1` | 保留现有诊断；实验室只添加指定进程的线程采样和有限调整 |
| FPS 采集与游戏报告 | `electron/fps-collector.cjs`、`GameSessionReporter.tsx`、`PerformanceReports.psm1` | 已有，不重复；未新增宣称改善百分比的“提帧报告” |
| 单线程提优 | 此前仅采样与查询，无 setter | 新增限时实验，应用回读后才标记生效 |
| 运行中的后台 CPU 降级 | 此前无此引擎 | 新增单目标限时实验；不是完整动态压制引擎 |
| 游戏库/启动器解析 | `RealtimeMonitor.psm1`、`GameDiscovery.psm1`、`electron/game-paths.cjs` | 部分已有；多平台安装库、启动器学习仍未补齐 |
| CPU Sets 分配 / 缓存域隔离 | 原有仅读取拓扑 | 缺失，未加入本轮；需要多组处理器与异构 CPU 实机验证 |
| 后台 IO / GPU 调度、自动白名单压制 | 无等价实现 | 缺失，未伪装成 CPU 让步功能 |
| USB / NIC / 存储 IRQ 迁移 | 无等价实现 | 缺失，未直接套用其他机器参数 |
| 鼠标回报率、DPC 驱动归因 | 原有只有汇总计数 | 缺失，未用汇总计数冒充具体驱动归因 |
| 待机列表 / 工作集清理 | 现有文件清理、内存检查并非 RAM 回收 | 未新增，不能把清理空闲缓存当成普遍提帧功能 |

额外审计发现：现有 GPU 模块的持久化备份时序需要继续单独审查（PS 包装层在 native apply 后保存结果）。本轮没有在用户电脑上执行显卡写入验证，也不据此声明整套优化“全部通过”。

## 验证边界

使用自建测试进程验证原生 API、进程类不变、后台降级与恢复、到时自动恢复、进程/线程身份保护、活动外部服务拒绝接管、模拟服务崩溃恢复及旧计时器隔离。测试不会操作实际游戏和用户的后台应用。现有 Node 回归、TypeScript 和运行时 13 组 CPU 适配检查一并回归。

检查时未发现 `fxgame.exe`，因此尚不能确认九阴是否允许线程写访问，也没有同场景 FPS 对照数据。不要将测试进程成功当成九阴成功。

实际执行结果：88 项 Node 回归通过；`Test-SchedulerLab.ps1` 的原生应用、手动/到时恢复、旧计时器、身份保护、活动外部服务保护及崩溃恢复通过；`Test-SchedulerLabHost.ps1` 的 HTTP 采样/应用/关闭前恢复通过；13 组 CPU 兼容性案例与 6 项线程诊断保护检查通过。TypeScript、Vite 和 0.33.0 Windows 便携版打包通过。界面验收图：`design-evidence/scheduler-lab-0330.png`。

接口文档：
- https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-setthreadpriority
- https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getthreadtimes
- https://learn.microsoft.com/en-us/windows/win32/procthread/scheduling-priorities

功能调研来源：https://github.com/dulaiduwang003/Pavise-Game
